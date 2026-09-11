//! Sandboxed JavaScript macros (`script.run`) via Boa.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use boa_engine::property::PropertyKey;
use boa_engine::{js_string, Context, JsValue, NativeFunction, Source};
use boa_runtime::Console;

use crate::actions::registry::ActionError;
use crate::cancel::CancellationToken;
use crate::env::MacroEnv;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::MouseInjector;
use crate::schema::MacroValue;

pub type RunMacroCallback =
    Arc<dyn Fn(&str) -> Result<(), ActionError> + Send + Sync>;

#[derive(Clone)]
pub struct ScriptOptions {
    pub allow_network: bool,
    pub allow_clipboard: bool,
    pub allow_fs: bool,
    pub allow_macro_control: bool,
    pub config_dir: PathBuf,
    pub injector: Option<Arc<dyn MouseInjector>>,
    pub run_macro: Option<RunMacroCallback>,
}

impl Default for ScriptOptions {
    fn default() -> Self {
        Self {
            allow_network: true,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            config_dir: PathBuf::from("."),
            injector: None,
            run_macro: None,
        }
    }
}

impl ScriptOptions {
    pub fn script_data_dir(&self) -> PathBuf {
        self.config_dir.join("script-data")
    }
}

/// Run inline JS with host API. Returns value from `caster.return(x)` or the IIFE result.
pub fn run_script(
    source: &str,
    timeout_ms: u64,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
) -> Result<Option<MacroValue>, ActionError> {
    run_script_with_options(source, timeout_ms, env, bus, cancel, &ScriptOptions::default())
}

pub fn run_script_with_perms(
    source: &str,
    timeout_ms: u64,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
    allow_network: bool,
) -> Result<Option<MacroValue>, ActionError> {
    let mut opts = ScriptOptions::default();
    opts.allow_network = allow_network;
    run_script_with_options(source, timeout_ms, env, bus, cancel, &opts)
}

