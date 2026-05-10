import { NextRequest, NextResponse } from "next/server";
import { updateSheetCell, deleteSheetRow, insertSheetRow } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sheetTab: string;
      afterRowIndex: number;
      assetType: string;
      accountName: string;
      name: string;
      code: string;
      quantity: number;
      avgPrice: number;
    };
    const { sheetTab, afterRowIndex, assetType, accountName, name, code, quantity, avgPrice } = body;

    if (!sheetTab || !afterRowIndex || !assetType || !accountName || !name || !quantity || !avgPrice) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "수량은 0보다 커야 합니다" }, { status: 400 });
    }
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
      return NextResponse.json({ error: "매입가는 0보다 커야 합니다" }, { status: 400 });
    }

    await insertSheetRow(sheetTab, afterRowIndex, { assetType, accountName, name, code, quantity, avgPrice });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      sheetTab: string;
      rowIndex: number;
      field: "quantity" | "avgPrice" | "cash";
      value: number;
    };
    const { sheetTab, rowIndex, field, value } = body;

    if (!sheetTab || !rowIndex || !field || value === undefined) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "유효하지 않은 값" }, { status: 400 });
    }
    if (field !== "cash" && value <= 0) {
      return NextResponse.json({ error: "유효하지 않은 값" }, { status: 400 });
    }

    let column: string;
    if (field === "quantity") column = "E";
    else if (field === "avgPrice") column = "F";
    else if (field === "cash") column = "I";
    else throw new Error("지원하지 않는 필드");

    await updateSheetCell(sheetTab, rowIndex, column, value);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { sheetTab: string; rowIndex: number };
    const { sheetTab, rowIndex } = body;

    if (!sheetTab || !rowIndex) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    await deleteSheetRow(sheetTab, rowIndex);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "서버 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
