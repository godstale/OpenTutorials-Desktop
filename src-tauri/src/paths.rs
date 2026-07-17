use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// App data root: `%APPDATA%/OpenTutorials` on Windows, `~/Library/Application Support/OpenTutorials` on macOS.
/// Uses the OS base data dir (not Tauri's identifier-scoped app_data_dir) so the folder name matches
/// the product name regardless of the bundle identifier.
///
/// Generic over `R: Runtime` so it works with both the real Wry runtime and
/// tauri::test's MockRuntime (used by the integration tests).
pub fn app_data_root<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app.path()
        .data_dir()
        .expect("failed to resolve OS data directory")
        .join("OpenTutorials")
}

pub fn db_file_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app_data_root(app).join("db.json")
}

pub fn storage_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app_data_root(app).join("courses")
}

/// Per-agent chat transcripts + token/duration stats, one JSON array file per
/// agent id — replaces the original web app's `public/agent-chats/<id>.json`.
pub fn agent_chats_dir<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    app_data_root(app).join("agent-chats")
}
