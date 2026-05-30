"use client";

import { useState, useEffect, useCallback } from "react";
import type { CryptoApiResponse } from "@/lib/types";

interface UseCryptoResult {
  data: CryptoApiResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCrypto(): UseCryptoResult {
  const [data, setData] = useState<CryptoApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    let hasCache = false;

    // 1. 캐시된 데이터 먼저 로드 (이전 데이터)
    try {
      const cached = sessionStorage.getItem("crypto-cache");
      if (cached) {
        const cachedData = JSON.parse(cached) as CryptoApiResponse;
        setData(cachedData);
        setLoading(false);
        hasCache = true;
      }
    } catch (e) {
      // 캐시 파싱 실패 무시
    }

    // 2. 새로운 데이터를 백그라운드에서 로드
    try {
      const res = await fetch("/api/crypto");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const newData = (await res.json()) as CryptoApiResponse;
      setData(newData);

      // 캐시 저장
      sessionStorage.setItem("crypto-cache", JSON.stringify(newData));
      setLoading(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "알 수 없는 오류";
      setError(errorMsg);

      if (!hasCache) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
