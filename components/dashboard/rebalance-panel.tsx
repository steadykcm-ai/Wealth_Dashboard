"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPriceUpdatedAt } from "@/lib/dashboard-format";
import { formatKRW } from "@/lib/number-format";
import type { AssetGroup, AssetItem, RebalanceCategory, RebalanceTarget } from "@/lib/types";

export function RebalancePanel({
  group,
  category,
}: {
  group: AssetGroup;
  category: RebalanceCategory;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetInputs, setTargetInputs] = useState<Record<number, string>>({});
  const [contribution, setContribution] = useState("1000000");
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const items = useMemo(
    () => group.items
      .filter((item): item is AssetItem & { id: number } => Number.isInteger(item.id))
      .slice()
      .sort((left, right) => right.currentValue - left.currentValue),
    [group.items]
  );
  const accountByAssetId = useMemo(() => {
    const accountMap: Record<number, string> = {};
    group.accounts.forEach((account) => {
      account.items.forEach((item) => {
        if (item.id) accountMap[item.id] = account.name;
      });
    });
    return accountMap;
  }, [group.accounts]);
  const holdingsTotal = items.reduce((sum, item) => sum + item.currentValue, 0);
  const targetSum = items.reduce((sum, item) => sum + Number(targetInputs[item.id] || 0), 0);
  const targetSumIsZero = Math.abs(targetSum) < 0.005;
  const targetSumIsValid = Math.abs(targetSum - 100) <= 0.05;
  const contributionAmount = Math.max(0, Number(contribution) || 0);

  const planRows = useMemo(() => {
    const finalPortfolioValue = holdingsTotal + contributionAmount;
    const rows = items.map((item) => {
      const currentWeight = holdingsTotal > 0 ? (item.currentValue / holdingsTotal) * 100 : 0;
      const targetWeight = Number(targetInputs[item.id] || 0);
      const targetValue = (targetWeight / 100) * finalPortfolioValue;
      const gapValue = targetSumIsValid ? Math.max(0, targetValue - item.currentValue) : 0;
      return {
        item,
        currentWeight,
        targetWeight,
        difference: targetWeight - currentWeight,
        gapValue,
        recommendedBuy: 0,
      };
    });
    const totalGap = rows.reduce((sum, row) => sum + row.gapValue, 0);
    if (totalGap <= 0) return rows;

    const roundedBudget = Math.round(contributionAmount);
    const rawBuys = rows.map((row) => (roundedBudget * row.gapValue) / totalGap);
    const integerBuys = rawBuys.map((amount) => Math.floor(amount));
    let remainder = roundedBudget - integerBuys.reduce((sum, amount) => sum + amount, 0);
    const remainderOrder = rawBuys
      .map((amount, index) => ({ index, fraction: amount - Math.floor(amount) }))
      .sort((left, right) => right.fraction - left.fraction);
    remainderOrder.forEach(({ index }) => {
      if (remainder <= 0) return;
      integerBuys[index] += 1;
      remainder -= 1;
    });

    return rows.map((row, index) => ({ ...row, recommendedBuy: integerBuys[index] }));
  }, [contributionAmount, holdingsTotal, items, targetInputs, targetSumIsValid]);

  const orderPlan = useMemo(() => {
    const roundedContribution = Math.round(contributionAmount);
    const finalPortfolioValue = holdingsTotal + roundedContribution;
    const rows = planRows.map((row) => {
      const supportsUnitOrder = row.item.valuationMode !== "manual"
        && Boolean(row.item.code)
        && row.item.currentPrice > 0;
      const orderQuantity = supportsUnitOrder
        ? Math.floor(row.recommendedBuy / row.item.currentPrice)
        : null;
      const orderAmount = orderQuantity === null
        ? row.recommendedBuy
        : Math.round(orderQuantity * row.item.currentPrice);
      const projectedWeight = finalPortfolioValue > 0
        ? ((row.item.currentValue + orderAmount) / finalPortfolioValue) * 100
        : 0;

      return {
        ...row,
        supportsUnitOrder,
        orderQuantity,
        orderAmount,
        projectedWeight,
        projectedDifference: row.targetWeight - projectedWeight,
      };
    });
    const totalOrderAmount = rows.reduce((sum, row) => sum + row.orderAmount, 0);
    const remainingCash = Math.max(0, roundedContribution - totalOrderAmount);
    const currentDrift = rows.reduce((sum, row) => sum + Math.abs(row.difference), 0) / 2;
    const projectedDrift = rows.reduce((sum, row) => sum + Math.abs(row.projectedDifference), 0) / 2;

    return { rows, totalOrderAmount, remainingCash, currentDrift, projectedDrift };
  }, [contributionAmount, holdingsTotal, planRows]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTargets(true);
    setTargetError(null);
    fetch(`/api/rebalance-targets?category=${category}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json() as { error?: string };
          throw new Error(body.error ?? "목표 비중을 불러오지 못했습니다.");
        }
        return response.json() as Promise<{ targets: RebalanceTarget[] }>;
      })
      .then(({ targets }) => {
        if (cancelled) return;
        const nextInputs: Record<number, string> = {};
        targets.forEach((target) => {
          nextInputs[target.assetId] = `${target.targetWeight}`;
        });
        setTargetInputs(nextInputs);
        const latestUpdatedAt = targets.map((target) => target.updatedAt).filter(Boolean).sort().at(-1);
        setSavedAt(latestUpdatedAt ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setTargetError(error instanceof Error ? error.message : "목표 비중을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTargets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  function applyCurrentWeights() {
    if (holdingsTotal <= 0 || items.length === 0) return;
    const nextInputs: Record<number, string> = {};
    let roundedTotal = 0;
    items.forEach((item) => {
      const weight = Math.round((item.currentValue / holdingsTotal) * 10000) / 100;
      nextInputs[item.id] = weight.toFixed(2);
      roundedTotal += weight;
    });
    const adjustment = Math.round((100 - roundedTotal) * 100) / 100;
    nextInputs[items[0].id] = (Number(nextInputs[items[0].id]) + adjustment).toFixed(2);
    setTargetInputs(nextInputs);
    setTargetError(null);
    setSavedAt(null);
  }

  async function saveTargets() {
    if (savingTargets || (!targetSumIsZero && !targetSumIsValid)) return;
    setSavingTargets(true);
    setTargetError(null);
    try {
      const response = await fetch("/api/rebalance-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          targets: items.map((item) => ({
            assetId: item.id,
            targetWeight: Number(targetInputs[item.id] || 0),
          })),
        }),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "목표 비중을 저장하지 못했습니다.");
      }
      const body = await response.json() as { targets: RebalanceTarget[] };
      const latestUpdatedAt = body.targets.map((target) => target.updatedAt).filter(Boolean).sort().at(-1);
      setSavedAt(latestUpdatedAt ?? new Date().toISOString());
      window.dispatchEvent(new CustomEvent("rebalance-targets-updated"));
    } catch (error: unknown) {
      setTargetError(error instanceof Error ? error.message : "목표 비중을 저장하지 못했습니다.");
    } finally {
      setSavingTargets(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="mx-4 mb-6 overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332] md:mx-0">
      <button
        type="button"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]"
      >
        <span>
          <span className="block text-sm font-semibold text-[#3d47cf]">리밸런싱</span>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            목표 {targetSum.toFixed(2)}%{savedAt ? ` · 저장 ${formatPriceUpdatedAt(savedAt)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm text-gray-400">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div>
          <div className="grid gap-3 border-b border-[#e0e0e0] px-4 py-4 dark:border-[#2a3a4a] md:grid-cols-[minmax(180px,1fr)_auto] md:items-end">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              추가 투자금
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="10000"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
                className="mt-1 block w-full rounded-md border border-[#d6d9e0] bg-white px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white md:max-w-56"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={applyCurrentWeights} disabled={loadingTargets} className="rounded-md border border-[#d6d9e0] px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40 dark:border-[#3a4658] dark:text-gray-300">
                현재 비중
              </button>
              <button type="button" onClick={() => { setTargetInputs({}); setSavedAt(null); }} disabled={loadingTargets} className="rounded-md border border-[#d6d9e0] px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40 dark:border-[#3a4658] dark:text-gray-300">
                초기화
              </button>
              <button type="button" onClick={saveTargets} disabled={loadingTargets || savingTargets || (!targetSumIsZero && !targetSumIsValid)} className="rounded-md bg-[#3d47cf] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {savingTargets ? "저장 중" : "저장"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-[#e0e0e0] px-4 py-2.5 text-xs dark:border-[#2a3a4a]">
            <span className="text-gray-500">목표 합계</span>
            <span className={`rounded-full px-2 py-0.5 font-semibold ${targetSumIsValid || targetSumIsZero ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
              {targetSum.toFixed(2)}%
            </span>
          </div>

          {targetSumIsValid && contributionAmount > 0 && (
            <div className="grid grid-cols-3 gap-3 border-b border-[#e0e0e0] px-4 py-3 text-xs dark:border-[#2a3a4a]">
              <div>
                <span className="block text-[11px] text-gray-400">주문 예정</span>
                <strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(orderPlan.totalOrderAmount)}</strong>
              </div>
              <div className="text-center">
                <span className="block text-[11px] text-gray-400">남는 현금</span>
                <strong className="mt-0.5 block text-gray-900 dark:text-white">{formatKRW(orderPlan.remainingCash)}</strong>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-gray-400">목표 격차</span>
                <strong className="mt-0.5 block text-[#3d47cf]">{orderPlan.currentDrift.toFixed(2)} → {orderPlan.projectedDrift.toFixed(2)}%p</strong>
              </div>
            </div>
          )}

          {targetError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{targetError}</p>}

          <div className="hidden grid-cols-[minmax(220px,1fr)_90px_100px_90px_120px] gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-2 text-right text-[11px] font-semibold text-gray-400 dark:border-[#2a3a4a] dark:bg-[#0f1923] md:grid">
            <span className="text-left">종목</span>
            <span>현재 비중</span>
            <span>목표 비중</span>
            <span>차이</span>
            <span>주문 제안</span>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {loadingTargets ? (
              <p className="py-10 text-center text-sm text-gray-400">목표 비중 불러오는 중</p>
            ) : orderPlan.rows.map((row) => (
              <div key={row.item.id} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-3 gap-y-2 border-b border-[#f0f0f0] px-4 py-3 last:border-b-0 dark:border-[#2a3a4a] md:grid-cols-[minmax(220px,1fr)_90px_100px_90px_120px]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.item.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">{accountByAssetId[row.item.id] ?? "계좌 미확인"} · {formatKRW(row.item.currentValue)}</p>
                </div>
                <div className="hidden text-right text-xs font-medium text-gray-600 dark:text-gray-300 md:block">{row.currentWeight.toFixed(2)}%</div>
                <label className="text-right text-[11px] text-gray-400 md:text-xs">
                  <span className="md:hidden">목표</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    aria-label={`${row.item.name} 목표 비중`}
                    value={targetInputs[row.item.id] ?? ""}
                    onChange={(event) => {
                      setTargetInputs((previous) => ({ ...previous, [row.item.id]: event.target.value }));
                      setSavedAt(null);
                    }}
                    className="ml-1 w-16 rounded-md border border-[#d6d9e0] bg-white px-2 py-1.5 text-right text-xs font-semibold text-gray-900 dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-white md:ml-0 md:w-20"
                  />
                  <span className="ml-1">%</span>
                </label>
                <div className="text-xs text-gray-500 md:text-right">
                  <span className="md:hidden">현재 {row.currentWeight.toFixed(2)}% · 차이 </span>
                  <span className={row.difference > 0.005 ? "font-semibold text-[#3d47cf]" : row.difference < -0.005 ? "text-gray-400" : "text-gray-500"}>
                    {row.difference > 0 ? "+" : ""}{row.difference.toFixed(2)}%p
                  </span>
                </div>
                <div className="text-right text-xs font-semibold text-gray-900 dark:text-white md:col-auto">
                  <span className="mr-1 font-normal text-gray-400 md:hidden">주문</span>
                  {targetSumIsValid && contributionAmount > 0 ? (
                    <>
                      <span className="block">
                        {row.supportsUnitOrder ? `${row.orderQuantity?.toLocaleString("ko-KR")}주` : formatKRW(row.orderAmount)}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-normal text-gray-400">
                        {row.supportsUnitOrder ? `${formatKRW(row.orderAmount)} · ` : "금액 주문 · "}
                        주문 후 {row.projectedWeight.toFixed(2)}%
                      </span>
                    </>
                  ) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