pub fn run_script_with_options(
    source: &str,
    timeout_ms: u64,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
    opts: &ScriptOptions,
) -> Result<Option<MacroValue>, ActionError> {
    if cancel.is_cancelled() {
        return Err(ActionError::Cancelled);
    }
    let _ = timeout_ms;
    let _ = fs::create_dir_all(opts.script_data_dir());

    let mut ctx = Context::default();
    let console = Console::init(&mut ctx);
    ctx.register_global_property(
        js_string!("console"),
        console,
        boa_engine::property::Attribute::all(),
    )
    .map_err(|e| ActionError::Message(format!("js console: {e}")))?;

    let mut vars_init = String::from(
        "globalThis.__caster_vars = Object.create(null);\nglobalThis.__caster_return = undefined;\n",
    );
    for (k, v) in env.snapshot() {
        let lit = macro_to_js_literal(&v);
        vars_init.push_str(&format!(
            "globalThis.__caster_vars[{}] = {};\n",
            js_quote(&k),
            lit
        ));
    }
    ctx.eval(Source::from_bytes(vars_init.as_bytes()))
        .map_err(|e| ActionError::Message(format!("js init: {e}")))?;

    let bus_ptr = bus as *const EventBus as usize;
    let allow_net = opts.allow_network;
    let allow_clip = opts.allow_clipboard;
    let allow_fs = opts.allow_fs;
    let allow_macro = opts.allow_macro_control;
    let data_dir = opts.script_data_dir();
    let injector = opts.injector.clone();
    let run_macro = opts.run_macro.clone();

    let log_fn = NativeFunction::from_copy_closure(move |_this, args, _ctx| {
        let msg = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let bus = unsafe { &*(bus_ptr as *const EventBus) };
        bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("script: {msg}"),
        });
        Ok(JsValue::undefined())
    });

    let get_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let name = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let vars = ctx.global_object().get(js_string!("__caster_vars"), ctx)?;
        let obj = vars.as_object().ok_or_else(|| {
            boa_engine::JsNativeError::typ().with_message("missing __caster_vars")
        })?;
        obj.get(js_string!(name), ctx)
    });

    let set_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let name = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let value = args.get(1).cloned().unwrap_or(JsValue::undefined());
        let vars = ctx.global_object().get(js_string!("__caster_vars"), ctx)?;
        let obj = vars.as_object().ok_or_else(|| {
            boa_engine::JsNativeError::typ().with_message("missing __caster_vars")
        })?;
        obj.set(js_string!(name), value, false, ctx)?;
        Ok(JsValue::undefined())
    });

    let return_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let value = args.first().cloned().unwrap_or(JsValue::undefined());
        ctx.global_object()
            .set(js_string!("__caster_return"), value.clone(), false, ctx)?;
        Ok(value)
    });

    let fetch_fn = NativeFunction::from_copy_closure(move |_this, args, ctx| {
        if !allow_net {
            return Err(boa_engine::JsNativeError::error()
                .with_message("caster.fetch disabled (network permission required)")
                .into());
        }
        let opts = args
            .first()
            .and_then(|v| v.as_object())
            .ok_or_else(|| {
                boa_engine::JsNativeError::typ().with_message("fetch expects an object")
            })?;
        let method = opts
            .get(js_string!("method"), ctx)?
            .as_string()
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_else(|| "GET".into());
        let url = opts
            .get(js_string!("url"), ctx)?
            .as_string()
            .map(|s| s.to_std_string_escaped())
            .ok_or_else(|| boa_engine::JsNativeError::typ().with_message("fetch requires url"))?;
        let timeout_ms = opts
            .get(js_string!("timeoutMs"), ctx)?
            .as_number()
            .map(|n| n as u64)
            .unwrap_or(10_000);
        let body = opts
            .get(js_string!("body"), ctx)?
            .as_string()
            .map(|s| s.to_std_string_escaped());
        let mut headers: Vec<(String, String)> = Vec::new();
        if let Ok(hval) = opts.get(js_string!("headers"), ctx) {
            if let Some(hobj) = hval.as_object() {
                let keys = hobj.own_property_keys(ctx)?;
                for key in keys {
                    let k = property_key_to_string(&key);
                    if let Ok(v) = hobj.get(key, ctx) {
                        if let Some(s) = v.as_string() {
                            headers.push((k, s.to_std_string_escaped()));
                        }
                    }
                }
            }
        }
        let (status, body_text) =
            http_fetch(&method, &url, body.as_deref(), &headers, timeout_ms).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e)
            })?;
        let out = boa_engine::object::ObjectInitializer::new(ctx)
            .property(
                js_string!("status"),
                JsValue::from(status),
                boa_engine::property::Attribute::all(),
            )
            .property(
                js_string!("body"),
                js_string!(body_text),
                boa_engine::property::Attribute::all(),
            )
            .build();
        Ok(JsValue::from(out))
    });

    // SAFETY: closures capture only Rust heap (Arc/PathBuf), not JS GC-managed values.
    let inj_clip = injector.clone();
    let clipboard_read_fn = unsafe {
        NativeFunction::from_closure(move |_this, _args, _ctx| {
            if !allow_clip {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.clipboardRead disabled")
                    .into());
            }
            let Some(inj) = inj_clip.as_ref() else {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("clipboard unavailable")
                    .into());
            };
            let text = inj.clipboard_get().map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e.to_string())
            })?;
            Ok(JsValue::from(js_string!(text)))
        })
    };

    let inj_clip_w = injector.clone();
    let clipboard_write_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if !allow_clip {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.clipboardWrite disabled")
                    .into());
            }
            let text = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let Some(inj) = inj_clip_w.as_ref() else {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("clipboard unavailable")
                    .into());
            };
            inj.clipboard_set(&text).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e.to_string())
            })?;
            Ok(JsValue::undefined())
        })
    };

    let data_dir_r = data_dir.clone();
    let read_file_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if !allow_fs {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.readFile disabled")
                    .into());
            }
            let rel = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let path = sandbox_path(&data_dir_r, &rel).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e)
            })?;
            let text = fs::read_to_string(&path).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e.to_string())
            })?;
            Ok(JsValue::from(js_string!(text)))
        })
    };

    let data_dir_w = data_dir.clone();
    let write_file_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if !allow_fs {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.writeFile disabled")
                    .into());
            }
            let rel = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let content = args
                .get(1)
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let path = sandbox_path(&data_dir_w, &rel).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e)
            })?;
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(&path, content).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e.to_string())
            })?;
            Ok(JsValue::undefined())
        })
    };

    let run_macro_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if !allow_macro {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.runMacro disabled")
                    .into());
            }
            let id = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let Some(cb) = run_macro.as_ref() else {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("runMacro unavailable")
                    .into());
            };
            cb(&id).map_err(|e| boa_engine::JsNativeError::error().with_message(e.to_string()))?;
            Ok(JsValue::undefined())
        })
    };

    let caster = boa_engine::object::ObjectInitializer::new(&mut ctx)
        .function(get_fn, js_string!("get"), 1)
        .function(set_fn, js_string!("set"), 2)
        .function(log_fn, js_string!("log"), 1)
        .function(return_fn, js_string!("return"), 1)
        .function(fetch_fn, js_string!("fetch"), 1)
        .function(clipboard_read_fn, js_string!("clipboardRead"), 0)
        .function(clipboard_write_fn, js_string!("clipboardWrite"), 1)
        .function(read_file_fn, js_string!("readFile"), 1)
        .function(write_file_fn, js_string!("writeFile"), 2)
        .function(run_macro_fn, js_string!("runMacro"), 1)
        .build();
    ctx.register_global_property(
        js_string!("caster"),
        caster,
        boa_engine::property::Attribute::all(),
    )
    .map_err(|e| ActionError::Message(format!("js caster: {e}")))?;

    let wrapped = format!("(function(){{\n{source}\n}})();");
    let eval_result = ctx
        .eval(Source::from_bytes(wrapped.as_bytes()))
        .map_err(|e| ActionError::Message(format!("script.run: {e}")))?;

    if cancel.is_cancelled() {
        return Err(ActionError::Cancelled);
    }

    let vars_val = ctx
        .global_object()
        .get(js_string!("__caster_vars"), &mut ctx)
        .map_err(|e| ActionError::Message(format!("js vars: {e}")))?;
    let vars_obj = vars_val
        .as_object()
        .ok_or_else(|| ActionError::Message("missing __caster_vars".into()))?;
    let keys = vars_obj
        .own_property_keys(&mut ctx)
        .map_err(|e| ActionError::Message(format!("js keys: {e}")))?;
    for key in keys {
        let name = property_key_to_string(&key);
        let v = vars_obj
            .get(key, &mut ctx)
            .map_err(|e| ActionError::Message(format!("js get: {e}")))?;
        env.set(name, js_to_macro(&v));
    }

    let ret_val = ctx
        .global_object()
        .get(js_string!("__caster_return"), &mut ctx)
        .ok();
    let returned = if let Some(v) = ret_val {
        if !v.is_undefined() {
            Some(js_to_macro(&v))
        } else if !eval_result.is_undefined() {
            Some(js_to_macro(&eval_result))
        } else {
            None
        }
    } else if !eval_result.is_undefined() {
        Some(js_to_macro(&eval_result))
    } else {
        None
    };
    Ok(returned)
}

