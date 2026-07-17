# Changelog

All notable changes to this project will be documented in this file.

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
