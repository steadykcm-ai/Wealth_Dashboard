import type { RetirementSettings } from "@/lib/types";

export interface RetirementScenarioResult {
  label: string;
  annualReturn: number;
  projectedAssets: number;
  targetAssets: number;
  monthlyIncome: number;
  fundingRate: number;
  depletionAge: number | null;
  bridgeGap: number;
  projectedStockAssets: number;
  projectedPensionAssets: number;
}

export type NumericRetirementSettingKey = Exclude<keyof RetirementSettings, "withdrawalPriority" | "updatedAt">;

export function calculateRetirementScenario(
  stockAssets: number,
  pensionAssets: number,
  settings: RetirementSettings,
  returnAdjustment: number,
  label: string
): RetirementScenarioResult {
  const annualReturn = settings.expectedReturnRate + returnAdjustment;
  const realAnnualRate = (1 + annualReturn / 100) / (1 + settings.inflationRate / 100) - 1;
  const monthlyRate = Math.pow(1 + realAnnualRate, 1 / 12) - 1;
  const savingMonths = Math.max(0, (settings.retirementAge - settings.currentAge) * 12);
  const retirementMonths = Math.max(1, (settings.lifeExpectancy - settings.retirementAge) * 12);
  const savingGrowth = Math.pow(1 + monthlyRate, savingMonths);
  const contributionFactor = Math.abs(monthlyRate) < 0.000001
    ? savingMonths
    : (savingGrowth - 1) / monthlyRate;
  const pensionContribution = settings.monthlyContribution * (settings.pensionContributionRatio / 100);
  const stockContribution = settings.monthlyContribution - pensionContribution;
  const projectedStockAssets = Math.max(0, stockAssets * savingGrowth + stockContribution * contributionFactor);
  const projectedPensionAssets = Math.max(0, pensionAssets * savingGrowth + pensionContribution * contributionFactor);
  const projectedAssets = projectedStockAssets + projectedPensionAssets;
  const monthlyGap = Math.max(0, settings.monthlyLivingCost - settings.publicPensionMonthly);
  const annuityFactor = Math.abs(monthlyRate) < 0.000001
    ? retirementMonths
    : (1 - Math.pow(1 + monthlyRate, -retirementMonths)) / monthlyRate;
  const targetAssets = Math.max(0, monthlyGap * annuityFactor);
  const sustainableWithdrawal = annuityFactor > 0 ? projectedAssets / annuityFactor : 0;
  let stockBalance = projectedStockAssets;
  let pensionBalance = projectedPensionAssets;
  let bridgeGap = 0;
  let depletionAge: number | null = null;
  for (let month = 0; month < retirementMonths; month += 1) {
    const age = settings.retirementAge + month / 12;
    stockBalance *= 1 + monthlyRate;
    pensionBalance *= 1 + monthlyRate;
    stockBalance += settings.monthlyContributionAfterRetirement;
    const publicPension = age >= settings.publicPensionStartAge ? settings.publicPensionMonthly : 0;
    let requiredWithdrawal = Math.max(0, settings.monthlyLivingCost - publicPension);
    if (age < settings.publicPensionStartAge) bridgeGap += requiredWithdrawal;

    const takeFromStock = (amount: number) => {
      const withdrawn = Math.min(stockBalance, amount);
      stockBalance -= withdrawn;
      return amount - withdrawn;
    };
    const takeFromPension = (amount: number) => {
      if (age < settings.privatePensionStartAge) return amount;
      const withdrawn = Math.min(pensionBalance, amount);
      pensionBalance -= withdrawn;
      return amount - withdrawn;
    };
    if (settings.withdrawalPriority === "pension_first") {
      requiredWithdrawal = takeFromStock(takeFromPension(requiredWithdrawal));
    } else if (settings.withdrawalPriority === "taxable_first") {
      requiredWithdrawal = takeFromPension(takeFromStock(requiredWithdrawal));
    } else {
      const totalBalance = stockBalance + (age >= settings.privatePensionStartAge ? pensionBalance : 0);
      const stockShare = totalBalance > 0 ? stockBalance / totalBalance : 1;
      const stockNeed = requiredWithdrawal * stockShare;
      const pensionNeed = requiredWithdrawal - stockNeed;
      requiredWithdrawal = takeFromStock(stockNeed) + takeFromPension(pensionNeed);
      requiredWithdrawal = takeFromStock(takeFromPension(requiredWithdrawal));
    }
    if (requiredWithdrawal > 1 && depletionAge === null) depletionAge = age;
  }

  return {
    label,
    annualReturn,
    projectedAssets,
    targetAssets,
    monthlyIncome: sustainableWithdrawal + settings.publicPensionMonthly,
    fundingRate: targetAssets > 0 ? (projectedAssets / targetAssets) * 100 : 100,
    depletionAge,
    bridgeGap,
    projectedStockAssets,
    projectedPensionAssets,
  };
}
