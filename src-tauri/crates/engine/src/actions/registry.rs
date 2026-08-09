use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;
use thiserror::Error;

use crate::cancel::CancellationToken;
use crate::event_bus::EventBus;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ActionError {
    #[error("unknown action type: {0}")]
    UnknownType(String),
    #[error("action cancelled")]
    Cancelled,
    #[error("{0}")]
    Message(String),
}

pub struct ActionContext<'a> {
    pub parameters: &'a Value,
    pub cancel: &'a CancellationToken,
    pub bus: &'a EventBus,
}

pub trait ActionHandler: Send + Sync {
    fn execute(&self, ctx: &ActionContext<'_>) -> Result<(), ActionError>;
}

#[derive(Default)]
pub struct ActionRegistry {
    handlers: HashMap<String, Arc<dyn ActionHandler>>,
}

impl ActionRegistry {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    pub fn register(&mut self, action_type: impl Into<String>, handler: Arc<dyn ActionHandler>) {
        self.handlers.insert(action_type.into(), handler);
    }

    pub fn dispatch(&self, action_type: &str, ctx: &ActionContext<'_>) -> Result<(), ActionError> {
        if ctx.cancel.is_cancelled() {
            return Err(ActionError::Cancelled);
        }
        let handler = self
            .handlers
            .get(action_type)
            .ok_or_else(|| ActionError::UnknownType(action_type.to_string()))?;
        handler.execute(ctx)
    }

    pub fn contains(&self, action_type: &str) -> bool {
        self.handlers.contains_key(action_type)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions::stub::{LogHandler, NoopHandler};
    use crate::cancel::CancellationToken;
    use crate::event_bus::EventBus;
    use serde_json::json;

    #[test]
    fn dispatches_registered_stub() {
        let mut registry = ActionRegistry::new();
        registry.register("noop", Arc::new(NoopHandler));
        registry.register("log", Arc::new(LogHandler));
        let cancel = CancellationToken::new();
        let bus = EventBus::new();
        let params = json!({"message": "hi"});
        let ctx = ActionContext {
            parameters: &params,
            cancel: &cancel,
            bus: &bus,
        };
        registry.dispatch("noop", &ctx).unwrap();
        registry.dispatch("log", &ctx).unwrap();
    }

    #[test]
    fn unknown_type_errors() {
        let registry = ActionRegistry::new();
        let cancel = CancellationToken::new();
        let bus = EventBus::new();
        let params = json!({});
        let ctx = ActionContext {
            parameters: &params,
            cancel: &cancel,
            bus: &bus,
        };
        let err = registry.dispatch("missing", &ctx).unwrap_err();
        assert!(matches!(err, ActionError::UnknownType(_)));
    }
}
