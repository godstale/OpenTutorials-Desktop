use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

#[derive(Debug, Deserialize)]
pub struct Filter {
    #[serde(rename = "type")]
    pub kind: String, // "eq" | "neq" | "in"
    pub column: String,
    pub value: JsonValue,
}

#[derive(Debug, Deserialize)]
pub struct OrderConfig {
    pub column: String,
    pub ascending: bool,
}

#[derive(Debug, Deserialize, Default)]
pub struct SerializedQuery {
    pub table: String,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default)]
    pub order: Option<OrderConfig>,
    #[serde(default)]
    pub single: bool,
    #[serde(default, rename = "maybeSingle")]
    pub maybe_single: bool,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DbError {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

impl DbError {
    pub fn new(message: impl Into<String>) -> Self {
        Self { message: message.into(), code: None }
    }

    pub fn with_code(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self { message: message.into(), code: Some(code.into()) }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct DbResult {
    pub data: Option<JsonValue>,
    pub error: Option<DbError>,
}

impl DbResult {
    pub fn ok(data: JsonValue) -> Self {
        Self { data: Some(data), error: None }
    }

    pub fn ok_null() -> Self {
        Self { data: None, error: None }
    }

    pub fn err(error: DbError) -> Self {
        Self { data: None, error: Some(error) }
    }
}
