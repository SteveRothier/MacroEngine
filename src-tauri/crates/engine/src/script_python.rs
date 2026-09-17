//! Python script sidecar: system CPython + line-delimited JSON-RPC over stdin/stdout.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::actions::registry::ActionError;
use crate::cancel::CancellationToken;
use crate::env::MacroEnv;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::input::{MouseButton, Point};
use crate::schema::MacroValue;
use crate::script_runtime::{http_fetch, ScriptOptions};

const RUNNER_PY: &str = r#"
import json, sys, threading, traceback, time

_resp = {}
_cond = threading.Condition()
_next = 1
_done = {"ok": False, "value": None, "error": None}

def _reader():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        rid = msg.get("id")
        if rid is None:
            continue
        with _cond:
            _resp[rid] = msg
            _cond.notify_all()

threading.Thread(target=_reader, daemon=True).start()

def _call(method, params=None):
    global _next
    with _cond:
        rid = _next
        _next += 1
    sys.stdout.write(json.dumps({"id": rid, "method": method, "params": params or {}}) + "\n")
    sys.stdout.flush()
    while True:
        with _cond:
            if rid in _resp:
                msg = _resp.pop(rid)
                break
            _cond.wait(0.05)
    if "error" in msg and msg["error"]:
        raise RuntimeError(str(msg["error"]))
    return msg.get("result")

class Caster:
    def get(self, name):
        return _call("get", {"name": name})
    def set(self, name, value):
        return _call("set", {"name": name, "value": value})
    def log(self, message):
        return _call("log", {"message": str(message)})
    def ret(self, value=None):
        return _call("return", {"value": value})
    def sleep(self, ms):
        return _call("sleep", {"ms": int(ms)})
    def fetch(self, opts=None):
        return _call("fetch", opts or {})
    def clipboardRead(self):
        return _call("clipboardRead", {})
    def clipboardWrite(self, text):
        return _call("clipboardWrite", {"text": text})
    def readFile(self, path):
        return _call("readFile", {"path": path})
    def writeFile(self, path, text):
        return _call("writeFile", {"path": path, "text": text})
    def click(self, opts=None):
        return _call("click", opts or {})
    def moveTo(self, x, y):
        return _call("moveTo", {"x": x, "y": y})
    def mouseDown(self, opts=None):
        return _call("mouseDown", opts or {})
    def mouseUp(self, opts=None):
        return _call("mouseUp", opts or {})
    def wheel(self, dx, dy):
        return _call("wheel", {"dx": dx, "dy": dy})
    def keyTap(self, key, mods=None):
        p = {"key": key}
        if mods:
            p.update(mods)
        return _call("keyTap", p)
    def keyDown(self, key, mods=None):
        p = {"key": key}
        if mods:
            p.update(mods)
        return _call("keyDown", p)
    def keyUp(self, key, mods=None):
        p = {"key": key}
        if mods:
            p.update(mods)
        return _call("keyUp", p)
    def runMacro(self, name):
        return _call("runMacro", {"name": name})
    def runProcess(self, opts=None):
        return _call("runProcess", opts or {})
    def parseJson(self, text):
        return json.loads(text)
    def stringify(self, value):
        return json.dumps(value)
    def include(self, *_a, **_k):
        raise RuntimeError("caster.include is not available in Python scripts")
    def runScript(self, *_a, **_k):
        raise RuntimeError("caster.runScript is not available in Python scripts")

caster = Caster()

def main():
    user_path = sys.argv[1]
    with open(user_path, "r", encoding="utf-8") as f:
        src = f.read()
    try:
        g = {"caster": caster, "json": json, "time": time}
        exec(compile(src, user_path, "exec"), g, g)
        sys.stdout.write(json.dumps({"method": "done", "params": {"ok": True}}) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({
            "method": "done",
            "params": {"ok": False, "error": str(e), "trace": traceback.format_exc()}
        }) + "\n")
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
"#;

