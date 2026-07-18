# Changelog

All notable changes to this project will be documented in this file.

## [0.3.5] - 2026-07-18

### Added
- 에이전트 신규 등록 시, 기본 튜터가 없을 경우 첫 번째 에이전트를 기본 튜터로 자동 지정
- 에이전트 삭제 시, 기존 기본 튜터가 삭제되는 경우 남아있는 에이전트 중 첫 번째를 기본 튜터로 자동 지정
- 신규 강좌 임포트 시, 데이터베이스에 기본 튜터가 설정되어 있다면 자동으로 해당 튜터를 강좌의 `agent_id`로 자동 할당 (기존 지정된 튜터가 있다면 유지)

### Changed
- 패키지 버전 범프 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) to `0.3.5`
- 에이전트 수동 변경 시 최소 1개의 기본 튜터 지정을 보장하도록 해제 제한 설정 (유일한 기본 튜터 해제 시도 시 에러 발생 및 UI 상 메뉴 비활성화 처리)

## [0.3.4] - 2026-07-18

### Changed
- 패키지 버전 범프 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) to `0.3.4`
- 강좌 상세(`CourseDetail`), 강좌 관리(`CoursesManage`), 학습 화면(`Learn`), 프로필 설정(`SettingsProfile`)의 하드코딩 다국어 조건문 분기(`language === "en"`) 전면 제거 및 `t()` 다국어 번역 키 적용
- locales 사전(`ko.ts`, `en.ts`)에 신규 번역 키 추가 및 중복 정의 제거
- TS 미사용 변수 경고(TS6133) 수정 및 `npx tsc --noEmit` 컴파일 에러 해결

## [0.3.3] - 2026-07-17

### Added
- `src/lib/utils/course.ts`에 TOC 트리 구조로부터 카드 개수를 집계하는 `countCardsFromToc` 헬퍼 함수 추가 및 export
- 강좌 검색 화면(`src/pages/Courses.tsx`)에서 로컬 설치 여부와 상관없이 원격 피드(`courses.json`)의 `toc`, `license`, `target_age` 데이터를 활용하여 `CourseCard`에 챕터 수, 카드 수, 라이선스, 연령 제한이 표시되도록 연동

### Changed
- 패키지 버전 범프 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) to `0.3.3`

## [0.3.2] - 2026-07-17

### Added
- 대시보드 및 내 강좌 페이지의 코스 카드 레이아웃 간소화를 위한 옵션 추가 (`hideMeta`, `hideEnrollmentLabel` 추가)
- `src/components/features/CourseCard.tsx`에 메타 정보 및 수강 상태 라벨을 숨길 수 있는 프로퍼티 구현
- `src/pages/Dashboard.tsx` 및 `src/pages/MyCourses.tsx`에 코스 카드 레이아웃 간소화 옵션 적용

### Changed
- 패키지 버전 범프 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) to `0.3.2`
