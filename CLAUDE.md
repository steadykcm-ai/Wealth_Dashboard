# CLAUDE.md — 에이전트 행동 지시서

## 프로젝트 한 줄 요약
Supabase 자산 데이터를 KIS 시세와 결합해 렌더링하는 Next.js 15 개인 금융자산 대시보드.

---

## 기술 스택 (변경 금지)
- Next.js 15 App Router, React 19, TypeScript strict
- Tailwind CSS — 유틸리티 클래스 + 인라인 hex 색상 (`#3d47cf` 등) 혼용
- Supabase Auth + PostgreSQL + RLS
- KIS Open API — 주식·주요국 증시·환율·원자재
- Upbit 공개 API — 암호화폐 시장 동향
- Gemini API — 포트폴리오 분석

---

## 코딩 규칙

### 절대 하지 말 것
- 파일 덮어쓰기 전에 반드시 기존 내용 확인 후 diff 보여주고 승인 받을 것
- `any` 타입 사용 금지 — `unknown` 또는 명시적 타입 사용
- `console.log` 남기지 말 것 — 디버그 후 반드시 제거
- `localStorage` / `sessionStorage` 사용 금지

### 반드시 할 것
- 새 파일 생성 전 `lib/types.ts` 타입 확인
- API 라우트는 반드시 `try/catch` + 명확한 에러 메시지 반환
- 환경변수 접근 시 `undefined` 체크 후 명확한 에러 throw
- 컴포넌트는 파일 하나에 관련 컴포넌트 모아서 작성

### 데이터 공급자 관련
- 주식과 전통 금융시장 데이터는 KIS를 우선 사용
- 암호화폐 시장 데이터는 Upbit 공개 API에서 독립적으로 수집
- Yahoo Finance는 KIS에서 제공하지 않는 시계열의 보조 수단으로만 사용
- 공급자 하나의 실패가 다른 영역의 데이터를 막지 않도록 분리
- KIS 접근 토큰은 기존 Supabase 캐시를 우회해 재발급하지 말 것

---

## UI 규칙 (Ghostfolio 스타일)
- 배경: 라이트 `#f8f9fc` / 다크 `#0f1923`
- 사이드바: `#1a2332`
- 강조색: `#3d47cf`
- 수익+: `#f44336` (빨강) / 손실-: `#1565c0` (파랑) — 한국 증시 컨벤션
- 카드: 흰 배경 + `border border-[#e0e0e0]` + `rounded-xl`
- 수익률은 반드시 pill 배지 형태로 표시
- 숫자 포맷: 억 이상 "억" 단위 축약, 이하 `toLocaleString("ko-KR")`

---

## 주요 환경변수
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
KIS_APP_KEY=...
KIS_APP_SECRET=...
GEMINI_API_KEY=...
CRON_SECRET=...
```

---

## 에러 대응
- 빌드 실패 시 `.next` 삭제 후 재빌드: `rm -rf .next && npm run build`
- 모듈 못 찾을 때: `tsconfig.json`의 `paths` `@/*` 확인
- 자산 데이터가 안 올 때: Supabase 세션, RLS, `user_id` 필터 순서로 확인
- KIS 데이터가 안 올 때: Supabase 토큰 캐시와 동기화 이력부터 확인
