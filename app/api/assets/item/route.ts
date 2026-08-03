import { NextRequest, NextResponse } from "next/server";
import { toAssetUpdateData } from "@/lib/asset-updates";
import type { AssetUpdates, BulkAssetUpdate, EditableAssetField } from "@/lib/asset-updates";
import { createSupabaseServer } from "@/lib/supabase-server";

const MAX_BULK_UPDATES = 100;

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
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

    const { data, error } = await supabaseServer.from("assets").insert([
      {
        asset_type: assetType,
        account_name: accountName,
        name,
        code: code || null,
        quantity,
        avg_price: avgPrice,
        is_cash: false,
        user_id: user.id,
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
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as {
      id?: number;
      field?: EditableAssetField;
      value?: number;
      updates?: AssetUpdates;
    };

    const id = Number(body.id);
    const updates = body.updates ?? (
      body.field && body.value !== undefined
        ? { [body.field]: body.value }
        : {}
    );
    const updateEntries = Object.entries(updates);

    if (!Number.isInteger(id) || id <= 0 || updateEntries.length === 0) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    let updateData: Record<string, number | string>;
    try {
      updateData = toAssetUpdateData(updates);
    } catch (validationError: unknown) {
      const message = validationError instanceof Error ? validationError.message : "수정 값이 올바르지 않습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("assets")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as { items?: BulkAssetUpdate[] };
    const items = body.items ?? [];
    if (items.length === 0 || items.length > MAX_BULK_UPDATES) {
      return NextResponse.json(
        { error: `한 번에 1~${MAX_BULK_UPDATES}개 종목을 수정할 수 있습니다.` },
        { status: 400 }
      );
    }

    const ids = items.map((item) => Number(item.id));
    if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "종목 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const valuationUpdatedAt = new Date().toISOString();
    let prepared: Array<{ id: number; updateData: Record<string, number | string> }>;
    try {
      prepared = items.map((item) => ({
        id: item.id,
        updateData: toAssetUpdateData(item.updates, valuationUpdatedAt),
      }));
    } catch (validationError: unknown) {
      const message = validationError instanceof Error ? validationError.message : "수정 값이 올바르지 않습니다.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { data: ownedAssets, error: ownershipError } = await supabaseServer
      .from("assets")
      .select("id")
      .eq("user_id", user.id)
      .in("id", ids);
    if (ownershipError) throw ownershipError;
    if ((ownedAssets ?? []).length !== ids.length) {
      return NextResponse.json({ error: "수정 권한이 없는 종목이 포함되어 있습니다." }, { status: 403 });
    }

    const results = await Promise.all(prepared.map(({ id, updateData }) => (
      supabaseServer
        .from("assets")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", user.id)
    )));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({ ok: true, updated: prepared.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "일괄 수정 중 서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as { id: number };
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "ID 누락" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("assets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
