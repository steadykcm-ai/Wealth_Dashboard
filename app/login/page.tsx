"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) throw signInError;
    } catch (err: unknown) {
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
