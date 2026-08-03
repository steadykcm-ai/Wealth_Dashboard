import assert from "node:assert/strict";
import test from "node:test";
import { toAssetUpdateData } from "../lib/asset-updates";
import type { AssetUpdates } from "../lib/asset-updates";

test("시장가 종목 수정 값을 데이터베이스 필드로 변환한다", () => {
  assert.deepEqual(toAssetUpdateData({ quantity: 12.5, avgPrice: 32000 }), {
    quantity: 12.5,
    avg_price: 32000,
  });
});

test("직접 평가 종목을 수정하면 평가 기준 시각을 함께 기록한다", () => {
  const updatedAt = "2026-08-03T01:02:03.000Z";
  assert.deepEqual(toAssetUpdateData({ manualInvestAmount: 1_000_000, manualValue: 1_200_000 }, updatedAt), {
    manual_invest_amount: 1_000_000,
    manual_value: 1_200_000,
    valuation_updated_at: updatedAt,
  });
});

test("빈 수정 값과 0 이하 값은 거부한다", () => {
  assert.throws(() => toAssetUpdateData({}), /수정할 값/);
  assert.throws(() => toAssetUpdateData({ quantity: 0 }), /0보다 큰 숫자/);
});

test("허용되지 않은 필드는 거부한다", () => {
  const unsupported = { accountName: 1 } as unknown as AssetUpdates;
  assert.throws(() => toAssetUpdateData(unsupported), /지원하지 않는 필드/);
});
