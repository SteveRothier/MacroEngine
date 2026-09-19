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
use crate::input::{MouseButton, MouseInjector, Point};
use crate::script_library::{resolve_script, ScriptLanguage};
use crate::script_transpile::prepare_script_source;
use crate::schema::MacroValue;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use serde_json::{json, Value};

pub const MAX_SCRIPT_NEST: u32 = 5;

pub type RunMacroCallback =
    Arc<dyn Fn(&str) -> Result<(), ActionError> + Send + Sync>;

#[derive(Clone)]
pub struct ScriptOptions {
    pub allow_network: bool,
    pub allow_clipboard: bool,
    pub allow_fs: bool,
    pub allow_macro_control: bool,
    pub allow_input: bool,
    pub allow_process: bool,
    pub language: ScriptLanguage,
    pub config_dir: PathBuf,
    pub injector: Option<Arc<dyn MouseInjector>>,
    pub run_macro: Option<RunMacroCallback>,
    /// Nesting depth for runScript / include (max 5).
    pub call_depth: u32,
    /// Shared nesting counter (created on first run when unset).
    pub nest_depth: Option<Arc<AtomicU32>>,
    /// Include cycle detection stack.
    pub include_stack: Option<Arc<Mutex<HashSet<String>>>>,
    /// When true, input/process side effects are logged and skipped.
    pub dry_run: bool,
}

impl Default for ScriptOptions {
    fn default() -> Self {
        Self {
            allow_network: true,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process: false,
            language: ScriptLanguage::Javascript,
            config_dir: PathBuf::from("."),
            injector: None,
            run_macro: None,
            call_depth: 0,
            nest_depth: None,
            include_stack: None,
            dry_run: false,
        }
    }
}

impl ScriptOptions {
    pub fn script_data_dir(&self) -> PathBuf {
        self.config_dir.join("script-data")
    }

    pub fn ensure_nest_state(&mut self) {
        if self.nest_depth.is_none() {
            self.nest_depth = Some(Arc::new(AtomicU32::new(self.call_depth)));
        }
        if self.include_stack.is_none() {
            self.include_stack = Some(Arc::new(Mutex::new(HashSet::new())));
        }
    }
}

pub fn ensure_script_lang_compat(
    _caller: ScriptLanguage,
    _child: ScriptLanguage,
) -> Result<(), ActionError> {
    Ok(())
}

pub fn dry_run_skip(bus: &EventBus, method: &str) {
    bus.publish(EngineEvent::Log {
        level: LogLevel::Info,
        message: format!("script: dry-run skipped {method}"),
    });
}

fn nest_depth_ref(opts: &ScriptOptions) -> Result<&Arc<AtomicU32>, ActionError> {
    opts.nest_depth
        .as_ref()
        .ok_or_else(|| ActionError::Message("nest state missing".into()))
}

pub fn nest_begin(opts: &ScriptOptions) -> Result<u32, ActionError> {
    let depth_ref = nest_depth_ref(opts)?;
    let depth = depth_ref.fetch_add(1, Ordering::SeqCst);
    if depth >= MAX_SCRIPT_NEST {
        depth_ref.fetch_sub(1, Ordering::SeqCst);
        return Err(ActionError::Message(
            "caster.runScript max depth exceeded".into(),
        ));
    }
    Ok(depth)
}

