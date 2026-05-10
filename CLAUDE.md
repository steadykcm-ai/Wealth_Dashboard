# CLAUDE.md — 에이전트 행동 지시서

## 프로젝트 한 줄 요약
Google Sheets 데이터를 읽어 Ghostfolio 스타일로 렌더링하는 Next.js 14 금융자산 대시보드.

---

## 기술 스택 (변경 금지)
- Next.js 14 App Router, React 18, TypeScript strict
- Tailwind CSS — 유틸리티 클래스 + 인라인 hex 색상 (`#3d47cf` 등) 혼용
- Google Sheets API — `batchGet`만 사용 (단건 `get` 호출 금지)
- Anthropic SDK (`@anthropic-ai/sdk`)

---

## 코딩 규칙

### 절대 하지 말 것
- 파일 덮어쓰기 전에 반드시 기존 내용 확인 후 diff 보여주고 승인 받을 것
- `any` 타입 사용 금지 — `unknown` 또는 명시적 타입 사용
- Google Sheets 단건 `get()` 호출 금지 — 반드시 `batchGet()` 사용
- `console.log` 남기지 말 것 — 디버그 후 반드시 제거
- `localStorage` / `sessionStorage` 사용 금지

### 반드시 할 것
- 새 파일 생성 전 `lib/types.ts` 타입 확인
- API 라우트는 반드시 `try/catch` + 명확한 에러 메시지 반환
- 환경변수 접근 시 `undefined` 체크 후 명확한 에러 throw
- 컴포넌트는 파일 하나에 관련 컴포넌트 모아서 작성

### Google Sheets 관련
- `valueRenderOption: "UNFORMATTED_VALUE"` 항상 사용 (숫자 포맷 제거)
- 탭 이름 변경 시 반드시 `lib/sheetConfig.ts`만 수정
- 행 읽기 최대 50행 제한 (`A2:D51`)

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

## 환경변수
```
GOOGLE_APPLICATION_CREDENTIALS=C:\tmp\google-key.json   ← 한글/공백 없는 경로
GOOGLE_SPREADSHEET_ID=1MdNxFQq6bBrvfm_5p6DGHYmuqQ4bsSQhgRMLsMdQcFI
ANTHROPIC_API_KEY=...
```

---

## 에러 대응
- 빌드 실패 시 `.next` 삭제 후 재빌드: `rm -rf .next && npm run build`
- 모듈 못 찾을 때: `tsconfig.json`의 `paths` `@/*` 확인
- Sheets 데이터 안 올 때: 서비스 계정 이메일이 시트에 공유됐는지 먼저 확인
