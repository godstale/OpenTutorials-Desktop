---
description: TypeScript/React 및 Rust(Tauri) 코딩 컨벤션. 코드 작성 시 항상 적용.
pattern: "**/*.{ts,tsx,rs}"
---

# Coding Standards

## 1. TypeScript
- `any` 사용을 금지하며, 추론이 안 될 경우 `unknown`을 적용하고 타입 가드를 이용합니다.
- 공유 타입은 `src/lib/types/` 에 선언합니다.
- 인터페이스(`interface`) 작성을 우선하며, 필요한 경우에만 `type`을 사용합니다.
- IPC 커맨드 호출 함수 및 클라이언트 래퍼(`src/lib/**/client.ts`)의 반환 타입을 명시적으로 작성합니다.
- `tsconfig.json`에 `noUnusedLocals: true`가 설정되어 있으므로, 사용하지 않는 변수/상태를 방치하면 빌드가 실패합니다. 포팅/리팩토링 시 죽은 코드를 남기지 않습니다.

## 2. React 컴포넌트
- 함수형 컴포넌트를 사용하고, `React.FC` 타입은 사용하지 않습니다.
- Props 타입은 파일 상단에 `interface XxxProps`로 선언합니다.
- 이벤트 핸들러 명명 규칙: `handle + Event` (예: `handleSubmit`, `handleClick`).
- 페이지 컴포넌트는 `src/pages/`에 default export로, 재사용 가능한 기능 컴포넌트는 `src/components/features/`에 named export로 작성합니다 (기존 코드베이스 관례).

## 3. 파일/폴더 명명
- 컴포넌트: `PascalCase.tsx`
- 유틸리티/훅: `kebab-case.ts` 또는 `camelCase.ts` (기존 파일 관례를 따름)
- Rust 모듈: `snake_case.rs`, 도메인별 하위 폴더(`db/`, `bundle/`, `agent/`)에 배치

## 4. Import 순서
1. React / 외부 프레임워크 패키지 (`react`, `react-router-dom`, `@tauri-apps/api` 등)
2. 외부 라이브러리 (`clsx`, `lucide-react` 등)
3. 내부 절대 경로 (`@/components`, `@/lib` 등)
4. 상대 경로 (`./FeatureCard` 등)

## 5. Rust
- `#[tauri::command]` 함수는 `Result<T, String>` 또는 프로젝트 공통 `DbResult` 타입을 반환해 에러를 명시적으로 전달합니다. `.unwrap()`/`.expect()`로 커맨드 핸들러를 패닉시키지 않습니다 (앱 전체가 크래시함).
- SSE 파싱, 정규화 등 부수효과 없는 로직은 순수 함수로 분리하고, 각 모듈 하단에 `#[cfg(test)] mod tests { ... }`로 유닛 테스트를 함께 작성합니다.
- 새 의존성 추가 시 Windows 빌드 환경을 고려합니다 (예: `reqwest`는 시스템 OpenSSL 의존을 피하기 위해 `rustls-tls` 피처를 사용).
