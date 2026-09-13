import assert from "node:assert/strict";
import test from "node:test";
import { buildNhPlugSyncOperations } from "../lib/nhplug-sync-apply";
import type { NhPlugSyncPreview } from "../lib/nhplug-types";

const candidate = {
  accountLabels: ["NH ···· 7187"],
  code: "005930",
  name: "삼성전자",
  market: "domestic" as const,
  nhQuantity: 10,
  nhAveragePrice: 70000,
};

test("신규 종목은 추가 작업으로 계획한다", () => {
  const sync: NhPlugSyncPreview = {
    total: 1, newCount: 1, quantityMismatchCount: 0, averagePriceMismatchCount: 0, matchedCount: 0, invalidCount: 0,
    candidates: [{ ...candidate, key: "domestic:005930", status: "new" }],
  };
  const operations = buildNhPlugSyncOperations(sync, [], ["domestic:005930"]);
  assert.equal(operations[0]?.kind, "create");
});

test("단일 시장가 종목만 수량 차이를 갱신한다", () => {
  const sync: NhPlugSyncPreview = {
    total: 1, newCount: 0, quantityMismatchCount: 1, averagePriceMismatchCount: 0, matchedCount: 0, invalidCount: 0,
    candidates: [{ ...candidate, key: "domestic:005930", status: "quantity_mismatch", dashboardQuantity: 8, dashboardAveragePrice: 70000 }],
  };
  const operations = buildNhPlugSyncOperations(sync, [{ id: 7, code: "005930.KS", name: "삼성전자", quantity: 8, avg_price: 70000, valuation_mode: "market" }], ["domestic:005930"]);
  assert.deepEqual(operations[0], { kind: "update", candidate: sync.candidates[0], assetId: 7, quantity: 10, averagePrice: undefined });
});

test("중복 또는 직접평가 종목은 자동 반영하지 않는다", () => {
  const sync: NhPlugSyncPreview = {
    total: 1, newCount: 0, quantityMismatchCount: 1, averagePriceMismatchCount: 0, matchedCount: 0, invalidCount: 0,
    candidates: [{ ...candidate, key: "domestic:005930", status: "quantity_mismatch", dashboardQuantity: 8, dashboardAveragePrice: 70000 }],
  };
  const operations = buildNhPlugSyncOperations(sync, [
    { id: 7, code: "005930.KS", name: "삼성전자", quantity: 8, avg_price: 70000, valuation_mode: "market" },
    { id: 8, code: "005930", name: "삼성전자", quantity: 1, avg_price: 70000, valuation_mode: "market" },
  ], ["domestic:005930"]);
  assert.equal(operations[0]?.kind, "skip");
});
