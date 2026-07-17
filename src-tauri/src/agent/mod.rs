use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::db::{read_db, rpc, write_db, AppDb, DbError, DbResult};
use crate::paths;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Clone)]
struct ChatChunkPayload {
    #[serde(rename = "requestId")]
    request_id: String,
    delta: String,
}

fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder().build().unwrap_or_else(|_| reqwest::Client::new())
}

// ---------------------------------------------------------------------------
// test_agent_connection — ports app/api/external-agents/test/route.ts
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn test_agent_connection(
    endpoint: String,
    api_key: Option<String>,
    agent_program: Option<String>,
    #[allow(unused_variables)] agent_type: Option<String>,
) -> Result<DbResult, String> {
    if endpoint.trim().is_empty() {
        return Ok(DbResult::err(DbError::new("Endpoint is required")));
    }
    let api_key = api_key.unwrap_or_default();
    let program = agent_program.unwrap_or_default();
    let client = build_http_client();

    let result = match program.as_str() {
        "claude" => test_claude(&client, &endpoint, &api_key).await,
        "gemini" => test_gemini(&client, &endpoint, &api_key).await,
        _ => test_openai_compatible(&client, &endpoint, &api_key).await,
    };
    Ok(DbResult::ok(result))
}

async fn test_claude(client: &reqwest::Client, endpoint: &str, api_key: &str) -> JsonValue {
    let url = format!("{}/messages", endpoint.trim_end_matches('/'));
    let body = json!({
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "Ping"}]
    });

    let res = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    match res {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if status == 401 || status == 403 {
                json!({"success": false, "message": "API Key 인증 실패. Claude API 권한이 없습니다."})
            } else if resp.status().is_success() {
                json!({
                    "success": true,
                    "models": [
                        {"id": "claude-3-5-sonnet-20241022"},
                        {"id": "claude-3-5-haiku-20241022"}
                    ],
                    "current_model": "claude-3-5-sonnet-20241022"
                })
            } else {
                json!({"success": false, "message": "Claude API 연결 실패 (엔드포인트 및 API Key 확인 필요)"})
            }
        }
        Err(_) => json!({"success": false, "message": "Claude API 연결 실패 (엔드포인트 및 API Key 확인 필요)"}),
    }
}

async fn test_gemini(client: &reqwest::Client, endpoint: &str, api_key: &str) -> JsonValue {
    let trimmed = endpoint.trim_end_matches('/');

    let openai_res = client
        .get(format!("{trimmed}/openai/v1/models"))
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    if let Ok(resp) = openai_res {
        if resp.status().is_success() {
            if let Ok(data) = resp.json::<JsonValue>().await {
                let ids: Vec<JsonValue> = data
                    .get("data")
                    .and_then(|v| v.as_array())
                    .into_iter()
                    .flatten()
                    .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
                    .map(|id| json!({"id": id}))
                    .collect();
                if !ids.is_empty() {
                    let current = ids[0].get("id").and_then(|v| v.as_str()).unwrap_or("gemini-1.5-flash").to_string();
                    return json!({"success": true, "models": ids, "current_model": current});
                }
            }
        }
    }

    let rest_res = client
        .get(format!("{trimmed}/models?key={api_key}"))
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    if let Ok(resp) = rest_res {
        let status = resp.status().as_u16();
        if status == 400 || status == 403 {
            return json!({"success": false, "message": "Gemini API Key 인증 실패."});
        }
        if resp.status().is_success() {
            if let Ok(data) = resp.json::<JsonValue>().await {
                let ids: Vec<JsonValue> = data
                    .get("models")
                    .and_then(|v| v.as_array())
                    .into_iter()
                    .flatten()
                    .filter_map(|m| m.get("name").and_then(|v| v.as_str()))
                    .map(|name| json!({"id": name.trim_start_matches("models/")}))
                    .collect();
                if !ids.is_empty() {
                    let current = ids[0].get("id").and_then(|v| v.as_str()).unwrap_or("gemini-1.5-flash").to_string();
                    return json!({"success": true, "models": ids, "current_model": current});
                }
            }
        }
    }

    json!({"success": false, "message": "Gemini API 연결 실패 (API Key 확인 필요)"})
}

