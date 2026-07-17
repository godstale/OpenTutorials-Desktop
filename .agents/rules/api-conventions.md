---
description: Tauri IPC(#[tauri::command]) 및 프론트 invoke() 호출 컨벤션. IPC 관련 코드 작성 시 적용.
pattern: "**/{src-tauri/src,src/lib}/**/*"
---

# API(IPC) Conventions

Next.js API Route Handler는 전부 제거되었습니다. 모든 백엔드 로직은 Rust `#[tauri::command]` 함수로 작성하고, 프론트엔드는 `@tauri-apps/api/core`의 `invoke()`로 호출합니다.

## 1. Rust 커맨드 작성 규칙
- 커맨드는 도메인 모듈(`db`, `bundle`, `agent`)의 `mod.rs`에 `#[tauri::command]`로 선언합니다.
```rust
#[tauri::command]
pub async fn agent_chat(
    state: tauri::State<'_, DbState>,
    app: tauri::AppHandle,
    args: AgentChatArgs,
) -> Result<(), String> {
    // ...
}
```
- 새 커맨드를 추가하면 반드시 `src-tauri/src/lib.rs`의 `invoke_handler![tauri::generate_handler![...]]` 목록에 등록해야 합니다. 등록을 빠뜨리면 프론트에서 `invoke()` 호출 시 런타임 에러가 발생합니다.
- 커맨드 인자/반환 타입은 `serde::{Serialize, Deserialize}`를 구현해야 하며, 프론트 TypeScript 타입과 필드명(camelCase ↔ Rust는 기본적으로 매칭되므로 `#[serde(rename_all = "camelCase")]` 필요 여부를 확인)이 일치해야 합니다.

## 2. Local DB 커맨드 (`db_query` / `db_rpc`)
- 프론트의 `QueryBuilder`(`src/lib/db/client.ts`)가 조회 조건을 `SerializedQuery`로 직렬화해 `db_query` 커맨드로 전달하면, Rust `db::query_engine`이 `db.json`에 대해 실제 필터/정렬/limit/single 처리를 수행합니다.
- Supabase에 없는 커스텀 로직(예: 정리/집계 함수)은 `db_rpc` 커맨드를 통해 `db::rpc::execute_rpc`에 함수명으로 분기 추가합니다 (기존 Supabase `.rpc()` 호출 문법과 동일하게 유지).

## 3. AI Agent 연동 (`agent` 모듈)
- 로컬 에이전트/AI 튜터 연동은 `test_agent_connection`(연결 테스트), `agent_chat`(스트리밍 채팅), `get_agent_chat_logs`(로그 조회) 3개 커맨드로 구성됩니다.
- 스트리밍 응답은 HTTP 응답 자체를 반환하지 않고, Rust가 `reqwest`로 SSE를 소비하며 델타 텍스트를 Tauri 이벤트(`agent-chat-chunk`)로 emit합니다. 프론트는 `listen("agent-chat-chunk", ...)`로 구독합니다.
- Claude/Gemini/OpenAI 호환 API마다 SSE 포맷이 다르므로, 프로토콜별 파서(`parse_claude_sse_line`, `parse_openai_sse_line` 등)를 순수 함수로 분리하고 각각 유닛 테스트를 작성합니다.

## 4. 프론트 invoke() 호출 규칙
```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<DbResult<Course[]>>("db_query", { query, action: "select" });
```
- 반환 타입은 항상 `DbResult<T>`(`{ data: T | null; error: DbError | null }`) 형태를 유지하여 기존 Supabase 스타일 에러 핸들링(`if (error) { ... }`)을 그대로 재사용합니다.
- IPC 호출은 반드시 `src/lib/` 하위의 클라이언트 래퍼(`db/client.ts`, `agent/client.ts` 등)를 통해서만 수행하고, 페이지/컴포넌트에서 `invoke()`를 직접 호출하지 않습니다.

## 5. 응답 형식 규격
- **성공 응답**: `DbResult::ok(data)` → `{ data, error: null }`
- **에러 응답**: `DbResult::err(DbError::new("메시지"))` → `{ data: null, error: { message } }`
