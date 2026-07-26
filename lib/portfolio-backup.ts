import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_TABLES = [
  "assets",
  "cash",
  "daily_log",
  "daily_account_log",
  "portfolio_events",
  "rebalance_targets",
  "retirement_settings",
] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type BackupKind = "manual" | "automatic" | "pre_restore";

export interface PortfolioBackupPayload {
  version: 1;
  userId: string;
  createdAt: string;
  tables: Record<BackupTable, Array<Record<string, unknown>>>;
}

export async function createPortfolioBackup(
  supabase: SupabaseClient,
  userId: string,
  kind: BackupKind
): Promise<{ id: number; createdAt: string; byteSize: number }> {
  const tables = {} as Record<BackupTable, Array<Record<string, unknown>>>;
  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId);
    if (error) throw new Error(`${table} 백업 실패: ${error.message}`);
    tables[table] = (data ?? []) as Array<Record<string, unknown>>;
  }

  const createdAt = new Date().toISOString();
  const payload: PortfolioBackupPayload = { version: 1, userId, createdAt, tables };
  const byteSize = new TextEncoder().encode(JSON.stringify(payload)).length;
  const { data, error } = await supabase
    .from("portfolio_backups")
    .insert({ user_id: userId, kind, payload, byte_size: byteSize })
    .select("id, created_at")
    .single();
  if (error) throw new Error(`백업 저장 실패: ${error.message}`);

  return { id: Number(data.id), createdAt: data.created_at, byteSize };
}

function isBackupPayload(value: unknown, userId: string): value is PortfolioBackupPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PortfolioBackupPayload>;
  if (payload.version !== 1 || payload.userId !== userId || !payload.tables) return false;
  return BACKUP_TABLES.every((table) => Array.isArray(payload.tables?.[table]));
}

export async function restorePortfolioBackup(
  supabase: SupabaseClient,
  userId: string,
  payload: unknown
): Promise<Record<BackupTable, number>> {
  if (!isBackupPayload(payload, userId)) throw new Error("백업 파일 구조가 올바르지 않습니다.");

  for (const table of [...BACKUP_TABLES].reverse()) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} 초기화 실패: ${error.message}`);
  }

  const restored = {} as Record<BackupTable, number>;
  for (const table of BACKUP_TABLES) {
    const rows = payload.tables[table].map((row) => ({ ...row, user_id: userId }));
    if (rows.length > 0) {
      const { error } = await supabase.from(table).insert(rows);
      if (error) throw new Error(`${table} 복구 실패: ${error.message}`);
    }
    restored[table] = rows.length;
  }
  return restored;
}
