use serde_json::Value as JsonValue;

use super::types::{DbError, DbResult};

pub fn execute_rpc(db: &mut JsonValue, function: &str, args: JsonValue) -> DbResult {
    match function {
        "prune_external_agent_messages" => prune_external_agent_messages(db, &args),
        other => DbResult::err(DbError::new(format!("Unsupported RPC function: {other}"))),
    }
}

/// Keeps only the latest 100 messages (by created_at) for the given agent,
/// mirroring the JS `prune_external_agent_messages` RPC mock.
fn prune_external_agent_messages(db: &mut JsonValue, args: &JsonValue) -> DbResult {
    let agent_id = match args.get("p_agent_id") {
        Some(v) => v.clone(),
        None => return DbResult::err(DbError::new("Missing p_agent_id argument")),
    };

    let obj = db.as_object_mut().expect("db root must be a JSON object");
    let table = obj
        .entry("user_external_agent_messages".to_string())
        .or_insert_with(|| JsonValue::Array(Vec::new()));
    let arr = match table.as_array_mut() {
        Some(a) => a,
        None => return DbResult::ok_null(),
    };

    let mut agent_msgs: Vec<JsonValue> = arr
        .iter()
        .filter(|m| m.get("agent_id").cloned().unwrap_or(JsonValue::Null) == agent_id)
        .cloned()
        .collect();

    agent_msgs.sort_by(|a, b| parse_created_at(b).cmp(&parse_created_at(a))); // descending

    let keep_ids: Vec<JsonValue> = agent_msgs
        .into_iter()
        .take(100)
        .map(|m| m.get("id").cloned().unwrap_or(JsonValue::Null))
        .collect();

    arr.retain(|m| {
        let is_this_agent = m.get("agent_id").cloned().unwrap_or(JsonValue::Null) == agent_id;
        if !is_this_agent {
            return true;
        }
        keep_ids.contains(&m.get("id").cloned().unwrap_or(JsonValue::Null))
    });

    DbResult::ok_null()
}

fn parse_created_at(m: &JsonValue) -> i64 {
    m.get("created_at")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn prunes_keep_only_latest_100_for_agent() {
        let mut messages = Vec::new();
        for i in 0..150 {
            let hh = i / 3600;
            let mm = (i % 3600) / 60;
            let ss = i % 60;
            messages.push(json!({
                "id": format!("m{i}"),
                "agent_id": "a1",
                "created_at": format!("2024-01-01T{hh:02}:{mm:02}:{ss:02}.000Z"),
            }));
        }
        // a different agent's messages must be untouched regardless of count
        messages.push(json!({ "id": "other1", "agent_id": "a2", "created_at": "2024-01-01T00:00:00.000Z" }));

        let mut db = json!({ "user_external_agent_messages": messages });
        let result = execute_rpc(&mut db, "prune_external_agent_messages", json!({ "p_agent_id": "a1" }));
        assert!(result.error.is_none());

        let remaining = db["user_external_agent_messages"].as_array().unwrap();
        let a1_count = remaining.iter().filter(|m| m["agent_id"] == "a1").count();
        assert_eq!(a1_count, 100);
        assert!(remaining.iter().any(|m| m["agent_id"] == "a2"));

        // the kept messages must be the 100 most recent (m50..m149)
        let kept_ids: std::collections::HashSet<String> = remaining
            .iter()
            .filter(|m| m["agent_id"] == "a1")
            .map(|m| m["id"].as_str().unwrap().to_string())
            .collect();
        for i in 50..150 {
            assert!(kept_ids.contains(&format!("m{i}")), "expected m{i} to survive pruning");
        }
    }

    #[test]
    fn unsupported_function_returns_error() {
        let mut db = json!({});
        let result = execute_rpc(&mut db, "does_not_exist", json!({}));
        assert!(result.data.is_none());
        assert!(result.error.is_some());
    }
}
