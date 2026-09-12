import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";
import type { MarketOverviewResponse } from "@/lib/types";

interface MarketSnapshotRow {
  payload: unknown;
  collected_at: string;
}

function isMarketOverviewResponse(value: unknown): value is MarketOverviewResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.items)
    && typeof candidate.updatedAt === "string"
    && typeof candidate.partial === "boolean"
    && typeof candidate.unavailableCount === "number";
}

export async function readMarketSnapshot(userId: string): Promise<MarketOverviewResponse | null> {
  const admin = getRequiredSupabaseAdminClient();
  const { data, error } = await admin
    .from("market_snapshots")
    .select("payload, collected_at")
    .eq("user_id", userId)
    .maybeSingle<MarketSnapshotRow>();

  if (error) throw error;
  if (!data || !isMarketOverviewResponse(data.payload)) return null;

  return {
    ...data.payload,
    delivery: { mode: "snapshot", storedAt: data.collected_at },
  };
}

export async function saveMarketSnapshot(
  userId: string,
  overview: MarketOverviewResponse
): Promise<MarketOverviewResponse> {
  const admin = getRequiredSupabaseAdminClient();
  const storedAt = new Date().toISOString();
  const payload: MarketOverviewResponse = {
    items: overview.items,
    updatedAt: overview.updatedAt,
    partial: overview.partial,
    unavailableCount: overview.unavailableCount,
  };
  const { error } = await admin
    .from("market_snapshots")
    .upsert({
      user_id: userId,
      payload,
      collected_at: storedAt,
      updated_at: storedAt,
    }, { onConflict: "user_id" });

  if (error) throw error;
  return { ...payload, delivery: { mode: "live", storedAt } };
}
