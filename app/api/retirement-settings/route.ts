import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { RetirementSettings } from "@/lib/types";

const DEFAULT_SETTINGS: RetirementSettings = {
  currentAge: 45,
  retirementAge: 60,
  lifeExpectancy: 90,
  monthlyContribution: 1_000_000,
  monthlyLivingCost: 3_000_000,
  publicPensionMonthly: 1_000_000,
  expectedReturnRate: 5,
  inflationRate: 2,
};

interface RetirementSettingsRow {
  current_age: number;
  retirement_age: number;
  life_expectancy: number;
  monthly_contribution: number;
  monthly_living_cost: number;
  public_pension_monthly: number;
  expected_return_rate: number;
  inflation_rate: number;
  updated_at: string;
}

function toSettings(row: RetirementSettingsRow): RetirementSettings {
  return {
    currentAge: Number(row.current_age),
    retirementAge: Number(row.retirement_age),
    lifeExpectancy: Number(row.life_expectancy),
    monthlyContribution: Number(row.monthly_contribution),
    monthlyLivingCost: Number(row.monthly_living_cost),
    publicPensionMonthly: Number(row.public_pension_monthly),
    expectedReturnRate: Number(row.expected_return_rate),
    inflationRate: Number(row.inflation_rate),
    updatedAt: row.updated_at,
  };
}

function isValidSettings(settings: RetirementSettings): boolean {
  return Number.isInteger(settings.currentAge)
    && Number.isInteger(settings.retirementAge)
    && Number.isInteger(settings.lifeExpectancy)
    && settings.currentAge >= 18
    && settings.retirementAge > settings.currentAge
    && settings.lifeExpectancy > settings.retirementAge
    && settings.lifeExpectancy <= 120
    && settings.monthlyContribution >= 0
    && settings.monthlyLivingCost >= 0
    && settings.publicPensionMonthly >= 0
    && settings.expectedReturnRate > -50
    && settings.expectedReturnRate <= 50
    && settings.inflationRate > -10
    && settings.inflationRate <= 30;
}

export async function GET() {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const { data, error } = await supabaseServer
      .from("retirement_settings")
      .select("current_age, retirement_age, life_expectancy, monthly_contribution, monthly_living_cost, public_pension_monthly, expected_return_rate, inflation_rate, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ settings: data ? toSettings(data as RetirementSettingsRow) : DEFAULT_SETTINGS });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "은퇴 설정을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabaseServer = await createSupabaseServer();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const body = await request.json() as Partial<RetirementSettings>;
    const settings: RetirementSettings = {
      currentAge: Number(body.currentAge),
      retirementAge: Number(body.retirementAge),
      lifeExpectancy: Number(body.lifeExpectancy),
      monthlyContribution: Number(body.monthlyContribution),
      monthlyLivingCost: Number(body.monthlyLivingCost),
      publicPensionMonthly: Number(body.publicPensionMonthly),
      expectedReturnRate: Number(body.expectedReturnRate),
      inflationRate: Number(body.inflationRate),
    };
    if (!isValidSettings(settings)) {
      return NextResponse.json({ error: "은퇴 설정 값이 올바르지 않습니다." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabaseServer
      .from("retirement_settings")
      .upsert({
        user_id: user.id,
        current_age: settings.currentAge,
        retirement_age: settings.retirementAge,
        life_expectancy: settings.lifeExpectancy,
        monthly_contribution: settings.monthlyContribution,
        monthly_living_cost: settings.monthlyLivingCost,
        public_pension_monthly: settings.publicPensionMonthly,
        expected_return_rate: settings.expectedReturnRate,
        inflation_rate: settings.inflationRate,
        updated_at: updatedAt,
      }, { onConflict: "user_id" })
      .select("current_age, retirement_age, life_expectancy, monthly_contribution, monthly_living_cost, public_pension_monthly, expected_return_rate, inflation_rate, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, settings: toSettings(data as RetirementSettingsRow) });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "은퇴 설정을 저장하지 못했습니다." },
      { status: 500 }
    );
  }
}
