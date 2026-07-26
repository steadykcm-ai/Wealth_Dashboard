"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssetsApiResponse } from "@/lib/types";

interface UseAssetsResult {
  data: AssetsApiResponse | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refetch: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useAssets(): UseAssetsResult {
  const [data, setData] = useState<AssetsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const refetch = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const priceResponse = await fetch("/api/cron/update-prices", { cache: "no-store" });
      if (!priceResponse.ok) {
        const body = (await priceResponse.json()) as { error?: string };
        throw new Error(body.error ?? `시세 동기화 실패 (HTTP ${priceResponse.status})`);
      }

      // 데이터는 반드시 새로고침
      await fetchData(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "새로고침 실패");
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  const reload = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refreshing, refetch, reload };
}