pub fn nest_end(opts: &ScriptOptions) {
    if let Some(d) = &opts.nest_depth {
        d.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn include_begin(opts: &ScriptOptions, id: &str) -> Result<(), ActionError> {
    let depth_ref = nest_depth_ref(opts)?;
    let depth = depth_ref.fetch_add(1, Ordering::SeqCst);
    if depth >= MAX_SCRIPT_NEST {
        depth_ref.fetch_sub(1, Ordering::SeqCst);
        return Err(ActionError::Message(
            "caster.include max depth exceeded".into(),
        ));
    }
    let stack = opts
        .include_stack
        .as_ref()
        .ok_or_else(|| ActionError::Message("include stack missing".into()))?;
    let mut guard = stack
        .lock()
        .map_err(|_| ActionError::Message("include lock".into()))?;
    if !guard.insert(id.to_string()) {
        drop(guard);
        nest_end(opts);
        return Err(ActionError::Message(format!("caster.include cycle: {id}")));
    }
    Ok(())
}

pub fn include_end(opts: &ScriptOptions, id: &str) {
    if let Some(stack) = &opts.include_stack {
        if let Ok(mut guard) = stack.lock() {
            guard.remove(id);
        }
    }
    nest_end(opts);
}

pub fn nest_include_js_wrapped(source: &str, language: ScriptLanguage) -> Result<String, ActionError> {
    let js = prepare_script_source(source, language)?;
    Ok(format!(
        "(function(exports, module){{\n{js}\nreturn module.exports;\n}})({{}}, {{exports: {{}}}});"
    ))
}

pub fn macro_to_json_value(v: Option<&MacroValue>) -> Value {
    match v {
        Some(MacroValue::Bool(b)) => Value::Bool(*b),
        Some(MacroValue::Number(n)) => json!(*n),
        Some(MacroValue::String(s)) => Value::String(s.clone()),
        None => Value::Null,
    }
}

pub fn json_params_to_env(params: &Value) -> HashMap<String, MacroValue> {
    let mut out = HashMap::new();
    let Some(obj) = params.as_object() else {
        return out;
    };
    for (k, v) in obj {
        out.insert(k.clone(), json_to_macro(v));
    }
    out
}

fn json_to_macro(v: &Value) -> MacroValue {
    match v {
        Value::Bool(b) => MacroValue::Bool(*b),
        Value::Number(n) => MacroValue::Number(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => MacroValue::String(s.clone()),
        Value::Null => MacroValue::String(String::new()),
        other => MacroValue::String(other.to_string()),
    }
}

pub fn merge_child_script_opts(base: &ScriptOptions, doc: &crate::script_library::ScriptDoc, depth: u32) -> ScriptOptions {
    let mut child = base.clone();
    child.allow_network |= doc.allow_network;
    child.allow_clipboard |= doc.allow_clipboard;
    child.allow_fs |= doc.allow_fs;
    child.allow_macro_control |= doc.allow_macro_control;
    child.allow_input |= doc.allow_input;
    child.allow_process |= doc.allow_process;
    child.language = doc.language;
    child.call_depth = depth + 1;
    child
}

pub fn nest_run_script(
    id: &str,
    params: HashMap<String, MacroValue>,
    timeout_ms: u64,
    bus: &EventBus,
    cancel: &CancellationToken,
    opts: &ScriptOptions,
) -> Result<Option<MacroValue>, ActionError> {
    let depth = nest_begin(opts)?;
    let result = (|| {
        let doc = resolve_script(&opts.config_dir, id)
            .map_err(|e| ActionError::Message(e.to_string()))?;
        ensure_script_lang_compat(opts.language, doc.language)?;
        let mut child_env = MacroEnv::new();
        for (k, v) in params {
            child_env.set(k, v);
        }
        for (k, v) in &doc.param_values {
            if child_env.get(k).is_none() {
                child_env.set(k.clone(), v.clone());
            }
        }
        let child_opts = merge_child_script_opts(opts, &doc, depth);
        run_script_with_options(
            &doc.source,
            timeout_ms,
            &mut child_env,
            bus,
            cancel,
            &child_opts,
        )
    })();
    nest_end(opts);
    result
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
    let mut run_opts = opts.clone();
    run_opts.ensure_nest_state();
    let opts = &run_opts;
    let _ = fs::create_dir_all(opts.script_data_dir());

    let timed_out = Arc::new(AtomicBool::new(false));
    let watchdog_done = Arc::new(AtomicBool::new(false));
    if timeout_ms > 0 {
        let cancel_w = cancel.clone();
        let timed_out_w = Arc::clone(&timed_out);
        let done_w = Arc::clone(&watchdog_done);
        std::thread::spawn(move || {
            let step = 50u64;
            let mut left = timeout_ms;
            while left > 0 {
                if done_w.load(Ordering::SeqCst) {
                    return;
                }
                let chunk = left.min(step);
                std::thread::sleep(Duration::from_millis(chunk));
                left = left.saturating_sub(chunk);
            }
            if !done_w.load(Ordering::SeqCst) {
                timed_out_w.store(true, Ordering::SeqCst);
                cancel_w.cancel();
            }
        });
    }

    let source = prepare_script_source(source, opts.language)?;

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
    let cancel_ptr = cancel as *const CancellationToken as usize;
    let allow_net = opts.allow_network;
    let allow_clip = opts.allow_clipboard;
    let allow_fs = opts.allow_fs;
    let allow_macro = opts.allow_macro_control;
    let allow_input = opts.allow_input;
    let allow_process = opts.allow_process;
    let data_dir = opts.script_data_dir();
    let config_dir = opts.config_dir.clone();
    let injector = opts.injector.clone();
    let run_macro = opts.run_macro.clone();
    let _include_stack = opts
        .include_stack
        .clone()
        .expect("nest include_stack");
    let _nest_depth = opts.nest_depth.clone().expect("nest depth");
    let dry_run = opts.dry_run;
    let base_opts = opts.clone();

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

    let sleep_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if !allow_input {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.sleep disabled")
                    .into());
            }
            let ms = args
                .first()
                .and_then(|v| v.as_number())
                .map(|n| n.max(0.0) as u64)
                .unwrap_or(0);
            let cancel = &*(cancel_ptr as *const CancellationToken);
            let deadline = std::time::Instant::now() + Duration::from_millis(ms);
            while std::time::Instant::now() < deadline {
                if cancel.is_cancelled() {
                    return Err(boa_engine::JsNativeError::error()
                        .with_message("cancelled")
                        .into());
                }
                let remain = deadline.saturating_duration_since(std::time::Instant::now());
                std::thread::sleep(remain.min(Duration::from_millis(50)));
            }
            Ok(JsValue::undefined())
        })
    };

    let inj_click = injector.clone();
    let click_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.click");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.click")?;
            let inj = require_injector(inj_click.as_ref())?;
            let (button, x, y) = parse_mouse_opts(args.first(), ctx)?;
            maybe_move_xy(inj, x, y)?;
            inj.click(button).map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_move = injector.clone();
    let move_to_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, _ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.moveTo");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.moveTo")?;
            let inj = require_injector(inj_move.as_ref())?;
            let x = args
                .first()
                .and_then(|v| v.as_number())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("moveTo expects x, y")
                })? as i32;
            let y = args
                .get(1)
                .and_then(|v| v.as_number())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("moveTo expects x, y")
                })? as i32;
            inj.move_to(Point { x, y }).map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_down = injector.clone();
    let mouse_down_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.mouseDown");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.mouseDown")?;
            let inj = require_injector(inj_down.as_ref())?;
            let (button, x, y) = parse_mouse_opts(args.first(), ctx)?;
            maybe_move_xy(inj, x, y)?;
            inj.mouse_down(button).map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_up = injector.clone();
    let mouse_up_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.mouseUp");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.mouseUp")?;
            let inj = require_injector(inj_up.as_ref())?;
            let (button, x, y) = parse_mouse_opts(args.first(), ctx)?;
            maybe_move_xy(inj, x, y)?;
            inj.mouse_up(button).map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_wheel = injector.clone();
    let wheel_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.wheel");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.wheel")?;
            let inj = require_injector(inj_wheel.as_ref())?;
            let delta = args
                .first()
                .and_then(|v| v.as_number())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("wheel expects delta")
                })? as i32;
            let (_, x, y) = parse_mouse_opts(args.get(1), ctx)?;
            maybe_move_xy(inj, x, y)?;
            inj.mouse_wheel(delta).map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_ktap = injector.clone();
    let key_tap_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.keyTap");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.keyTap")?;
            let inj = require_injector(inj_ktap.as_ref())?;
            let key = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("keyTap expects key")
                })?;
            let (ctrl, alt, shift) = parse_key_mods(args.get(1), ctx)?;
            inj.key_chord_tap(&key, ctrl, alt, shift)
                .map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_kdown = injector.clone();
    let key_down_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.keyDown");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.keyDown")?;
            let inj = require_injector(inj_kdown.as_ref())?;
            let key = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("keyDown expects key")
                })?;
            let (ctrl, alt, shift) = parse_key_mods(args.get(1), ctx)?;
            inj.key_chord_down(&key, ctrl, alt, shift)
                .map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let inj_kup = injector.clone();
    let key_up_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.keyUp");
                return Ok(JsValue::undefined());
            }
            require_input(allow_input, "caster.keyUp")?;
            let inj = require_injector(inj_kup.as_ref())?;
            let key = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("keyUp expects key")
                })?;
            let (ctrl, alt, shift) = parse_key_mods(args.get(1), ctx)?;
            inj.key_chord_up(&key, ctrl, alt, shift)
                .map_err(input_js_err)?;
            Ok(JsValue::undefined())
        })
    };

    let parse_json_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let raw = args
            .first()
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_default();
        let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
            boa_engine::JsNativeError::error().with_message(format!("parseJson: {e}"))
        })?;
        json_to_js(&val, ctx)
    });

    let stringify_fn = NativeFunction::from_copy_closure(|_this, args, ctx| {
        let v = args.first().cloned().unwrap_or(JsValue::undefined());
        let json = js_to_json(&v, ctx).map_err(|e| {
            boa_engine::JsNativeError::error().with_message(e)
        })?;
        let s = serde_json::to_string(&json).map_err(|e| {
            boa_engine::JsNativeError::error().with_message(e.to_string())
        })?;
        Ok(JsValue::from(js_string!(s)))
    });

    let allow_process_rp = allow_process;
    let cancel_ptr_rp = cancel_ptr;
    let run_process_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            if dry_run {
                let bus = unsafe { &*(bus_ptr as *const EventBus) };
                dry_run_skip(bus, "caster.runProcess");
                return Ok(JsValue::undefined());
            }
            if !allow_process_rp {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("caster.runProcess disabled (process permission required)")
                    .into());
            }
            let opts = args
                .first()
                .and_then(|v| v.as_object())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ()
                        .with_message("runProcess expects an object")
                })?;
            let command = opts
                .get(js_string!("command"), ctx)?
                .as_string()
                .map(|s| s.to_std_string_escaped())
                .ok_or_else(|| {
                    boa_engine::JsNativeError::typ().with_message("runProcess requires command")
                })?;
            if command.is_empty() {
                return Err(boa_engine::JsNativeError::error()
                    .with_message("runProcess empty command")
                    .into());
            }
            let mut cmd_args: Vec<String> = Vec::new();
            let args_val = opts.get(js_string!("args"), ctx)?;
            if let Some(arr) = args_val.as_object() {
                if let Ok(len) = arr.get(js_string!("length"), ctx) {
                    if let Some(n) = len.as_number() {
                        for i in 0..(n as i64).max(0) {
                            if let Ok(item) = arr.get(i as u32, ctx) {
                                if let Some(s) = item.as_string() {
                                    cmd_args.push(s.to_std_string_escaped());
                                } else if let Some(num) = item.as_number() {
                                    cmd_args.push(num.to_string());
                                }
                            }
                        }
                    }
                }
            }
            let wait = opts
                .get(js_string!("wait"), ctx)?
                .as_boolean()
                .unwrap_or(true);
            let timeout_ms = opts
                .get(js_string!("timeoutMs"), ctx)?
                .as_number()
                .map(|n| n.max(0.0) as u64);

            let mut child = Command::new(&command)
                .args(&cmd_args)
                .spawn()
                .map_err(|e| {
                    boa_engine::JsNativeError::error().with_message(format!("spawn failed: {e}"))
                })?;
            if !wait {
                return Ok(JsValue::undefined());
            }
            let cancel = &*(cancel_ptr_rp as *const CancellationToken);
            let deadline = timeout_ms.map(|ms| Instant::now() + Duration::from_millis(ms));
            loop {
                if cancel.is_cancelled() {
                    let _ = child.kill();
                    return Err(boa_engine::JsNativeError::error()
                        .with_message("cancelled")
                        .into());
                }
                if let Some(deadline) = deadline {
                    if Instant::now() >= deadline {
                        let _ = child.kill();
                        return Err(boa_engine::JsNativeError::error()
                            .with_message("runProcess timeout")
                            .into());
                    }
                }
                match child.try_wait() {
                    Ok(Some(_)) => return Ok(JsValue::undefined()),
                    Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                    Err(e) => {
                        return Err(boa_engine::JsNativeError::error()
                            .with_message(format!("wait failed: {e}"))
                            .into());
                    }
                }
            }
        })
    };

    let config_dir_inc = config_dir.clone();
    let base_opts_inc = base_opts.clone();
    let include_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            let id = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            include_begin(&base_opts_inc, &id).map_err(|e| {
                boa_engine::JsNativeError::error().with_message(e.to_string())
            })?;
            let result = (|| {
                let doc = resolve_script(&config_dir_inc, &id).map_err(|e| {
                    boa_engine::JsNativeError::error().with_message(e.to_string())
                })?;
                ensure_script_lang_compat(base_opts_inc.language, doc.language).map_err(|e| {
                    boa_engine::JsNativeError::error().with_message(e.to_string())
                })?;
                let wrapped = nest_include_js_wrapped(&doc.source, doc.language).map_err(|e| {
                    boa_engine::JsNativeError::error().with_message(e.to_string())
                })?;
                ctx.eval(Source::from_bytes(wrapped.as_bytes()))
            })();
            include_end(&base_opts_inc, &id);
            result
        })
    };

    let base_opts_rs = base_opts.clone();
    let bus_ptr_rs = bus_ptr;
    let cancel_ptr_rs = cancel_ptr;
    let nest_timeout_ms = timeout_ms;
    let run_script_fn = unsafe {
        NativeFunction::from_closure(move |_this, args, ctx| {
            let id = args
                .first()
                .and_then(|v| v.as_string())
                .map(|s| s.to_std_string_escaped())
                .unwrap_or_default();
            let mut params = HashMap::new();
            if let Some(param_obj) = args.get(1).and_then(|v| v.as_object()) {
                if let Ok(keys) = param_obj.own_property_keys(ctx) {
                    for key in keys {
                        let name = property_key_to_string(&key);
                        let v = param_obj.get(key, ctx)?;
                        params.insert(name, js_to_macro(&v));
                    }
                }
            }
            let bus = &*(bus_ptr_rs as *const EventBus);
            let cancel = &*(cancel_ptr_rs as *const CancellationToken);
            let ret = nest_run_script(&id, params, nest_timeout_ms, bus, cancel, &base_opts_rs)
                .map_err(|e| {
                    boa_engine::JsNativeError::error().with_message(e.to_string())
                })?;
            Ok(macro_to_js_value(ret.as_ref()))
        })
    };

    let assert_fn = NativeFunction::from_copy_closure(move |_this, args, _ctx| {
        let cond = args.first().map(|v| v.to_boolean()).unwrap_or(false);
        if cond {
            return Ok(JsValue::undefined());
        }
        let msg = args
            .get(1)
            .and_then(|v| v.as_string())
            .map(|s| s.to_std_string_escaped())
            .unwrap_or_else(|| "assertion failed".into());
        Err(boa_engine::JsNativeError::error()
            .with_message(msg)
            .into())
    });

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
        .function(run_script_fn, js_string!("runScript"), 2)
        .function(include_fn, js_string!("include"), 1)
        .function(run_process_fn, js_string!("runProcess"), 1)
        .function(parse_json_fn, js_string!("parseJson"), 1)
        .function(stringify_fn, js_string!("stringify"), 1)
        .function(sleep_fn, js_string!("sleep"), 1)
        .function(click_fn, js_string!("click"), 1)
        .function(move_to_fn, js_string!("moveTo"), 2)
        .function(mouse_down_fn, js_string!("mouseDown"), 1)
        .function(mouse_up_fn, js_string!("mouseUp"), 1)
        .function(wheel_fn, js_string!("wheel"), 2)
        .function(key_tap_fn, js_string!("keyTap"), 2)
        .function(key_down_fn, js_string!("keyDown"), 2)
        .function(key_up_fn, js_string!("keyUp"), 2)
        .function(assert_fn, js_string!("assert"), 2)
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
        .map_err(|e| ActionError::Message(format!("script.run: {e}")));

    watchdog_done.store(true, Ordering::SeqCst);

    let eval_result = eval_result?;

    if timed_out.load(Ordering::SeqCst) {
        return Err(ActionError::Message("script_timeout".into()));
    }
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
        PropertyKey::Symbol(s) => format!("Symbol({})", s.descriptive_string().to_std_string_escaped()),
        PropertyKey::Index(i) => i.get().to_string(),
    }
}

