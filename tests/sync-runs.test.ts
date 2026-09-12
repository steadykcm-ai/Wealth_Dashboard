import assert from "node:assert/strict";
import test from "node:test";
import { getSyncRunTimeoutMs, isSyncRunStale } from "../lib/sync-runs";

const NOW = new Date("2026-09-13T12:00:00.000Z");

test("작업별 실행 제한 시간을 반환한다", () => {
  assert.equal(getSyncRunTimeoutMs("prices"), 20 * 60 * 1000);
  assert.equal(getSyncRunTimeoutMs("daily_log"), 10 * 60 * 1000);
  assert.equal(getSyncRunTimeoutMs("benchmarks"), 20 * 60 * 1000);
});

test("제한 시간을 넘긴 running 작업을 오래된 실행으로 판정한다", () => {
  assert.equal(isSyncRunStale("daily_log", "2026-09-13T11:49:59.000Z", NOW), true);
  assert.equal(isSyncRunStale("daily_log", "2026-09-13T11:50:00.000Z", NOW), false);
  assert.equal(isSyncRunStale("prices", "invalid-date", NOW), true);
});
