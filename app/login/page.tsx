"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<any>(null);

  useEffect(() => {
    // 클라이언트 사이드에서만 Supabase 초기화
    async function initSupabase() {
      try {
        const { supabase: sb } = await import("@/lib/supabase-browser");
        setSupabase(sb);
      } catch (err) {
        console.error("Supabase 초기화 실패:", err);
        setError("로그인 시스템 초기화 실패");
      }
    }
    initSupabase();
  }, []);

  async function handleGoogleSignIn() {
    if (!supabase) {
      setError("로그인 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log("Google OAuth 시작...");
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      console.log("OAuth 응답:", { data, signInError });
      if (signInError) throw signInError;
    } catch (err: unknown) {
      console.error("로그인 에러:", err);
      const message = err instanceof Error ? err.message : "로그인 실패";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f1923" }}>
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-[#2a3a4a] shadow-xl p-8" style={{ background: "#1a2332" }}>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Wealth Dashboard</h1>
          <p className="text-sm text-gray-400">구글 계정으로 로그인하세요</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "#fee", color: "#c33" }}>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ background: "#3d47cf" }}
        >
          {loading ? "로그인 중..." : "Google로 로그인"}
        </button>

        <p className="text-xs text-gray-500 text-center mt-6">
          처음 로그인하면 자동으로 계정이 생성됩니다.
        </p>
      </div>
    </div>
  );
}
