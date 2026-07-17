# Open Tutorials Desktop

Open Tutorials의 Next.js 웹앱을 **Tauri 2 네이티브 데스크탑 앱**으로 포팅한 프로젝트입니다. 클라우드 서비스(Supabase 등) 의존성을 완전히 걷어내고, Rust(Tauri) 백엔드가 로컬 파일 시스템(`db.json` + 강좌 스토리지 폴더)을 직접 관리하는 오프라인 단독 실행 앱입니다.

가이드 문서는 [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) 및 [.agents/rules/](.agents/rules/)를 참조하십시오. 작업 이력과 아키텍처 배경지식은 [wiki/](wiki/)에 축적되어 있으니, 작업 전 반드시 확인하십시오.

## 핵심 기능
1. **학습 콘텐츠 수강 및 진행률 관리** — zip 강좌 패키지를 임포트해 카드 형식으로 학습하고, 진행률을 OS 앱 데이터 폴더의 `db.json`에 저장합니다.
2. **강좌 관리 및 업로드** — zip 번들(매니페스트 + 카드)을 업로드하면 Rust가 [Bundler Protocol](reference/protocol/protocol.md)에 따라 검증한 뒤 로컬에 적재합니다.
3. **로컬 에이전트 및 AI 튜터** — Ollama/LM Studio 등 로컬 에이전트 또는 Claude/Gemini/OpenAI 호환 API를 등록해 AI 튜터로 연동합니다 (Rust가 SSE 스트리밍 프록시 역할 수행).

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Vite + React 19 + TypeScript + React Router (`HashRouter`) + Tailwind CSS + Shadcn UI |
| Desktop Shell | Tauri 2 (Rust) |
| Backend/DB | Rust가 관리하는 Local JSON Database (`db.json`, OS 앱 데이터 폴더) |
| IPC | `@tauri-apps/api`의 `invoke()` ↔ `#[tauri::command]` |
| AI Worker | Rust 백엔드가 HTTP(reqwest)로 로컬/외부 에이전트에 직접 연결 및 SSE 스트림 중계 |
| 패키지 매니저 | pnpm |

## 폴더 구조 (요약)
```
src/                # Vite + React 프론트엔드 (pages/, components/, lib/, hooks/)
src-tauri/          # Tauri 2 Rust 백엔드 (db/, bundle/, agent/ 모듈)
reference/
  web-app/          # 포팅 이전 Next.js 웹앱 원본 (레거시 참조용)
  protocol/         # 강좌 번들러 프로토콜 스펙 (별도 git 저장소)
wiki/               # 작업 히스토리 및 아키텍처 지식 베이스
.agents/rules/      # AI 에이전트 개발 규칙 문서
```
상세 아키텍처는 [.agents/rules/architecture.md](.agents/rules/architecture.md)를 참조하십시오.

## 사전 준비물
- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (`cargo`)
- Tauri 플랫폼별 사전 요구사항: [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

## 실행 방법
```bash
pnpm install       # 의존성 설치 (최초 1회)
pnpm tauri dev     # Rust + Vite dev 서버를 함께 실행하는 네이티브 앱 개발 모드
```
`pnpm dev`로 Vite 개발 서버만(포트 1420) 띄워 브라우저에서 UI만 미리 볼 수도 있지만, 이 경우 Tauri IPC(`invoke()`) 호출은 동작하지 않습니다.

## 빌드
```bash
pnpm build         # tsc && vite build → dist/
pnpm tauri build   # 배포용 네이티브 바이너리/설치 파일 생성
```

## 테스트
```bash
cd src-tauri
cargo test         # Rust 백엔드 유닛 테스트 (쿼리 엔진, 번들 검증, RPC, 스토리지, 에이전트 등)
```
프론트엔드(TS/React) 쪽에는 아직 테스트 러너가 설정되어 있지 않습니다. 프론트 변경 시 `pnpm build`(타입 체크 포함)로 회귀를 확인하십시오.

## 추천 IDE 설정
- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 작업 규칙
AI 에이전트(및 협업자)는 코드 수정 전후로 다음을 반드시 따릅니다:
- [.agents/rules/](.agents/rules/)의 아키텍처/코딩/API/디자인 규칙 준수
- 작업 시작 전 [wiki/](wiki/)에서 관련 배경 확인, 작업 완료 후 [wiki/log.md](wiki/log.md)에 이력 등록 ([.agents/rules/wiki-maintenance.md](.agents/rules/wiki-maintenance.md) 참조)
