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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crypto");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as CryptoApiResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
