# Changelog

All notable changes to this project will be documented in this file.

## [0.3.2] - 2026-07-17

### Added
- 대시보드 및 내 강좌 페이지의 코스 카드 레이아웃 간소화를 위한 옵션 추가 (`hideMeta`, `hideEnrollmentLabel` 추가)
- `src/components/features/CourseCard.tsx`에 메타 정보 및 수강 상태 라벨을 숨길 수 있는 프로퍼티 구현
- `src/pages/Dashboard.tsx` 및 `src/pages/MyCourses.tsx`에 코스 카드 레이아웃 간소화 옵션 적용

### Changed
- 패키지 버전 범프 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) to `0.3.2`
