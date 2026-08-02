"use client";

import { useEffect, useMemo, useState } from "react";
import type { RetirementSettings } from "@/lib/types";
import { formatKRW } from "@/lib/number-format";
import { formatPriceUpdatedAt } from "@/lib/dashboard-format";
import { calculateRetirementScenario } from "@/lib/retirement-calculator";
import type { NumericRetirementSettingKey } from "@/lib/retirement-calculator";

export function RetirementPlanner({
  stockAssets,
  pensionAssets,
}: {
  stockAssets: number;
  pensionAssets: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState<RetirementSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentAssets = stockAssets + pensionAssets;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/retirement-settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json() as { error?: string };
          throw new Error(body.error ?? "은퇴 설정을 불러오지 못했습니다.");
        }
        return response.json() as Promise<{ settings: RetirementSettings }>;
      })
      .then(({ settings: fetchedSettings }) => {
        if (!cancelled) setSettings(fetchedSettings);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "은퇴 설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const scenarios = useMemo(() => settings ? [
    calculateRetirementScenario(stockAssets, pensionAssets, settings, -2, "보수적"),
    calculateRetirementScenario(stockAssets, pensionAssets, settings, 0, "기준"),
    calculateRetirementScenario(stockAssets, pensionAssets, settings, 2, "낙관적"),
  ] : [], [pensionAssets, settings, stockAssets]);
  const baseScenario = scenarios[1];

  function updateSetting(key: NumericRetirementSettingKey, value: number) {
    setSettings((previous) => previous ? { ...previous, [key]: value, updatedAt: undefined } : previous);
    setError(null);
  }

  function updateWithdrawalPriority(value: RetirementSettings["withdrawalPriority"]) {
    setSettings((previous) => previous ? { ...previous, withdrawalPriority: value, updatedAt: undefined } : previous);
    setError(null);
  }

  async function saveSettings() {
    if (!settings || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/retirement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error ?? "은퇴 설정을 저장하지 못했습니다.");
      }
      const body = await response.json() as { settings: RetirementSettings };
      setSettings(body.settings);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "은퇴 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const inputFields: Array<{
    key: NumericRetirementSettingKey;
    label: string;
    suffix: string;
    step: number;
  }> = [
    { key: "currentAge", label: "현재 나이", suffix: "세", step: 1 },
    { key: "retirementAge", label: "은퇴 나이", suffix: "세", step: 1 },
    { key: "lifeExpectancy", label: "계획 수명", suffix: "세", step: 1 },
    { key: "monthlyContribution", label: "월 추가 투자", suffix: "원", step: 100000 },
    { key: "monthlyLivingCost", label: "은퇴 월 생활비", suffix: "원", step: 100000 },
    { key: "publicPensionMonthly", label: "월 공적연금", suffix: "원", step: 100000 },
    { key: "publicPensionStartAge", label: "공적연금 시작", suffix: "세", step: 1 },
    { key: "privatePensionStartAge", label: "개인연금 인출", suffix: "세", step: 1 },
    { key: "pensionContributionRatio", label: "연금 투자 비중", suffix: "%", step: 1 },
    { key: "monthlyContributionAfterRetirement", label: "은퇴 후 월 투자", suffix: "원", step: 100000 },
    { key: "expectedReturnRate", label: "기대수익률", suffix: "%", step: 0.1 },
    { key: "inflationRate", label: "물가상승률", suffix: "%", step: 0.1 },
  ];

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="은퇴 시뮬레이터">
      <div className="overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <button
          type="button"
          onClick={() => setIsExpanded((previous) => !previous)}
          aria-expanded={isExpanded}
          className="flex w-full items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 text-left dark:border-[#2a3a4a] dark:bg-[#0f1923]"
        >
          <span>
            <span className="block text-sm font-semibold text-[#3d47cf]">은퇴 준비</span>
            <span className="mt-0.5 block text-[11px] text-gray-400">
              {loading ? "계산 중" : baseScenario ? `목표 충족률 ${Math.round(baseScenario.fundingRate)}%` : "설정 확인 필요"}
            </span>
          </span>
          <span className="text-sm text-gray-400">{isExpanded ? "▲" : "▼"}</span>
        </button>

        {isExpanded && settings && baseScenario && (
          <>
            <div className="grid grid-cols-3 divide-x divide-[#e0e0e0] border-b border-[#e0e0e0] dark:divide-[#2a3a4a] dark:border-[#2a3a4a]">
              <div className="px-3 py-4 md:px-4">
                <span className="block text-[11px] text-gray-400">현재 은퇴자산</span>
                <strong className="mt-1 block text-sm text-gray-900 dark:text-white md:text-base">{formatKRW(currentAssets)}</strong>
                <span className="mt-0.5 block text-[10px] text-gray-400">주식 {formatKRW(stockAssets)} · 연금 {formatKRW(pensionAssets)}</span>
              </div>
              <div className="px-3 py-4 text-center md:px-4">
                <span className="block text-[11px] text-gray-400">은퇴 예상자산</span>
                <strong className="mt-1 block text-sm text-[#3d47cf] md:text-base">{formatKRW(baseScenario.projectedAssets)}</strong>
                <span className="mt-0.5 block text-[10px] text-gray-400">현재가치 기준</span>
              </div>
              <div className="px-3 py-4 text-right md:px-4">
                <span className="block text-[11px] text-gray-400">예상 월 가용액</span>
                <strong className="mt-1 block text-sm text-gray-900 dark:text-white md:text-base">{formatKRW(baseScenario.monthlyIncome)}</strong>
                <span className="mt-0.5 block text-[10px] text-gray-400">공적연금 포함</span>
              </div>
            </div>

            <div className="border-b border-[#e0e0e0] px-4 py-4 dark:border-[#2a3a4a]">
              <div className="space-y-3">
                {scenarios.map((scenario) => (
                  <div key={scenario.label} className="grid grid-cols-[52px_minmax(0,1fr)_76px] items-center gap-3 text-xs">
                    <span className="font-semibold text-gray-600 dark:text-gray-300">{scenario.label}</span>
                    <div className="h-2 overflow-hidden bg-gray-100 dark:bg-[#0f1923]">
                      <div className="h-full bg-[#3d47cf]" style={{ width: `${Math.min(100, scenario.fundingRate)}%` }} />
                    </div>
                    <span className="text-right font-semibold text-gray-900 dark:text-white">{Math.round(scenario.fundingRate)}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                실질수익률 기준 · 기준 {baseScenario.annualReturn.toFixed(1)}% · 필요자산 {formatKRW(baseScenario.targetAssets)}
              </p>
              <div className="mt-4 grid grid-cols-3 divide-x divide-[#e0e0e0] border-y border-[#e0e0e0] py-3 dark:divide-[#2a3a4a] dark:border-[#2a3a4a]">
                <div className="px-2"><span className="block text-[10px] text-gray-400">연금 시작 전 필요액</span><strong className="mt-1 block text-xs text-gray-900 dark:text-white">{formatKRW(baseScenario.bridgeGap)}</strong></div>
                <div className="px-2 text-center"><span className="block text-[10px] text-gray-400">자산 소진 예상</span><strong className="mt-1 block text-xs text-gray-900 dark:text-white">{baseScenario.depletionAge ? `${baseScenario.depletionAge.toFixed(1)}세` : `${settings.lifeExpectancy}세 이후`}</strong></div>
                <div className="px-2 text-right"><span className="block text-[10px] text-gray-400">은퇴 시 연금자산</span><strong className="mt-1 block text-xs text-gray-900 dark:text-white">{formatKRW(baseScenario.projectedPensionAssets)}</strong></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-4">
              {inputFields.map((field) => (
                <label key={field.key} className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {field.label}
                  <span className="mt-1 flex items-center rounded-md border border-[#d6d9e0] bg-white px-2 dark:border-[#3a4658] dark:bg-[#0f1923]">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={field.step}
                      value={settings[field.key] ?? 0}
                      onChange={(event) => updateSetting(field.key, Number(event.target.value))}
                      className="min-w-0 flex-1 bg-transparent py-2 text-right text-xs font-semibold text-gray-900 outline-none dark:text-white"
                    />
                    <span className="ml-1 shrink-0 text-[10px] text-gray-400">{field.suffix}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t border-[#e0e0e0] px-4 py-4 dark:border-[#2a3a4a]">
              <span className="mb-2 block text-[11px] font-medium text-gray-500 dark:text-gray-400">인출 순서</span>
              <div className="grid grid-cols-3 overflow-hidden rounded-md border border-[#d6d9e0] dark:border-[#3a4658]">
                {([
                  { value: "pension_first" as const, label: "연금 먼저" },
                  { value: "taxable_first" as const, label: "주식 먼저" },
                  { value: "proportional" as const, label: "비례 인출" },
                ]).map((option) => (
                  <button key={option.value} type="button" onClick={() => updateWithdrawalPriority(option.value)} className={`border-r border-[#d6d9e0] px-2 py-2 text-xs font-semibold last:border-r-0 dark:border-[#3a4658] ${settings.withdrawalPriority === option.value ? "bg-[#3d47cf] text-white" : "bg-white text-gray-600 dark:bg-[#0f1923] dark:text-gray-300"}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="flex items-center justify-between border-t border-[#e0e0e0] px-4 py-3 dark:border-[#2a3a4a]">
              <span className="text-[11px] text-gray-400">{settings.updatedAt ? `저장 ${formatPriceUpdatedAt(settings.updatedAt)}` : "저장 전"}</span>
              <button type="button" onClick={saveSettings} disabled={saving} className="rounded-md bg-[#3d47cf] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {saving ? "저장 중" : "설정 저장"}
              </button>
            </div>
          </>
        )}
        {isExpanded && !settings && <p className="px-4 py-8 text-center text-sm text-gray-400">{error ?? "은퇴 설정 불러오는 중"}</p>}
      </div>
    </section>
  );
}
