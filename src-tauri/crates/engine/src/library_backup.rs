//! Pack / unpack Accueil library (macros, clickers, scripts, index) as a zip archive.
//! Does **not** include `settings.json` (separate settings export).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use thiserror::Error;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MANIFEST_NAME: &str = "caster-library-manifest.json";
const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum LibraryBackupError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Manifest {
    version: u32,
    kind: String,
}

const DIRS: &[&str] = &["macros", "clicker-presets", "scripts"];
const FILES: &[&str] = &["library.json", "accueil-order.json", "quick-access.json"];

fn add_file(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    archive_name: &str,
    path: &Path,
) -> Result<(), LibraryBackupError> {
    if !path.is_file() {
        return Ok(());
    }
    zip.start_file(archive_name, options)?;
    let mut f = File::open(path)?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    zip.write_all(&buf)?;
    Ok(())
}

fn add_dir_json(
    zip: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    config_dir: &Path,
    dirname: &str,
) -> Result<(), LibraryBackupError> {
    let dir = config_dir.join(dirname);
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let archive_name = format!("{dirname}/{name}");
        add_file(zip, options, &archive_name, &path)?;
    }
    Ok(())
}

/// Export library files under `config_dir` into `zip_path`.
pub fn export_library_zip(
    config_dir: &Path,
    zip_path: &Path,
) -> Result<(), LibraryBackupError> {
    if let Some(parent) = zip_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = File::create(zip_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let manifest = Manifest {
        version: MANIFEST_VERSION,
        kind: "caster-library".into(),
    };
    zip.start_file(MANIFEST_NAME, options)?;
    zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;

    for dir in DIRS {
        add_dir_json(&mut zip, options, config_dir, dir)?;
    }
    for name in FILES {
        add_file(&mut zip, options, name, &config_dir.join(name))?;
    }
    zip.finish()?;
    Ok(())
}

fn safe_archive_path(name: &str) -> Result<PathBuf, LibraryBackupError> {
    let path = Path::new(name);
    if path.is_absolute() {
        return Err(LibraryBackupError::Message(
            "invalid archive path (absolute)".into(),
        ));
    }
    for c in path.components() {
        match c {
            Component::Normal(_) => {}
            Component::CurDir => {}
            _ => {
                return Err(LibraryBackupError::Message(format!(
                    "invalid archive path: {name}"
                )));
            }
        }
    }
    Ok(path.to_path_buf())
}

fn clear_dir_json(dir: &Path) -> Result<(), LibraryBackupError> {
    if !dir.is_dir() {
        fs::create_dir_all(dir)?;
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Replace library under `config_dir` with contents of `zip_path`.
pub fn import_library_zip(
    config_dir: &Path,
    zip_path: &Path,
) -> Result<(), LibraryBackupError> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;

    let mut has_manifest = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i)?;
        if entry.name() == MANIFEST_NAME {
            has_manifest = true;
            break;
        }
    }
    if !has_manifest {
        return Err(LibraryBackupError::Message(
            "not a Caster library archive (missing manifest)".into(),
        ));
    }

    let staging = config_dir.join(".library-restore-tmp");
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        if name == MANIFEST_NAME || name.ends_with('/') {
            continue;
        }
        let rel = safe_archive_path(&name)?;
        let out = staging.join(&rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = File::create(&out)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }

    for dir in DIRS {
        let target = config_dir.join(dir);
        clear_dir_json(&target)?;
        let src = staging.join(dir);
        if src.is_dir() {
            for entry in fs::read_dir(&src)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    let dest = target.join(entry.file_name());
                    fs::copy(&path, &dest)?;
                }
            }
        }
    }
    for name in FILES {
        let src = staging.join(name);
        let dest = config_dir.join(name);
        if src.is_file() {
            fs::copy(&src, &dest)?;
        } else if dest.exists() && *name == "library.json" {
            // Keep existing if archive omitted — but prefer empty index wipe for full replace
            let _ = fs::remove_file(&dest);
        }
    }

    let _ = fs::remove_dir_all(&staging);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_dir() -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        let p = std::env::temp_dir().join(format!(
            "caster-lib-backup-{}-{}",
            std::process::id(),
            n
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn export_import_roundtrip() {
        let dir = temp_dir();
        fs::create_dir_all(dir.join("macros")).unwrap();
        fs::write(dir.join("macros").join("demo.json"), r#"{"name":"demo"}"#).unwrap();
        fs::create_dir_all(dir.join("clicker-presets")).unwrap();
        fs::write(
            dir.join("clicker-presets").join("fast.json"),
            r#"{"name":"fast"}"#,
        )
        .unwrap();
        fs::write(dir.join("library.json"), r#"{"folders":[],"entries":{}}"#).unwrap();

        let zip = dir.join("out.zip");
        export_library_zip(&dir, &zip).unwrap();

        let restore = temp_dir();
        import_library_zip(&restore, &zip).unwrap();
        assert!(restore.join("macros").join("demo.json").is_file());
        assert!(restore.join("clicker-presets").join("fast.json").is_file());
        assert!(restore.join("library.json").is_file());

        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&restore);
    }
}
