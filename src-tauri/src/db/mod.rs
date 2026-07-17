pub mod query_engine;
pub(crate) mod rpc;
mod storage;
mod types;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value as JsonValue};
use tauri::{AppHandle, Runtime, State};

pub use types::{DbError, DbResult, SerializedQuery};

pub struct AppDbState {
    /// Serializes read-modify-write cycles against db.json across concurrent invokes.
    pub(crate) lock: Mutex<()>,
    pub(crate) db_path: PathBuf,
    pub(crate) storage_dir: PathBuf,
}

pub type AppDb = Arc<AppDbState>;

fn default_db() -> JsonValue {
    json!({
        "course_cards": [],
        "course_wiki": [],
        "course_packages": [],
        "user_package_subscriptions": [],
        "user_progress": [],
        "user_external_agents": [],
        "user_external_agent_messages": [],
        "macros": [],
        "user_profiles": []
    })
}

pub(crate) fn read_db(db_path: &Path) -> JsonValue {
    if !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let seed = serde_json::to_string_pretty(&default_db()).expect("default db must serialize");
        let _ = std::fs::write(db_path, seed);
    }

    match std::fs::read_to_string(db_path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|e| {
            eprintln!("Failed to parse db.json, returning empty structure: {e}");
            default_db()
        }),
        Err(_) => default_db(),
    }
}

pub(crate) fn write_db(db_path: &Path, db: &JsonValue) -> std::io::Result<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let pretty = serde_json::to_string_pretty(db).unwrap_or_else(|_| "{}".to_string());
    std::fs::write(db_path, pretty)
}

pub fn init_state<R: Runtime>(app: &AppHandle<R>) -> AppDb {
    let db_path = crate::paths::db_file_path(app);
    let storage_dir = crate::paths::storage_dir(app);
    let _ = std::fs::create_dir_all(&storage_dir);
    Arc::new(AppDbState { lock: Mutex::new(()), db_path, storage_dir })
}

#[tauri::command]
pub async fn db_query(
    state: State<'_, AppDb>,
    query: SerializedQuery,
    action: String,
    data: Option<JsonValue>,
) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        let mut db = read_db(&state.db_path);
        let result = query_engine::execute(&mut db, &query, &action, data);
        if result.error.is_none() && action != "select" {
            if let Err(e) = write_db(&state.db_path, &db) {
                return Ok(DbResult::err(DbError::new(e.to_string())));
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_rpc(state: State<'_, AppDb>, r#fn: String, args: Option<JsonValue>) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        let mut db = read_db(&state.db_path);
        let result = rpc::execute_rpc(&mut db, &r#fn, args.unwrap_or(JsonValue::Null));
        if result.error.is_none() {
            if let Err(e) = write_db(&state.db_path, &db) {
                return Ok(DbResult::err(DbError::new(e.to_string())));
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn storage_upload(
    state: State<'_, AppDb>,
    bucket: String,
    path: String,
    file_data_base64: String,
) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        Ok(storage::upload(&state.storage_dir, &bucket, &path, &file_data_base64))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Absolute path to the course storage directory, used by the frontend to
/// build `asset:`-protocol URLs for thumbnails via `convertFileSrc`.
#[tauri::command]
pub fn storage_dir_path(state: State<'_, AppDb>) -> String {
    state.storage_dir.to_string_lossy().to_string()
}

#[tauri::command]
pub async fn storage_download(state: State<'_, AppDb>, bucket: String, path: String) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        Ok(storage::download(&state.storage_dir, &bucket, &path))
    })
    .await
    .map_err(|e| e.to_string())?
}
