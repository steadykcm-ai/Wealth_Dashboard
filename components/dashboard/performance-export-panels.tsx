"use client";

import { useMemo, useState } from "react";
import type { AssetGroup, BenchmarkSeries, DailyLogItem, PortfolioEvent } from "@/lib/types";
import { formatKRW, formatRate } from "@/lib/number-format";
import { rateColor } from "@/lib/dashboard-format";
import { buildPerformancePoints } from "@/lib/performance-calculator";
import type { PerformancePoint } from "@/lib/performance-calculator";

export function PerformanceAnalyticsPanel({ logs, events, benchmarks }: { logs: DailyLogItem[]; events: PortfolioEvent[]; benchmarks: BenchmarkSeries[] }) {
  const [period, setPeriod] = useState<"1year" | "all">("1year");
  const allPoints = useMemo(() => buildPerformancePoints(logs, events), [events, logs]);
  const points = useMemo(() => {
    if (period === "all" || allPoints.length === 0) return allPoints;
    const end = new Date(allPoints.at(-1)?.date ?? "");
    end.setFullYear(end.getFullYear() - 1);
    const cutoff = end.toISOString().slice(0, 10);
    const filtered = allPoints.filter((point) => point.date >= cutoff);
    return filtered.length > 1 ? filtered : allPoints;
  }, [allPoints, period]);
  const analytics = useMemo(() => {
    if (points.length < 2) return null;
    const base = points[0].index;
    const normalized = points.map((point) => ({ ...point, normalized: (point.index / base) * 100 }));
    const cumulativeReturn = normalized.at(-1)!.normalized - 100;
    const days = Math.max(1, (new Date(points.at(-1)!.date).getTime() - new Date(points[0].date).getTime()) / 86_400_000);
    const annualizedReturn = (Math.pow(1 + cumulativeReturn / 100, 365 / days) - 1) * 100;
    let peak = normalized[0].normalized;
    let peakDate = normalized[0].date;
    let maxDrawdown = 0;
    let drawdownPeakDate = peakDate;
    let troughDate = peakDate;
    normalized.forEach((point) => {
      if (point.normalized > peak) {
        peak = point.normalized;
        peakDate = point.date;
      }
      const drawdown = ((point.normalized - peak) / peak) * 100;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
        drawdownPeakDate = peakDate;
        troughDate = point.date;
      }
    });
    const drawdownPeak = normalized.find((point) => point.date === drawdownPeakDate)?.normalized ?? 100;
    const recoveryPoint = normalized.find((point) => point.date > troughDate && point.normalized >= drawdownPeak);
    const recoveryDays = recoveryPoint
      ? Math.round((new Date(recoveryPoint.date).getTime() - new Date(troughDate).getTime()) / 86_400_000)
      : null;
    const monthEnds = new Map<string, PerformancePoint>();
    points.forEach((point) => monthEnds.set(point.date.slice(0, 7), point));
    const monthly = [...monthEnds.entries()].map(([month, point], index, entries) => ({
      month,
      rate: index === 0 ? 0 : ((point.index / entries[index - 1][1].index) - 1) * 100,
    })).slice(1);
    const benchmarkReturns = benchmarks.map((benchmark) => {
      const inRange = benchmark.points.filter((point) => point.date >= points[0].date && point.date <= points.at(-1)!.date);
      const rate = inRange.length > 1 ? ((inRange.at(-1)!.value / inRange[0].value) - 1) * 100 : null;
      return { symbol: benchmark.symbol, name: benchmark.name, rate };
    });
    return { cumulativeReturn, annualizedReturn, maxDrawdown, recoveryDays, monthly, benchmarkReturns };
  }, [benchmarks, points]);

  if (!analytics) return null;
  const bestMonth = [...analytics.monthly].sort((left, right) => right.rate - left.rate)[0];
  const worstMonth = [...analytics.monthly].sort((left, right) => left.rate - right.rate)[0];

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="성과 분석">
      <div className="overflow-hidden rounded-xl border border-[#e0e0e0] bg-white dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <div className="flex items-center justify-between border-b border-[#e0e0e0] bg-[#f8f9fc] px-4 py-3 dark:border-[#2a3a4a] dark:bg-[#0f1923]">
          <div><h2 className="text-sm font-semibold text-[#3d47cf]">성과 분석</h2><p className="mt-0.5 text-[11px] text-gray-400">입출금·평가조정 제외</p></div>
          <div className="flex overflow-hidden rounded-md border border-[#d6d9e0] dark:border-[#3a4658]">
            <button type="button" onClick={() => setPeriod("1year")} className={`px-3 py-1.5 text-xs ${period === "1year" ? "bg-[#3d47cf] text-white" : "text-gray-500 dark:text-gray-300"}`}>1년</button>
            <button type="button" onClick={() => setPeriod("all")} className={`px-3 py-1.5 text-xs ${period === "all" ? "bg-[#3d47cf] text-white" : "text-gray-500 dark:text-gray-300"}`}>전체</button>
          </div>
        </div>
        <div className="grid grid-cols-2 border-b border-[#e0e0e0] md:grid-cols-4 dark:border-[#2a3a4a]">
          {[
            ["누적 수익률", formatRate(analytics.cumulativeReturn)],
            ["연환산 수익률", formatRate(analytics.annualizedReturn)],
            ["최대 낙폭", formatRate(analytics.maxDrawdown)],
            ["회복 기간", analytics.recoveryDays === null ? "아직 미회복" : `${analytics.recoveryDays}일`],
          ].map(([label, value]) => <div key={label} className="border-b border-r border-[#e0e0e0] px-4 py-4 last:border-r-0 md:border-b-0 dark:border-[#2a3a4a]"><span className="block text-[11px] text-gray-400">{label}</span><strong className="mt-1 block text-sm text-gray-900 dark:text-white">{value}</strong></div>)}
        </div>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <div><h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-300">벤치마크 대비</h3>{analytics.benchmarkReturns.map((benchmark) => <div key={benchmark.symbol} className="flex justify-between border-b border-[#e0e0e0] py-2 text-xs last:border-b-0 dark:border-[#2a3a4a]"><span className="text-gray-500 dark:text-gray-400">{benchmark.name}</span><span className="font-semibold text-gray-900 dark:text-white">{benchmark.rate === null ? "데이터 부족" : `${formatRate(benchmark.rate)} · 초과 ${formatRate(analytics.cumulativeReturn - benchmark.rate)}`}</span></div>)}</div>
          <div><h3 className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-300">월별 성과</h3><div className="mb-2 flex justify-between text-[11px] text-gray-400"><span>최고 {bestMonth ? `${bestMonth.month} ${formatRate(bestMonth.rate)}` : "-"}</span><span>최저 {worstMonth ? `${worstMonth.month} ${formatRate(worstMonth.rate)}` : "-"}</span></div>{analytics.monthly.slice(-6).reverse().map((month) => <div key={month.month} className="flex justify-between border-b border-[#e0e0e0] py-1.5 text-xs last:border-b-0 dark:border-[#2a3a4a]"><span className="text-gray-500 dark:text-gray-400">{month.month}</span><span className="font-semibold" style={{ color: rateColor(month.rate) }}>{formatRate(month.rate)}</span></div>)}</div>
        </div>
      </div>
    </section>
  );
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const protectedValue = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const contents = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ groups, logs, events }: { groups: AssetGroup[]; logs: DailyLogItem[]; events: PortfolioEvent[] }) {
  const dateKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  function exportAssets() {
    const rows: Array<Array<string | number>> = [["구분", "계좌", "종목코드", "종목명", "수량", "평균매입가", "현재가", "투자원금", "평가금액", "평가손익", "수익률"]];
    groups.forEach((group) => {
      const accounts = group.accounts.length > 0 ? group.accounts : [{ name: "-", items: group.items, cash: group.cash }];
      accounts.forEach((account) => {
        account.items.forEach((item) => rows.push([group.category, account.name, item.code ?? "", item.name, item.quantity, item.avgPrice, item.currentPrice, item.investAmount, item.currentValue, item.profitLoss, item.returnRate]));
        if (account.cash !== 0) rows.push([group.category, account.name, "", "현금", 1, account.cash, account.cash, account.cash, account.cash, 0, 0]);
      });
    });
    downloadCsv(`자산현황_${dateKey}.csv`, rows);
  }

  function exportPerformance() {
    const indexByDate = new Map(buildPerformancePoints(logs, events).map((point) => [point.date, point.index]));
    const rows: Array<Array<string | number>> = [["날짜", "총자산", "주식", "연금", "투자성과지수"]];
    [...logs].sort((left, right) => left.date.localeCompare(right.date)).forEach((log) => rows.push([
      log.date, log.total.total, log.stocks.total, log.pension.total, Number((indexByDate.get(log.date) ?? 100).toFixed(6)),
    ]));
    downloadCsv(`자산성과_${dateKey}.csv`, rows);
  }

  return (
    <section className="mb-6 px-4 md:px-0" aria-label="내보내기">
      <div className="rounded-xl border border-[#e0e0e0] bg-white p-4 dark:border-[#2a3a4a] dark:bg-[#1a2332]">
        <div className="mb-3"><h2 className="text-sm font-semibold text-[#3d47cf]">내보내기</h2><p className="mt-0.5 text-[11px] text-gray-400">원본 데이터 보관과 정기 보고용</p></div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={exportAssets} className="rounded-md border border-[#d6d9e0] px-2 py-2 text-xs font-semibold text-gray-600 dark:border-[#3a4658] dark:text-gray-300">자산 CSV</button>
          <button type="button" onClick={exportPerformance} className="rounded-md border border-[#d6d9e0] px-2 py-2 text-xs font-semibold text-gray-600 dark:border-[#3a4658] dark:text-gray-300">성과 CSV</button>
          <button type="button" onClick={() => window.print()} className="rounded-md bg-[#3d47cf] px-2 py-2 text-xs font-semibold text-white">PDF 보고서</button>
        </div>
      </div>
    </section>
  );
}

