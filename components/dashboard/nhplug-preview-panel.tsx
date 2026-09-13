"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/number-format";
import type { NhPlugPreviewWithSyncResponse, NhPlugSyncCandidate, NhPlugSyncStatus } from "@/lib/nhplug-types";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NhPlugPreviewPanel() {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NhPlugPreviewWithSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  function isSelectable(candidate: NhPlugSyncCandidate): boolean {
    return candidate.status === "new" || candidate.status === "quantity_mismatch" || candidate.status === "average_price_mismatch";
  }

  async function fetchPreview(clearApplyMessage = true) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/brokers/nh/preview", { cache: "no-store" });
      const body = await response.json() as NhPlugPreviewWithSyncResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "NH 계좌 연결 확인에 실패했습니다.");
      setData(body);
      setSelectedKeys(body.sync.candidates.filter(isSelectable).map((candidate) => candidate.key));
      if (clearApplyMessage) setApplyMessage(null);
      setExpanded(true);
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : "NH 계좌 연결 확인에 실패했습니다.");
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }

  function toggleCandidate(key: string) {
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : [...current, key]);
  }

  async function applySelected() {
    if (applying || selectedKeys.length === 0) return;
    if (!window.confirm(`${selectedKeys.length}개 종목을 NH 잔고 기준으로 반영할까요? 기존 종목은 삭제되지 않습니다.`)) return;

    setApplying(true);
    setApplyMessage(null);
    try {
      const response = await fetch("/api/brokers/nh/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedKeys }),
      });
      const body = await response.json() as { created?: number; updated?: number; skipped?: Array<{ name: string; reason: string }>; error?: string };
      if (!response.ok) throw new Error(body.error ?? "NH 종목 반영에 실패했습니다.");
      const skipped = body.skipped?.length ?? 0;
      setApplyMessage(`신규 ${body.created ?? 0}개 추가 · ${body.updated ?? 0}개 갱신${skipped > 0 ? ` · ${skipped}개 보류` : ""}`);
      await fetchPreview(false);
    } catch (applyError: unknown) {
      setApplyMessage(applyError instanceof Error ? applyError.message : "NH 종목 반영에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  }

  const statusLabel: Record<NhPlugSyncStatus, string> = {
    new: "신규",
    quantity_mismatch: "수량 차이",
    average_price_mismatch: "매입가 차이",
    matched: "일치",
    invalid: "확인 필요",
  };

  const statusClass: Record<NhPlugSyncStatus, string> = {
    new: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    quantity_mismatch: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    average_price_mismatch: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    matched: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    invalid: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  };

  return (
    <section className="mx-4 mb-4 overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0 md:mb-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 text-left" aria-expanded={expanded}>
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">NH 계좌 연결</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">읽기 전용</span>
          </span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            {data ? `${data.totals.accounts}개 계좌 · ${data.totals.holdings}개 종목` : "Namuh PLUG 연결 상태와 잔고를 확인합니다"}
          </span>
        </button>
        <button type="button" onClick={() => void fetchPreview()} disabled={loading} className="shrink-0 rounded-md bg-[#3d47cf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {loading ? "조회 중" : data ? "다시 조회" : "연결 확인"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#e0e0e0] dark:border-[#2a3a4a]">
          {error && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
          {data && (
            <>
              <div className="grid grid-cols-3 gap-3 border-b border-[#e0e0e0] px-4 py-3 text-xs dark:border-[#2a3a4a]">
                <div><span className="block text-[11px] text-gray-400">평가액</span><strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(data.totals.currentValue)}</strong></div>
                <div className="text-center"><span className="block text-[11px] text-gray-400">예수금</span><strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(data.totals.cash)}</strong></div>
                <div className="text-right"><span className="block text-[11px] text-gray-400">토큰</span><strong className="mt-0.5 block text-gray-900 dark:text-white">{data.tokenSource === "issued" ? "신규 발급" : data.tokenSource === "database" ? "DB 캐시" : "메모리 캐시"}</strong></div>
              </div>
              {data.accounts.map((account) => (
                <div key={`${account.accountId}-${account.accountType}-${account.holdings.length}`} className="border-b border-[#f0f0f0] px-4 py-3 last:border-b-0 dark:border-[#2a3a4a]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{account.accountId}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">운영 계좌 · 종목 {account.holdings.length}개</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatKRW((account.domestic?.currentValue ?? 0) + (account.us?.currentValue ?? 0))}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">국내 {account.domestic ? formatKRW(account.domestic.currentValue) : "-"} · 미국 {account.us ? formatKRW(account.us.currentValue) : "-"}</p>
                    </div>
                  </div>
                  {account.errors.length > 0 && <p className="mt-2 text-[11px] text-amber-600">{account.errors.join(" · ")}</p>}
                </div>
              ))}
              <div className="border-t border-[#e0e0e0] dark:border-[#2a3a4a]">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">동기화 미리보기</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">NH 보유 종목만 대시보드와 비교합니다</p>
                  </div>
                  <span className="text-xs text-gray-500">총 {data.sync.total}개</span>
                </div>
                <div className="grid grid-cols-4 gap-2 border-y border-[#e0e0e0] px-4 py-3 text-center text-[11px] dark:border-[#2a3a4a]">
                  <span><strong className="block text-emerald-600">{data.sync.newCount}</strong>신규</span>
                  <span><strong className="block text-amber-600">{data.sync.quantityMismatchCount}</strong>수량 차이</span>
                  <span><strong className="block text-orange-600">{data.sync.averagePriceMismatchCount}</strong>매입가 차이</span>
                  <span><strong className="block text-gray-600 dark:text-gray-200">{data.sync.matchedCount}</strong>일치</span>
                </div>
                {data.sync.candidates.filter((candidate) => candidate.status !== "matched").map((candidate) => (
                  <div key={candidate.key} className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] px-4 py-3 last:border-b-0 dark:border-[#2a3a4a]">
                    <input
                      type="checkbox"
                      aria-label={`${candidate.name} 반영`}
                      checked={selectedKeys.includes(candidate.key)}
                      disabled={!isSelectable(candidate) || applying}
                      onChange={() => toggleCandidate(candidate.key)}
                      className="h-4 w-4 shrink-0 accent-[#3d47cf] disabled:opacity-40"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{candidate.name}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">{candidate.code} · NH {candidate.nhQuantity.toLocaleString("ko-KR")}주{candidate.dashboardQuantity !== undefined ? ` · 대시보드 ${candidate.dashboardQuantity.toLocaleString("ko-KR")}주` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass[candidate.status]}`}>{statusLabel[candidate.status]}</span>
                  </div>
                ))}
                {data.sync.candidates.every((candidate) => candidate.status === "matched") && <p className="px-4 py-3 text-xs text-gray-400">NH 보유 종목이 모두 대시보드와 일치합니다.</p>}
                {applyMessage && <p role="status" className="border-t border-[#e0e0e0] px-4 py-3 text-xs text-gray-600 dark:border-[#2a3a4a] dark:text-gray-300">{applyMessage}</p>}
                {data.sync.candidates.some(isSelectable) && (
                  <div className="flex items-center justify-between gap-3 border-t border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
                    <span className="text-xs text-gray-500">{selectedKeys.length}개 선택 · 삭제·현금 변경 제외</span>
                    <button type="button" onClick={() => void applySelected()} disabled={selectedKeys.length === 0 || applying} className="shrink-0 rounded-md bg-[#3d47cf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      {applying ? "반영 중" : "선택 반영"}
                    </button>
                  </div>
                )}
              </div>
              <p className="border-t border-[#e0e0e0] px-4 py-2 text-[10px] text-gray-400 dark:border-[#2a3a4a]">
                {formatTimestamp(data.updatedAt)} 조회 · 토큰 만료 {formatTimestamp(data.tokenExpiresAt)} · 현재 자산은 변경하지 않았습니다
              </p>
            </>
          )}
          {!data && !error && <p className="px-4 py-4 text-xs text-gray-400">연결 확인을 누르면 마스킹된 계좌별 집계만 표시합니다.</p>}
        </div>
      )}
    </section>
  );
}
