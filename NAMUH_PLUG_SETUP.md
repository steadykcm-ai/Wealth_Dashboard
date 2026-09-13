# Namuh PLUG 읽기 전용 연동

## 목적

NH투자증권의 계좌 목록과 국내·미국주식 잔고를 읽어 현재 대시보드와 비교하기 위한 연결 점검 기능이다. 주문 API와 Supabase 자산 변경은 사용하지 않는다.

## 준비

1. [Namuh PLUG 공식 포털](https://www.nhplug.com/)에서 서비스를 신청한다.
2. 발급된 AppKey와 AppSecret을 로컬 및 Vercel 환경변수에 저장한다.
3. `supabase/migrations/20260913_add_nhplug_token_cache.sql`을 Supabase에 적용한다.

```text
NHPLUG_APP_KEY=...
NHPLUG_APP_SECRET=...
```

키와 토큰은 Git에 커밋하지 않는다. 접근 토큰은 Supabase의 서버 전용 테이블에 저장하며 만료 전까지 재사용한다.

## 확인 순서

1. 전체 자산 화면에서 `NH 계좌 연결`을 연다.
2. `연결 확인`을 누른다.
3. 마스킹된 계좌번호, 국내·미국주식 평가액, 예수금, 종목 수를 확인한다.
4. 일반 펀드·연금·IRP 계좌가 조회되는지 확인한다.

현재 단계에서는 조회 결과가 기존 자산을 덮어쓰지 않는다. 실계좌 응답 구조를 확인한 뒤 계좌별 차이 미리보기와 승인 기반 동기화를 추가한다.