export function PrintablePortfolioReport({ groups, logs, events }: { groups: AssetGroup[]; logs: DailyLogItem[]; events: PortfolioEvent[] }) {
  const totalValue = groups.reduce((sum, group) => sum + group.totalValue, 0);
  const totalInvest = groups.reduce((sum, group) => sum + group.totalInvest, 0);
  const totalProfit = groups.reduce((sum, group) => sum + group.totalProfitLoss, 0);
  const performance = buildPerformancePoints(logs, events);
  const cumulativeReturn = performance.length > 1 ? ((performance.at(-1)!.index / performance[0].index) - 1) * 100 : 0;
  return (
    <article className="print-report">
      <header><h1>자산 현황 보고서</h1><p>{new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 기준</p></header>
      <section className="print-summary"><div><span>총자산</span><strong>{formatKRW(totalValue)}</strong></div><div><span>평가손익</span><strong>{formatKRW(totalProfit)}</strong></div><div><span>수익률</span><strong>{formatRate(totalInvest > 0 ? (totalProfit / totalInvest) * 100 : 0)}</strong></div><div><span>기간 성과</span><strong>{formatRate(cumulativeReturn)}</strong></div></section>
      <h2>자산 구성</h2>
      <table><thead><tr><th>구분</th><th>투자원금</th><th>평가금액</th><th>평가손익</th><th>수익률</th></tr></thead><tbody>{groups.map((group) => <tr key={group.category}><td>{group.category}</td><td>{formatKRW(group.totalInvest)}</td><td>{formatKRW(group.totalValue)}</td><td>{formatKRW(group.totalProfitLoss)}</td><td>{formatRate(group.returnRate)}</td></tr>)}</tbody></table>
      <h2>계좌별 현황</h2>
      <table><thead><tr><th>구분</th><th>계좌</th><th>평가금액</th><th>평가손익</th><th>수익률</th></tr></thead><tbody>{groups.flatMap((group) => group.accounts.map((account) => <tr key={`${group.category}-${account.name}`}><td>{group.category}</td><td>{account.name}</td><td>{formatKRW(account.totalValue)}</td><td>{formatKRW(account.totalProfitLoss)}</td><td>{formatRate(account.returnRate)}</td></tr>))}</tbody></table>
      <footer>입출금 및 평가조정은 기간 성과 계산에서 제외됩니다.</footer>
    </article>
  );
}
