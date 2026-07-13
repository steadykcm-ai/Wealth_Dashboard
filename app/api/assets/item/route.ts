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
      assetType: string;
      accountName: string;
      name: string;
      code?: string;
      quantity: number;
      avgPrice: number;
      valuationMode?: "market" | "manual";
      manualInvestAmount?: number;
      manualValue?: number;
    };

    const {
      assetType,
      accountName,
      name,
      code,
      quantity,
      avgPrice,
      valuationMode = "market",
      manualInvestAmount,
      manualValue,
    } = body;

    if (!assetType || !accountName || !name || !quantity || !avgPrice) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "수량은 0보다 커야 합니다" }, { status: 400 });
    }

    if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
      return NextResponse.json({ error: "매입가는 0보다 커야 합니다" }, { status: 400 });
    }

    if (valuationMode === "manual") {
      if (!Number.isFinite(manualInvestAmount) || (manualInvestAmount ?? 0) <= 0) {
        return NextResponse.json({ error: "투자원금은 0보다 커야 합니다." }, { status: 400 });
      }
      if (!Number.isFinite(manualValue) || (manualValue ?? 0) <= 0) {
        return NextResponse.json({ error: "평가금액은 0보다 커야 합니다." }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from("assets").insert([
      {
        asset_type: assetType,
        account_name: accountName,
        name,
        code: code || null,
        quantity,
        avg_price: avgPrice,
        is_cash: false,
        user_id: session.user.id,
        valuation_mode: valuationMode,
        manual_invest_amount: valuationMode === "manual" ? manualInvestAmount : null,
        manual_value: valuationMode === "manual" ? manualValue : null,
        valuation_updated_at: valuationMode === "manual" ? new Date().toISOString() : null,
      },
    ]).select();

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data?.[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as {
      id: number;
      field: "quantity" | "avgPrice" | "manualValue";
      value: number;
    };

    const { id, field, value } = body;

    if (!id || !field || value === undefined) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: "유효하지 않은 값" }, { status: 400 });
    }

    const updateData: Record<string, number | string> = {};
    if (field === "quantity") {
      updateData.quantity = value;
    } else if (field === "avgPrice") {
      updateData.avg_price = value;
    } else if (field === "manualValue") {
      updateData.manual_value = value;
      updateData.valuation_updated_at = new Date().toISOString();
    } else {
      return NextResponse.json({ error: "지원하지 않는 필드" }, { status: 400 });
    }

    const { error } = await supabase
      .from("assets")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { session } } = await supabaseServer.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { id: number };
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "ID 누락" }, { status: 400 });
    }

    const { error } = await supabase
      .from("assets")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
