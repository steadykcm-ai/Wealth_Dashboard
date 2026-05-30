import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// 이 마이그레이션 함수는 한 번만 실행되어야 합니다
export async function POST() {
  try {
    const userId = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

    // Supabase 클라이언트 생성 (RLS 제외하기 위해 anon key 사용)
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // assets 테이블에서 이미 user_id가 있는지 확인
    const { data: existingAssets } = await supabase
      .from("assets")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1);

    if (existingAssets && existingAssets.length > 0) {
      return NextResponse.json({
        message: "이미 마이그레이션되었습니다.",
        status: "already_migrated",
      });
    }

    // RLS가 비활성화된 상태여야 이 작업이 가능합니다
    // 실제 마이그레이션은 Supabase 대시보드의 SQL 에디터에서 실행해야 합니다
    return NextResponse.json({
      message:
        "이 엔드포인트는 문서용입니다. Supabase 대시보드에서 다음 SQL을 실행하세요:",
      sql: `
-- assets 테이블에 user_id 추가
ALTER TABLE assets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- cash 테이블에 user_id 추가
ALTER TABLE cash ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- daily_log 테이블에 user_id 추가
ALTER TABLE daily_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 기존 데이터를 사용자에게 할당
UPDATE assets SET user_id = '${userId}' WHERE user_id IS NULL;
UPDATE cash SET user_id = '${userId}' WHERE user_id IS NULL;
UPDATE daily_log SET user_id = '${userId}' WHERE user_id IS NULL;
      `,
      status: "manual_required",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "마이그레이션 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
