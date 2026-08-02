"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPriceUpdatedAt } from "@/lib/dashboard-format";

interface BackupSummaryItem {
  id: number;
  kind: "manual" | "automatic" | "pre_restore";
  byte_size: number;
  created_at: string;
}

export function BackupPanel({ onRestored }: { onRestored: () => Promise<void> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [backups, setBackups] = useState<BackupSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backups", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "백업 목록을 불러오지 못했습니다.");
      }
      const body = await response.json() as { backups: BackupSummaryItem[] };
      setBackups(body.backups);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "백업 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  async function createBackup() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/backups", { method: "POST" });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "백업 생성에 실패했습니다.");
      }
      await loadBackups();
    } catch (backupError: unknown) {
      setError(backupError instanceof Error ? backupError.message : "백업 생성에 실패했습니다.");
    } finally {
      setWorking(false);
    }
  }

  async function restoreBackup(backupId: number) {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/backups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId, confirmation: "복구" }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "백업 복구에 실패했습니다.");
      }
      setPendingRestoreId(null);
      await onRestored();
      await loadBackups();
    } catch (restoreError: unknown) {
      setError(restoreError instanceof Error ? restoreError.message : "백업 복구에 실패했습니다.");
    } finally {
      setWorking(false);
    }
  }

  const latestBackup = backups[0];
  const kindLabels: Record<BackupSummaryItem["kind"], string> = {
    manual: "수동",
    automatic: "자동",
    pre_restore: "복구 전",
  };

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="데이터 백업">
      <div className="overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <button type="button" onClick={() => setIsExpanded((previous) => !previous)} aria-expanded={isExpanded} className="flex w-full items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]">
          <span><span className="block text-sm font-semibold text-[#3d47cf]">데이터 백업</span><span className="mt-0.5 block text-[11px] text-gray-400">{loading ? "확인 중" : latestBackup ? `최근 ${formatPriceUpdatedAt(latestBackup.created_at)}` : "백업 없음"}</span></span>
          <span className="text-sm text-gray-400">{isExpanded ? "▲" : "▼"}</span>
        </button>
        {isExpanded && (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
              <span className="text-xs text-gray-500 dark:text-gray-400">매주 월요일 새벽 자동 백업</span>
              <button type="button" onClick={createBackup} disabled={working} className="rounded-md bg-[#3d47cf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{working ? "처리 중" : "지금 백업"}</button>
            </div>
            {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="max-h-72 overflow-y-auto px-4">
              {!loading && backups.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">저장된 백업이 없습니다.</p>
              ) : backups.map((backup) => (
                <div key={backup.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#f0f0f0] py-3 last:border-b-0 dark:border-[#2a3a4a]">
                  <div className="min-w-0"><p className="text-xs font-semibold text-gray-900 dark:text-white">{new Date(backup.created_at).toLocaleString("ko-KR")}</p><p className="mt-0.5 text-[10px] text-gray-400">{kindLabels[backup.kind]} · {(backup.byte_size / 1024).toFixed(1)} KB</p></div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/backups?download=${backup.id}`} className="rounded-md border border-[#d6d9e0] px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:border-[#3a4658] dark:text-gray-300">JSON</a>
                    {pendingRestoreId === backup.id ? (
                      <><button type="button" onClick={() => restoreBackup(backup.id)} disabled={working} className="rounded-md bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">확인</button><button type="button" onClick={() => setPendingRestoreId(null)} className="px-1 text-[11px] text-gray-400">취소</button></>
                    ) : (
                      <button type="button" onClick={() => setPendingRestoreId(backup.id)} disabled={working} className="rounded-md border border-[#d6d9e0] px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 disabled:opacity-50 dark:border-[#3a4658] dark:text-gray-300">복구</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