async fn test_openai_compatible(client: &reqwest::Client, endpoint: &str, api_key: &str) -> JsonValue {
    let (base_url, v1_url) = normalize_agent_endpoint(endpoint);

    let _ = client.get(format!("{base_url}/health")).timeout(Duration::from_secs(3)).send().await;

    let mut models_req = client.get(format!("{v1_url}/models")).timeout(Duration::from_secs(5));
    if !api_key.is_empty() {
        models_req = models_req.header("Authorization", format!("Bearer {api_key}"));
    }

    let mut models_list: Vec<JsonValue> = Vec::new();
    let mut current_model: Option<String> = None;
    let mut success = false;
    let mut auth_error = false;

    if let Ok(resp) = models_req.send().await {
        let status = resp.status().as_u16();
        if status == 401 || status == 403 {
            auth_error = true;
        } else if resp.status().is_success() {
            if let Ok(data) = resp.json::<JsonValue>().await {
                let list = data.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                current_model = data
                    .get("current_model")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .or_else(|| {
                        list.iter()
                            .find(|m| m.get("current").and_then(|c| c.as_bool()) == Some(true))
                            .and_then(|m| m.get("id"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                    });
                models_list = list.iter().filter_map(|m| m.get("id").and_then(|v| v.as_str())).map(|id| json!({"id": id})).collect();
                success = true;
            }
        }
    }

    if !success && !auth_error {
        let probe_body = json!({
            "model": "hermes-agent",
            "messages": [{
                "role": "user",
                "content": "Please output the list of all currently supported/available LLM models you can route to, and the currently active model. Respond ONLY in valid JSON format like: {\"models\": [\"model-name-1\", \"model-name-2\"], \"current_model\": \"active-model-name\"}"
            }],
            "response_format": {"type": "json_object"}
        });
        let mut chat_req = client.post(format!("{v1_url}/chat/completions")).timeout(Duration::from_secs(10)).json(&probe_body);
        if !api_key.is_empty() {
            chat_req = chat_req.header("Authorization", format!("Bearer {api_key}"));
        }

        if let Ok(resp) = chat_req.send().await {
            if resp.status().is_success() {
                if let Ok(chat_data) = resp.json::<JsonValue>().await {
                    if let Some(reply) = chat_data
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c0| c0.get("message"))
                        .and_then(|m| m.get("content"))
                        .and_then(|v| v.as_str())
                    {
                        let clean = reply.trim().trim_start_matches("```json").trim_end_matches("```").trim();
                        if let Ok(parsed) = serde_json::from_str::<JsonValue>(clean) {
                            if let Some(models) = parsed.get("models").and_then(|v| v.as_array()) {
                                models_list = models.iter().filter_map(|v| v.as_str()).map(|id| json!({"id": id})).collect();
                                current_model = parsed
                                    .get("current_model")
                                    .and_then(|v| v.as_str())
                                    .map(str::to_string)
                                    .or_else(|| models_list.first().and_then(|m| m.get("id")).and_then(|v| v.as_str()).map(str::to_string));
                                success = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if !success {
        let message = if auth_error {
            "API Key 인증 실패. 권한이 없습니다."
        } else {
            "에이전트 서버에 연결할 수 없거나 지원 모델 정보를 가져오지 못했습니다. (/v1/models 및 chat fallback 실패)"
        };
        return json!({"success": false, "message": message});
    }

    json!({"success": true, "models": models_list, "current_model": current_model})
}

// ---------------------------------------------------------------------------
// agent_chat — ports app/api/external-agents/[id]/chat/route.ts (POST)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn agent_chat(
    app: AppHandle,
    state: State<'_, AppDb>,
    request_id: String,
    agent_id: String,
    messages: Vec<ChatMessage>,
    original_user_message: Option<String>,
) -> Result<DbResult, String> {
    let start = std::time::Instant::now();
    let db_state = state.inner().clone();

    let prep = {
        let db_state = db_state.clone();
        let agent_id = agent_id.clone();
        let messages = messages.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<PreparedChat, String> {
            let _guard = db_state.lock.lock().map_err(|e| e.to_string())?;
            let mut db = read_db(&db_state.db_path);

            let agent = match find_agent(&db, &agent_id) {
                Some(a) => a,
                None => return Err("Agent not found".to_string()),
            };

            let last_user_message = messages.iter().rev().find(|m| m.role == "user");
            let user_content = original_user_message
                .clone()
                .or_else(|| last_user_message.map(|m| m.content.clone()))
                .unwrap_or_default();
            let is_system_check = user_content.contains("[시스템 점검]");

            if !is_system_check && last_user_message.is_some() {
                insert_message(&mut db, &agent_id, "user", &user_content);
            }

            let agent_type = agent.get("agent_type").and_then(|v| v.as_str()).unwrap_or("");
            let request_messages =
                if agent_type == "llm" { reload_history(&db, &agent_id, &messages) } else { messages.clone() };

            write_db(&db_state.db_path, &db).map_err(|e| e.to_string())?;
            Ok(PreparedChat { agent, request_messages, user_content, is_system_check })
        })
        .await
        .map_err(|e| e.to_string())?
    };

    let PreparedChat { agent, request_messages, user_content, is_system_check } = match prep {
        Ok(p) => p,
        Err(msg) => return Ok(DbResult::err(DbError::new(msg))),
    };

    let agent_type = agent.get("agent_type").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let agent_program = agent.get("agent_program").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let endpoint = agent.get("endpoint").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let api_key = agent.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let selected_model = agent.get("selected_model").and_then(|v| v.as_str()).unwrap_or("").to_string();

    let target_model = if !selected_model.is_empty() {
        selected_model
    } else if agent_type == "harness" {
        "hermes-agent".to_string()
    } else {
        String::new()
    };
    if target_model.is_empty() {
        return Ok(DbResult::err(DbError::new("모델이 선택되지 않았습니다. 에이전트 상세 설정에서 모델을 설정해 주세요.")));
    }

    let (_, v1_url) = normalize_agent_endpoint(&endpoint);
    let is_claude = agent_program == "claude";
    let (url, headers, body) = build_chat_request(&agent_program, &endpoint, &v1_url, &api_key, &target_model, &request_messages);

    let client = build_http_client();
    let mut req = client.post(&url).json(&body);
    for (k, v) in &headers {
        req = req.header(*k, v);
    }

    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => return Ok(DbResult::err(DbError::new(format!("External Agent 연결 실패: {e}")))),
    };
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Ok(DbResult::err(DbError::new(format!("External Agent API error ({status}): {text}"))));
    }

    let mut stream = response.bytes_stream();
    let mut assistant_text = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => return Ok(DbResult::err(DbError::new(format!("스트림 읽기 오류: {e}")))),
        };
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            emit_delta(&app, is_claude, line.trim(), &mut assistant_text, &request_id);
        }
    }
    if !buffer.trim().is_empty() {
        let line = buffer.clone();
        emit_delta(&app, is_claude, line.trim(), &mut assistant_text, &request_id);
    }

    if !assistant_text.trim().is_empty() && !is_system_check {
        let db_state2 = db_state.clone();
        let agent_id2 = agent_id.clone();
        let assistant_text2 = assistant_text.clone();
        let persist = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let _guard = db_state2.lock.lock().map_err(|e| e.to_string())?;
            let mut db = read_db(&db_state2.db_path);
            insert_message(&mut db, &agent_id2, "assistant", &assistant_text2);
            let _ = rpc::execute_rpc(&mut db, "prune_external_agent_messages", json!({"p_agent_id": agent_id2}));
            write_db(&db_state2.db_path, &db).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?;
        persist?;

        let duration_ms = start.elapsed().as_millis() as i64;
        let input_tokens = estimate_token_size(&user_content);
        let output_tokens = estimate_token_size(&assistant_text);
        let log_dir = paths::agent_chats_dir(&app);
        let agent_id3 = agent_id.clone();
        let user_content2 = user_content.clone();
        let assistant_text3 = assistant_text.clone();
        tauri::async_runtime::spawn_blocking(move || {
            append_chat_log(&log_dir, &agent_id3, duration_ms, input_tokens, output_tokens, &user_content2, &assistant_text3);
        })
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(DbResult::ok(json!({ "content": assistant_text })))
}

struct PreparedChat {
    agent: JsonValue,
    request_messages: Vec<ChatMessage>,
    user_content: String,
    is_system_check: bool,
}

fn emit_delta(app: &AppHandle, is_claude: bool, line: &str, assistant_text: &mut String, request_id: &str) {
    let delta = if is_claude { parse_claude_sse_line(line) } else { parse_openai_sse_line(line) };
    if let StreamDelta::Content(text) = delta {
        assistant_text.push_str(&text);
        let _ = app.emit("agent-chat-chunk", ChatChunkPayload { request_id: request_id.to_string(), delta: text });
    }
}

fn find_agent(db: &JsonValue, agent_id: &str) -> Option<JsonValue> {
    db.get("user_external_agents")?
        .as_array()?
        .iter()
        .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(agent_id))
        .cloned()
}

fn insert_message(db: &mut JsonValue, agent_id: &str, role: &str, content: &str) {
    let obj = db.as_object_mut().expect("db root must be a JSON object");
    let arr = obj.entry("user_external_agent_messages".to_string()).or_insert_with(|| JsonValue::Array(Vec::new()));
    if let Some(arr) = arr.as_array_mut() {
        arr.push(json!({
            "id": Uuid::new_v4().to_string(),
            "agent_id": agent_id,
            "role": role,
            "content": content,
            "created_at": Utc::now().to_rfc3339(),
        }));
    }
}

/// Mirrors `[id]/chat/route.ts`'s session-continuity reload: if this agent
/// has any stored history, replace the client-sent messages with
/// `[system?, ...db history]`; otherwise fall back to what the client sent.
fn reload_history(db: &JsonValue, agent_id: &str, client_messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let system_content = client_messages.iter().find(|m| m.role == "system").map(|m| m.content.clone());

    let mut db_msgs: Vec<&JsonValue> = db
        .get("user_external_agent_messages")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter(|m| m.get("agent_id").and_then(|v| v.as_str()) == Some(agent_id)).collect())
        .unwrap_or_default();

    db_msgs.sort_by_key(|m| parse_created_at_ms(m));

    if db_msgs.is_empty() {
        return client_messages.to_vec();
    }

    let mut result = Vec::new();
    if let Some(content) = system_content {
        result.push(ChatMessage { role: "system".to_string(), content });
    }
    for m in db_msgs {
        let role = if m.get("role").and_then(|v| v.as_str()) == Some("assistant") { "assistant" } else { "user" };
        let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
        result.push(ChatMessage { role: role.to_string(), content });
    }
    result
}

