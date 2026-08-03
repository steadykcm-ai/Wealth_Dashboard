export type EditableAssetField = "quantity" | "avgPrice" | "manualInvestAmount" | "manualValue";
export type AssetUpdates = Partial<Record<EditableAssetField, number>>;

export interface BulkAssetUpdate {
  id: number;
  updates: AssetUpdates;
}

const EDITABLE_FIELDS: EditableAssetField[] = [
  "quantity",
  "avgPrice",
  "manualInvestAmount",
  "manualValue",
];

export function toAssetUpdateData(
  updates: AssetUpdates,
  valuationUpdatedAt = new Date().toISOString()
): Record<string, number | string> {
  const updateEntries = Object.entries(updates);
  if (updateEntries.length === 0) throw new Error("수정할 값이 없습니다.");

  const updateData: Record<string, number | string> = {};
  let updatesManualValuation = false;

  for (const [rawField, rawValue] of updateEntries) {
    if (!EDITABLE_FIELDS.includes(rawField as EditableAssetField)) {
      throw new Error("지원하지 않는 필드입니다.");
    }
    const field = rawField as EditableAssetField;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("수정 값은 0보다 큰 숫자여야 합니다.");
    }

    if (field === "quantity") updateData.quantity = value;
    if (field === "avgPrice") updateData.avg_price = value;
    if (field === "manualInvestAmount") {
      updateData.manual_invest_amount = value;
      updatesManualValuation = true;
    }
    if (field === "manualValue") {
      updateData.manual_value = value;
      updatesManualValuation = true;
    }
  }

  if (updatesManualValuation) updateData.valuation_updated_at = valuationUpdatedAt;
  return updateData;
}
