"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatKRW } from "@/lib/number-format";
import type { BulkAssetUpdate, EditableAssetField } from "@/lib/asset-updates";
import type { AssetItem } from "@/lib/types";

type EditableItem = AssetItem & { id: number };
type DraftRow = Record<EditableAssetField, string>;
type DraftValues = Record<number, DraftRow>;

interface BulkEditingAccount {
  accountName: string;
  items: AssetItem[];
}

interface MobileBulkEditorProps {
  account: BulkEditingAccount | null;
  onClose: () => void;
  onSave: (changes: BulkAssetUpdate[]) => Promise<void>;
}

function hasAssetId(item: AssetItem): item is EditableItem {
  return Number.isInteger(item.id) && (item.id ?? 0) > 0;
}

function initialDraft(items: EditableItem[]): DraftValues {
  return Object.fromEntries(items.map((item) => [item.id, {
    quantity: `${item.quantity}`,
    avgPrice: `${item.avgPrice}`,
    manualInvestAmount: `${item.manualInvestAmount ?? item.investAmount}`,
    manualValue: `${item.manualValue ?? item.currentValue}`,
  }])) as DraftValues;
}

function positiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function signedKRW(value: number): string {
  if (value === 0) return formatKRW(0);
  return `${value > 0 ? "+" : "-"}${formatKRW(Math.abs(value))}`;
}

export function MobileBulkEditor({ account, onClose, onSave }: MobileBulkEditorProps) {
  const items = useMemo(() => account?.items.filter(hasAssetId) ?? [], [account]);
  const [draft, setDraft] = useState<DraftValues>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(initialDraft(items));
    setError(null);
  }, [items]);

  const analysis = useMemo(() => {
    const changes: BulkAssetUpdate[] = [];
    let invalidCount = 0;
    let valueDelta = 0;

    for (const item of items) {
      const row = draft[item.id];
      if (!row) continue;

      const updates: Partial<Record<EditableAssetField, number>> = {};
      if (item.valuationMode === "manual") {
        const investAmount = positiveNumber(row.manualInvestAmount);
        const manualValue = positiveNumber(row.manualValue);
        if (investAmount === null || manualValue === null) {
          invalidCount += 1;
          continue;
        }
        if (investAmount !== (item.manualInvestAmount ?? item.investAmount)) {
          updates.manualInvestAmount = investAmount;
        }
        if (manualValue !== (item.manualValue ?? item.currentValue)) {
          updates.manualValue = manualValue;
          valueDelta += manualValue - item.currentValue;
        }
      } else {
        const quantity = positiveNumber(row.quantity);
        const avgPrice = positiveNumber(row.avgPrice);
        if (quantity === null || avgPrice === null) {
          invalidCount += 1;
          continue;
        }
        if (quantity !== item.quantity) {
          updates.quantity = quantity;
          valueDelta += (quantity - item.quantity) * item.currentPrice;
        }
        if (avgPrice !== item.avgPrice) updates.avgPrice = avgPrice;
      }

      if (Object.keys(updates).length > 0) changes.push({ id: item.id, updates });
    }

    return { changes, invalidCount, valueDelta };
  }, [draft, items]);

  if (!account) return null;

  function updateValue(id: number, field: EditableAssetField, value: string) {
    setDraft((previous) => ({
      ...previous,
      [id]: { ...previous[id], [field]: value },
    }));
    setError(null);
  }

  function focusNextInput(current: HTMLInputElement) {
    const inputs = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>("[data-bulk-input]") ?? []);
    const next = inputs[inputs.indexOf(current) + 1];
    next?.focus();
    next?.select();
  }

  function requestClose() {
    if (analysis.changes.length > 0 && !window.confirm("저장하지 않은 변경을 취소할까요?")) return;
    onClose();
  }

  async function submit() {
    if (analysis.invalidCount > 0) {
      setError("모든 값은 0보다 큰 숫자여야 합니다.");
      return;
    }
    if (analysis.changes.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(analysis.changes);
      onClose();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#f8f9fc] dark:bg-[#0f1923] md:hidden" role="dialog" aria-modal="true" aria-labelledby="bulk-editor-title">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e0e0e0] bg-white px-4 dark:border-[#2a3a4a] dark:bg-[#172231]">
        <div className="min-w-0">
          <h2 id="bulk-editor-title" className="truncate text-base font-bold text-gray-900 dark:text-gray-100">{account.accountName}</h2>
          <p className="text-[11px] text-gray-500">{items.length}종목 일괄 수정</p>
        </div>
        <button type="button" aria-label="닫기" onClick={requestClose} disabled={saving} className="flex h-10 w-10 items-center justify-center text-2xl text-gray-500 disabled:opacity-50">×</button>
      </header>

      <div ref={formRef} className="min-h-0 flex-1 overflow-y-auto pb-4">
        {items.map((item) => {
          const row = draft[item.id];
          if (!row) return null;
          const manual = item.valuationMode === "manual";
          const fields: Array<{ field: EditableAssetField; label: string; value: string }> = manual
            ? [
                { field: "manualInvestAmount", label: "투자원금", value: row.manualInvestAmount },
                { field: "manualValue", label: "평가금액", value: row.manualValue },
              ]
            : [
                { field: "quantity", label: "수량", value: row.quantity },
                { field: "avgPrice", label: "평균매입가", value: row.avgPrice },
              ];

          return (
            <section key={item.id} className="border-b border-[#e0e0e0] bg-white px-4 py-4 dark:border-[#2a3a4a] dark:bg-[#172231]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
                  <p className="mt-0.5 text-[11px] text-gray-500">현재 {formatKRW(item.currentValue)}</p>
                </div>
                {manual && <span className="shrink-0 rounded-full bg-[#eef1ff] px-2 py-1 text-[10px] font-semibold text-[#3d47cf] dark:bg-[#202a48]">직접 평가</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(({ field, label, value }) => (
                  <label key={field} className="min-w-0 text-xs font-medium text-gray-500">
                    {label}
                    <input
                      data-bulk-input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={value}
                      onChange={(event) => updateValue(item.id, field, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        focusNextInput(event.currentTarget);
                      }}
                      aria-label={`${item.name} ${label}`}
                      className="mt-1.5 h-11 w-full min-w-0 rounded-md border border-[#d6d9e0] bg-white px-3 text-right text-base font-semibold text-gray-900 outline-none focus:border-[#3d47cf] focus:ring-1 focus:ring-[#3d47cf] dark:border-[#3a4658] dark:bg-[#0f1923] dark:text-gray-100"
                    />
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="shrink-0 border-t border-[#d6d9e0] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:border-[#2a3a4a] dark:bg-[#172231]">
        {error && <p role="alert" className="mb-2 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-600 dark:text-gray-300">변경 {analysis.changes.length}종목</span>
          <span className="font-semibold" style={{ color: analysis.valueDelta >= 0 ? "#f44336" : "#1565c0" }}>
            예상 자산 변동 {signedKRW(analysis.valueDelta)}
          </span>
        </div>
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <button type="button" onClick={requestClose} disabled={saving} className="h-11 rounded-md border border-[#d6d9e0] text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-[#3a4658] dark:text-gray-200">취소</button>
          <button type="button" onClick={() => void submit()} disabled={saving || analysis.invalidCount > 0 || analysis.changes.length === 0} className="h-11 rounded-md bg-[#3d47cf] text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "저장 중" : "변경사항 저장"}
          </button>
        </div>
      </footer>
    </div>
  );
}