fn parse_created_at_ms(m: &JsonValue) -> i64 {
    m.get("created_at")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn build_chat_request(
    agent_program: &str,
    endpoint: &str,
    v1_url: &str,
    api_key: &str,
    target_model: &str,
    messages: &[ChatMessage],
) -> (String, Vec<(&'static str, String)>, JsonValue) {
    match agent_program {
        "claude" => {
            let system_message = messages.iter().find(|m| m.role == "system").map(|m| m.content.clone());
            let other_messages: Vec<JsonValue> = messages
                .iter()
                .filter(|m| m.role != "system")
                .map(|m| {
                    let role = if m.role == "assistant" { "assistant" } else { "user" };
                    json!({"role": role, "content": m.content})
                })
                .collect();
            let mut body = json!({
                "model": target_model,
                "messages": other_messages,
                "max_tokens": 4000,
                "stream": true
            });
            if let Some(sys) = system_message {
                body["system"] = JsonValue::String(sys);
            }
            let headers = vec![
                ("Content-Type", "application/json".to_string()),
                ("x-api-key", api_key.to_string()),
                ("anthropic-version", "2023-06-01".to_string()),
            ];
            (format!("{}/messages", endpoint.trim_end_matches('/')), headers, body)
        }
        "gemini" => {
            let headers = vec![
                ("Content-Type", "application/json".to_string()),
                ("Authorization", format!("Bearer {api_key}")),
            ];
            let body = json!({"model": target_model, "messages": messages, "stream": true});
            (format!("{}/openai/v1/chat/completions", endpoint.trim_end_matches('/')), headers, body)
        }
        _ => {
            let mut headers = vec![("Content-Type", "application/json".to_string())];
            if !api_key.is_empty() {
                headers.push(("Authorization", format!("Bearer {api_key}")));
            }
            let body = json!({"model": target_model, "messages": messages, "stream": true});
            (format!("{v1_url}/chat/completions"), headers, body)
        }
    }
}

fn estimate_token_size(text: &str) -> i64 {
    if text.is_empty() {
        return 0;
    }
    let korean_count = text.chars().filter(|c| ('\u{ac00}'..='\u{d7a3}').contains(c)).count() as f64;
    let other_count = text.chars().count() as f64 - korean_count;
    (korean_count * 1.5 + other_count * 0.5).ceil() as i64
}

fn append_chat_log(
    dir: &Path,
    agent_id: &str,
    duration_ms: i64,
    input_tokens: i64,
    output_tokens: i64,
    user_message: &str,
    assistant_message: &str,
) {
    let _ = std::fs::create_dir_all(dir);
    let path = dir.join(format!("{agent_id}.json"));
    let mut logs: Vec<JsonValue> =
        std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();

    logs.push(json!({
        "timestamp": Utc::now().to_rfc3339(),
        "duration_ms": duration_ms,
        "input_token_size": input_tokens,
        "output_token_size": output_tokens,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }));

    if let Ok(pretty) = serde_json::to_string_pretty(&logs) {
        let _ = std::fs::write(&path, pretty);
    }
}

// ---------------------------------------------------------------------------
// get_agent_chat_logs — ports app/api/external-agents/[id]/chat/route.ts (GET)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_agent_chat_logs(app: AppHandle, agent_id: String) -> Result<DbResult, String> {
    let path: PathBuf = paths::agent_chats_dir(&app).join(format!("{agent_id}.json"));
    let logs: JsonValue = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| JsonValue::Array(Vec::new()))
    } else {
        JsonValue::Array(Vec::new())
    };
    Ok(DbResult::ok(logs))
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested below): endpoint normalization + SSE translation
// ---------------------------------------------------------------------------

