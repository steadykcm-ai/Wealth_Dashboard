"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssetsApiResponse } from "@/lib/types";

interface UseAssetsResult {
  data: AssetsApiResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAssets(): UseAssetsResult {
  const [data, setData] = useState<AssetsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (bust = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = bust ? `/api/assets?_t=${Date.now()}` : "/api/assets";
      const res = await fetch(url, bust ? { cache: "no-store" } : undefined);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AssetsApiResponse;
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: () => fetchData(true) };
}
