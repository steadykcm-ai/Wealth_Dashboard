import { saveDailyLog } from "@/lib/daily-calculator";

export async function GET() {
  try {
    console.log("🕐 Daily log 저장 시작...");

    // Jake의 user_id로 고정
    const OWNER_USER_ID = "56701cc8-3dff-405d-a2b7-1ff4301e92cc";

    const success = await saveDailyLog(OWNER_USER_ID);

    if (success) {
      console.log("✅ Daily log 저장 성공");
      return Response.json({ success: true, message: "Daily log 저장 완료" }, { status: 200 });
    } else {
      console.log("❌ Daily log 저장 실패 (자세한 내용은 서버 로그 참고)");
      return Response.json({ success: false, error: "Daily log 저장 실패 - 서버 로그 확인" }, { status: 500 });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ 예외 발생:", errorMsg, error);
    return Response.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
