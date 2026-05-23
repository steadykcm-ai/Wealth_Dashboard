import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "이 라우트는 더 이상 사용되지 않습니다. /api/assets와 /api/crypto를 사용하세요." },
    { status: 410 }
  );
}
