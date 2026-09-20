use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::actions::registry::{ActionContext, ActionError, ActionHandler, ActionRegistry};
use crate::actions::stub::NoopHandler;
use crate::cancel::CancellationToken;
use crate::env::MacroEnv;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::{MouseButton, MouseInjector, Point, RecordingInjector};
use crate::pause::PauseGate;
use crate::scheduler::wait_until;
use crate::schema::{ActionNode, MacroDocument, MacroProcessFilterMode, MacroValue};
use crate::settings::ProcessFilter;
use std::sync::Mutex;

/// Slice the action tree so execution starts at `path` (inclusive) within its sibling list.
pub fn actions_from_path(actions: &[ActionNode], path: &[usize]) -> Result<Vec<ActionNode>, String> {
    if path.is_empty() {
        return Ok(actions.to_vec());
    }
    let mut list = actions;
    let mut depth = 0;
    while depth < path.len() {
        let idx = path[depth];
        if depth + 1 == path.len() {
            if idx >= list.len() {
                return Err(format!("from_path index {idx} hors limites"));
            }
            return Ok(list[idx..].to_vec());
        }
        let node = list
            .get(idx)
            .ok_or_else(|| format!("from_path index {idx} hors limites"))?;
        match node {
            ActionNode::ControlIf {
                then,
                else_branch,
                ..
            } => {
                let branch = *path
                    .get(depth + 1)
                    .ok_or_else(|| "from_path branche manquante".to_string())?;
                let branch_list: &[ActionNode] = if branch == 0 {
                    then.as_slice()
                } else {
                    else_branch.as_slice()
                };
                if depth + 2 == path.len() {
                    // Path points at the branch itself → run whole branch.
                    return Ok(branch_list.to_vec());
                }
                list = branch_list;
                depth += 2;
            }
            _ => {
                return Err(
                    "from_path ne peut naviguer que dans des conditions (if)".into(),
                );
            }
        }
    }
    Ok(list.to_vec())
}

/// Executes parsed macros via ActionRegistry (real injection when configured).
pub struct MacroVm {
    registry: ActionRegistry,
    injector: Arc<dyn MouseInjector>,
}

