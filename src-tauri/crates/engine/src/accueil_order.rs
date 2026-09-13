//! Accueil home list order (`kind:id` keys), persisted in config dir.

use std::fs;
use std::path::{Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AccueilOrderError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn accueil_order_path(dir: impl AsRef<Path>) -> PathBuf {
    dir.as_ref().join("accueil-order.json")
}

pub fn load_accueil_order(dir: impl AsRef<Path>) -> Result<Vec<String>, AccueilOrderError> {
    let path = accueil_order_path(dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    let keys: Vec<String> = serde_json::from_str(&raw)?;
    Ok(keys
        .into_iter()
        .filter(|k| !k.trim().is_empty() && k.contains(':'))
        .collect())
}

pub fn save_accueil_order(
    dir: impl AsRef<Path>,
    keys: &[String],
) -> Result<(), AccueilOrderError> {
    let dir = dir.as_ref();
    fs::create_dir_all(dir)?;
    let path = accueil_order_path(dir);
    let cleaned: Vec<&str> = keys
        .iter()
        .map(|s| s.as_str())
        .filter(|k| !k.trim().is_empty() && k.contains(':'))
        .collect();
    let raw = serde_json::to_string_pretty(&cleaned)?;
    fs::write(path, raw)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!(
            "me-accueil-order-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn roundtrip_accueil_order() {
        let dir = temp_dir();
        let _ = fs::create_dir_all(&dir);
        let keys = vec!["macro:A".into(), "clicker:B".into(), "script:C".into()];
        save_accueil_order(&dir, &keys).unwrap();
        let loaded = load_accueil_order(&dir).unwrap();
        assert_eq!(loaded, keys);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_file_is_empty() {
        let dir = temp_dir();
        let _ = fs::create_dir_all(&dir);
        assert!(load_accueil_order(&dir).unwrap().is_empty());
        let _ = fs::remove_dir_all(dir);
    }
}
