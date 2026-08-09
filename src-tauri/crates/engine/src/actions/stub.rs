use serde_json::Value;

use crate::actions::registry::{ActionContext, ActionError, ActionHandler};
use crate::event_bus::{EngineEvent, LogLevel};

pub struct NoopHandler;

impl ActionHandler for NoopHandler {
    fn execute(&self, _ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        Ok(())
    }
}

pub struct LogHandler;

impl ActionHandler for LogHandler {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        let message = ctx
            .parameters
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("(empty)")
            .to_string();
        ctx.bus.publish(EngineEvent::Log {
            level: LogLevel::Info,
            message,
        });
        Ok(())
    }
}
