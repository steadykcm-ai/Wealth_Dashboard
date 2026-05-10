import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { AssetGroup, DailyLogItem } from "@/lib/types";
import { formatKRW, formatRate } from "@/lib/profit-calculator";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에서 확인해주세요." },
        { status: 500 }
      );
    }

    const body = await req.json() as {
      category: string;
      group: AssetGroup;
      logs: DailyLogItem[];
    };

    const { category, group, logs } = body;

    // 프롬프트 구성
    const prompt = buildAnalysisPrompt(category, group, logs);

    // Claude 스트리밍 호출
    const client = new Anthropic({ apiKey });
    const stream = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: true,
    });

    // ReadableStream으로 변환
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              if (text) {
                controller.enqueue(text);
              }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("Analysis API error:", err);
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
  // 종목 정보 포맷팅
  const itemsInfo = group.items
    .map((item) => {
      const weight = ((item.currentValue / group.totalValue) * 100).toFixed(1);
      const sector = item.sector ? ` (${item.sector})` : "";
      return `- ${item.name}${sector}: 비중 ${weight}%, 수익률 ${formatRate(item.returnRate)}`;
    })
    .join("\n");

  // 계좌별 요약
  const accountsInfo = group.accounts
    .map((acc) => `- ${acc.name}: ${formatKRW(acc.totalValue)} (수익률 ${formatRate(acc.returnRate)})`)
    .join("\n");

  // 시계열 추이 요약 (최근 90일, 주 단위)
  const weeklyTrend = getWeeklyTrend(logs);
  const trendInfo = weeklyTrend
    .map(
      (w) =>
        `${w.date}: ${formatKRW(w.value)} (변화: ${w.change > 0 ? "+" : ""}${formatKRW(w.change)})`
    )
    .join("\n");

  const prompt = `당신은 전문적인 금융 포트폴리오 분석가입니다. 다음 ${category} 포트폴리오를 분석해주세요.

## 포트폴리오 개요
- 카테고리: ${category}
- 총 투자금: ${formatKRW(group.totalInvest)}
- 평가액: ${formatKRW(group.totalValue)}
- 수익금: ${formatKRW(group.totalProfitLoss)}
- 수익률: ${formatRate(group.returnRate)}

## 보유 종목
${itemsInfo || "보유 종목 없음"}

## 계좌별 구성
${accountsInfo || "계좌 정보 없음"}

## 최근 90일 자산 추이 (주 단위)
${trendInfo || "데이터 없음"}

## 분석 요청 사항

다음 세 가지를 순서대로 분석해주세요:

### 1. 섹터 분산 분석
현재 포트폴리오의 섹터 집중도를 평가하세요. 고위험 집중도가 있는지, 충분히 분산되어 있는지 판단해주세요.

### 2. 리밸런싱 제안
현재 구성 기반으로 포트폴리오 균형을 개선하기 위한 구체적인 리밸런싱 방안을 제안해주세요.
- 추가 진출해야 할 섹터나 자산 유형
- 감소시켜야 할 비중이 높은 항목
- 목표 비중 제안

### 3. 매수/매도 종목 제안
현재 포트폴리오 기반으로 구체적인 매수 또는 매도를 검토해야 할 종목을 제안해주세요.
- 추가 매수 검토 대상 (이유 포함)
- 정리/감액 검토 대상 (이유 포함)

답변은 한국어로 마크다운 형식으로 작성해주세요.`;

  return prompt;
}

interface WeeklyPoint {
  date: string;
  value: number;
  change: number;
}

function getWeeklyTrend(logs: DailyLogItem[]): WeeklyPoint[] {
  if (logs.length === 0) return [];

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const points: WeeklyPoint[] = [];
  for (let i = 0; i < sortedLogs.length; i += 7) {
    const log = sortedLogs[i];
    const value = log.total.total;
    const prevLog = i >= 7 ? sortedLogs[i - 7] : null;
    const change = prevLog ? value - prevLog.total.total : 0;

    points.push({
      date: log.date,
      value,
      change,
    });
  }

  // 최대 13개 포인트만 반환 (90일 ≈ 13주)
  return points.slice(-13);
}
