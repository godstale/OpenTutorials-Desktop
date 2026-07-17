---
description: 강좌 제작 Bundler 프로토콜 수정 규칙. 번들 스펙이나 메타데이터 변경 시 적용.
pattern: "**/{reference/protocol,src-tauri/src/bundle}/**/*"
---

# Bundler Protocol

강좌 번들 구조 및 유효성 검증 프로토콜을 관리하기 위한 지침입니다.

## 1. 프로토콜 문서 위치
- 공식 프로토콜 스펙은 [reference/protocol/protocol.md](file:///C:/Workspace/Projects/OpenTutorials-Desktop/reference/protocol/protocol.md) (별도 git 저장소, 외부 강좌 제작 프로젝트와 공유)이며, Rust 검증 로직은 [src-tauri/src/bundle/validator.rs](file:///C:/Workspace/Projects/OpenTutorials-Desktop/src-tauri/src/bundle/validator.rs)에 구현되어 있습니다.

## 2. 프로토콜 수정 규칙
- 강좌 번들 구조, JSON 매니페스트/메타데이터 스펙, 유효성 검증 로직 등 **Bundler 프로토콜과 관련된 모든 변경사항이 발생할 경우, 반드시 `reference/protocol/protocol.md` 및 `protocol-changelog.md` 등 하위 지침 문서들을 즉시 최신화**해야 합니다.
- `validator.rs`의 검증 규칙을 변경할 경우 `protocol.md` 6장(제작 시 주의사항 및 검증 규칙)과의 정합성을 반드시 재확인하고, 두 문서 중 하나만 갱신되어 어긋나는 상태가 되지 않도록 합니다.
- 이는 외부 강좌 제작 프로젝트에서 최신 프로토콜에 맞게 강좌 파일을 정상적으로 빌드할 수 있도록 공조 체계를 유지하기 위함입니다.
- `reference/protocol/`은 별도의 git 저장소(`.git` 보유)이므로, 이 문서 변경 사항을 커밋할 때 루트 저장소와 별개로 관리해야 함을 유의합니다.
