//! Sandboxed JavaScript macros (`script.run`) via Boa.

use std::time::Duration;

use boa_engine::{js_string, Context, JsValue, NativeFunction, Source};
use boa_engine::property::PropertyKey;
use boa_runtime::Console;

use crate::actions::registry::ActionError;
use crate::cancel::CancellationToken;
use crate::env::MacroEnv;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::schema::MacroValue;

/// Run inline JS with host API: `caster.get`, `caster.set`, `caster.log`, `caster.fetch`.
pub fn run_script(
    source: &str,
    timeout_ms: u64,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
) -> Result<(), ActionError> {
    run_script_with_perms(source, timeout_ms, env, bus, cancel, true)
}

pub fn run_script_with_perms(
    source: &str,
    timeout_ms: u64,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
    allow_network: bool,
) -> Result<(), ActionError> {
    if cancel.is_cancelled() {
        return Err(ActionError::Cancelled);
    }
    let _ = timeout_ms;

    let mut ctx = Context::default();
    let console = Console::init(&mut ctx);
    ctx.register_global_property(
        js_string!("console"),
        console,
        boa_engine::property::Attribute::all(),
    )
    .map_err(|e| ActionError::Message(format!("js console: {e}")))?;

    // Seed vars object
    let mut vars_init = String::from("globalThis.__caster_vars = Object.create(null);\n");
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
    let allow = allow_network;

    // caster.log
    let log_fn = NativeFunction::from_copy_closure(move |_this, args, _ctx| {
        let msg = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        // SAFETY: bus lives for the duration of run_script
        let bus = unsafe { &*(bus_ptr as *const EventBus) };
        bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message: format!("script: {msg}"),
        });
        Ok(JsValue::undefined())
    });

    // caster.get
    let get_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let name = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let vars = ctx
            .global_object()
            .get(js_string!("__caster_vars"), ctx)?;
        let obj = vars.as_object().ok_or_else(|| {
            boa_engine::JsNativeError::typ().with_message("missing __caster_vars")
        })?;
        obj.get(js_string!(name), ctx)
    });

    // caster.set
    let set_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let name = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let value = args.get(1).cloned().unwrap_or(JsValue::undefined());
        let vars = ctx
            .global_object()
            .get(js_string!("__caster_vars"), ctx)?;
        let obj = vars.as_object().ok_or_else(|| {
            boa_engine::JsNativeError::typ().with_message("missing __caster_vars")
        })?;
        obj.set(js_string!(name), value, false, ctx)?;
        Ok(JsValue::undefined())
    });

    // caster.fetch
    let fetch_fn = NativeFunction::from_copy_closure(move |_this, args, ctx| {
        if !allow {
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

    let caster = boa_engine::object::ObjectInitializer::new(&mut ctx)
        .function(get_fn, js_string!("get"), 1)
        .function(set_fn, js_string!("set"), 2)
        .function(log_fn, js_string!("log"), 1)
        .function(fetch_fn, js_string!("fetch"), 1)
        .build();
    ctx.register_global_property(
        js_string!("caster"),
        caster,
        boa_engine::property::Attribute::all(),
    )
    .map_err(|e| ActionError::Message(format!("js caster: {e}")))?;

    let wrapped = format!("(function(){{\n{source}\n}})();");
    ctx.eval(Source::from_bytes(wrapped.as_bytes()))
        .map_err(|e| ActionError::Message(format!("script.run: {e}")))?;

    if cancel.is_cancelled() {
        return Err(ActionError::Cancelled);
    }

    // Read back vars
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
    Ok(())
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
}
