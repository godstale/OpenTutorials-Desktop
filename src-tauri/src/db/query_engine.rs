use std::cmp::Ordering;

use chrono::SecondsFormat;
use serde_json::{Map, Value as JsonValue};

use super::types::{DbError, DbResult, SerializedQuery};

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn is_truthy(v: &JsonValue) -> bool {
    match v {
        JsonValue::Null => false,
        JsonValue::Bool(b) => *b,
        JsonValue::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(true),
        JsonValue::String(s) => !s.is_empty(),
        JsonValue::Array(_) | JsonValue::Object(_) => true,
    }
}

/// Ensures `db[table]` exists as an array and returns a mutable reference to it.
fn ensure_table<'a>(db: &'a mut JsonValue, table: &str) -> &'a mut Vec<JsonValue> {
    let obj = db.as_object_mut().expect("db root must be a JSON object");
    let entry = obj
        .entry(table.to_string())
        .or_insert_with(|| JsonValue::Array(Vec::new()));
    entry.as_array_mut().expect("table must be a JSON array")
}

fn table_ref<'a>(db: &'a JsonValue, table: &str) -> &'a [JsonValue] {
    db.get(table).and_then(|v| v.as_array()).map(|v| v.as_slice()).unwrap_or(&[])
}

fn matches_filters(item: &JsonValue, query: &SerializedQuery) -> bool {
    query.filters.iter().all(|f| {
        let val = item.get(&f.column).cloned().unwrap_or(JsonValue::Null);
        match f.kind.as_str() {
            "eq" => val == f.value,
            "neq" => val != f.value,
            "in" => f
                .value
                .as_array()
                .map(|arr| arr.contains(&val))
                .unwrap_or(false),
            _ => true,
        }
    })
}

/// Mirrors JS `a[col] < b[col]` semantics for the two comparable JSON types.
/// Anything else (mixed types, null, missing) is treated as equal, same as
/// leaving the pair unsorted under a stable sort.
fn compare_values(a: &JsonValue, b: &JsonValue) -> Ordering {
    match (a, b) {
        (JsonValue::Number(x), JsonValue::Number(y)) => {
            let xf = x.as_f64().unwrap_or(f64::NAN);
            let yf = y.as_f64().unwrap_or(f64::NAN);
            xf.partial_cmp(&yf).unwrap_or(Ordering::Equal)
        }
        (JsonValue::String(x), JsonValue::String(y)) => x.cmp(y),
        _ => Ordering::Equal,
    }
}

fn apply_joins(table: &str, items: Vec<JsonValue>, db: &JsonValue) -> Vec<JsonValue> {
    if items.is_empty() {
        return items;
    }
    let (fk_column, join_key, out_column) = match table {
        "user_progress" => ("course_id", "id", "course"),
        "user_package_subscriptions" => ("package_id", "id", "package"),
        _ => return items,
    };
    let packages = table_ref(db, "course_packages").to_vec();
    items
        .into_iter()
        .map(|mut item| {
            let fk_val = item.get(fk_column).cloned().unwrap_or(JsonValue::Null);
            let joined = packages
                .iter()
                .find(|p| p.get(join_key).cloned().unwrap_or(JsonValue::Null) == fk_val)
                .cloned();
            if let JsonValue::Object(map) = &mut item {
                map.insert(out_column.to_string(), joined.unwrap_or(JsonValue::Null));
            }
            item
        })
        .collect()
}

/// Computes the final `id` field for an inserted/upserted row: keep the
/// caller-provided id if it is a truthy value, otherwise generate a new uuid.
fn resolve_id(obj: &Map<String, JsonValue>) -> JsonValue {
    match obj.get("id") {
        Some(v) if is_truthy(v) => v.clone(),
        _ => JsonValue::String(new_uuid()),
    }
}

fn resolve_created_at(obj: &Map<String, JsonValue>) -> JsonValue {
    match obj.get("created_at") {
        Some(v) if is_truthy(v) => v.clone(),
        _ => JsonValue::String(now_iso()),
    }
}

