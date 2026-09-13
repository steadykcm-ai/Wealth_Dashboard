import { getRequiredSupabaseAdminClient } from "@/lib/supabase-admin";

const TOKEN_CACHE_ID = "live";

interface NhPlugTokenCacheRow {
  access_token: string;
  expires_at: string;
}

export interface CachedNhPlugToken {
  accessToken: string;
  expiresAtMs: number;
}

export async function readCachedNhPlugToken(nowMs: number): Promise<CachedNhPlugToken | null> {
  const admin = getRequiredSupabaseAdminClient();
  const { data, error } = await admin
    .from("nhplug_token_cache")
    .select("access_token, expires_at")
    .eq("id", TOKEN_CACHE_ID)
    .maybeSingle<NhPlugTokenCacheRow>();

  if (error) throw new Error(`Namuh PLUG 토큰 캐시 조회 실패: ${error.message}`);
  if (!data) return null;

  const expiresAtMs = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return { accessToken: data.access_token, expiresAtMs };
}

export async function saveCachedNhPlugToken(
  accessToken: string,
  expiresAtMs: number
): Promise<void> {
  const admin = getRequiredSupabaseAdminClient();
  const { error } = await admin.from("nhplug_token_cache").upsert({
    id: TOKEN_CACHE_ID,
    access_token: accessToken,
    expires_at: new Date(expiresAtMs).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (error) throw new Error(`Namuh PLUG 토큰 캐시 저장 실패: ${error.message}`);
}

export async function clearCachedNhPlugToken(): Promise<void> {
  const admin = getRequiredSupabaseAdminClient();
  const { error } = await admin
    .from("nhplug_token_cache")
    .delete()
    .eq("id", TOKEN_CACHE_ID);
  if (error) throw new Error(`Namuh PLUG 토큰 캐시 초기화 실패: ${error.message}`);
}
