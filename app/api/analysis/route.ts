import { NextRequest, NextResponse } from "next/server";
import type {
  AccountGroup,
  AssetGroup,
  AssetItem,
  DailyLogItem,
} from "@/lib/types";
import { formatKRW, formatRate } from "@/lib/profit-calculator";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isDashboardOwner } from "@/lib/auth-config";

export const runtime = "nodejs";

interface AnalysisRequestBody {
  category: string;
  group: AssetGroup;
  logs: DailyLogItem[];
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GeminiErrorResponse {
  error?: {
    message?: string;
  };
}

interface WeeklyPoint {
  date: string;
  value: number;
  change: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    if (!isDashboardOwner(user.id)) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 250_000) {
      return NextResponse.json({ error: "분석 요청이 너무 큽니다." }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY가 설정되지 않았습니다. 환경변수를 확인해주세요." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as AnalysisRequestBody;
    if (
      typeof body.category !== "string"
      || !body.group
      || !Array.isArray(body.group.items)
      || !Array.isArray(body.group.accounts)
      || !Array.isArray(body.logs)
      || JSON.stringify(body).length > 250_000
    ) {
      return NextResponse.json({ error: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const prompt = buildAnalysisPrompt(body.category, body.group, body.logs);
    const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1400,
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as GeminiErrorResponse | null;
      const message = errorBody?.error?.message || `Gemini API 오류 (${response.status})`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = (await response.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "Gemini 응답에 분석 결과가 없습니다." },
        { status: 502 }
      );
    }

    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "분석 생성 실패" },
      { status: 500 }
    );
  }
}

function buildAnalysisPrompt(
  category: string,
  group: AssetGroup,
  logs: DailyLogItem[]
): string {
  const totalValue = group.totalValue || 1;
  const topByValue = sortItems(group.items, (item) => item.currentValue).slice(0, 10);
  const topWinners = sortItems(group.items, (item) => item.profitLoss).slice(0, 5);
  const topLosers = sortItems(group.items, (item) => -item.profitLoss).slice(0, 5);
  const accounts = group.accounts
    .slice()
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((account) => formatAccountLine(account, totalValue))
    .join("\n");
  const weeklyTrend = getWeeklyTrend(logs)
    .map(
      (point) =>
        `- ${point.date}: ${formatKRW(point.value)} / 변화 ${formatSignedKRW(point.change)}`
    )
    .join("\n");

  return `당신은 개인 투자 포트폴리오를 점검하는 분석 도우미입니다.
아래 데이터는 전체 원장이 아니라 토큰 절약을 위해 요약한 핵심 데이터입니다.
투자 자문, 매수/매도 지시, 수익 보장 표현을 하지 마세요.
사용자가 스스로 판단할 수 있도록 리스크, 쏠림, 확인할 질문을 정리하세요.

## 표현 규칙
- "매수하세요", "매도하세요", "교체하세요", "축소하세요", "확대하세요"처럼 행동을 지시하지 마세요.
- "검토할 수 있습니다", "점검이 필요합니다", "관찰 후보입니다", "비중 확인 대상입니다"처럼 보수적으로 표현하세요.
- 특정 종목을 추천 종목처럼 포장하지 말고, 데이터상 비중/손익/변동성 관찰 대상으로만 언급하세요.
- 외부 시황, 재무제표, 실시간 뉴스는 제공되지 않았으므로 추정하지 마세요.
- 답변 첫머리에 "투자 조언이 아닌 포트폴리오 점검용 요약입니다."라고 적으세요.

## 전체 요약
- 카테고리: ${category}
- 보유 종목 수: ${group.items.length}
- 계좌 수: ${group.accounts.length}
- 투자 원금: ${formatKRW(group.totalInvest)}
- 현재 평가액: ${formatKRW(group.totalValue)}
- 현금: ${formatKRW(group.cash)}
- 평가손익: ${formatSignedKRW(group.totalProfitLoss)}
- 수익률: ${formatRate(group.returnRate)}

## 계좌별 요약
${accounts || "- 계좌 데이터 없음"}

## 평가액 상위 종목
${formatItemLines(topByValue, totalValue)}

## 수익 기여 상위
${formatItemLines(topWinners, totalValue)}

## 손실 기여 상위
${formatItemLines(topLosers, totalValue)}

## 최근 자산 추이
${weeklyTrend || "- 추이 데이터 없음"}

## 답변 형식
### 1. 현재 상태 한 줄 점검
### 2. 집중 리스크
### 3. 비중 점검 후보
### 4. 다음 확인 질문 3개

한국어로 간결하게 작성하세요. 각 항목은 짧은 bullet 위주로 쓰고, 결론을 단정하지 마세요.`;
}

function sortItems(
  items: AssetItem[],
  score: (item: AssetItem) => number
): AssetItem[] {
  return items.slice().sort((a, b) => score(b) - score(a));
}

function formatItemLines(items: AssetItem[], totalValue: number): string {
  if (items.length === 0) {
    return "- 데이터 없음";
  }

  return items
    .map((item) => {
      const weight = ((item.currentValue / totalValue) * 100).toFixed(1);
      const sector = item.sector ? ` / ${item.sector}` : "";
      return `- ${item.name}${sector}: 비중 ${weight}%, 평가액 ${formatKRW(item.currentValue)}, 손익 ${formatSignedKRW(item.profitLoss)}, 수익률 ${formatRate(item.returnRate)}`;
    })
    .join("\n");
}

function formatAccountLine(account: AccountGroup, totalValue: number): string {
  const weight = ((account.totalValue / totalValue) * 100).toFixed(1);
  return `- ${account.name}: 비중 ${weight}%, 평가액 ${formatKRW(account.totalValue)}, 현금 ${formatKRW(account.cash)}, 손익 ${formatSignedKRW(account.totalProfitLoss)}, 수익률 ${formatRate(account.returnRate)}`;
}

function formatSignedKRW(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatKRW(value)}`;
}

function getWeeklyTrend(logs: DailyLogItem[]): WeeklyPoint[] {
  if (logs.length === 0) return [];

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const recentLogs = sortedLogs.slice(-28);
  const step = Math.max(1, Math.ceil(recentLogs.length / 7));

  const points: WeeklyPoint[] = [];
  for (let i = 0; i < recentLogs.length; i += step) {
    const log = recentLogs[i];
    const prevLog = points.length > 0 ? recentLogs[Math.max(0, i - step)] : null;
    const value = log.total.total;
    const change = prevLog ? value - prevLog.total.total : 0;

    points.push({
      date: log.date,
      value,
      change,
    });
  }

  return points.slice(-8);
}