fn sandbox_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = relative.replace('\\', "/");
    if rel.is_empty() || rel.contains("..") || Path::new(&rel).is_absolute() {
        return Err("invalid script-data path".into());
    }
    let joined = root.join(&rel);
    let canon_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    if let Ok(canon) = fs::canonicalize(&joined) {
        if !canon.starts_with(&canon_root) {
            return Err("path escapes script-data sandbox".into());
        }
        return Ok(canon);
    }
    // File may not exist yet (write) — check parent
    if let Some(parent) = joined.parent() {
        let _ = fs::create_dir_all(root);
        let canon_parent = fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
        if !canon_parent.starts_with(&canon_root)
            && canon_parent != canon_root
            && !joined.starts_with(root)
        {
            return Err("path escapes script-data sandbox".into());
        }
    }
    Ok(joined)
}

fn property_key_to_string(key: &PropertyKey) -> String {
    match key {
        PropertyKey::String(s) => s.to_std_string_escaped(),
        PropertyKey::Symbol(s) => format!("Symbol({s})"),
        PropertyKey::Index(i) => i.get().to_string(),
    }
}

fn js_quote(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

fn macro_to_js_literal(v: &MacroValue) -> String {
    match v {
        MacroValue::Bool(b) => b.to_string(),
        MacroValue::Number(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                format!("{}", *n as i64)
            } else {
                n.to_string()
            }
        }
        MacroValue::String(s) => js_quote(s),
    }
}

fn js_to_macro(v: &JsValue) -> MacroValue {
    if let Some(b) = v.as_boolean() {
        return MacroValue::Bool(b);
    }
    if let Some(n) = v.as_number() {
        return MacroValue::Number(n);
    }
    if let Some(s) = v.as_string() {
        let s = s.to_std_string_escaped();
        if let Ok(n) = s.parse::<f64>() {
            return MacroValue::Number(n);
        }
        return MacroValue::String(s);
    }
    MacroValue::String(String::new())
}

pub fn http_fetch(
    method: &str,
    url: &str,
    body: Option<&str>,
    headers: &[(String, String)],
    timeout_ms: u64,
) -> Result<(u16, String), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms.max(1)))
        .build();
    let upper = method.to_ascii_uppercase();
    let mut req = match upper.as_str() {
        "GET" => agent.get(url),
        "POST" => agent.post(url),
        "PUT" => agent.put(url),
        "DELETE" => agent.delete(url),
        other => return Err(format!("unsupported http method: {other}")),
    };
    for (n, v) in headers {
        req = req.set(n, v);
    }
    let result = match upper.as_str() {
        "POST" | "PUT" => {
            if let Some(b) = body {
                req.send_string(b)
            } else {
                req.call()
            }
        }
        _ => req.call(),
    };
    match result {
        Ok(resp) => Ok((resp.status(), resp.into_string().unwrap_or_default())),
        Err(ureq::Error::Status(code, resp)) => {
            Ok((code, resp.into_string().unwrap_or_default()))
        }
        Err(e) => Err(format!("http failed: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_sets_variable() {
        let mut env = MacroEnv::new();
        env.set("n", MacroValue::Number(1.0));
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        run_script(
            r#"
              var n = Number(caster.get("n"));
              caster.set("n", n + 2);
            "#,
            5_000,
            &mut env,
            &bus,
            &cancel,
        )
        .unwrap();
        assert_eq!(env.get("n"), Some(&MacroValue::Number(3.0)));
    }

    #[test]
    fn script_return_value() {
        let mut env = MacroEnv::new();
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let ret = run_script(
            r#"caster.return(7);"#,
            5_000,
            &mut env,
            &bus,
            &cancel,
        )
        .unwrap();
        assert_eq!(ret, Some(MacroValue::Number(7.0)));
    }
}
