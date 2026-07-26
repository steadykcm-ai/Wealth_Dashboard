import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { RebalanceCategory, RebalanceTarget } from "@/lib/types";

const CATEGORIES: RebalanceCategory[] = ["stocks", "pension"];

function isRebalanceCategory(value: string | null | undefined): value is RebalanceCategory {
  return !!value && CATEGORIES.includes(value as RebalanceCategory);
}

export async function GET(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const category = req.nextUrl.searchParams.get("category");
    if (!isRebalanceCategory(category)) {
      return NextResponse.json({ error: "지원하지 않는 포트폴리오 유형입니다." }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("rebalance_targets")
      .select("asset_id, target_weight, updated_at")
      .eq("user_id", user.id)
      .eq("category", category)
      .order("asset_id");

    if (error) throw error;

    const targets: RebalanceTarget[] = (data ?? []).map((row) => ({
      assetId: Number(row.asset_id),
      targetWeight: Number(row.target_weight),
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ targets });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "목표 비중을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json() as {
      category?: RebalanceCategory;
      targets?: Array<{ assetId?: number; targetWeight?: number }>;
    };
    if (!isRebalanceCategory(body.category) || !Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json({ error: "목표 비중 정보가 올바르지 않습니다." }, { status: 400 });
    }
    if (body.targets.length > 200) {
      return NextResponse.json({ error: "한 번에 저장할 수 있는 종목 수를 초과했습니다." }, { status: 400 });
    }

    const normalizedTargets = body.targets.map((target) => ({
      assetId: Number(target.assetId),
      targetWeight: Number(target.targetWeight),
    }));
    const assetIds = normalizedTargets.map((target) => target.assetId);
    const uniqueAssetIds = new Set(assetIds);
    const invalidTarget = normalizedTargets.some((target) => (
      !Number.isInteger(target.assetId)
      || target.assetId <= 0
      || !Number.isFinite(target.targetWeight)
      || target.targetWeight < 0
      || target.targetWeight > 100
    ));
    if (invalidTarget || uniqueAssetIds.size !== assetIds.length) {
      return NextResponse.json({ error: "종목 또는 목표 비중 값이 올바르지 않습니다." }, { status: 400 });
    }

    const targetSum = normalizedTargets.reduce((sum, target) => sum + target.targetWeight, 0);
    const validTotal = Math.abs(targetSum) < 0.005 || Math.abs(targetSum - 100) <= 0.05;
    if (!validTotal) {
      return NextResponse.json({ error: "목표 비중 합계는 0% 또는 100%여야 합니다." }, { status: 400 });
    }

    const { data: ownedAssets, error: ownedAssetsError } = await supabaseServer
      .from("assets")
      .select("id")
      .eq("user_id", user.id)
      .in("id", assetIds);
    if (ownedAssetsError) throw ownedAssetsError;
    if ((ownedAssets ?? []).length !== uniqueAssetIds.size) {
      return NextResponse.json({ error: "현재 사용자에게 속하지 않은 종목이 포함되어 있습니다." }, { status: 403 });
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabaseServer
      .from("rebalance_targets")
      .upsert(normalizedTargets.map((target) => ({
        user_id: user.id,
        category: body.category,
        asset_id: target.assetId,
        target_weight: target.targetWeight,
        updated_at: updatedAt,
      })), { onConflict: "user_id,category,asset_id" })
      .select("asset_id, target_weight, updated_at");

    if (error) throw error;

    const targets: RebalanceTarget[] = (data ?? []).map((row) => ({
      assetId: Number(row.asset_id),
      targetWeight: Number(row.target_weight),
      updatedAt: row.updated_at,
    }));
    return NextResponse.json({ ok: true, targets });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "목표 비중을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