/// Ports `lib/utils/agent-endpoint.ts`'s `normalizeAgentEndpoint`.
pub fn normalize_agent_endpoint(endpoint: &str) -> (String, String) {
    if endpoint.is_empty() {
        return (String::new(), String::new());
    }
    let resolved = endpoint.replace("//localhost", "//127.0.0.1");
    let clean = resolved.trim_end_matches('/').to_string();
    let base_url = clean.strip_suffix("/v1").unwrap_or(&clean).to_string();
    let v1_url = if clean.ends_with("/v1") { clean.clone() } else { format!("{clean}/v1") };
    (base_url, v1_url)
}

#[derive(Debug, PartialEq, Eq)]
pub enum StreamDelta {
    Content(String),
    Done,
    Skip,
}

/// Extracts plain-text deltas out of Anthropic's native Messages-API SSE
/// stream (`content_block_delta` events), mirroring the Claude branch of
/// `[id]/chat/route.ts`'s `processLine`/inline translate logic.
pub fn parse_claude_sse_line(line: &str) -> StreamDelta {
    let line = line.trim();
    if !line.starts_with("data:") {
        return StreamDelta::Skip;
    }
    let data = line[5..].trim();
    if data == "[DONE]" {
        return StreamDelta::Skip;
    }
    let parsed: JsonValue = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return StreamDelta::Skip,
    };
    match parsed.get("type").and_then(|v| v.as_str()) {
        Some("content_block_delta") => match parsed.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()) {
            Some(text) => StreamDelta::Content(text.to_string()),
            None => StreamDelta::Skip,
        },
        Some("message_stop") => StreamDelta::Done,
        _ => StreamDelta::Skip,
    }
}