fn json_to_js(
    val: &serde_json::Value,
    ctx: &mut Context,
) -> Result<JsValue, boa_engine::JsError> {
    match val {
        serde_json::Value::Null => Ok(JsValue::null()),
        serde_json::Value::Bool(b) => Ok(JsValue::from(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(JsValue::from(i as f64))
            } else if let Some(f) = n.as_f64() {
                Ok(JsValue::from(f))
            } else {
                Ok(JsValue::from(0.0))
            }
        }
        serde_json::Value::String(s) => Ok(JsValue::from(js_string!(s.clone()))),
        serde_json::Value::Array(arr) => {
            let obj = boa_engine::object::ObjectInitializer::new(ctx).build();
            for (i, item) in arr.iter().enumerate() {
                let v = json_to_js(item, ctx)?;
                obj.set(i as u32, v, false, ctx)?;
            }
            obj.set(js_string!("length"), JsValue::from(arr.len() as f64), false, ctx)?;
            Ok(JsValue::from(obj))
        }
        serde_json::Value::Object(map) => {
            let obj = boa_engine::object::ObjectInitializer::new(ctx).build();
            for (k, item) in map {
                let v = json_to_js(item, ctx)?;
                obj.set(js_string!(k.clone()), v, false, ctx)?;
            }
            Ok(JsValue::from(obj))
        }
    }
}

