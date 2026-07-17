---
description: Local JSON DB (db.json) 및 파일 스토리지 관리 규칙. 데이터 조회/수정/삭제 관련 코드 작성 시 적용.
pattern: "**/{src/lib/db,src-tauri/src/db,src-tauri/src/bundle}/**/*"
---

# Local DB & Storage

이 프로젝트는 클라우드 서비스(Supabase 등) 없이, OS 앱 데이터 폴더의 `db.json`과 강좌 스토리지 폴더를 Rust가 직접 관리하는 온디바이스형 도구입니다.

## 1. 데이터 처리 패턴
- 프론트엔드는 [client.ts](file:///C:/Workspace/Projects/OpenTutorials-Desktop/src/lib/db/client.ts)의 `db.from(table)...` (`QueryBuilder`, 기존 Supabase 체이닝 문법과 동일)을 통해서만 데이터에 접근합니다.
- `QueryBuilder`는 조회 조건을 `SerializedQuery`로 직렬화해 `invoke("db_query", ...)`로 Rust에 전달할 뿐, 실제 파일 Read/Write는 전부 Rust `src-tauri/src/db/query_engine.rs`가 `db.json`에 대해 수행합니다.
- `db.json`의 실제 경로는 `src-tauri/src/paths.rs`가 계산하는 OS 앱 데이터 폴더 하위이며, 프론트엔드 코드에서 직접 경로를 하드코딩하지 않습니다.

## 2. QueryBuilder 사용법
Supabase 스타일 체이닝 구문을 그대로 사용합니다:
```typescript
import { db } from "@/lib/db/client";

const { data, error } = await db
  .from("courses")
  .select("*")
  .eq("id", courseId)
  .maybeSingle();
```
- 커스텀 집계/정리 로직이 필요하면 새 필터 연산자를 추가하기보다 `db.rpc("함수명", args)` → Rust `db/rpc.rs`에 함수를 추가하는 방식을 우선 고려합니다 (예: `prune_external_agent_messages`).

## 3. 권한 및 보안 우회 (Bypass)
- 데스크탑 전용 로컬 환경이므로, 로그인 및 회원가입 절차가 없습니다.
- 항상 고정된 로컬 사용자(`LOCAL_USER_ID = "local-user-id"`, `src/lib/db/client.ts`)로 동작하며, 관리자 권한 체크 로직은 존재하지 않고 모든 기능이 기본 사용자 모드에서 실행됩니다.

## 4. 파일 스토리지 (Storage)
- 강좌 번들 및 첨부 자산은 `db.storage.from(bucket).upload/download(...)`(`StorageBucket`, `src/lib/db/client.ts`)를 통해 base64로 인코딩되어 Rust `storage_upload`/`storage_download` 커맨드로 전달되고, Rust `src-tauri/src/db/storage.rs`가 실제 파일 시스템에 적재/조회합니다.
- 브라우저에서 정적 파일을 직접 참조해야 할 때는 `getPublicUrl()`이 Tauri의 `convertFileSrc()`를 사용해 `asset:` 프로토콜 URL을 생성합니다. 새로운 스토리지 경로를 추가할 경우 `tauri.conf.json`의 asset 프로토콜 allowlist에도 반영되어야 합니다.
- 강좌 번들(zip) 임포트는 `src-tauri/src/bundle/mod.rs`의 `import_course_bundle` 커맨드가 담당하며, 검증은 [bundler-protocol.md](bundler-protocol.md) 규칙을 따릅니다.