static PYTHON_CACHE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn python_cache() -> &'static Mutex<Option<PathBuf>> {
    PYTHON_CACHE.get_or_init(|| Mutex::new(None))
}

/// Resolve system Python (`py -3`, `python`, `python3`).
pub fn find_python() -> Result<PathBuf, ActionError> {
    {
        let guard = python_cache()
            .lock()
            .map_err(|_| ActionError::Message("python cache lock".into()))?;
        if let Some(p) = guard.as_ref() {
            return Ok(p.clone());
        }
    }
    let found = discover_python().ok_or_else(|| ActionError::Message("python_not_found".into()))?;
    let mut guard = python_cache()
        .lock()
        .map_err(|_| ActionError::Message("python cache lock".into()))?;
    *guard = Some(found.clone());
    Ok(found)
}

fn discover_python() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(p) = try_python_cmd("py", &["-3", "-c", "import sys; print(sys.executable)"]) {
            return Some(p);
        }
    }
    for bin in ["python", "python3"] {
        if let Some(p) = try_python_cmd(bin, &["-c", "import sys; print(sys.executable)"]) {
            return Some(p);
        }
    }
    None
}

fn try_python_cmd(bin: &str, args: &[&str]) -> Option<PathBuf> {
    let out = Command::new(bin).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let p = PathBuf::from(path);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

fn sandbox_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = relative.replace('\\', "/");
    if rel.contains("..") || Path::new(&rel).is_absolute() {
        return Err("path escapes sandbox".into());
    }
    let joined = root.join(rel);
    let canon_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    if let Ok(canon) = fs::canonicalize(&joined) {
        if !canon.starts_with(&canon_root) {
            return Err("path escapes sandbox".into());
        }
        return Ok(canon);
    }
    Ok(joined)
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

fn macro_to_json(v: &MacroValue) -> Value {
    match v {
        MacroValue::Bool(b) => Value::Bool(*b),
        MacroValue::Number(n) => json!(*n),
        MacroValue::String(s) => Value::String(s.clone()),
    }
}

fn parse_button(s: &str) -> MouseButton {
    match s.to_ascii_lowercase().as_str() {
        "right" => MouseButton::Right,
        "middle" => MouseButton::Middle,
        _ => MouseButton::Left,
    }
}

fn handle_host_call(
    method: &str,
    params: &Value,
    env: &mut MacroEnv,
    bus: &EventBus,
    cancel: &CancellationToken,
    opts: &ScriptOptions,
) -> Result<Value, String> {
    if cancel.is_cancelled() {
        return Err("cancelled".into());
    }
    match method {
        "get" => {
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            Ok(match env.get(name) {
                Some(v) => macro_to_json(v),
                None => Value::Null,
            })
        }
        "set" => {
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let value = params.get("value").cloned().unwrap_or(Value::Null);
            env.set(name, json_to_macro(&value));
            Ok(Value::Null)
        }
        "log" => {
            let message = params
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            bus.publish(EngineEvent::Log {
                level: LogLevel::Info,
                message: format!("script: {message}"),
            });
            Ok(Value::Null)
        }
        "return" => {
            let value = params.get("value").cloned().unwrap_or(Value::Null);
            env.set("__python_return", json_to_macro(&value));
            Ok(Value::Null)
        }
        "sleep" => {
            let ms = params.get("ms").and_then(|v| v.as_u64()).unwrap_or(0);
            let end = Instant::now() + Duration::from_millis(ms.max(1));
            while Instant::now() < end {
                if cancel.is_cancelled() {
                    return Err("cancelled".into());
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            Ok(Value::Null)
        }
        "fetch" => {
            if !opts.allow_network {
                return Err("caster.fetch disabled".into());
            }
            let method = params
                .get("method")
                .and_then(|v| v.as_str())
                .unwrap_or("GET");
            let url = params
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or("fetch url required")?;
            let body = params
                .get("body")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let timeout_ms = params
                .get("timeoutMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(15_000);
            let headers: Vec<(String, String)> = params
                .get("headers")
                .and_then(|v| v.as_object())
                .map(|m| {
                    m.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();
            let (status, body_text) =
                http_fetch(method, url, body.as_deref(), &headers, timeout_ms)?;
            Ok(json!({ "status": status, "body": body_text }))
        }
        "clipboardRead" => {
            if !opts.allow_clipboard {
                return Err("caster.clipboardRead disabled".into());
            }
            let inj = opts
                .injector
                .as_ref()
                .ok_or("clipboard unavailable")?;
            Ok(Value::String(inj.clipboard_get().map_err(|e| e.to_string())?))
        }
        "clipboardWrite" => {
            if !opts.allow_clipboard {
                return Err("caster.clipboardWrite disabled".into());
            }
            let text = params
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let inj = opts
                .injector
                .as_ref()
                .ok_or("clipboard unavailable")?;
            inj.clipboard_set(text).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "readFile" => {
            if !opts.allow_fs {
                return Err("caster.readFile disabled".into());
            }
            let rel = params
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let path = sandbox_path(&opts.script_data_dir(), rel)?;
            let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
            Ok(Value::String(text))
        }
        "writeFile" => {
            if !opts.allow_fs {
                return Err("caster.writeFile disabled".into());
            }
            let rel = params
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let text = params
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let path = sandbox_path(&opts.script_data_dir(), rel)?;
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(path, text).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "click" | "mouseDown" | "mouseUp" => {
            if !opts.allow_input {
                return Err(format!("caster.{method} disabled"));
            }
            let inj = opts.injector.as_ref().ok_or("input unavailable")?;
            let button = params
                .get("button")
                .and_then(|v| v.as_str())
                .map(parse_button)
                .unwrap_or(MouseButton::Left);
            let x = params.get("x").and_then(|v| v.as_i64()).map(|n| n as i32);
            let y = params.get("y").and_then(|v| v.as_i64()).map(|n| n as i32);
            if let (Some(x), Some(y)) = (x, y) {
                inj.move_to(Point { x, y }).map_err(|e| e.to_string())?;
            }
            match method {
                "click" => inj.click(button).map_err(|e| e.to_string())?,
                "mouseDown" => inj.mouse_down(button).map_err(|e| e.to_string())?,
                "mouseUp" => inj.mouse_up(button).map_err(|e| e.to_string())?,
                _ => {}
            }
            Ok(Value::Null)
        }
        "moveTo" => {
            if !opts.allow_input {
                return Err("caster.moveTo disabled".into());
            }
            let inj = opts.injector.as_ref().ok_or("input unavailable")?;
            let x = params.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = params.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            inj.move_to(Point { x, y }).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "keyTap" | "keyDown" | "keyUp" => {
            if !opts.allow_input {
                return Err(format!("caster.{method} disabled"));
            }
            let inj = opts.injector.as_ref().ok_or("input unavailable")?;
            let key = params
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let ctrl = params.get("ctrl").and_then(|v| v.as_bool()).unwrap_or(false);
            let alt = params.get("alt").and_then(|v| v.as_bool()).unwrap_or(false);
            let shift = params
                .get("shift")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            match method {
                "keyTap" => inj
                    .key_chord_tap(key, ctrl, alt, shift)
                    .map_err(|e| e.to_string())?,
                "keyDown" => inj
                    .key_chord_down(key, ctrl, alt, shift)
                    .map_err(|e| e.to_string())?,
                "keyUp" => inj
                    .key_chord_up(key, ctrl, alt, shift)
                    .map_err(|e| e.to_string())?,
                _ => {}
            }
            Ok(Value::Null)
        }
        "wheel" => {
            if !opts.allow_input {
                return Err("caster.wheel disabled".into());
            }
            let inj = opts.injector.as_ref().ok_or("input unavailable")?;
            let dy = params.get("dy").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            inj.mouse_wheel(dy).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "runMacro" => {
            if !opts.allow_macro_control {
                return Err("caster.runMacro disabled".into());
            }
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("runMacro name required")?;
            let cb = opts
                .run_macro
                .as_ref()
                .ok_or("runMacro unavailable")?;
            cb(name).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "runProcess" => {
            if !opts.allow_process {
                return Err("caster.runProcess disabled".into());
            }
            let command = params
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or("runProcess command required")?;
            let args: Vec<String> = params
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let wait = params
                .get("wait")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let timeout_ms = params
                .get("timeoutMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(30_000);
            let mut child = Command::new(command)
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| e.to_string())?;
            if !wait {
                return Ok(json!({ "started": true }));
            }
            let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(1));
            loop {
                if cancel.is_cancelled() {
                    let _ = child.kill();
                    return Err("cancelled".into());
                }
                if Instant::now() > deadline {
                    let _ = child.kill();
                    return Err("runProcess timeout".into());
                }
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let stdout = child
                            .stdout
                            .take()
                            .map(|s| {
                                let mut buf = String::new();
                                let _ = BufReader::new(s).read_line(&mut buf);
                                buf
                            })
                            .unwrap_or_default();
                        return Ok(json!({
                            "exitCode": status.code().unwrap_or(-1),
                            "stdout": stdout,
                        }));
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(20)),
                    Err(e) => return Err(e.to_string()),
                }
            }
        }
        other => Err(format!("unknown method: {other}")),
    }
}

/// Run a Python script via sidecar. Returns optional value from `caster.return`.
pub fn run_python_script(
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
    let python = find_python()?;
    let _ = fs::create_dir_all(opts.script_data_dir());

    let tmp = std::env::temp_dir().join(format!(
        "caster-py-{}",
        std::process::id()
    ));
    let _ = fs::create_dir_all(&tmp);
    let runner_path = tmp.join("runner.py");
    let user_path = tmp.join("user.py");
    fs::write(&runner_path, RUNNER_PY).map_err(|e| ActionError::Message(e.to_string()))?;
    fs::write(&user_path, source).map_err(|e| ActionError::Message(e.to_string()))?;

    let mut child = Command::new(&python)
        .arg("-u")
        .arg(&runner_path)
        .arg(&user_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ActionError::Message(format!("python_sidecar_failed: {e}")))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| ActionError::Message("python_sidecar_failed: no stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ActionError::Message("python_sidecar_failed: no stdout".into()))?;
    let mut reader = BufReader::new(stdout);

    // Push initial env into Python process by responding to gets; also pre-set via host env.
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(1_000));
    let mut line = String::new();
    let mut finished_ok = false;
    let mut finish_error: Option<String> = None;

    loop {
        if cancel.is_cancelled() {
            let _ = child.kill();
            let _ = fs::remove_dir_all(&tmp);
            return Err(ActionError::Cancelled);
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = fs::remove_dir_all(&tmp);
            return Err(ActionError::Message("python_sidecar_failed: timeout".into()));
        }

        line.clear();
        // Non-blocking-ish: poll with short try_wait + read with set_nonblocking is hard on Windows.
        // Use try_wait and only block briefly by checking if child exited without output.
        match child.try_wait() {
            Ok(Some(status)) => {
                // Drain remaining lines
                while reader.read_line(&mut line).unwrap_or(0) > 0 {
                    if let Ok(msg) = serde_json::from_str::<Value>(line.trim()) {
                        if msg.get("method").and_then(|m| m.as_str()) == Some("done") {
                            let ok = msg
                                .pointer("/params/ok")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            finished_ok = ok;
                            if !ok {
                                finish_error = msg
                                    .pointer("/params/error")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                            }
                        }
                    }
                    line.clear();
                }
                if !status.success() && finish_error.is_none() {
                    let err = child
                        .stderr
                        .take()
                        .map(|s| {
                            let mut b = String::new();
                            let _ = BufReader::new(s).read_line(&mut b);
                            b
                        })
                        .unwrap_or_default();
                    let _ = fs::remove_dir_all(&tmp);
                    return Err(ActionError::Message(format!(
                        "python_sidecar_failed: {}",
                        if err.trim().is_empty() {
                            status.to_string()
                        } else {
                            err.trim().to_string()
                        }
                    )));
                }
                break;
            }
            Ok(None) => {}
            Err(e) => {
                let _ = fs::remove_dir_all(&tmp);
                return Err(ActionError::Message(format!("python_sidecar_failed: {e}")));
            }
        }

        // Blocking read with short timeout simulation: set read timeout not portable.
        // Read one line (blocks until child writes or exits — try_wait checked above).
        // To avoid hang when child is idle waiting for RPC response, we only block when
        // we expect a message — the protocol is request-driven from child.
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => {
                std::thread::sleep(Duration::from_millis(10));
                continue;
            }
            Ok(_) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = fs::remove_dir_all(&tmp);
                return Err(ActionError::Message(format!("python_sidecar_failed: {e}")));
            }
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: Value = serde_json::from_str(trimmed).map_err(|e| {
            ActionError::Message(format!("python_sidecar_failed: bad json: {e}"))
        })?;

        if msg.get("method").and_then(|m| m.as_str()) == Some("done") {
            finished_ok = msg
                .pointer("/params/ok")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if !finished_ok {
                finish_error = msg
                    .pointer("/params/error")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            let _ = child.wait();
            break;
        }

        let id = msg.get("id").cloned();
        let method = msg
            .get("method")
            .and_then(|m| m.as_str())
            .unwrap_or_default()
            .to_string();
        let params = msg.get("params").cloned().unwrap_or(json!({}));

        let reply = match handle_host_call(&method, &params, env, bus, cancel, opts) {
            Ok(result) => json!({ "id": id, "result": result }),
            Err(error) => json!({ "id": id, "error": error }),
        };
        writeln!(stdin, "{reply}").map_err(|e| {
            ActionError::Message(format!("python_sidecar_failed: write: {e}"))
        })?;
        stdin.flush().ok();
    }

    let _ = fs::remove_dir_all(&tmp);

    if let Some(err) = finish_error {
        return Err(ActionError::Message(format!("python_sidecar_failed: {err}")));
    }
    if !finished_ok {
        // Child may exit 0 after done ok without us catching — check return var
    }

    let ret = env.get("__python_return").cloned();
    if let Some(MacroValue::String(s)) = &ret {
        if s.is_empty() {
            return Ok(None);
        }
    }
    Ok(ret)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cancel::CancellationToken;
    use crate::event_bus::EventBus;
    use crate::script_library::ScriptLanguage;

    #[test]
    fn find_python_or_skip() {
        match find_python() {
            Ok(p) => assert!(p.exists(), "{p:?}"),
            Err(e) => assert!(e.to_string().contains("python_not_found")),
        }
    }

    #[test]
    fn run_python_hello_if_available() {
        let Ok(_) = find_python() else {
            return;
        };
        let mut env = MacroEnv::new();
        env.set("n", MacroValue::Number(1.0));
        let bus = EventBus::new();
        let cancel = CancellationToken::new();
        let opts = ScriptOptions {
            language: ScriptLanguage::Python,
            allow_network: false,
            ..ScriptOptions::default()
        };
        let ret = run_python_script(
            r#"
n = caster.get("n")
caster.set("n", n + 2)
caster.log("hi")
caster.return(n + 2)
"#,
            15_000,
            &mut env,
            &bus,
            &cancel,
            &opts,
        )
        .expect("python run");
        assert_eq!(env.get("n"), Some(&MacroValue::Number(3.0)));
        assert_eq!(ret, Some(MacroValue::Number(3.0)));
    }
}
