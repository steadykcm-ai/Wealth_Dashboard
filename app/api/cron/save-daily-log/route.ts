import { calculateDailyLog, saveDailyLog } from "@/lib/daily-calculator";

export async function GET() {
  try {
    console.log("🕐 Daily log 저장 시작...");

    const dailyData = await calculateDailyLog();
    console.log("📊 계산된 데이터:", dailyData);

    const success = await saveDailyLog();

    if (success) {
      console.log("✅ Daily log 저장 성공");
      return Response.json({ message: "Daily log 저장 완료", data: dailyData }, { status: 200 });
    } else {
      console.log("❌ Daily log 저장 실패");
      return Response.json({ error: "Daily log 저장 실패" }, { status: 500 });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("❌ 에러:", errorMsg, error);
    return Response.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