/// Extracts plain-text deltas out of an OpenAI-compatible chat-completions
/// SSE stream, mirroring `[id]/chat/route.ts`'s `processLine` for the
/// Gemini/DeepSeek/Qwen/Kimi/Ollama/LM Studio branch.
pub fn parse_openai_sse_line(line: &str) -> StreamDelta {
    let line = line.trim();
    if !line.starts_with("data:") {
        return StreamDelta::Skip;
    }
    let data = line[5..].trim();
    if data == "[DONE]" {
        return StreamDelta::Done;
    }
    let parsed: JsonValue = match serde_json::from_str(data) {
        Ok(v) => v,
        Err(_) => return StreamDelta::Skip,
    };
    let delta = parsed.get("choices").and_then(|c| c.get(0)).and_then(|c0| c0.get("delta")).and_then(|d| d.get("content")).and_then(|v| v.as_str());
    match delta {
        Some(text) if !text.is_empty() => StreamDelta::Content(text.to_string()),
        _ => StreamDelta::Skip,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_trailing_slash_and_localhost() {
        let (base, v1) = normalize_agent_endpoint("http://localhost:8642/v1/");
        assert_eq!(base, "http://127.0.0.1:8642");
        assert_eq!(v1, "http://127.0.0.1:8642/v1");
    }

    #[test]
    fn normalize_appends_v1_when_missing() {
        let (base, v1) = normalize_agent_endpoint("http://127.0.0.1:1234");
        assert_eq!(base, "http://127.0.0.1:1234");
        assert_eq!(v1, "http://127.0.0.1:1234/v1");
    }

    #[test]
    fn normalize_empty_endpoint_returns_empty() {
        assert_eq!(normalize_agent_endpoint(""), (String::new(), String::new()));
    }

    #[test]
    fn claude_sse_content_block_delta_yields_content() {
        let line = r#"data: {"type":"content_block_delta","delta":{"text":"hello"}}"#;
        assert_eq!(parse_claude_sse_line(line), StreamDelta::Content("hello".to_string()));
    }

    #[test]
    fn claude_sse_message_stop_yields_done() {
        let line = r#"data: {"type":"message_stop"}"#;
        assert_eq!(parse_claude_sse_line(line), StreamDelta::Done);
    }

    #[test]
    fn claude_sse_other_event_types_are_skipped() {
        let line = r#"data: {"type":"content_block_start"}"#;
        assert_eq!(parse_claude_sse_line(line), StreamDelta::Skip);
    }

    #[test]
    fn claude_sse_malformed_json_is_skipped() {
        assert_eq!(parse_claude_sse_line("data: not json"), StreamDelta::Skip);
    }

    #[test]
    fn openai_sse_delta_content_yields_content() {
        let line = r#"data: {"choices":[{"delta":{"content":"world"}}]}"#;
        assert_eq!(parse_openai_sse_line(line), StreamDelta::Content("world".to_string()));
    }

    #[test]
    fn openai_sse_done_marker_yields_done() {
        assert_eq!(parse_openai_sse_line("data: [DONE]"), StreamDelta::Done);
    }

    #[test]
    fn openai_sse_empty_delta_is_skipped() {
        let line = r#"data: {"choices":[{"delta":{}}]}"#;
        assert_eq!(parse_openai_sse_line(line), StreamDelta::Skip);
    }

    #[test]
    fn non_data_lines_are_skipped() {
        assert_eq!(parse_openai_sse_line("event: ping"), StreamDelta::Skip);
        assert_eq!(parse_claude_sse_line(""), StreamDelta::Skip);
    }

    #[test]
    fn reload_history_falls_back_to_client_messages_when_no_db_history() {
        let db = json!({"user_external_agent_messages": []});
        let client_messages = vec![ChatMessage { role: "user".to_string(), content: "hi".to_string() }];
        let result = reload_history(&db, "agent-1", &client_messages);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].content, "hi");
    }

    #[test]
    fn reload_history_prepends_system_and_uses_db_order() {
        let db = json!({"user_external_agent_messages": [
            {"id": "m2", "agent_id": "agent-1", "role": "assistant", "content": "second", "created_at": "2024-01-01T00:00:02.000Z"},
            {"id": "m1", "agent_id": "agent-1", "role": "user", "content": "first", "created_at": "2024-01-01T00:00:01.000Z"},
            {"id": "m3", "agent_id": "other", "role": "user", "content": "ignored", "created_at": "2024-01-01T00:00:00.000Z"}
        ]});
        let client_messages = vec![
            ChatMessage { role: "system".to_string(), content: "sys prompt".to_string() },
            ChatMessage { role: "user".to_string(), content: "latest".to_string() },
        ];
        let result = reload_history(&db, "agent-1", &client_messages);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].role, "system");
        assert_eq!(result[1].content, "first");
        assert_eq!(result[2].content, "second");
    }

    #[test]
    fn estimate_token_size_weighs_korean_higher() {
        assert_eq!(estimate_token_size(""), 0);
        assert_eq!(estimate_token_size("abcd"), 2); // 4 * 0.5
        assert_eq!(estimate_token_size("가나다라"), 6); // 4 * 1.5
    }
}
