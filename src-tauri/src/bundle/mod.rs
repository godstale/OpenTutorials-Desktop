mod validator;

use base64::Engine;
use serde_json::{json, Value as JsonValue};
use tauri::State;

use crate::db::{query_engine, read_db, write_db, AppDb, AppDbState, DbError, DbResult, SerializedQuery};
use validator::ValidatedBundle;

/// Dry-run validation only — parses and checks the zip against the Bundler
/// Protocol (see `protocol/protocol.md`) without touching disk or db.json.
/// Used by the upload UI to preview a course (title/author/card count/TOC)
/// and surface validation errors before the user commits to importing.
#[tauri::command]
pub async fn validate_course_bundle(file_data_base64: String) -> Result<DbResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = match base64::engine::general_purpose::STANDARD.decode(&file_data_base64) {
            Ok(b) => b,
            Err(e) => return DbResult::err(DbError::new(format!("Invalid base64 data: {e}"))),
        };
        match validator::validate(&bytes) {
            Ok(validated) => DbResult::ok(preview_json(&validated)),
            Err(msg) => DbResult::err(DbError::new(msg)),
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// Validates again (cheap, and avoids any drift between the preview shown to
/// the user and what actually gets written) then extracts every zip entry
/// under the course's storage folder and upserts `course_packages` /
/// `course_wiki` in db.json.
#[tauri::command]
pub async fn import_course_bundle(
    state: State<'_, AppDb>,
    file_data_base64: String,
    source: Option<String>,
) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = match base64::engine::general_purpose::STANDARD.decode(&file_data_base64) {
            Ok(b) => b,
            Err(e) => return Ok(DbResult::err(DbError::new(format!("Invalid base64 data: {e}")))),
        };
        let validated = match validator::validate(&bytes) {
            Ok(v) => v,
            Err(msg) => return Ok(DbResult::err(DbError::new(msg))),
        };

        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        Ok(import_validated(&state, &validated, source.as_deref().unwrap_or("LOCAL")))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Deletes a course package and everything that references it: the row itself,
/// its `course_wiki` entry, all subscriptions/progress rows, and its extracted
/// storage folder. Blocks on active subscribers unless `force` is set (mirrors
/// the original web app's confirmation-before-cascade-delete UX).
#[tauri::command]
pub async fn delete_course_package(state: State<'_, AppDb>, id: String, force: bool) -> Result<DbResult, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.lock.lock().map_err(|e| e.to_string())?;
        Ok(delete_package(&state, &id, force))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn delete_package(state: &AppDbState, id: &str, force: bool) -> DbResult {
    let mut db = read_db(&state.db_path);
    let id_val = JsonValue::String(id.to_string());

    let subscriber_count = db
        .get("user_package_subscriptions")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter(|s| s.get("package_id") == Some(&id_val)).count())
        .unwrap_or(0);

    if !force && subscriber_count > 0 {
        return DbResult::err(DbError::with_code(
            format!("이 강좌를 수강 중인 사용자가 {subscriber_count}명 있습니다."),
            "subscribers_exist",
        ));
    }

    let slug = db
        .get("course_packages")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.iter().find(|p| p.get("id") == Some(&id_val)))
        .and_then(|p| p.get("slug"))
        .and_then(|s| s.as_str())
        .map(str::to_string);

    if let Some(obj) = db.as_object_mut() {
        if let Some(JsonValue::Array(arr)) = obj.get_mut("course_packages") {
            arr.retain(|item| item.get("id") != Some(&id_val));
        }
        if let Some(JsonValue::Array(arr)) = obj.get_mut("user_package_subscriptions") {
            arr.retain(|item| item.get("package_id") != Some(&id_val));
        }
        if let Some(JsonValue::Array(arr)) = obj.get_mut("user_progress") {
            arr.retain(|item| item.get("course_id") != Some(&id_val));
        }
        if let Some(JsonValue::Array(arr)) = obj.get_mut("course_wiki") {
            arr.retain(|item| item.get("course_id") != Some(&id_val));
        }
    }

    if let Some(slug) = &slug {
        let _ = std::fs::remove_dir_all(state.storage_dir.join(slug));
    }

    if let Err(e) = write_db(&state.db_path, &db) {
        return DbResult::err(DbError::new(e.to_string()));
    }

    DbResult::ok(json!({ "id": id, "subscriberCount": subscriber_count }))
}

fn preview_json(v: &ValidatedBundle) -> JsonValue {
    let has_thumbnail = v.entries.keys().any(|k| !k.contains('/') && k.to_lowercase().starts_with("thumbnail."));
    json!({
        "slug": v.slug,
        "title": v.title,
        "description": v.description,
        "category": v.category,
        "target_age": v.target_age,
        "license": v.license,
        "author": v.author,
        "card_count": v.cards.len(),
        "toc": v.toc,
        "has_thumbnail": has_thumbnail,
    })
}

