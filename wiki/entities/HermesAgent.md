# HermesAgent

**Type:** Entity (External Tool)
**Related:** [[PennyPress]], [[AIAgentWorker]], [[ContentMonitoring]]

---

NousResearch의 오픈소스 self-improving AI agent 프레임워크입니다.
기본적으로 고도로 튜닝된 파인튜닝 모델인 OpenHermes 계열과의 결합력이 높으며, 사용자 쿼리에 반응하여 자율적으로 행동(Tool 사용, 추론 등)을 조율합니다.

## 주요 기능 및 참조

- **GitHub 저장소**: https://github.com/nousresearch/hermes-agent
- **자율 행동 루프**: 에이전트가 주어지는 목표를 완수할 때까지 계획(Planning) - 실행(Execution) - 회고(Reflection)를 반복합니다.
- **PennyPress에서의 응용**: 플랫폼 내의 [[AIAgentWorker]] 구현의 핵심 백엔드 엔진이자 튜터링 서비스의 핵심 기반으로 차용되었습니다.

## PennyPress & Open Tutorials Desktop에서의 역할

1. **AI Worker 백엔드 엔진**: Tencent Cloud 환경에서 실행되는 AI Worker 서버 내부에서 실제 추론 및 도구 사용 자동화를 담당합니다.
2. **다양한 LLM API 추상화**: OpenAI 호환 API, Anthropic Claude, Gemini 뿐만 아니라 Ollama 및 LM Studio 등의 로컬 LLM 환경까지 단일한 에이전트 인터페이스로 추상화합니다.
3. **네이티브 SSE 스트리밍 프록시**: 데스크톱 앱(Tauri 2) 환경에서 Rust 백엔드와 연동되어 AI 답변을 실시간 SSE(Server-Sent Events) 스트림으로 프런트엔드에 중계합니다.
4. **다중 사용자 프로파일**: 하나의 Worker 인스턴스에서 서로 다른 시스템 프롬프트와 페르소나 설정을 운용함으로써 맞춤형 튜터링을 제공합니다.

## 트러블슈팅 이력 (Troubleshooting History)

### 1. 중복 Content-Type 헤더 오류 (400 Bad Request)
- **현상**: 로컬 Hermes 에이전트를 `http://127.0.0.1:8642/v1` 경로로 등록하고 테스트 시 `External Agent API error (400 Bad Request): Duplicate 'Content-Type' header found.` 오류가 발생하며 동작하지 않음.
- **원인**: Rust 백엔드(`src-tauri/src/agent/mod.rs`)의 `build_chat_request`에서 수동으로 `Content-Type: application/json` 헤더를 설정하여 반환하고, 실제 HTTP 요청 시 `reqwest` 클라이언트의 `.json(&body)` 메소드가 자동으로 동일한 헤더를 설정해 헤더가 중복 전달됨. 일부 OpenAI 호환 API 서버(Hermes API 서버 등)는 중복 헤더가 있을 때 400 에러를 반환함.
- **해결**: `build_chat_request`에서 수동으로 `"Content-Type"` 헤더를 리턴하는 로직을 제거하고, `reqwest`의 자동 JSON 헤더 설정을 활용하도록 변경함.
