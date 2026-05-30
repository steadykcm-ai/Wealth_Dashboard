"use client";

import { useState, FormEvent } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowser();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (err) {
        setError(err.message || "Magic Link 전송 실패");
      } else {
        setMessage("이메일을 확인하고 Magic Link를 클릭해주세요");
        setEmail("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1923] px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-[#e0e0e0] dark:border-[#2a3a4a] shadow-xl p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Wealth Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              이메일로 로그인하세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-[#e0e0e0] dark:border-[#2a3a4a] bg-[#f8f9fc] dark:bg-[#0f1923] text-gray-900 dark:text-white placeholder-gray-400 text-sm outline-none focus:border-[#3d47cf] disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 p-3">
                <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {message && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 p-3">
                <p className="text-xs text-blue-700 dark:text-blue-400">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-lg font-semibold text-white transition-all disabled:opacity-50"
              style={{
                background: loading || !email.trim() ? "#999" : "#3d47cf",
              }}
            >
              {loading ? "전송 중..." : "Magic Link 전송"}
            </button>
          </form>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
            이메일을 입력하면 로그인 링크를 보내드립니다
          </p>
        </div>
      </div>
    </div>
  );
}
