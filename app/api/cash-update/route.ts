import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      accountName: string;
      amount: number;
    };

    const { accountName, amount } = body;

    if (!accountName || amount === undefined) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    // 기존 cash 레코드 찾기 (정확한 이름 또는 부분 매칭으로 검색)
    let { data: existing } = await supabase
      .from("cash")
      .select("id")
      .eq("account_name", accountName)
      .eq("user_id", session.user.id)
      .single();

    // 정확한 매칭 없으면 부분 매칭 검색 (예: "NH_CMA" → "NH_CMA7987")
    if (!existing) {
      const { data: partialMatch } = await supabase
        .from("cash")
        .select("id, account_name")
        .like("account_name", `${accountName}%`)
        .eq("user_id", session.user.id);
      if (partialMatch && partialMatch.length > 0) {
        existing = partialMatch[0];
      }
    }

    let result;
    if (existing) {
      // 업데이트
      result = await supabase
        .from("cash")
        .update({ amount })
        .eq("id", existing.id)
        .eq("user_id", session.user.id);
    } else {
      // 새로 생성
      result = await supabase
        .from("cash")
        .insert([{
          account_name: accountName,
          amount,
          user_id: session.user.id,
        }]);
    }

    if (result.error) throw result.error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