fn js_to_json(v: &JsValue, ctx: &mut Context) -> Result<serde_json::Value, String> {
    if v.is_null() || v.is_undefined() {
        return Ok(serde_json::Value::Null);
    }
    if let Some(b) = v.as_boolean() {
        return Ok(serde_json::Value::Bool(b));
    }
    if let Some(n) = v.as_number() {
        return Ok(serde_json::Number::from_f64(n)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null));
    }
    if let Some(s) = v.as_string() {
        return Ok(serde_json::Value::String(s.to_std_string_escaped()));
    }
    if let Some(obj) = v.as_object() {
        let len = obj
            .get(js_string!("length"), ctx)
            .ok()
            .and_then(|l| l.as_number());
        if let Some(n) = len {
            let mut arr = Vec::new();
            for i in 0..(n as i64).max(0) {
                let item = obj
                    .get(i as u32, ctx)
                    .map_err(|e| e.to_string())?;
                arr.push(js_to_json(&item, ctx)?);
            }
            return Ok(serde_json::Value::Array(arr));
        }
        let keys = obj.own_property_keys(ctx).map_err(|e| e.to_string())?;
        let mut map = serde_json::Map::new();
        for key in keys {
            let name = property_key_to_string(&key);
            if name == "length" {
                continue;
            }
            let item = obj.get(key, ctx).map_err(|e| e.to_string())?;
            map.insert(name, js_to_json(&item, ctx)?);
        }
        return Ok(serde_json::Value::Object(map));
    }
    Ok(serde_json::Value::Null)
}

