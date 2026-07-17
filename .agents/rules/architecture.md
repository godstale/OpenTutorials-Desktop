---
description: Vite/React Router 프론트엔드 및 Tauri Rust 백엔드 폴더 구조 패턴. 신규 페이지/컴포넌트/Rust 모듈 설계 시 적용.
pattern: "src/**/*"
---

# Architecture — Vite/React + Tauri(Rust)

## 1. 프론트엔드 구조 (`src/`)
Next.js App Router를 걷어내고, Vite + React Router(`HashRouter`) 기반 SPA 구조로 재구성되었습니다.
```
src/
  main.tsx              # 진입점, initDesktopDb() 초기화 후 App 마운트
  App.tsx                # HashRouter 및 전체 라우트 정의
  pages/                 # 라우트 단위 페이지 (Dashboard.tsx, Courses.tsx, Learn.tsx, Agents.tsx 등)
  components/
    layout/              # UserLayout, UserHeader, UserSidebar, SettingsLayout 등 공통 레이아웃
    features/            # 기능 단위 컴포넌트 (AddAgentModal, AgentChatTab, AgentSettingsTab 등)
    dashboard/           # 대시보드 전용 위젯
    learn/                # 학습 화면(Learn.tsx) 전용 하위 컴포넌트
    ui/                  # Shadcn UI 원본/래퍼 컴포넌트
  lib/
    db/                  # client.ts — QueryBuilder, DesktopDbClient (Rust invoke 래퍼)
    agent/                # 로컬/외부 에이전트 연동 클라이언트 (SSE 스트리밍 소비)
    bundle/                # 강좌 번들 업로드/검증 호출 클라이언트
    api/                  # 기타 IPC 래퍼 (external-agents.ts 등)
    context/              # React Context (예: LearnLayoutContext)
    types/                # 공유 TypeScript 타입
    constants/, locales/  # 상수 및 다국어 리소스
  hooks/                 # 커스텀 훅
```
- 라우팅은 `App.tsx`의 `HashRouter` 안에서 선언적으로 관리하며, Next.js의 파일 기반 라우팅(`page.tsx`)은 더 이상 사용하지 않습니다.
- 인증/로그인 절차가 없는 단일 사용자 로컬 앱이므로 미들웨어나 라우트 가드가 존재하지 않습니다. 앱 진입 시 바로 `Dashboard` 등 메인 화면으로 이동합니다.

## 2. Rust(Tauri) 백엔드 구조 (`src-tauri/src/`)
```
src-tauri/src/
  main.rs                # 바이너리 엔트리 (lib.rs의 run() 호출)
  lib.rs                 # tauri::Builder 설정, invoke_handler! 커맨드 등록 지점
  paths.rs               # OS 앱 데이터 폴더 경로 계산 헬퍼 (db.json, courses/, agent-chats/ 등)
  db/
    mod.rs               # db_query/db_rpc/storage_* 커맨드 진입점 및 상태(State) 관리
    query_engine.rs       # QueryBuilder가 직렬화한 쿼리(SerializedQuery)를 db.json에 대해 실행
    rpc.rs                # Supabase RPC(`supabase.rpc()`) 호환 커스텀 함수 (prune_external_agent_messages 등)
    storage.rs            # 파일 스토리지 업로드/다운로드 (base64 인코딩 경유)
    types.rs              # DbResult/DbError 등 공유 타입
  bundle/
    mod.rs                # validate_course_bundle/import_course_bundle/delete_course_package 커맨드
    validator.rs           # Bundler Protocol 검증 로직 (zip 파싱 + 매니페스트/TOC/카드 검증)
  agent/
    mod.rs                # test_agent_connection/agent_chat/get_agent_chat_logs 커맨드, SSE 릴레이
```
- 신규 Rust 기능은 도메인별 모듈(`db`, `bundle`, `agent`)에 배치하고, `#[tauri::command]` 함수는 각 모듈의 `mod.rs`에서 정의한 뒤 `lib.rs`의 `invoke_handler![...]`에 반드시 등록합니다.
- Rust 유닛 테스트는 각 모듈 파일 하단에 `#[cfg(test)] mod tests { ... }` 형태로 함께 작성합니다 (별도 테스트 디렉토리를 사용하지 않음).

## 3. Client vs Server 개념의 대체
- Next.js의 Server/Client Component 구분은 더 이상 존재하지 않습니다. 모든 React 컴포넌트는 브라우저(WebView)에서 실행되는 클라이언트 코드이며, 파일 시스템/DB 접근이 필요한 로직은 전부 Rust `#[tauri::command]`로 위임하고 프론트에서는 `invoke()`로 호출합니다.
- 민감 정보나 로컬 파일 시스템 직접 접근은 반드시 Rust 커맨드를 경유해야 하며, 프론트엔드 코드에서 Node.js API나 파일 시스템에 직접 접근하지 않습니다.

## 4. 참고 자료
- 포팅 이전의 Next.js 웹앱 원본 소스는 [reference/web-app/](file:///C:/Workspace/Projects/OpenTutorials-Desktop/reference/web-app)에서 확인할 수 있습니다. 기존 로직을 포팅할 때 1차 참조 대상입니다.
- 강좌 번들 프로토콜 원본 저장소는 [reference/protocol/](file:///C:/Workspace/Projects/OpenTutorials-Desktop/reference/protocol)에 위치합니다.
