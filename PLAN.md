# PLAN.md — 프로젝트 기획 및 진행 현황

## 프로젝트 개요
Google Sheets를 DB로 사용하는 개인 금융자산 대시보드.
별도 DB 없이 스프레드시트만으로 자산 현황을 실시간 조회한다.

---

## 구조

```
finance-dashboard/
├── app/
│   ├── api/
│   │   ├── assets/route.ts              # 자산 데이터 조회
│   │   ├── deposits/route.ts            # 입금 기록
│   │   ├── logs/route.ts                # 수익금 로그 조회
│   │   ├── analysis/route.ts            # AI 분석
│   │   └── cron/daily-profit/route.ts  # 매일 UTC 23시 자동 로그
│   ├── page.tsx                         # 메인 대시보드
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── types.ts                         # 공유 타입 정의
│   ├── sheetConfig.ts                   # 시트 탭 이름 · 컬럼 설정
│   ├── sheets.ts                        # Google Sheets API 래퍼
│   ├── profit-calculator.ts             # 손익 계산 순수 함수
│   ├── profit-logger.ts                 # 수익금 로그 기록
│   └── useAssets.ts                     # 클라이언트 데이터 훅
├── CLAUDE.md
├── PLAN.md
└── .env.local
```

---

## Google Sheets 구조

| 시트 탭 | 용도 | 컬럼 순서 |
|---------|------|-----------|
| 개별주식 | 국내·해외 주식 | A=종목명, B=수량, C=평균매입가, D=현재가 |
| 개인연금 | 연금저축펀드 | A=종목명, B=수량, C=평균매입가, D=현재가 |
| IRP | IRP 계좌 | A=종목명, B=수량, C=평균매입가, D=현재가 |
| 암호화폐 | 코인 | A=종목명, B=수량, C=평균매입가, D=현재가 |
| 수익금로그 | 일별 자동 기록 | A=날짜, B=총자산, C=수익금, D=수익률 |
| 입금기록 | 수동 입금 기록 | A=날짜, B=구분, C=금액, D=메모 |

---

## 기능 로드맵

### ✅ 완료
- [x] Next.js 14 프로젝트 초기화
- [x] Google Sheets Service Account 인증
- [x] `batchGet` 기반 자산 데이터 조회 API (`/api/assets`)
- [x] 손익 계산 로직 (`profit-calculator.ts`)
- [x] `useAssets` 훅 (로딩·에러·refetch)
- [x] Ghostfolio 스타일 대시보드 UI
  - 네이비 사이드바
  - Summary 카드 3개 (총 현재가치 / 평가손익 / 수익률)
  - 탭 pill 필터
  - 자산 테이블 (수익률 배지, 이니셜 아이콘, 수익률순 정렬)
  - 로딩 스켈레톤 / 에러 카드
  - 라이트·다크 모드

### ⏳ 다음 작업
- [ ] 입금 기록 탭 (`/api/deposits`) — 연금/예수금/배당금 입력 폼
- [ ] 수익금 로그 탭 (`/api/logs`) — 날짜별 자산 변화 차트
- [ ] AI 분석 탭 (`/api/analysis`) — Claude API 포트폴리오 분석
- [ ] Cron Job (`/api/cron/daily-profit`) — Vercel Cron, 매일 UTC 23시
- [ ] Vercel 배포 (`vercel deploy --prod`)

---

## 데이터 흐름

```
Google Sheets
  └─ batchGet (1회 호출, 전체 탭)
       └─ /api/assets (Next.js, revalidate 300s)
            └─ useAssets 훅 (클라이언트)
                 └─ page.tsx 렌더링
```

---

## 주요 의사결정 기록

| 결정 | 이유 |
|------|------|
| DB 없이 Google Sheets 사용 | 별도 인프라 불필요, 스프레드시트로 직접 수정 가능 |
| `batchGet` 단일 호출 | Sheets API 쿼터(분당 60회) 절약 |
| `revalidate: 300` | 실시간성보다 쿼터 보호 우선 |
| Ghostfolio UI 스타일 | 금융 앱 특화 디자인, 라이트·다크 모드 모두 지원 |
| Service Account 인증 | OAuth 리다이렉트 불필요, 서버사이드 전용 |