fn parse_mouse_button(s: &str) -> MouseButton {
    match s.to_ascii_lowercase().as_str() {
        "right" => MouseButton::Right,
        "middle" => MouseButton::Middle,
        _ => MouseButton::Left,
    }
}

fn require_input(allow: bool, name: &str) -> Result<(), boa_engine::JsError> {
    if allow {
        Ok(())
    } else {
        Err(boa_engine::JsNativeError::error()
            .with_message(format!("{name} disabled"))
            .into())
    }
}

fn require_injector(
    inj: Option<&Arc<dyn MouseInjector>>,
) -> Result<&dyn MouseInjector, boa_engine::JsError> {
    inj.map(|a| a.as_ref()).ok_or_else(|| {
        boa_engine::JsNativeError::error()
            .with_message("input unavailable")
            .into()
    })
}

fn input_js_err(e: crate::input::InputError) -> boa_engine::JsError {
    boa_engine::JsNativeError::error()
        .with_message(e.to_string())
        .into()
}

fn maybe_move_xy(
    inj: &dyn MouseInjector,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<(), boa_engine::JsError> {
    if let (Some(x), Some(y)) = (x, y) {
        inj.move_to(Point { x, y }).map_err(input_js_err)?;
    }
    Ok(())
}

fn parse_mouse_opts(
    arg: Option<&JsValue>,
    ctx: &mut Context,
) -> Result<(MouseButton, Option<i32>, Option<i32>), boa_engine::JsError> {
    let Some(obj) = arg.and_then(|v| v.as_object()) else {
        return Ok((MouseButton::Left, None, None));
    };
    let button = obj
        .get(js_string!("button"), ctx)?
        .as_string()
        .map(|s| parse_mouse_button(&s.to_std_string_escaped()))
        .unwrap_or(MouseButton::Left);
    let x = obj
        .get(js_string!("x"), ctx)?
        .as_number()
        .map(|n| n as i32);
    let y = obj
        .get(js_string!("y"), ctx)?
        .as_number()
        .map(|n| n as i32);
    Ok((button, x, y))
}

fn parse_key_mods(
    arg: Option<&JsValue>,
    ctx: &mut Context,
) -> Result<(bool, bool, bool), boa_engine::JsError> {
    let Some(obj) = arg.and_then(|v| v.as_object()) else {
        return Ok((false, false, false));
    };
    Ok((
        obj.get(js_string!("ctrl"), ctx)?
            .as_boolean()
            .unwrap_or(false),
        obj.get(js_string!("alt"), ctx)?
            .as_boolean()
            .unwrap_or(false),
        obj.get(js_string!("shift"), ctx)?
            .as_boolean()
            .unwrap_or(false),
    ))
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

fn macro_to_js_value(v: Option<&MacroValue>) -> JsValue {
    match v {
        None => JsValue::undefined(),
        Some(MacroValue::Bool(b)) => JsValue::from(*b),
        Some(MacroValue::Number(n)) => JsValue::from(*n),
        Some(MacroValue::String(s)) => JsValue::from(js_string!(s.as_str())),
    }
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

    #[test]
    fn script_input_gated_without_permission() {
        use crate::input::RecordingInjector;
        let mut env = MacroEnv::new();
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let inj = Arc::new(RecordingInjector::new());
        let opts = ScriptOptions {
            allow_input: false,
            injector: Some(inj.clone() as Arc<dyn MouseInjector>),
            ..ScriptOptions::default()
        };
        let err = run_script_with_options(
            r#"caster.click({ button: "left" });"#,
            5_000,
            &mut env,
            &bus,
            &cancel,
            &opts,
        )
        .unwrap_err();
        assert!(err.to_string().contains("disabled") || err.to_string().contains("click"));
        assert!(inj.clicks().is_empty());
    }

    #[test]
    fn script_click_and_key_with_permission() {
        use crate::input::RecordingInjector;
        let mut env = MacroEnv::new();
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let inj = Arc::new(RecordingInjector::new());
        let opts = ScriptOptions {
            allow_input: true,
            injector: Some(inj.clone() as Arc<dyn MouseInjector>),
            ..ScriptOptions::default()
        };
        run_script_with_options(
            r#"
              caster.sleep(1);
              caster.click({ button: "left", x: 10, y: 20 });
              caster.keyTap("A", { shift: true });
            "#,
            5_000,
            &mut env,
            &bus,
            &cancel,
            &opts,
        )
        .unwrap();
        assert_eq!(inj.clicks(), vec![MouseButton::Left]);
    }

    fn temp_scripts_dir(tag: &str) -> std::path::PathBuf {
        use std::time::{SystemTime, UNIX_EPOCH};
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dir = std::env::temp_dir().join(format!("caster-rt-{tag}-{stamp}"));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn sample_doc(
        id: &str,
        source: &str,
        allow_process: bool,
    ) -> crate::script_library::ScriptDoc {
        crate::script_library::ScriptDoc {
            id: id.into(),
            name: id.into(),
            source: source.into(),
            language: ScriptLanguage::Javascript,
            is_module: false,
            allow_network: false,
            allow_clipboard: false,
            allow_fs: false,
            allow_macro_control: false,
            allow_input: false,
            allow_process,
            param_values: Default::default(),
        }
    }

    #[test]
    fn run_script_unions_child_process_permission() {
        use crate::script_library::save_script;
        let dir = temp_scripts_dir("union");
        let child = sample_doc(
            "child-proc",
            r#"caster.runProcess({ command: "cmd", args: ["/c", "echo", "ok"], wait: true });"#,
            true,
        );
        save_script(&dir, &child).unwrap();
        let mut env = MacroEnv::new();
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let opts = ScriptOptions {
            allow_process: false,
            allow_network: false,
            config_dir: dir.clone(),
            ..ScriptOptions::default()
        };
        // Parent lacks process; child has it — union must allow.
        run_script_with_options(
            r#"caster.runScript("child-proc");"#,
            10_000,
            &mut env,
            &bus,
            &cancel,
            &opts,
        )
        .expect("child allow_process should union into nested run");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_script_max_nest_depth() {
        use crate::script_library::save_script;
        let dir = temp_scripts_dir("nest");
        // Chain: nest0 → nest1 → … → nest5 (6th call exceeds max depth 5)
        for i in 0..6 {
            let next = i + 1;
            let source = if i < 5 {
                format!(r#"caster.runScript("nest{next}");"#)
            } else {
                "caster.log('leaf');".into()
            };
            save_script(&dir, &sample_doc(&format!("nest{i}"), &source, false)).unwrap();
        }
        let mut env = MacroEnv::new();
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let opts = ScriptOptions {
            config_dir: dir.clone(),
            call_depth: 0,
            ..ScriptOptions::default()
        };
        let err = run_script_with_options(
            r#"caster.runScript("nest0");"#,
            10_000,
            &mut env,
            &bus,
            &cancel,
            &opts,
        )
        .unwrap_err();
        assert!(
            err.to_string().contains("max depth"),
            "expected depth error, got {err}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