impl MacroVm {
    /// Production VM with the given injector.
    pub fn with_injector(injector: Arc<dyn MouseInjector>) -> Self {
        let mut registry = ActionRegistry::new();
        registry.register(
            "mouse.click",
            Arc::new(MouseClickHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "mouse.move",
            Arc::new(MouseMoveHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "mouse.down",
            Arc::new(MouseDownHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "mouse.up",
            Arc::new(MouseUpHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "mouse.wheel",
            Arc::new(MouseWheelHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register("delay", Arc::new(DelayHandler));
        registry.register("process.run", Arc::new(ProcessRunHandler));
        registry.register("http.request", Arc::new(HttpRequestHandler));
        registry.register(
            "key.tap",
            Arc::new(KeyTapHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "key.down",
            Arc::new(KeyDownHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register(
            "key.up",
            Arc::new(KeyUpHandler {
                injector: Arc::clone(&injector),
            }),
        );
        registry.register("noop", Arc::new(NoopHandler));
        Self { registry, injector }
    }

    /// Test-friendly defaults (recording injector, no OS clicks).
    pub fn with_defaults() -> Self {
        Self::with_injector(Arc::new(RecordingInjector::new()))
    }

    pub fn run(
        &self,
        doc: &MacroDocument,
        cancel: &CancellationToken,
        pause: &PauseGate,
        bus: &EventBus,
    ) -> Result<Vec<String>, ActionError> {
        self.run_with_process_filter(doc, cancel, pause, bus, None)
    }

    pub fn run_with_process_filter(
        &self,
        doc: &MacroDocument,
        cancel: &CancellationToken,
        pause: &PauseGate,
        bus: &EventBus,
        process_filter: Option<Arc<Mutex<ProcessFilter>>>,
    ) -> Result<Vec<String>, ActionError> {
        self.run_from_path(doc, cancel, pause, bus, process_filter, None)
    }

    /// Run the macro starting at `from_path` (same encoding as the UI action tree).
    /// When `from_path` is set, only that action and its following siblings in the
    /// same list are executed (parent control.if wrappers are not re-run).
    pub fn run_from_path(
        &self,
        doc: &MacroDocument,
        cancel: &CancellationToken,
        pause: &PauseGate,
        bus: &EventBus,
        process_filter: Option<Arc<Mutex<ProcessFilter>>>,
        from_path: Option<&[usize]>,
    ) -> Result<Vec<String>, ActionError> {
        let sliced = match from_path {
            None | Some([]) => None,
            Some(path) => Some(actions_from_path(&doc.actions, path).map_err(ActionError::Message)?),
        };
        let mut run_doc = doc.clone();
        if let Some(actions) = sliced {
            run_doc.actions = actions;
        }
        let mut trace = Vec::new();
        let mut env = MacroEnv::new();
        let effective_filter = effective_process_filter(&run_doc, process_filter);
        let mut iteration = 0u32;
        loop {
            if run_doc.repeat_count > 0 && iteration >= run_doc.repeat_count {
                break;
            }
            if cancel.is_cancelled() {
                return Err(ActionError::Cancelled);
            }
            if !pause.wait_while_paused(|| cancel.is_cancelled()) {
                return Err(ActionError::Cancelled);
            }

            self.execute_actions(
                &run_doc.actions,
                &mut env,
                cancel,
                pause,
                bus,
                iteration,
                &[],
                &mut trace,
                &run_doc.name,
                effective_filter.as_ref(),
            )?;

            iteration = iteration.saturating_add(1);
            if run_doc.repeat_count == 0 {
                continue;
            }
            if iteration >= run_doc.repeat_count {
                break;
            }
        }
        Ok(trace)
    }

    /// Wait while the global process filter blocks foreground (same rules as clicker).
    fn wait_while_process_blocked(
        &self,
        process_filter: Option<&Arc<Mutex<ProcessFilter>>>,
        cancel: &CancellationToken,
    ) -> Result<(), ActionError> {
        let Some(shared) = process_filter else {
            return Ok(());
        };
        loop {
            if cancel.is_cancelled() {
                return Err(ActionError::Cancelled);
            }
            let allowed = {
                let Ok(filter) = shared.lock() else {
                    return Ok(());
                };
                if !filter.enabled {
                    return Ok(());
                }
                filter.allows(self.injector.foreground_exe().as_deref())
            };
            if allowed {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn execute_actions(
        &self,
        actions: &[ActionNode],
        env: &mut MacroEnv,
        cancel: &CancellationToken,
        pause: &PauseGate,
        bus: &EventBus,
        repeat: u32,
        path_prefix: &[usize],
        trace: &mut Vec<String>,
        macro_name: &str,
        process_filter: Option<&Arc<Mutex<ProcessFilter>>>,
    ) -> Result<(), ActionError> {
        for (index, action) in actions.iter().enumerate() {
            if cancel.is_cancelled() {
                return Err(ActionError::Cancelled);
            }
            if !pause.wait_while_paused(|| cancel.is_cancelled()) {
                return Err(ActionError::Cancelled);
            }
            self.wait_while_process_blocked(process_filter, cancel)?;

            env.set_foreground_exe(self.injector.foreground_exe());

            let mut path = path_prefix.to_vec();
            path.push(index);
            let top_index = path.first().copied().unwrap_or(index);

            // Display 1-based repeat / path to users (internal loop stays 0-based).
            let display_repeat = repeat.saturating_add(1);
            let display_path = path
                .iter()
                .map(|i| (i + 1).to_string())
                .collect::<Vec<_>>()
                .join(".");
            bus.publish(EngineEvent::ActionStarted {
                index: top_index,
                path: path.clone(),
                repeat: display_repeat,
            });
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!(
                    "« {macro_name} » · passe {display_repeat} · étape {display_path} · {}",
                    action_kind_label(action)
                ),
            });

            match action {
                ActionNode::MouseClick { id, button, x, y } => {
                    let mut params = serde_json::json!({ "button": button, "id": id });
                    if let Some(x) = x {
                        params["x"] = serde_json::json!(x);
                    }
                    if let Some(y) = y {
                        params["y"] = serde_json::json!(y);
                    }
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.click", &ctx)?;
                    trace.push(format!("click:{id}:{button}"));
                }
                ActionNode::MouseMove { id, x, y } => {
                    let params = serde_json::json!({ "id": id, "x": x, "y": y });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.move", &ctx)?;
                    trace.push(format!("move:{id}:{x},{y}"));
                }
                ActionNode::MouseDown { id, button, x, y } => {
                    let mut params = serde_json::json!({ "button": button, "id": id });
                    if let Some(x) = x {
                        params["x"] = serde_json::json!(x);
                    }
                    if let Some(y) = y {
                        params["y"] = serde_json::json!(y);
                    }
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.down", &ctx)?;
                    trace.push(format!("down:{id}:{button}"));
                }
                ActionNode::MouseUp { id, button, x, y } => {
                    let mut params = serde_json::json!({ "button": button, "id": id });
                    if let Some(x) = x {
                        params["x"] = serde_json::json!(x);
                    }
                    if let Some(y) = y {
                        params["y"] = serde_json::json!(y);
                    }
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.up", &ctx)?;
                    trace.push(format!("up:{id}:{button}"));
                }
                ActionNode::Delay { id, ms } => {
                    let params = serde_json::json!({ "ms": ms, "id": id });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("delay", &ctx)?;
                    trace.push(format!("delay:{id}:{ms}"));
                }
                ActionNode::ProcessRun {
                    id,
                    command,
                    args,
                    wait,
                    timeout_ms,
                } => {
                    let command = env.interpolate(command);
                    let args: Vec<String> = args.iter().map(|a| env.interpolate(a)).collect();
                    let params = serde_json::json!({
                        "id": id,
                        "command": command,
                        "args": args,
                        "wait": wait,
                        "timeoutMs": timeout_ms,
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("process.run", &ctx)?;
                    trace.push(format!("process:{id}:{command}"));
                }
                ActionNode::HttpRequest {
                    id,
                    method,
                    url,
                    body,
                    timeout_ms,
                    headers,
                    status_var,
                    body_var,
                    fail_on_status,
                } => {
                    let url = env.interpolate(url);
                    let body = body.as_ref().map(|b| env.interpolate(b));
                    let headers: Vec<(String, String)> = headers
                        .iter()
                        .map(|h| (env.interpolate(&h.name), env.interpolate(&h.value)))
                        .collect();
                    let params = serde_json::json!({
                        "id": id,
                        "method": method,
                        "url": url,
                        "body": body,
                        "timeoutMs": timeout_ms,
                        "headers": headers.iter().map(|(n, v)| serde_json::json!({"name": n, "value": v})).collect::<Vec<_>>(),
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    let (status, resp_body) = perform_http(&ctx)?;
                    if *fail_on_status && status >= 400 {
                        return Err(ActionError::Message(format!(
                            "http.request failed with status {status}"
                        )));
                    }
                    if let Some(name) = status_var.as_ref().filter(|s| !s.is_empty()) {
                        env.set(name.clone(), MacroValue::Number(status as f64));
                    }
                    if let Some(name) = body_var.as_ref().filter(|s| !s.is_empty()) {
                        env.set(name.clone(), MacroValue::String(resp_body));
                    }
                    trace.push(format!("http:{id}:{method}"));
                }
                ActionNode::JsonPath {
                    id,
                    source_var,
                    path,
                    dest_var,
                } => {
                    let source = env
                        .get(source_var)
                        .ok_or_else(|| {
                            ActionError::Message(format!(
                                "json.path: undefined variable '{source_var}'"
                            ))
                        })?;
                    let raw = match source {
                        MacroValue::String(s) => s.clone(),
                        other => crate::env::value_to_string_pub(other),
                    };
                    let path = env.interpolate(path);
                    let extracted = crate::json_path::extract_path_from_string(&raw, &path)?;
                    env.set(dest_var.clone(), extracted);
                    trace.push(format!("json.path:{id}:{path}"));
                }
                ActionNode::ScriptRun {
                    id,
                    source,
                    script_id,
                    timeout_ms,
                    params,
                    result_var,
                } => {
                    let (src, mut opts) =
                        if let Some(sid) = script_id.as_ref().filter(|s| !s.is_empty()) {
                            let doc = crate::script_library::load_script_doc(sid)?;
                            for (k, v) in &doc.param_values {
                                if !params.contains_key(k) {
                                    env.set(k.clone(), v.clone());
                                }
                            }
                            (
                                doc.source,
                                {
                                    let config_dir = crate::script_library::config_dir_default();
                                    crate::script_runtime::ScriptOptions {
                                        allow_network: doc.allow_network,
                                        allow_clipboard: doc.allow_clipboard,
                                        allow_fs: doc.allow_fs,
                                        allow_macro_control: doc.allow_macro_control,
                                        allow_input: doc.allow_input,
                                        allow_process: doc.allow_process,
                                        language: doc.language,
                                        config_dir,
                                        injector: Some(Arc::clone(&self.injector)),
                                        run_macro: None,
                                        call_depth: 0,
                                        nest_depth: None,
                                        include_stack: None,
                                        dry_run: false,
                                        step_gate: None,
                                    }
                                },
                            )
                        } else {
                            (
                                source.clone(),
                                {
                                    let config_dir = crate::script_library::config_dir_default();
                                    crate::script_runtime::ScriptOptions {
                                        allow_network: true,
                                        allow_clipboard: false,
                                        allow_fs: false,
                                        allow_macro_control: false,
                                        allow_input: false,
                                        allow_process: false,
                                        language: crate::script_library::ScriptLanguage::Javascript,
                                        config_dir,
                                        injector: Some(Arc::clone(&self.injector)),
                                        run_macro: None,
                                        call_depth: 0,
                                        nest_depth: None,
                                        include_stack: None,
                                        dry_run: false,
                                        step_gate: None,
                                    }
                                },
                            )
                        };
                    for (k, v) in params {
                        env.set(k.clone(), v.clone());
                    }
                    for def in crate::script_params::parse_param_defs(&src) {
                        if env.get(&def.name).is_none() {
                            if let Some(d) = def.default {
                                env.set(def.name, d);
                            }
                        }
                    }
                    if opts.allow_macro_control {
                        let injector = Arc::clone(&self.injector);
                        let cancel_c = cancel.clone();
                        let pause_c = pause.clone();
                        let bus_ptr = bus as *const EventBus as usize;
                        opts.run_macro = Some(Arc::new(move |macro_id: &str| {
                            let bus = unsafe { &*(bus_ptr as *const EventBus) };
                            nest_run_macro(macro_id, &injector, &cancel_c, &pause_c, bus)
                        }));
                    }
                    let returned = crate::script_runtime::run_script_with_options(
                        &src,
                        *timeout_ms,
                        env,
                        bus,
                        cancel,
                        &opts,
                    )?;
                    if let Some(name) = result_var.as_ref().filter(|s| !s.is_empty()) {
                        if let Some(v) = returned {
                            env.set(name.clone(), v);
                        }
                    }
                    trace.push(format!("script.run:{id}"));
                }
                ActionNode::KeyTap { id, key, mods } => {
                    let key = env.interpolate(key);
                    let params = serde_json::json!({
                        "id": id,
                        "key": key,
                        "mods": { "ctrl": mods.ctrl, "alt": mods.alt, "shift": mods.shift },
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("key.tap", &ctx)?;
                    trace.push(format!("key:{id}:{key}"));
                }
                ActionNode::KeyDown { id, key, mods } => {
                    let key = env.interpolate(key);
                    let params = serde_json::json!({
                        "id": id,
                        "key": key,
                        "mods": { "ctrl": mods.ctrl, "alt": mods.alt, "shift": mods.shift },
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("key.down", &ctx)?;
                    trace.push(format!("keydown:{id}:{key}"));
                }
                ActionNode::KeyUp { id, key, mods } => {
                    let key = env.interpolate(key);
                    let params = serde_json::json!({
                        "id": id,
                        "key": key,
                        "mods": { "ctrl": mods.ctrl, "alt": mods.alt, "shift": mods.shift },
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("key.up", &ctx)?;
                    trace.push(format!("keyup:{id}:{key}"));
                }
                ActionNode::MouseWheel { id, delta, x, y } => {
                    let params = serde_json::json!({
                        "id": id,
                        "delta": delta,
                        "x": x,
                        "y": y,
                    });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.wheel", &ctx)?;
                    trace.push(format!("wheel:{id}:{delta}"));
                }
                ActionNode::ClipboardSet { id, text } => {
                    let text = env.interpolate(text);
                    self.injector
                        .clipboard_set(&text)
                        .map_err(|e| ActionError::Message(e.to_string()))?;
                    trace.push(format!("clipset:{id}"));
                }
                ActionNode::ClipboardGet { id, name } => {
                    let text = self
                        .injector
                        .clipboard_get()
                        .map_err(|e| ActionError::Message(e.to_string()))?;
                    env.set(name.clone(), MacroValue::String(text));
                    trace.push(format!("clipget:{id}:{name}"));
                }
                ActionNode::VarSet { id, name, value } => {
                    let value = match value {
                        MacroValue::String(s) => MacroValue::String(env.interpolate(s)),
                        other => other.clone(),
                    };
                    env.set(name.clone(), value.clone());
                    trace.push(format!("var:{id}:{name}"));
                }
                ActionNode::ControlIf {
                    id,
                    condition,
                    then,
                    else_branch,
                } => {
                    let take_then = env.eval_condition(condition)?;
                    trace.push(format!("if:{id}:{}", if take_then { "then" } else { "else" }));
                    let branch = if take_then { then } else { else_branch };
                    let mut branch_prefix = path.clone();
                    // 0 = then, 1 = else for path segment after the if node
                    branch_prefix.push(if take_then { 0 } else { 1 });
                    self.execute_actions(
                        branch,
                        env,
                        cancel,
                        pause,
                        bus,
                        repeat,
                        &branch_prefix,
                        trace,
                        macro_name,
                        process_filter,
                    )?;
                }
                ActionNode::ControlWhile {
                    id,
                    condition,
                    body,
                    max_iterations,
                } => {
                    let mut loops = 0u32;
                    while env.eval_condition(condition)? {
                        if cancel.is_cancelled() {
                            return Err(ActionError::Cancelled);
                        }
                        if loops >= *max_iterations {
                            return Err(ActionError::Message(format!(
                                "control.while {id} exceeded maxIterations ({max_iterations})"
                            )));
                        }
                        let mut body_prefix = path.clone();
                        body_prefix.push(0);
                        self.execute_actions(
                            body,
                            env,
                            cancel,
                            pause,
                            bus,
                            repeat,
                            &body_prefix,
                            trace,
                            macro_name,
                            process_filter,
                        )?;
                        loops = loops.saturating_add(1);
                    }
                    trace.push(format!("while:{id}:{loops}"));
                }
            }
        }
        Ok(())
    }
}

pub(crate) fn nest_run_macro(
    macro_id: &str,
    injector: &Arc<dyn MouseInjector>,
    cancel: &CancellationToken,
    pause: &PauseGate,
    bus: &EventBus,
) -> Result<(), ActionError> {
    thread_local! {
        static DEPTH: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
    }
    let depth = DEPTH.with(|d| d.get());
    if depth >= 3 {
        return Err(ActionError::Message(
            "caster.runMacro: profondeur max (3) atteinte".into(),
        ));
    }
    let dir = crate::script_library::config_dir_default();
    let doc = crate::macro_library::load_macro(&dir, macro_id)
        .map_err(|e| ActionError::Message(format!("runMacro: {e}")))?;
    DEPTH.with(|d| d.set(depth + 1));
    let result = (|| {
        let vm = MacroVm::with_injector(Arc::clone(injector));
        vm.run(&doc, cancel, pause, bus).map(|_| ())
    })();
    DEPTH.with(|d| d.set(depth));
    result
}

fn effective_process_filter(
    doc: &MacroDocument,
    global: Option<Arc<Mutex<ProcessFilter>>>,
) -> Option<Arc<Mutex<ProcessFilter>>> {
    match doc.process_filter {
        MacroProcessFilterMode::Inherit => global,
        MacroProcessFilterMode::Off => None,
        MacroProcessFilterMode::Local => Some(Arc::new(Mutex::new(
            doc.local_process_filter.clone(),
        ))),
    }
}

fn action_kind_label(action: &ActionNode) -> String {
    match action {
        ActionNode::MouseClick { button, x, y, .. } => match (x, y) {
            (Some(x), Some(y)) => format!("mouse.click {button} @ ({x},{y})"),
            _ => format!("mouse.click {button}"),
        },
        ActionNode::MouseMove { x, y, .. } => format!("mouse.move ({x},{y})"),
        ActionNode::MouseDown { button, x, y, .. } => match (x, y) {
            (Some(x), Some(y)) => format!("mouse.down {button} @ ({x},{y})"),
            _ => format!("mouse.down {button}"),
        },
        ActionNode::MouseUp { button, x, y, .. } => match (x, y) {
            (Some(x), Some(y)) => format!("mouse.up {button} @ ({x},{y})"),
            _ => format!("mouse.up {button}"),
        },
        ActionNode::Delay { ms, .. } => format!("delay {ms}ms"),
        ActionNode::ProcessRun { command, .. } => format!("process.run {command}"),
        ActionNode::HttpRequest { method, url, .. } => format!("http.request {method} {url}"),
        ActionNode::JsonPath { path, dest_var, .. } => {
            format!("json.path {path} → {dest_var}")
        }
        ActionNode::ScriptRun { script_id, .. } => match script_id {
            Some(id) if !id.is_empty() => format!("script.run @{id}"),
            _ => "script.run".into(),
        },
        ActionNode::KeyTap { key, .. } => format!("key.tap {key}"),
        ActionNode::KeyDown { key, .. } => format!("key.down {key}"),
        ActionNode::KeyUp { key, .. } => format!("key.up {key}"),
        ActionNode::MouseWheel { delta, .. } => format!("mouse.wheel {delta}"),
        ActionNode::ClipboardSet { .. } => "clipboard.set".into(),
        ActionNode::ClipboardGet { name, .. } => format!("clipboard.get {name}"),
        ActionNode::VarSet { name, .. } => format!("var.set {name}"),
        ActionNode::ControlIf { .. } => "control.if".into(),
        ActionNode::ControlWhile { .. } => "control.while".into(),
    }
}

fn parse_button(s: &str) -> MouseButton {
    match s {
        "right" => MouseButton::Right,
        "middle" => MouseButton::Middle,
        _ => MouseButton::Left,
    }
}

fn maybe_move(injector: &dyn MouseInjector, params: &serde_json::Value) -> Result<(), ActionError> {
    let x = params.get("x").and_then(|v| v.as_i64()).map(|v| v as i32);
    let y = params.get("y").and_then(|v| v.as_i64()).map(|v| v as i32);
    if let (Some(x), Some(y)) = (x, y) {
        injector
            .move_to(Point { x, y })
            .map_err(|e| ActionError::Message(e.to_string()))?;
    }
    Ok(())
}

struct MouseClickHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for MouseClickHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let button_str = ctx
            .parameters
            .get("button")
            .and_then(|v| v.as_str())
            .unwrap_or("left");
        maybe_move(self.injector.as_ref(), ctx.parameters)?;
        self.injector
            .click(parse_button(button_str))
            .map_err(|e| ActionError::Message(e.to_string()))?;
        Ok(())
    }
}

struct MouseMoveHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for MouseMoveHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let x = ctx
            .parameters
            .get("x")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| ActionError::Message("mouse.move missing x".into()))? as i32;
        let y = ctx
            .parameters
            .get("y")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| ActionError::Message("mouse.move missing y".into()))? as i32;
        self.injector
            .move_to(Point { x, y })
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct MouseDownHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for MouseDownHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let button_str = ctx
            .parameters
            .get("button")
            .and_then(|v| v.as_str())
            .unwrap_or("left");
        maybe_move(self.injector.as_ref(), ctx.parameters)?;
        self.injector
            .mouse_down(parse_button(button_str))
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct MouseUpHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for MouseUpHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let button_str = ctx
            .parameters
            .get("button")
            .and_then(|v| v.as_str())
            .unwrap_or("left");
        maybe_move(self.injector.as_ref(), ctx.parameters)?;
        self.injector
            .mouse_up(parse_button(button_str))
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct DelayHandler;

impl ActionHandler for DelayHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let ms = ctx
            .parameters
            .get("ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let deadline = Instant::now() + Duration::from_millis(ms);
        if !wait_until(deadline, ctx.cancel) {
            return Err(ActionError::Cancelled);
        }
        Ok(())
    }
}

struct ProcessRunHandler;

impl ActionHandler for ProcessRunHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        if ctx.cancel.is_cancelled() {
            return Err(ActionError::Cancelled);
        }
        let command = ctx
            .parameters
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionError::Message("process.run missing command".into()))?;
        if command.is_empty() {
            return Err(ActionError::Message("process.run empty command".into()));
        }
        let args: Vec<String> = ctx
            .parameters
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let mut child = Command::new(command)
            .args(&args)
            .spawn()
            .map_err(|e| ActionError::Message(format!("spawn failed: {e}")))?;

        let wait = ctx
            .parameters
            .get("wait")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        if !wait {
            ctx.bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!("process spawned (no wait): {command}"),
            });
            return Ok(());
        }

        let timeout_ms = ctx.parameters.get("timeoutMs").and_then(|v| v.as_u64());
        let deadline = timeout_ms.map(|ms| Instant::now() + Duration::from_millis(ms));

        loop {
            if ctx.cancel.is_cancelled() {
                let _ = child.kill();
                return Err(ActionError::Cancelled);
            }
            if let Some(deadline) = deadline {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    return Err(ActionError::Message(format!(
                        "process.run timeout after {} ms",
                        timeout_ms.unwrap_or(0)
                    )));
                }
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        ctx.bus.publish(EngineEvent::Log {
                            level: LogLevel::Warn,
                            message: format!("process exited: {status}"),
                        });
                    }
                    return Ok(());
                }
                Ok(None) => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(e) => return Err(ActionError::Message(format!("wait failed: {e}"))),
            }
        }
    }
}

struct HttpRequestHandler;

impl ActionHandler for HttpRequestHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let _ = perform_http(ctx)?;
        Ok(())
    }
}

fn header_list(params: &serde_json::Value) -> Vec<(String, String)> {
    params
        .get("headers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|h| {
                    let name = h.get("name")?.as_str()?.to_string();
                    let value = h.get("value")?.as_str()?.to_string();
                    Some((name, value))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn apply_http_headers(mut req: ureq::Request, headers: &[(String, String)]) -> ureq::Request {
    for (name, value) in headers {
        req = req.set(name, value);
    }
    req
}

fn perform_http(ctx: &ActionContext<'_>) -> Result<(u16, String), ActionError> {
    if ctx.cancel.is_cancelled() {
        return Err(ActionError::Cancelled);
    }
    let method = ctx
        .parameters
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");
    let url = ctx
        .parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ActionError::Message("http.request missing url".into()))?;
    let timeout_ms = ctx
        .parameters
        .get("timeoutMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(10_000);
    let body = ctx
        .parameters
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let headers = header_list(ctx.parameters);

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .build();

    let result = match method.to_ascii_uppercase().as_str() {
        "GET" => apply_http_headers(agent.get(url), &headers).call(),
        "POST" => {
            let req = apply_http_headers(agent.post(url), &headers);
            if let Some(b) = body.as_deref() {
                req.send_string(b)
            } else {
                req.call()
            }
        }
        "PUT" => {
            let req = apply_http_headers(agent.put(url), &headers);
            if let Some(b) = body.as_deref() {
                req.send_string(b)
            } else {
                req.call()
            }
        }
        "DELETE" => apply_http_headers(agent.delete(url), &headers).call(),
        other => {
            return Err(ActionError::Message(format!(
                "unsupported http method: {other}"
            )));
        }
    };

    let (status, body_text) = match result {
        Ok(resp) => {
            let status = resp.status();
            let body_text = resp.into_string().unwrap_or_default();
            (status, body_text)
        }
        Err(ureq::Error::Status(code, resp)) => {
            let body_text = resp.into_string().unwrap_or_default();
            (code, body_text)
        }
        Err(e) => {
            if ctx.cancel.is_cancelled() {
                return Err(ActionError::Cancelled);
            }
            return Err(ActionError::Message(format!("http failed: {e}")));
        }
    };

    ctx.bus.publish(EngineEvent::Log {
        level: LogLevel::Info,
        message: format!("http {} → {}", method, status),
    });
    Ok((status, body_text))
}

fn chord_from_params(params: &serde_json::Value) -> (bool, bool, bool) {
    let mods = params.get("mods");
    (
        mods.and_then(|m| m.get("ctrl"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        mods.and_then(|m| m.get("alt"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        mods.and_then(|m| m.get("shift"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    )
}

struct KeyTapHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for KeyTapHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let key = ctx
            .parameters
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionError::Message("key.tap missing key".into()))?;
        let (ctrl, alt, shift) = chord_from_params(ctx.parameters);
        self.injector
            .key_chord_tap(key, ctrl, alt, shift)
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct KeyDownHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for KeyDownHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let key = ctx
            .parameters
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionError::Message("key.down missing key".into()))?;
        let (ctrl, alt, shift) = chord_from_params(ctx.parameters);
        self.injector
            .key_chord_down(key, ctrl, alt, shift)
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct KeyUpHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for KeyUpHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let key = ctx
            .parameters
            .get("key")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionError::Message("key.up missing key".into()))?;
        let (ctrl, alt, shift) = chord_from_params(ctx.parameters);
        self.injector
            .key_chord_up(key, ctrl, alt, shift)
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

struct MouseWheelHandler {
    injector: Arc<dyn MouseInjector>,
}

impl ActionHandler for MouseWheelHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        maybe_move(self.injector.as_ref(), ctx.parameters)?;
        let delta = ctx
            .parameters
            .get("delta")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
        self.injector
            .mouse_wheel(delta)
            .map_err(|e| ActionError::Message(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{parse_macro_json, Trigger};
    use std::sync::Mutex;

    #[test]
    fn runs_click_delay_click_trace() {
        let json = r#"{
          "schemaVersion": 1,
          "name": "seq",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "a1", "type": "mouse.click", "button": "left" },
            { "id": "a2", "type": "delay", "ms": 30 },
            { "id": "a3", "type": "mouse.click", "button": "left" }
          ]
        }"#;
        let doc = parse_macro_json(json).unwrap();
        assert!(matches!(doc.trigger, Trigger::Manual));

        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let start = Instant::now();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        let elapsed = start.elapsed();

        assert_eq!(
            trace,
            vec![
                "click:a1:left".to_string(),
                "delay:a2:30".to_string(),
                "click:a3:left".to_string()
            ]
        );
        assert_eq!(inj.len(), 2);
        assert!(elapsed >= Duration::from_millis(25));
    }

    #[test]
    fn process_filter_waits_then_runs() {
        use crate::settings::{ProcessFilter, ProcessFilterMode};

        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 1,
          "name": "pf",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "a1", "type": "mouse.click", "button": "left" }
          ]
        }"#,
        )
        .unwrap();

        let inj = Arc::new(RecordingInjector::new());
        inj.set_foreground_exe(Some("chrome.exe"));
        let filter = Arc::new(Mutex::new(ProcessFilter {
            enabled: true,
            mode: ProcessFilterMode::Allow,
            names: vec!["notepad.exe".into()],
        }));
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let inj_flip = Arc::clone(&inj);

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            inj_flip.set_foreground_exe(Some("notepad.exe"));
        });

        let start = Instant::now();
        let trace = vm
            .run_with_process_filter(&doc, &cancel, &pause, &bus, Some(filter))
            .unwrap();
        assert_eq!(trace, vec!["click:a1:left".to_string()]);
        assert_eq!(inj.len(), 1);
        assert!(start.elapsed() >= Duration::from_millis(50));
    }

    #[test]
    fn cancel_aborts_long_delay() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 1,
          "name": "long",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "d1", "type": "delay", "ms": 5000 }
          ]
        }"#,
        )
        .unwrap();
        let vm = MacroVm::with_defaults();
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let cancel_flag = cancel.clone();
        let started = Arc::new(Mutex::new(false));
        let started_flag = Arc::clone(&started);

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            *started_flag.lock().unwrap() = true;
            cancel_flag.cancel();
        });

        let err = vm.run(&doc, &cancel, &pause, &bus).unwrap_err();
        assert!(matches!(err, ActionError::Cancelled));
        assert!(*started.lock().unwrap());
    }

    #[test]
    fn repeat_count_runs_twice() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 2,
          "name": "rep",
          "trigger": { "type": "manual" },
          "repeatCount": 2,
          "actions": [
            { "id": "a1", "type": "mouse.click", "button": "left" }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(trace.len(), 2);
        assert_eq!(inj.len(), 2);
    }

    #[test]
    fn process_run_echo() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 2,
          "name": "proc",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "p1", "type": "process.run", "command": "cmd", "args": ["/C", "echo", "ok"] }
          ]
        }"#,
        )
        .unwrap();
        let vm = MacroVm::with_defaults();
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(trace, vec!["process:p1:cmd".to_string()]);
    }

    #[test]
    fn pause_blocks_until_resume() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 2,
          "name": "p",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "a1", "type": "mouse.click", "button": "left" },
            { "id": "a2", "type": "mouse.click", "button": "left" }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let pause_c = pause.clone();
        let bus = EventBus::new();

        pause.pause();
        let handle = std::thread::spawn(move || vm.run(&doc, &cancel, &pause, &bus));
        std::thread::sleep(Duration::from_millis(40));
        assert_eq!(inj.len(), 0);
        pause_c.resume();
        handle.join().unwrap().unwrap();
        assert_eq!(inj.len(), 2);
    }

    #[test]
    fn key_tap_records() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 3,
          "name": "k",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "k1", "type": "key.tap", "key": "A" }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(trace, vec!["key:k1:A".to_string()]);
        assert_eq!(inj.keys(), vec!["A".to_string()]);
    }

    #[test]
    fn var_if_takes_then_branch() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 4,
          "name": "if",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "v1", "type": "var.set", "name": "n", "value": 2 },
            {
              "id": "i1",
              "type": "control.if",
              "condition": { "left": { "var": "n" }, "op": "gt", "right": 1 },
              "then": [ { "id": "k1", "type": "key.tap", "key": "A" } ],
              "else": [ { "id": "k2", "type": "key.tap", "key": "B" } ]
            }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(
            trace,
            vec![
                "var:v1:n".to_string(),
                "if:i1:then".to_string(),
                "key:k1:A".to_string()
            ]
        );
        assert_eq!(inj.keys(), vec!["A".to_string()]);
    }

    #[test]
    fn var_if_takes_else_branch() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 4,
          "name": "if",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "v1", "type": "var.set", "name": "n", "value": 0 },
            {
              "id": "i1",
              "type": "control.if",
              "condition": { "left": { "var": "n" }, "op": "gt", "right": 1 },
              "then": [ { "id": "k1", "type": "key.tap", "key": "A" } ],
              "else": [ { "id": "k2", "type": "key.tap", "key": "B" } ]
            }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert!(trace.iter().any(|t| t == "if:i1:else"));
        assert_eq!(inj.keys(), vec!["B".to_string()]);
    }

    #[test]
    fn interpolate_key_from_var() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 4,
          "name": "interp",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "v1", "type": "var.set", "name": "k", "value": "Z" },
            { "id": "k1", "type": "key.tap", "key": "{{k}}" }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(trace.last().unwrap(), "key:k1:Z");
        assert_eq!(inj.keys(), vec!["Z".to_string()]);
    }

    #[test]
    fn mouse_gesture_v5_records_down_move_up() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 5,
          "name": "drag",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "d", "type": "mouse.down", "button": "left", "x": 10, "y": 20 },
            { "id": "m", "type": "mouse.move", "x": 40, "y": 80 },
            { "id": "u", "type": "mouse.up", "button": "left", "x": 40, "y": 80 }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(
            trace,
            vec![
                "down:d:left".to_string(),
                "move:m:40,80".to_string(),
                "up:u:left".to_string()
            ]
        );
        assert_eq!(inj.downs().len(), 1);
        assert_eq!(inj.ups().len(), 1);
        assert_eq!(
            inj.moves(),
            vec![
                Point { x: 10, y: 20 },
                Point { x: 40, y: 80 },
                Point { x: 40, y: 80 }
            ]
        );
    }

    #[test]
    fn key_chord_wheel_clipboard() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 6,
          "name": "v6",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "k", "type": "key.tap", "key": "C", "mods": { "ctrl": true } },
            { "id": "d", "type": "key.down", "key": "A" },
            { "id": "u", "type": "key.up", "key": "A" },
            { "id": "w", "type": "mouse.wheel", "delta": -120 },
            { "id": "s", "type": "clipboard.set", "text": "hello {{x}}" },
            { "id": "v", "type": "var.set", "name": "x", "value": "world" },
            { "id": "s2", "type": "clipboard.set", "text": "hello {{x}}" },
            { "id": "g", "type": "clipboard.get", "name": "clip" }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert_eq!(
            trace,
            vec![
                "key:k:C".to_string(),
                "keydown:d:A".to_string(),
                "keyup:u:A".to_string(),
                "wheel:w:-120".to_string(),
                "clipset:s".to_string(),
                "var:v:x".to_string(),
                "clipset:s2".to_string(),
                "clipget:g:clip".to_string(),
            ]
        );
        assert_eq!(inj.keys(), vec!["Ctrl+C".to_string(), "down:A".to_string(), "up:A".to_string()]);
        assert_eq!(inj.wheels(), vec![-120]);
        assert_eq!(inj.clipboard_text(), "hello world");
    }

    #[test]
    fn while_loop_runs_until_condition_false() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 7,
          "name": "while",
          "trigger": { "type": "manual" },
          "actions": [
            { "id": "v1", "type": "var.set", "name": "n", "value": 3 },
            {
              "id": "w1",
              "type": "control.while",
              "condition": { "left": { "var": "n" }, "op": "gt", "right": 0 },
              "body": [
                { "id": "d1", "type": "var.set", "name": "n", "value": 0 },
                { "id": "k1", "type": "key.tap", "key": "A" }
              ],
              "maxIterations": 10
            }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert!(trace.iter().any(|t| t.starts_with("while:w1:")));
        assert_eq!(inj.keys().len(), 1);
    }

    #[test]
    fn macro_local_process_filter_blocks() {
        use crate::schema::MacroProcessFilterMode;
        use crate::settings::{ProcessFilter, ProcessFilterMode};

        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 7,
          "name": "localpf",
          "trigger": { "type": "manual" },
          "processFilter": "local",
          "localProcessFilter": {
            "enabled": true,
            "mode": "allow",
            "names": ["notepad.exe"]
          },
          "actions": [
            { "id": "a1", "type": "mouse.click", "button": "left" }
          ]
        }"#,
        )
        .unwrap();
        assert_eq!(doc.process_filter, MacroProcessFilterMode::Local);

        let inj = Arc::new(RecordingInjector::new());
        inj.set_foreground_exe(Some("chrome.exe".into()));
        let global = Arc::new(Mutex::new(ProcessFilter {
            enabled: false,
            mode: ProcessFilterMode::Deny,
            names: vec![],
        }));
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let inj_flip = Arc::clone(&inj);

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            inj_flip.set_foreground_exe(Some("notepad.exe".into()));
        });

        let trace = vm
            .run_with_process_filter(&doc, &cancel, &pause, &bus, Some(global))
            .unwrap();
        assert_eq!(trace, vec!["click:a1:left".to_string()]);
    }

    #[test]
    fn process_condition_in_if() {
        let doc = parse_macro_json(
            r#"{
          "schemaVersion": 7,
          "name": "procif",
          "trigger": { "type": "manual" },
          "actions": [
            {
              "id": "i1",
              "type": "control.if",
              "condition": { "predicate": "process.eq", "value": "game.exe" },
              "then": [ { "id": "k1", "type": "key.tap", "key": "A" } ],
              "else": [ { "id": "k2", "type": "key.tap", "key": "B" } ]
            }
          ]
        }"#,
        )
        .unwrap();
        let inj = Arc::new(RecordingInjector::new());
        inj.set_foreground_exe(Some("game.exe".into()));
        let vm = MacroVm::with_injector(Arc::clone(&inj) as Arc<dyn MouseInjector>);
        let cancel = CancellationToken::new();
        let pause = PauseGate::new();
        let bus = EventBus::new();
        let trace = vm.run(&doc, &cancel, &pause, &bus).unwrap();
        assert!(trace.iter().any(|t| t == "key:k1:A"));
    }
}
