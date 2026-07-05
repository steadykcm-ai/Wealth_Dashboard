import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const TOKEN_CACHE_ID = "kis";

interface KisTokenCacheRow {
  access_token: string;
  expires_at: string;
}

export interface CachedKisToken {
  accessToken: string;
  expiresAtMs: number;
}

export async function readCachedKisToken(nowMs: number): Promise<CachedKisToken | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("kis_token_cache")
    .select("access_token, expires_at")
    .eq("id", TOKEN_CACHE_ID)
    .maybeSingle<KisTokenCacheRow>();

  if (error || !data) {
    return null;
  }

  const expiresAtMs = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return null;
  }

  return {
    accessToken: data.access_token,
    expiresAtMs,
  };
}

export async function saveCachedKisToken(
  accessToken: string,
  expiresAtMs: number
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("kis_token_cache").upsert(
    {
      id: TOKEN_CACHE_ID,
      access_token: accessToken,
      expires_at: new Date(expiresAtMs).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}
