# user_id 기반 데이터 분리 마이그레이션 가이드 (완료된 레거시 기록)

> 초기 Supabase 이전 당시의 기록이다. 현재 운영 스키마 변경 절차로 사용하지 않는다.

## 현황

API 레이어 수정이 완료되었습니다:
- ✅ `app/api/assets/route.ts` - userId 필터 추가
- ✅ `app/api/assets/item/route.ts` - INSERT/UPDATE/DELETE 시 user_id 처리
- ✅ `app/api/profits/route.ts` - daily_log 필터 추가

**남은 작업**: Supabase 데이터베이스 스키마 수정 (user_id 컬럼 추가)

---

## 마이그레이션 SQL 실행 방법

### 방법 1: Supabase Dashboard (권장)

1. **Supabase 대시보드 열기**: https://app.supabase.com
2. **프로젝트 선택**: Wealth_dashboard
3. **SQL Editor 클릭** (좌측 메뉴)
4. **아래 SQL을 복사해서 붙여넣기**:

```sql
-- assets 테이블에 user_id 추가
ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- cash 테이블에 user_id 추가
ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- daily_log 테이블에 user_id 추가
ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 기존 데이터를 Jake 계정에 할당
UPDATE assets SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;
UPDATE cash SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;
UPDATE daily_log SET user_id = '56701cc8-3dff-405d-a2b7-1ff4301e92cc' WHERE user_id IS NULL;

-- 컬럼을 NOT NULL로 변경 (모든 행이 user_id를 가짐)
ALTER TABLE assets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cash ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_log ALTER COLUMN user_id SET NOT NULL;
```

5. **🔵 Run 버튼** 클릭 (우측 상단)
6. 실행 완료 메시지 확인

---

### 방법 2: SQL 파일 (마이그레이션)

마이그레이션 파일이 이미 준비되어 있습니다:
```
supabase/migrations/20250530_add_user_id.sql
```

Supabase CLI가 있다면:
```bash
# (프로젝트 디렉토리에서)
supabase db push
```

---

## 마이그레이션 완료 확인

### 1️⃣ Supabase 대시보드에서 확인
- **Table Editor** → **assets** → **user_id** 컬럼 존재 확인
- 모든 행의 user_id가 `56701cc8-3dff-405d-a2b7-1ff4301e92cc`로 설정됨

### 2️⃣ 앱 테스트
```bash
npm run dev
```

브라우저: `http://localhost:3003`

#### 테스트 케이스:
- **Jake 계정** (steadykcm@gmail.com)
  - 구글 로그인
  - 기존 자산 데이터가 보여야 함 ✓
  
- **다른 Google 계정** (신규)
  - 구글 로그인
  - 빈 대시보드가 보여야 함 ✓
  - 새 자산 추가 가능해야 함 ✓

---

## 트러블슈팅

### "user_id 컬럼이 이미 존재합니다" 에러
- 정상입니다. `IF NOT EXISTS` 때문에 안전하게 처리됩니다.

### "UPDATE 0 rows" 메시지
- 기존 데이터가 없다는 뜻입니다. (첫 설정일 때 정상)

### 마이그레이션 후 앱 404 에러
- 개발 서버 재시작: `npm run dev`

---

## 다음 단계

마이그레이션 완료 후:
1. `npm run dev`로 앱 실행
2. 여러 계정으로 테스트
3. 문제 없으면 배포 준비

---

**마이그레이션 파일 위치**:
- `supabase/migrations/20250530_add_user_id.sql`

**API 수정 완료**:
- `app/api/assets/route.ts`
- `app/api/assets/item/route.ts`
- `app/api/profits/route.ts`
