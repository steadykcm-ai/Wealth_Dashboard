import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type {
  PortfolioEventCategory,
  PortfolioEventType,
} from "@/lib/types";

const EVENT_TYPES: PortfolioEventType[] = [
  "deposit",
  "withdrawal",
  "valuation_adjustment",
  "ignored",
];

const CATEGORIES: PortfolioEventCategory[] = ["stocks", "pension"];

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).getTime());
}

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as {
      date?: string;
      category?: PortfolioEventCategory;
      accountName?: string;
      detectedAmount?: number;
      amount?: number;
      eventType?: PortfolioEventType;
    };

    const date = body.date ?? "";
    const category = body.category;
    const accountName = body.accountName?.trim() ?? "";
    const detectedAmount = Number(body.detectedAmount);
    const submittedAmount = Number(body.amount);
    const eventType = body.eventType;

    if (!isIsoDate(date) || !category || !CATEGORIES.includes(category) || !accountName) {
      return NextResponse.json({ error: "자산 변동 정보가 올바르지 않습니다." }, { status: 400 });
    }

    if (!eventType || !EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ error: "지원하지 않는 자산 변동 유형입니다." }, { status: 400 });
    }

    if (!Number.isFinite(detectedAmount)) {
      return NextResponse.json({ error: "감지된 변동 금액은 숫자여야 합니다." }, { status: 400 });
    }

    if (eventType !== "ignored" && (!Number.isFinite(submittedAmount) || submittedAmount === 0)) {
      return NextResponse.json({ error: "변동 금액은 0이 아닌 숫자여야 합니다." }, { status: 400 });
    }

    const amount = eventType === "ignored"
      ? 0
      : eventType === "deposit"
        ? Math.abs(submittedAmount)
        : eventType === "withdrawal"
          ? -Math.abs(submittedAmount)
          : submittedAmount;

    const { data, error } = await supabaseServer
      .from("portfolio_events")
      .upsert({
        user_id: user.id,
        date,
        category,
        account_name: accountName,
        detected_amount: detectedAmount,
        amount,
        event_type: eventType,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,date,category,account_name" })
      .select("id, date, category, account_name, detected_amount, amount, event_type")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, event: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "자산 변동 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
