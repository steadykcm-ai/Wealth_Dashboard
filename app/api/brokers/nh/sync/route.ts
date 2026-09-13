import { NextRequest, NextResponse } from "next/server";
import { isDashboardOwner } from "@/lib/auth-config";
import { fetchNhPlugPreview } from "@/lib/nhplug-client";
import { buildNhPlugSyncOperations, type NhPlugSyncWritableAsset } from "@/lib/nhplug-sync-apply";
import { buildNhPlugSyncPreview } from "@/lib/nhplug-sync-preview";
import { createSupabaseServer } from "@/lib/supabase-server";

const MAX_SELECTED_ITEMS = 50;
const NH_ACCOUNT_NAME = "NH투자증권 Namuh";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    if (!isDashboardOwner(user.id)) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });

    const body = await req.json() as { selectedKeys?: unknown };
    const selectedKeys = Array.isArray(body.selectedKeys)
      ? body.selectedKeys.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (selectedKeys.length === 0 || selectedKeys.length > MAX_SELECTED_ITEMS || new Set(selectedKeys).size !== selectedKeys.length) {
      return NextResponse.json({ error: `반영할 종목은 1~${MAX_SELECTED_ITEMS}개여야 합니다.` }, { status: 400 });
    }

    const [preview, assetsResult] = await Promise.all([
      fetchNhPlugPreview(),
      supabase
        .from("assets")
        .select("id, code, name, quantity, avg_price, valuation_mode")
        .eq("user_id", user.id)
        .eq("is_cash", false)
        .neq("asset_type", "암호화폐"),
    ]);
    if (assetsResult.error) throw new Error(`대시보드 자산 조회 실패: ${assetsResult.error.message}`);

    const assets = (assetsResult.data ?? []) as NhPlugSyncWritableAsset[];
    const sync = buildNhPlugSyncPreview(preview, assets);
    const operations = buildNhPlugSyncOperations(sync, assets, selectedKeys);
    const created = operations.filter((operation) => operation.kind === "create");
    const updated = operations.filter((operation) => operation.kind === "update");
    const skipped = operations.filter((operation) => operation.kind === "skip");

    for (const operation of created) {
      const { error } = await supabase.from("assets").insert({
        asset_type: "개별주식",
        account_name: NH_ACCOUNT_NAME,
        name: operation.candidate.name,
        code: operation.candidate.code,
        quantity: operation.candidate.nhQuantity,
        avg_price: operation.candidate.nhAveragePrice,
        is_cash: false,
        user_id: user.id,
        valuation_mode: "market",
      });
      if (error) throw new Error(`신규 종목 추가 실패: ${error.message}`);
    }

    for (const operation of updated) {
      const updateData: Record<string, number> = {};
      if (operation.quantity !== undefined) updateData.quantity = operation.quantity;
      if (operation.averagePrice !== undefined) updateData.avg_price = operation.averagePrice;
      const { error } = await supabase
        .from("assets")
        .update(updateData)
        .eq("id", operation.assetId)
        .eq("user_id", user.id);
      if (error) throw new Error(`종목 갱신 실패: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      updated: updated.length,
      skipped: skipped.map((operation) => ({ name: operation.candidate.name, reason: operation.reason })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "NH 종목 반영에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
