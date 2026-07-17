# Open Tutorials Desktop — AI Tutor Guide

> **Sync:** CLAUDE.md, GEMINI.md, AGENTS.md 는 동일한 내용을 유지합니다. 변경 시 세 파일 모두 업데이트하세요.
> **범위:** 이 문서는 Tauri 네이티브 앱에 적용됩니다.

---

## 프로젝트 개요

현재 프로젝트는 Next.js 기반 웹앱이었던 Open Tutorials를 **Tauri 2 네이티브 데스크탑 앱으로 포팅**한 결과물입니다.
웹앱의 소스는 `reference/web-app/`에서 참조할 수 있습니다.
- 프론트엔드는 Vite + React + TypeScript (React Router `HashRouter`)로 재구성되었습니다.
- 기존 Next.js API Route Handler와 Mock Supabase Client는 전부 걷어내고, **Rust(Tauri) 백엔드가 `db.json`과 강좌 스토리지를 직접 관리**합니다. 프론트는 `@tauri-apps/api`의 `invoke()`로 Rust `#[tauri::command]`를 호출합니다.
- **핵심 서비스** (웹앱과 동일한 3대 기능을 네이티브 앱으로 재구현):
  1. **학습 콘텐츠 수강 및 진행률 관리**: zip 강좌 패키지를 임포트하여 카드 형식으로 학습, 진행률은 OS 앱 데이터 폴더의 `db.json`에 저장.
  2. **강좌 관리 및 업로드**: zip 번들 매니페스트/카드를 업로드하면 Rust가 Bundler Protocol에 따라 검증 후 로컬에 적재.
  3. **로컬 에이전트 및 AI 튜터**: Ollama/LM Studio 등 로컬 에이전트 또는 Claude/Gemini/OpenAI 호환 API를 등록해 AI 튜터로 연동 (Rust가 SSE 스트리밍 프록시 역할 수행).

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Vite + React 19 + TypeScript + React Router (`HashRouter`) + Tailwind CSS + Shadcn UI |
| Desktop Shell | Tauri 2 (Rust) |
| Backend/DB | Rust가 관리하는 Local JSON Database (`db.json`, OS 앱 데이터 폴더) |
| IPC | `@tauri-apps/api`의 `invoke()` ↔ `#[tauri::command]` |
| AI Worker | Rust 백엔드가 HTTP(reqwest)로 로컬/외부 에이전트에 직접 연결 및 SSE 스트림 중계 |
| 패키지 매니저 | pnpm |

---

## 빌드 · 테스트 · 실행 방법

### 프론트엔드
```bash
pnpm install       # 최초 1회
pnpm dev           # Vite 개발 서버만 (포트 1420, Tauri 없이 브라우저 미리보기용)
pnpm build         # tsc && vite build → dist/
pnpm tauri dev     # Rust 빌드 + Vite dev 서버를 함께 띄우는 네이티브 앱 개발 모드 (실질적 "npm run dev"에 해당)
pnpm tauri build   # 배포용 네이티브 바이너리/설치 파일 생성
```

### 백엔드 (src-tauri/ 에서 실행)
```bash
cargo test         # Rust 단위 테스트 (query_engine, validator, rpc, storage, agent 등 56개 테스트 존재)
cargo build         # Rust 단독 빌드 (문제 격리 시 사용)
```
- **테스트는 Rust 쪽에만 존재**합니다. 프론트엔드(TS/React)에는 아직 테스트 러너(jest/vitest 등)가 설정되어 있지 않습니다.
- 백엔드 로직(쿼리 엔진, 번들 검증, RPC, 에이전트 프록싱)을 수정하면 반드시 `cargo test`로 회귀를 확인하십시오.

---

## 개발 및 협업 규칙 (규칙 파일 참조)

상세한 개발 지침 및 아키텍처 규칙은 아래 개별 규칙 문서를 참조하십시오. AI 에이전트는 작업 수행 시 해당 규칙들을 반드시 준수해야 합니다.

### 1. 개발 및 아키텍처 규칙
- [아키텍처 구조 규칙](.agents/rules/architecture.md): Vite/React Router 폴더 구조 및 Tauri Rust 모듈 구조
- [API(IPC) 개발 컨벤션](.agents/rules/api-conventions.md): `#[tauri::command]` 작성 및 등록, `invoke()` 사용 규격
- [로컬 DB & 스토리지 패턴](.agents/rules/local-db-storage.md): `db.json` 및 `QueryBuilder` 사용 방법

### 2. 코드 및 디자인 시스템 규칙
- [코딩 컨벤션 표준](.agents/rules/coding-standards.md): TypeScript/React 및 Rust 작성 규칙
- [디자인 시스템 규칙](.agents/rules/design-system.md): Shadcn UI 사용법, 테마 색상 및 레이아웃 규격

### 3. 작업 프로세스 규칙
- [작업 내역 Wiki 등록 의무](.agents/rules/wiki-maintenance.md): 작업 시작 전 `wiki/` 참고 및 작업 완료 후 이력 등록 규칙 (★필수★)
- [강좌 제작 번들러 프로토콜](.agents/rules/bundler-protocol.md): 번들 및 매니페스트 변경 시 프로토콜 최신화 규칙
- [Git 커밋 규칙](.agents/rules/git-workflow.md): 커밋 메시지 컨벤션 및 관리 요령
