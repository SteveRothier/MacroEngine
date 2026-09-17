//! TypeScript → JavaScript via oxc (types stripped for Boa).

use std::path::Path;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_transformer::{TransformOptions, Transformer};

use crate::actions::registry::ActionError;
use crate::script_library::ScriptLanguage;

pub fn prepare_script_source(
    source: &str,
    language: ScriptLanguage,
) -> Result<String, ActionError> {
    match language {
        ScriptLanguage::Javascript => Ok(source.to_string()),
        ScriptLanguage::Typescript => transpile_typescript(source),
        ScriptLanguage::Python => Ok(source.to_string()),
    }
}

pub fn transpile_typescript(source: &str) -> Result<String, ActionError> {
    let allocator = Allocator::default();
    let source_type = SourceType::default()
        .with_typescript(true)
        .with_module(false);
    let ret = Parser::new(&allocator, source, source_type).parse();
    if !ret.errors.is_empty() {
        let msg = ret
            .errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(ActionError::Message(format!("typescript parse: {msg}")));
    }
    let mut program = ret.program;

    let semantic = SemanticBuilder::new()
        .with_excess_capacity(2.0)
        .build(&program);
    if !semantic.errors.is_empty() {
        let msg = semantic
            .errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(ActionError::Message(format!("typescript semantic: {msg}")));
    }
    let (symbols, scopes) = semantic.semantic.into_symbol_table_and_scope_tree();

    let mut options = TransformOptions::default();
    options.typescript = Default::default();

    let path = Path::new("script.ts");
    let transformer = Transformer::new(&allocator, path, &options);
    let result = transformer.build_with_symbols_and_scopes(symbols, scopes, &mut program);
    if !result.errors.is_empty() {
        let msg = result
            .errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(ActionError::Message(format!(
            "typescript transform: {msg}"
        )));
    }

    let js = Codegen::new()
        .with_options(CodegenOptions::default())
        .build(&program)
        .code;
    Ok(js)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_simple_types() {
        let src = "const n: number = 1;\ncaster.log(String(n));\n";
        let out = transpile_typescript(src).unwrap();
        assert!(!out.contains(": number"), "{out}");
        assert!(out.contains("= 1"), "{out}");
    }
}
