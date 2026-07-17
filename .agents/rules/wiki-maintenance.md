---
description: 작업 시작 전 wiki/ 참고 및 작업 완료 후 변경 이력을 등록하는 의무 사항 및 규칙. 모든 작업에 적용.
pattern: "**/*"
---

# Wiki Maintenance

`wiki/`에는 이 프로젝트의 그간 작업 히스토리와 앱에 대한 배경 정보가 축적되어 있습니다. 작업 시작 전과 완료 후 모두 `wiki/`를 활용해야 합니다.

## 1. 작업 시작 전 Wiki 참고 의무
- 코드를 탐색하기 전에 먼저 [wiki/index.md](file:///C:/Workspace/Projects/OpenTutorials-Desktop/wiki/index.md)와 [wiki/log.md](file:///C:/Workspace/Projects/OpenTutorials-Desktop/wiki/log.md)를 확인하여 관련 배경(과거 결정, 트러블슈팅 이력, 아키텍처 개념)이 이미 기록되어 있는지 확인합니다.
- 관련 `sources/`, `concepts/`, `entities/` 문서를 먼저 참고하면 코드베이스를 처음부터 다시 탐색하지 않아도 되어 데이터 검색 효율이 크게 올라갑니다.
- `llm-wiki` 스킬의 `/wiki-query <질문>` 을 활용해 관련 기록을 빠르게 찾을 수 있습니다.

## 2. 작업 내역 Wiki 등록 의무
- 코드 수정이나 파일 추가/변경 등 모든 작업을 완료한 후에는 반드시 작업 내역을 [wiki/](file:///C:/Workspace/Projects/OpenTutorials-Desktop/wiki)에 등록/기록해야 합니다.
- 대표적으로 [log.md](file:///C:/Workspace/Projects/OpenTutorials-Desktop/wiki/log.md)를 업데이트하고 관련 상세 문서를 작성합니다.

## 3. wiki/log.md 기록 규칙
- 수정 날짜, 작업 내용, 수정된 파일 목록 및 영향도를 기록합니다.
- 작업 요약 및 새로 도입된 기능/버그 수정 상세 항목을 작성하여 차후 확인이 가능하도록 일관된 포맷을 유지합니다.
- 새 항목은 파일 최상단에 추가하고, `## [YYYY-MM-DD] <type> | <제목>` 형식의 헤더로 시작합니다.
