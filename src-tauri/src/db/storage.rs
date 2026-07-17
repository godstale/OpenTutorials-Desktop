use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde_json::json;

use super::types::{DbError, DbResult};

fn resolve_target_path(storage_dir: &Path, bucket: &str, file_path: &str) -> PathBuf {
    if bucket == "courses" {
        storage_dir.join(file_path)
    } else {
        storage_dir.join(bucket).join(file_path)
    }
}

pub fn upload(storage_dir: &Path, bucket: &str, file_path: &str, file_data_base64: &str) -> DbResult {
    let target = resolve_target_path(storage_dir, bucket, file_path);

    if let Some(parent) = target.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return DbResult::err(DbError::new(e.to_string()));
        }
    }

    let bytes = match base64::engine::general_purpose::STANDARD.decode(file_data_base64) {
        Ok(b) => b,
        Err(e) => return DbResult::err(DbError::new(format!("Invalid base64 data: {e}"))),
    };

    if let Err(e) = fs::write(&target, bytes) {
        return DbResult::err(DbError::new(e.to_string()));
    }

    DbResult::ok(json!({ "path": file_path }))
}

pub fn download(storage_dir: &Path, bucket: &str, file_path: &str) -> DbResult {
    let target = resolve_target_path(storage_dir, bucket, file_path);

    if !target.exists() {
        return DbResult::err(DbError::with_code(format!("File not found: {file_path}"), "404"));
    }

    let bytes = match fs::read(&target) {
        Ok(b) => b,
        Err(e) => return DbResult::err(DbError::new(e.to_string())),
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    DbResult::ok(json!({ "base64": b64 }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("opentutorials-storage-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn upload_then_download_roundtrip() {
        let dir = scratch_dir();
        let content = b"hello world";
        let b64 = base64::engine::general_purpose::STANDARD.encode(content);

        let up = upload(&dir, "courses", "sub/dir/file.txt", &b64);
        assert!(up.error.is_none());
        assert_eq!(up.data.unwrap()["path"], "sub/dir/file.txt");

        let down = download(&dir, "courses", "sub/dir/file.txt");
        assert!(down.error.is_none());
        let got_b64 = down.data.unwrap()["base64"].as_str().unwrap().to_string();
        let got_bytes = base64::engine::general_purpose::STANDARD.decode(got_b64).unwrap();
        assert_eq!(got_bytes, content);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn download_missing_file_returns_404() {
        let dir = scratch_dir();
        let result = download(&dir, "courses", "nope.txt");
        assert_eq!(result.error.unwrap().code.as_deref(), Some("404"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn non_courses_bucket_nests_under_bucket_name() {
        let dir = scratch_dir();
        let target = resolve_target_path(&dir, "avatars", "u1.png");
        assert_eq!(target, dir.join("avatars").join("u1.png"));
        fs::remove_dir_all(&dir).ok();
    }
}
