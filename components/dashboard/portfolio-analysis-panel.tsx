"use client";

import { useState } from "react";
import type { AssetGroup, DailyLogItem } from "@/lib/types";

export function PortfolioAnalysisPanel({
  group,
  logs,
  category,
}: {
  group: AssetGroup;
  logs: DailyLogItem[];
  category: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  async function handleAnalyze() {
    if (isAnalyzing || analysisText) return;
    setIsAnalyzing(true);
    setAnalysisText("");

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          group,
          logs,
        }),
      });

      if (!res.ok) {
        const error = await res.json() as { error?: string };
        setAnalysisText(`오류: ${error.error || "분석 생성 실패"}`);
        setIsAnalyzing(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setAnalysisText(accumulated);
      }

      setIsAnalyzing(false);
    } catch (err) {
      setAnalysisText(`오류: ${err instanceof Error ? err.message : "요청 실패"}`);
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="mt-6 px-4 md:px-0">
      <div
        className="rounded-xl border border-[#e0e0e0] dark:border-[#2a3a4a] bg-white dark:bg-[#1a2332] overflow-hidden"
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-[#f8f9fc] dark:bg-[#0f1923] border-b border-[#e0e0e0] dark:border-[#2a3a4a] cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#3d47cf" }}>
            🤖 AI 포트폴리오 분석
          </h3>
          <span className="text-lg" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            ▼
          </span>
        </div>

        {/* 본문 */}
        {isExpanded && (
          <div className="px-4 py-4 space-y-3">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !!analysisText}
              className="px-3 py-1.5 text-xs font-semibold rounded text-white"
              style={{
                background: isAnalyzing || analysisText ? "#ccc" : "#3d47cf",
                cursor: isAnalyzing || analysisText ? "not-allowed" : "pointer",
              }}
            >
              {isAnalyzing ? "⏳ 분석 중..." : analysisText ? "분석 완료" : "분석 요청"}
            </button>

            {analysisText && (
              <div
                className="mt-3 p-3 rounded-md bg-[#f0f2f8] dark:bg-[#0f1923] text-xs leading-relaxed whitespace-pre-wrap"
                style={{ color: "#333", maxHeight: "600px", overflowY: "auto" }}
              >
                <MarkdownContent text={analysisText} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 간단한 마크다운 렌더러
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-2" />;
        }
        if (line.startsWith("###")) {
          const title = line.replace(/^#+\s*/, "");
          return (
            <h3 key={idx} className="text-xs font-bold mt-3 mb-1" style={{ color: "#3d47cf" }}>
              {title}
            </h3>
          );
        }
        if (line.startsWith("##")) {
          const title = line.replace(/^#+\s*/, "");
          return (
            <h2 key={idx} className="text-xs font-bold mt-2 mb-1" style={{ color: "#3d47cf" }}>
              {title}
            </h2>
          );
        }
        // **bold** 처리
        const styled = line
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/- /g, "• ");
        return (
          <div key={idx} className="text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: styled }} />
        );
      })}
    </>
  );
}
