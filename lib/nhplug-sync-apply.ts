import { normalizeNhPlugCode, type NhPlugDashboardAsset } from "@/lib/nhplug-sync-preview";
import type { NhPlugSyncCandidate, NhPlugSyncPreview } from "@/lib/nhplug-types";

export interface NhPlugSyncWritableAsset extends NhPlugDashboardAsset {
  valuation_mode?: "market" | "manual" | null;
}

export interface NhPlugCreateOperation {
  kind: "create";
  candidate: NhPlugSyncCandidate;
}

export interface NhPlugUpdateOperation {
  kind: "update";
  candidate: NhPlugSyncCandidate;
  assetId: number;
  quantity?: number;
  averagePrice?: number;
}

export interface NhPlugSkipOperation {
  kind: "skip";
  candidate: NhPlugSyncCandidate;
  reason: string;
}

export type NhPlugSyncOperation = NhPlugCreateOperation | NhPlugUpdateOperation | NhPlugSkipOperation;

export function buildNhPlugSyncOperations(
  sync: NhPlugSyncPreview,
  assets: readonly NhPlugSyncWritableAsset[],
  selectedKeys: readonly string[]
): NhPlugSyncOperation[] {
  const selected = new Set(selectedKeys);

  return sync.candidates.flatMap<NhPlugSyncOperation>((candidate) => {
    if (!selected.has(candidate.key)) return [];
    if (candidate.status === "invalid" || candidate.status === "matched") {
      return [{ kind: "skip", candidate, reason: "현재 상태에서는 반영할 변경이 없습니다." }];
    }
    if (candidate.status === "new") return [{ kind: "create", candidate }];

    const matchedAssets = assets.filter((asset) => (
      normalizeNhPlugCode(asset.code ?? "") === candidate.code
    ));
    if (matchedAssets.length !== 1) {
      return [{ kind: "skip", candidate, reason: "같은 종목이 대시보드에 여러 건이라 자동 반영하지 않았습니다." }];
    }

    const asset = matchedAssets[0];
    if (asset.valuation_mode === "manual") {
      return [{ kind: "skip", candidate, reason: "직접평가 종목은 자동 반영하지 않았습니다." }];
    }

    return [{
      kind: "update",
      candidate,
      assetId: asset.id,
      quantity: candidate.status === "quantity_mismatch" ? candidate.nhQuantity : undefined,
      averagePrice: candidate.status === "average_price_mismatch" ? candidate.nhAveragePrice : undefined,
    }];
  });
}