fn stamp_new_item(d: &JsonValue) -> JsonValue {
    let src = d.as_object().cloned().unwrap_or_default();
    let mut item = src.clone();
    item.insert("id".to_string(), resolve_id(&src));
    item.insert("created_at".to_string(), resolve_created_at(&src));
    item.insert("updated_at".to_string(), JsonValue::String(now_iso()));
    JsonValue::Object(item)
}

fn item_id(item: &JsonValue) -> JsonValue {
    item.get("id").cloned().unwrap_or(JsonValue::Null)
}

fn as_batch(data: Option<JsonValue>) -> (Vec<JsonValue>, bool) {
    match data {
        Some(JsonValue::Array(arr)) => (arr, true),
        Some(other) => (vec![other], false),
        None => (Vec::new(), false),
    }
}

fn select_result(mut items: Vec<JsonValue>, query: &SerializedQuery) -> DbResult {
    if query.single {
        if items.is_empty() {
            return DbResult::err(DbError::with_code("Row not found", "PGRST116"));
        }
        return DbResult::ok(items.remove(0));
    }
    if query.maybe_single {
        return DbResult::ok(if items.is_empty() { JsonValue::Null } else { items.remove(0) });
    }
    DbResult::ok(JsonValue::Array(items))
}

/// Executes a single table operation against the in-memory db object, mutating
/// it in place for insert/upsert/update/delete. The caller decides whether to
/// persist `db` to disk afterwards (skip on error, matching the JS original
/// which never calls writeDB() on an aborted batch).
pub fn execute(db: &mut JsonValue, query: &SerializedQuery, action: &str, data: Option<JsonValue>) -> DbResult {
    let table = query.table.clone();
    ensure_table(db, &table);

    // 1. Filter (mirrors: non-insert actions filter the current table snapshot)
    let filtered: Vec<JsonValue> = if action != "insert" {
        table_ref(db, &table)
            .iter()
            .filter(|item| matches_filters(item, query))
            .cloned()
            .collect()
    } else {
        Vec::new()
    };

    match action {
        "select" => {
            let mut items = filtered;

            if let Some(order) = &query.order {
                items.sort_by(|a, b| {
                    let av = a.get(&order.column).cloned().unwrap_or(JsonValue::Null);
                    let bv = b.get(&order.column).cloned().unwrap_or(JsonValue::Null);
                    let ord = compare_values(&av, &bv);
                    if order.ascending { ord } else { ord.reverse() }
                });
            }

            if let Some(limit) = query.limit {
                let limit = limit.max(0) as usize;
                items.truncate(limit);
            }

            let items = apply_joins(&table, items, db);
            select_result(items, query)
        }

        "insert" => {
            let (batch, was_array) = as_batch(data);
            let mut created = Vec::with_capacity(batch.len());

            for d in &batch {
                let new_item = stamp_new_item(d);

                if let Some(slug) = d.get("slug").filter(|v| is_truthy(v)) {
                    let dup = table_ref(db, &table).iter().any(|x| x.get("slug") == Some(slug));
                    if dup {
                        let slug_str = slug.as_str().map(str::to_string).unwrap_or_else(|| slug.to_string());
                        return DbResult::err(DbError::with_code(
                            format!("Duplicate key violation: slug {slug_str} already exists"),
                            "23505",
                        ));
                    }
                }

                ensure_table(db, &table).push(new_item.clone());
                created.push(new_item);
            }

            if was_array {
                DbResult::ok(JsonValue::Array(created))
            } else {
                DbResult::ok(created.into_iter().next().unwrap_or(JsonValue::Null))
            }
        }

        "upsert" => {
            let (batch, was_array) = as_batch(data);
            let mut upserted = Vec::with_capacity(batch.len());

            for d in &batch {
                let d_obj = d.as_object().cloned().unwrap_or_default();
                let table_vec = ensure_table(db, &table);

                let existing_index = if d_obj.get("id").map(is_truthy).unwrap_or(false) {
                    table_vec.iter().position(|x| x.get("id") == d_obj.get("id"))
                } else if d_obj.get("slug").map(is_truthy).unwrap_or(false) {
                    table_vec.iter().position(|x| x.get("slug") == d_obj.get("slug"))
                } else if table == "user_progress"
                    && d_obj.get("user_id").map(is_truthy).unwrap_or(false)
                    && d_obj.get("course_id").map(is_truthy).unwrap_or(false)
                {
                    table_vec.iter().position(|x| {
                        x.get("user_id") == d_obj.get("user_id") && x.get("course_id") == d_obj.get("course_id")
                    })
                } else if table == "user_package_subscriptions"
                    && d_obj.get("user_id").map(is_truthy).unwrap_or(false)
                    && d_obj.get("package_id").map(is_truthy).unwrap_or(false)
                {
                    table_vec.iter().position(|x| {
                        x.get("user_id") == d_obj.get("user_id") && x.get("package_id") == d_obj.get("package_id")
                    })
                } else {
                    None
                };

                if let Some(idx) = existing_index {
                    let existing = table_vec[idx].as_object().cloned().unwrap_or_default();
                    let mut merged = existing;
                    for (k, v) in &d_obj {
                        merged.insert(k.clone(), v.clone());
                    }
                    merged.insert("updated_at".to_string(), JsonValue::String(now_iso()));
                    let merged_val = JsonValue::Object(merged);
                    table_vec[idx] = merged_val.clone();
                    upserted.push(merged_val);
                } else {
                    let new_item = stamp_new_item(d);
                    table_vec.push(new_item.clone());
                    upserted.push(new_item);
                }
            }

            if was_array {
                DbResult::ok(JsonValue::Array(upserted))
            } else {
                DbResult::ok(upserted.into_iter().next().unwrap_or(JsonValue::Null))
            }
        }

        "update" => {
            let updated_ids: Vec<JsonValue> = filtered.iter().map(item_id).collect();
            let patch = data.and_then(|v| v.as_object().cloned()).unwrap_or_default();

            let table_vec = ensure_table(db, &table);
            for item in table_vec.iter_mut() {
                if updated_ids.contains(&item_id(item)) {
                    if let JsonValue::Object(map) = item {
                        for (k, v) in &patch {
                            map.insert(k.clone(), v.clone());
                        }
                        map.insert("updated_at".to_string(), JsonValue::String(now_iso()));
                    }
                }
            }

            let updated_items: Vec<JsonValue> = table_ref(db, &table)
                .iter()
                .filter(|item| updated_ids.contains(&item_id(item)))
                .cloned()
                .collect();

            if query.single || query.maybe_single {
                DbResult::ok(updated_items.into_iter().next().unwrap_or(JsonValue::Null))
            } else {
                DbResult::ok(JsonValue::Array(updated_items))
            }
        }

        "delete" => {
            let deleted_ids: Vec<JsonValue> = filtered.iter().map(item_id).collect();
            let table_vec = ensure_table(db, &table);
            table_vec.retain(|item| !deleted_ids.contains(&item_id(item)));

            DbResult::ok(JsonValue::Array(filtered))
        }

        other => DbResult::err(DbError::new(format!("Unsupported action: {other}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn q(table: &str) -> SerializedQuery {
        SerializedQuery { table: table.to_string(), ..Default::default() }
    }

    fn filter(kind: &str, column: &str, value: JsonValue) -> super::super::types::Filter {
        super::super::types::Filter { kind: kind.to_string(), column: column.to_string(), value }
    }

    #[test]
    fn insert_generates_id_and_timestamps() {
        let mut db = json!({ "course_packages": [] });
        let result = execute(&mut db, &q("course_packages"), "insert", Some(json!({ "title": "Rust 101" })));
        assert!(result.error.is_none());
        let item = result.data.unwrap();
        assert!(item["id"].as_str().unwrap().len() > 0);
        assert!(item["created_at"].as_str().is_some());
        assert!(item["updated_at"].as_str().is_some());
        assert_eq!(item["title"], "Rust 101");
    }

    #[test]
    fn insert_preserves_provided_id() {
        let mut db = json!({ "course_packages": [] });
        let result = execute(&mut db, &q("course_packages"), "insert", Some(json!({ "id": "fixed-id", "title": "X" })));
        assert_eq!(result.data.unwrap()["id"], "fixed-id");
    }

    #[test]
    fn insert_rejects_duplicate_slug_with_23505() {
        let mut db = json!({ "course_packages": [ { "id": "1", "slug": "intro" } ] });
        let result = execute(&mut db, &q("course_packages"), "insert", Some(json!({ "slug": "intro" })));
        assert!(result.data.is_none());
        assert_eq!(result.error.unwrap().code.as_deref(), Some("23505"));
        // aborted insert must not have mutated the in-memory table
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 1);
    }

    fn seeded_packages_db() -> JsonValue {
        json!({
            "course_packages": [
                { "id": "p1", "slug": "a", "title": "Alpha", "price": 10 },
                { "id": "p2", "slug": "b", "title": "Beta", "price": 30 },
                { "id": "p3", "slug": "c", "title": "Gamma", "price": 20 }
            ]
        })
    }

    #[test]
    fn filter_eq_neq_in() {
        let mut db = seeded_packages_db();

        let mut query = q("course_packages");
        query.filters = vec![filter("eq", "slug", json!("b"))];
        let r = execute(&mut db, &query, "select", None);
        assert_eq!(r.data.unwrap().as_array().unwrap().len(), 1);

        let mut query = q("course_packages");
        query.filters = vec![filter("neq", "slug", json!("b"))];
        let r = execute(&mut db, &query, "select", None);
        assert_eq!(r.data.unwrap().as_array().unwrap().len(), 2);

        let mut query = q("course_packages");
        query.filters = vec![filter("in", "slug", json!(["a", "c"]))];
        let r = execute(&mut db, &query, "select", None);
        assert_eq!(r.data.unwrap().as_array().unwrap().len(), 2);
    }

    #[test]
    fn order_numeric_and_string() {
        let mut db = seeded_packages_db();

        let mut query = q("course_packages");
        query.order = Some(super::super::types::OrderConfig { column: "price".to_string(), ascending: true });
        let r = execute(&mut db, &query, "select", None);
        let items = r.data.unwrap();
        let prices: Vec<i64> = items.as_array().unwrap().iter().map(|i| i["price"].as_i64().unwrap()).collect();
        assert_eq!(prices, vec![10, 20, 30]);

        let mut query = q("course_packages");
        query.order = Some(super::super::types::OrderConfig { column: "slug".to_string(), ascending: false });
        let r = execute(&mut db, &query, "select", None);
        let items = r.data.unwrap();
        let slugs: Vec<String> = items.as_array().unwrap().iter().map(|i| i["slug"].as_str().unwrap().to_string()).collect();
        assert_eq!(slugs, vec!["c", "b", "a"]);
    }

    #[test]
    fn limit_truncates() {
        let mut db = seeded_packages_db();
        let mut query = q("course_packages");
        query.limit = Some(2);
        let r = execute(&mut db, &query, "select", None);
        assert_eq!(r.data.unwrap().as_array().unwrap().len(), 2);
    }

    #[test]
    fn single_not_found_returns_pgrst116() {
        let mut db = json!({ "course_packages": [] });
        let mut query = q("course_packages");
        query.single = true;
        let r = execute(&mut db, &query, "select", None);
        assert!(r.data.is_none());
        assert_eq!(r.error.unwrap().code.as_deref(), Some("PGRST116"));
    }

    #[test]
    fn single_found_returns_row() {
        let mut db = seeded_packages_db();
        let mut query = q("course_packages");
        query.filters = vec![filter("eq", "slug", json!("a"))];
        query.single = true;
        let r = execute(&mut db, &query, "select", None);
        assert_eq!(r.data.unwrap()["slug"], "a");
    }

    #[test]
    fn maybe_single_returns_null_when_empty() {
        let mut db = json!({ "course_packages": [] });
        let mut query = q("course_packages");
        query.maybe_single = true;
        let r = execute(&mut db, &query, "select", None);
        assert!(r.error.is_none());
        assert!(r.data.unwrap().is_null());
    }

    #[test]
    fn update_matching_rows() {
        let mut db = seeded_packages_db();
        let mut query = q("course_packages");
        query.filters = vec![filter("eq", "slug", json!("a"))];
        let r = execute(&mut db, &query, "update", Some(json!({ "title": "Alpha Updated" })));
        let items = r.data.unwrap();
        assert_eq!(items.as_array().unwrap().len(), 1);
        assert_eq!(items[0]["title"], "Alpha Updated");
        assert_eq!(db["course_packages"][0]["title"], "Alpha Updated");
    }

    #[test]
    fn upsert_by_id_updates_existing() {
        let mut db = seeded_packages_db();
        let r = execute(&mut db, &q("course_packages"), "upsert", Some(json!({ "id": "p1", "title": "Alpha v2" })));
        assert_eq!(r.data.unwrap()["title"], "Alpha v2");
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn upsert_by_slug_updates_existing() {
        let mut db = seeded_packages_db();
        let r = execute(&mut db, &q("course_packages"), "upsert", Some(json!({ "slug": "b", "title": "Beta v2" })));
        assert_eq!(r.data.unwrap()["title"], "Beta v2");
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn upsert_inserts_when_no_match() {
        let mut db = seeded_packages_db();
        let r = execute(&mut db, &q("course_packages"), "upsert", Some(json!({ "slug": "d", "title": "Delta" })));
        assert_eq!(r.data.unwrap()["title"], "Delta");
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 4);
    }

    #[test]
    fn upsert_by_composite_user_progress() {
        let mut db = json!({
            "user_progress": [ { "id": "up1", "user_id": "u1", "course_id": "c1", "percent": 10 } ]
        });
        let r = execute(&mut db, &q("user_progress"), "upsert", Some(json!({ "user_id": "u1", "course_id": "c1", "percent": 50 })));
        let item = r.data.unwrap();
        assert_eq!(item["percent"], 50);
        assert_eq!(item["id"], "up1");
        assert_eq!(db["user_progress"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn upsert_by_composite_subscriptions() {
        let mut db = json!({
            "user_package_subscriptions": [ { "id": "s1", "user_id": "u1", "package_id": "p1", "status": "active" } ]
        });
        let r = execute(
            &mut db,
            &q("user_package_subscriptions"),
            "upsert",
            Some(json!({ "user_id": "u1", "package_id": "p1", "status": "cancelled" })),
        );
        let item = r.data.unwrap();
        assert_eq!(item["status"], "cancelled");
        assert_eq!(db["user_package_subscriptions"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn delete_matching_rows() {
        let mut db = seeded_packages_db();
        let mut query = q("course_packages");
        query.filters = vec![filter("eq", "slug", json!("a"))];
        let r = execute(&mut db, &query, "delete", None);
        assert_eq!(r.data.unwrap().as_array().unwrap().len(), 1);
        assert_eq!(db["course_packages"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn join_user_progress_to_course() {
        let mut db = json!({
            "user_progress": [ { "id": "up1", "course_id": "p1" } ],
            "course_packages": [ { "id": "p1", "title": "Alpha" } ]
        });
        let r = execute(&mut db, &q("user_progress"), "select", None);
        let items = r.data.unwrap();
        assert_eq!(items[0]["course"]["title"], "Alpha");
    }

    #[test]
    fn join_user_package_subscriptions_to_package() {
        let mut db = json!({
            "user_package_subscriptions": [ { "id": "s1", "package_id": "p1" } ],
            "course_packages": [ { "id": "p1", "title": "Alpha" } ]
        });
        let r = execute(&mut db, &q("user_package_subscriptions"), "select", None);
        let items = r.data.unwrap();
        assert_eq!(items[0]["package"]["title"], "Alpha");
    }
}
