# PennyPress

**Type:** Entity (Project)
**Related:** [[HermesAgent]], [[ContentMonitoring]], [[AIAgentWorker]], [[PointSystem]]

---

PennyPress는 AI Agent 기반 기능들을 사용자에게 제공하는 SaaS형 학습 콘텐츠 및 코스 생성 플랫폼입니다. 
기존에는 Next.js 기반 웹앱으로 개발되던 구조였으나, 현재는 데스크톱 네이티브 사용성을 확보하고 로컬 백엔드를 유연하게 통합하기 위해 **Tauri 2 기반 데스크톱 네이티브 앱(Open Tutorials Desktop)**으로 포팅하여 병행 관리하고 있습니다.

## 핵심 가치 제안 및 주요 기능

- **AI Agent 연동**: 다양한 AI Agent(예: [[HermesAgent]], Hydra Agent 등)를 검색하고 구독하여 자동화된 학습 지원 및 작업 실행.
- **포인트 및 구독 과금**: 사용량 기반 포인트 시스템([[PointSystem]])과 구독형 플랜을 결합한 유연한 과금 체계 지원.
- **네이티브 포팅**: Rust 백엔드가 `db.json` 로컬 데이터베이스와 ZIP 강좌 매니페스트 스토리지를 직접 제어하여, 오프라인 환경에서도 유연하게 동작합니다.

## 시스템 아키텍처 및 포털 구조

- **사용자 포털**: 일반 수강생들을 위한 학습 공간 (원래 Next.js 경로는 `app/(user)/`이며, 데스크톱 프론트엔드는 React Router HashRouter 기반으로 구성).
- **관리자 포털**: 강좌 업로드, 패키지 구성, 에이전트 모니터링을 담당하는 어드민 공간 (`app/(admin)/` 구조 기반).

## 개발 히스토리 및 현 상태

- **Phase 1~3**: Web SaaS 버전 개발 (2026-06-12 시작, 레포: `C:\Workspace\Projects\PennyPress-FE`).
- **네이티브 데스크톱 포팅**: Tauri 2 + React + TypeScript + pnpm 기반으로 전환 완료되어, 오프라인 강좌 번들링 및 로컬 에이전트 프록싱을 제공함.
