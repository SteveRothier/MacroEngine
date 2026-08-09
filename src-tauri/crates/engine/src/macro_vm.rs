use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::actions::registry::{ActionContext, ActionError, ActionHandler, ActionRegistry};
use crate::actions::stub::NoopHandler;
use crate::cancel::CancellationToken;
use crate::event_bus::{EngineEvent, EventBus, LogLevel};
use crate::scheduler::wait_until;
use crate::schema::{ActionNode, MacroDocument};

/// Deterministic stub VM: executes parsed actions without real input injection.
pub struct MacroVm {
    registry: ActionRegistry,
}

impl MacroVm {
    pub fn with_defaults() -> Self {
        let mut registry = ActionRegistry::new();
        registry.register("mouse.click", Arc::new(ClickStubHandler));
        registry.register("delay", Arc::new(DelayHandler));
        registry.register("noop", Arc::new(NoopHandler));
        Self { registry }
    }

    pub fn run(
        &self,
        doc: &MacroDocument,
        cancel: &CancellationToken,
        bus: &EventBus,
    ) -> Result<Vec<String>, ActionError> {
        let mut trace = Vec::new();
        for action in &doc.actions {
            if cancel.is_cancelled() {
                return Err(ActionError::Cancelled);
            }
            match action {
                ActionNode::MouseClick { id, button } => {
                    let params = serde_json::json!({ "button": button, "id": id });
                    let ctx = ActionContext {
                        parameters: &params,
                        cancel,
                        bus,
                    };
                    self.registry.dispatch("mouse.click", &ctx)?;
                    trace.push(format!("click:{id}:{button}"));
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
            }
        }
        Ok(trace)
    }
}

struct ClickStubHandler;

impl ActionHandler for ClickStubHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let id = ctx
            .parameters
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        ctx.bus.publish(EngineEvent::Log {
            level: LogLevel::Debug,
            message: format!("stub click {id}"),
        });
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{parse_macro_json, Trigger};

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

        let vm = MacroVm::with_defaults();
        let cancel = CancellationToken::new();
        let bus = EventBus::new();
        let start = Instant::now();
        let trace = vm.run(&doc, &cancel, &bus).unwrap();
        let elapsed = start.elapsed();

        assert_eq!(
            trace,
            vec![
                "click:a1:left".to_string(),
                "delay:a2:30".to_string(),
                "click:a3:left".to_string()
            ]
        );
        assert!(elapsed >= Duration::from_millis(25));
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
        let bus = EventBus::new();
        let cancel_flag = cancel.clone();
        let started = Arc::new(Mutex::new(false));
        let started_flag = Arc::clone(&started);

        std::thread::spawn(move || {
            // Wait until run likely entered delay, then cancel.
            std::thread::sleep(Duration::from_millis(20));
            *started_flag.lock().unwrap() = true;
            cancel_flag.cancel();
        });

        let err = vm.run(&doc, &cancel, &bus).unwrap_err();
        assert!(matches!(err, ActionError::Cancelled));
        assert!(*started.lock().unwrap());
    }
}