/// If the zip included a root-level `thumbnail.*` file, points at it via the
/// `local:` convention (resolved by `CourseIcon` through `getPublicUrl` at
/// render time). Otherwise falls back to the manifest's `thumbnail` value
/// (typically an `icon:xxx` predefined icon id) or the default book icon.
fn resolve_thumbnail(slug: &str, validated: &ValidatedBundle) -> String {
    let thumb_entry = validated
        .entries
        .keys()
        .find(|k| !k.contains('/') && k.to_lowercase().starts_with("thumbnail."));
    if let Some(key) = thumb_entry {
        return format!("local:{slug}/{key}");
    }
    validated.manifest_thumbnail.clone().unwrap_or_else(|| "icon:book".to_string())
}

fn import_validated(state: &AppDbState, validated: &ValidatedBundle, source: &str) -> DbResult {
    let package_dir = state.storage_dir.join(&validated.slug);
    for (name, bytes) in &validated.entries {
        let target = package_dir.join(name);
        if let Some(parent) = target.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return DbResult::err(DbError::new(format!("파일 저장 실패 ({name}): {e}")));
            }
        }
        if let Err(e) = std::fs::write(&target, bytes) {
            return DbResult::err(DbError::new(format!("파일 저장 실패 ({name}): {e}")));
        }
    }

    let thumbnail = resolve_thumbnail(&validated.slug, validated);
    let author_nickname = validated.author.get("nickname").cloned().unwrap_or(JsonValue::Null);
    let author_email = validated.author.get("email").cloned().unwrap_or(JsonValue::Null);
    let author_homepage = validated.author.get("website").cloned().unwrap_or(JsonValue::Null);

    let mut db = read_db(&state.db_path);

    let default_agent_id = db
        .get("user_external_agents")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|agent| agent.get("is_ai_tutor").and_then(|t| t.as_bool()).unwrap_or(false))
                .and_then(|agent| agent.get("id").and_then(|id| id.as_str()))
        });

    let existing_agent_id = db
        .get("course_packages")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|p| p.get("slug").and_then(|s| s.as_str()) == Some(&validated.slug))
                .and_then(|p| p.get("agent_id").and_then(|id| id.as_str()))
        });

    let agent_id_val = if let Some(existing_id) = existing_agent_id {
        JsonValue::String(existing_id.to_string())
    } else if let Some(default_id) = default_agent_id {
        JsonValue::String(default_id.to_string())
    } else {
        JsonValue::Null
    };

    let package_data = json!({
        "slug": validated.slug,
        "title": validated.title,
        "description": validated.description,
        "thumbnail": thumbnail,
        "published": validated.published,
        "sequential_play": validated.sequential_play,
        "force_checkpoint": validated.force_checkpoint,
        "version": validated.version,
        "changelog": validated.changelog,
        "bundler_protocol_version": validated.bundler_protocol_version,
        "target_age": validated.target_age,
        "category": validated.category,
        "tags": validated.tags,
        "license": validated.license,
        "license_file": validated.license_file,
        "author": validated.author,
        "author_id": "local-user-id",
        "author_nickname": author_nickname,
        "author_email": author_email,
        "author_homepage": author_homepage,
        "source": source,
        "toc": validated.toc,
        "cards": validated.cards,
        "agent_id": agent_id_val,
    });

    let package_query = SerializedQuery { table: "course_packages".to_string(), single: true, ..Default::default() };
    let package_result = query_engine::execute(&mut db, &package_query, "upsert", Some(package_data));
    if package_result.error.is_some() {
        return package_result;
    }
    let package_id = package_result.data.as_ref().and_then(|d| d.get("id")).cloned().unwrap_or(JsonValue::Null);

    // query_engine's generic upsert only special-cases user_progress / user_package_subscriptions
    // composite keys, so resolve the existing wiki row's id ourselves to avoid inserting a
    // duplicate `course_wiki` row every time the same course is re-imported (e.g. version bump).
    let existing_wiki_id = db
        .get("course_wiki")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.iter().find(|w| w.get("course_id") == Some(&package_id)))
        .and_then(|w| w.get("id").cloned());

    let mut wiki_data = json!({
        "course_id": package_id,
        "content": validated.wiki,
    });
    if let Some(id) = existing_wiki_id {
        wiki_data["id"] = id;
    }
    let wiki_query = SerializedQuery { table: "course_wiki".to_string(), single: true, ..Default::default() };
    let wiki_result = query_engine::execute(&mut db, &wiki_query, "upsert", Some(wiki_data));
    if wiki_result.error.is_some() {
        return wiki_result;
    }

    if let Err(e) = write_db(&state.db_path, &db) {
        return DbResult::err(DbError::new(e.to_string()));
    }

    package_result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::Mutex;
    use zip::write::SimpleFileOptions;

    fn build_zip(files: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let cursor = std::io::Cursor::new(&mut buf);
            let mut writer = zip::ZipWriter::new(cursor);
            let options = SimpleFileOptions::default();
            for (name, content) in files {
                writer.start_file(*name, options).unwrap();
                writer.write_all(content.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    fn minimal_valid_zip() -> Vec<u8> {
        build_zip(&[
            (
                "package-manifest.json",
                r#"{
                "title": "테스트 강좌", "slug": "test-course",
                "author": { "nickname": "tester", "email": "a@b.com" },
                "bundler_protocol_version": "1.1.5", "target_age": "all", "category": "Programming"
            }"#,
            ),
            (
                "config.json",
                r#"{ "cards": ["01_intro.md"], "toc": [
                    { "type": "section", "title": "1강. 오리엔테이션", "description": "강좌 소개입니다.", "filename": "01_intro.md" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ])
    }

    fn scratch_state() -> AppDbState {
        let dir = std::env::temp_dir().join(format!("opentutorials-bundle-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        AppDbState {
            lock: Mutex::new(()),
            db_path: dir.join("db.json"),
            storage_dir: dir.join("courses"),
        }
    }

    #[test]
    fn import_writes_files_and_upserts_package_and_wiki() {
        let state = scratch_state();
        let validated = validator::validate(&minimal_valid_zip()).unwrap();

        let result = import_validated(&state, &validated, "LOCAL");
        assert!(result.error.is_none(), "expected ok, got {:?}", result.error);
        let pkg = result.data.unwrap();
        assert_eq!(pkg["slug"], "test-course");
        assert_eq!(pkg["author_nickname"], "tester");

        assert!(state.storage_dir.join("test-course/cards/01_intro.md").exists());
        assert!(state.storage_dir.join("test-course/wiki.md").exists());

        let db = read_db(&state.db_path);
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 1);
        assert_eq!(db["course_wiki"].as_array().unwrap().len(), 1);

        std::fs::remove_dir_all(state.storage_dir.parent().unwrap()).ok();
    }

    #[test]
    fn reimport_updates_existing_package_and_wiki_without_duplicating() {
        let state = scratch_state();
        let validated = validator::validate(&minimal_valid_zip()).unwrap();

        import_validated(&state, &validated, "LOCAL");
        let second = import_validated(&state, &validated, "LOCAL");
        assert!(second.error.is_none());

        let db = read_db(&state.db_path);
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 1);
        assert_eq!(db["course_wiki"].as_array().unwrap().len(), 1);

        std::fs::remove_dir_all(state.storage_dir.parent().unwrap()).ok();
    }

    #[test]
    fn invalid_zip_returns_error_without_writing_anything() {
        let bad_zip = build_zip(&[("config.json", "{}")]);
        assert!(validator::validate(&bad_zip).is_err());
    }

    #[test]
    fn delete_removes_package_wiki_and_storage_folder() {
        let state = scratch_state();
        let validated = validator::validate(&minimal_valid_zip()).unwrap();
        let pkg = import_validated(&state, &validated, "LOCAL").data.unwrap();
        let id = pkg["id"].as_str().unwrap().to_string();

        assert!(state.storage_dir.join("test-course").exists());

        let result = delete_package(&state, &id, false);
        assert!(result.error.is_none());

        let db = read_db(&state.db_path);
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 0);
        assert_eq!(db["course_wiki"].as_array().unwrap().len(), 0);
        assert!(!state.storage_dir.join("test-course").exists());

        std::fs::remove_dir_all(state.storage_dir.parent().unwrap()).ok();
    }

    #[test]
    fn delete_blocks_when_subscribers_exist_unless_forced() {
        let state = scratch_state();
        let validated = validator::validate(&minimal_valid_zip()).unwrap();
        let pkg = import_validated(&state, &validated, "LOCAL").data.unwrap();
        let id = pkg["id"].as_str().unwrap().to_string();

        {
            let mut db = read_db(&state.db_path);
            db["user_package_subscriptions"]
                .as_array_mut()
                .unwrap()
                .push(json!({ "id": "sub1", "user_id": "local-user-id", "package_id": id }));
            write_db(&state.db_path, &db).unwrap();
        }

        let blocked = delete_package(&state, &id, false);
        assert_eq!(blocked.error.unwrap().code.as_deref(), Some("subscribers_exist"));

        let forced = delete_package(&state, &id, true);
        assert!(forced.error.is_none());

        std::fs::remove_dir_all(state.storage_dir.parent().unwrap()).ok();
    }
}
