export interface EconomicsInput {
  rent: number;
  maintenance: number;
  labor: number;
  otherFixed: number | null;
  insurance: number;
  variableCostRate: number | null;
  ownerPay: number | null;
  loanAmount: number;
  annualInterestRate: number | null;
  loanPrincipal: number | null;
  operatingDays: number | null;
  ticketPrice: number | null;
  expectedRevenue: number | null;
  targetProfit: number | null;
  availableCash: number | null;
  premium: number;
}

export interface RevenueScenario {
  label: string;
  revenue: number;
  variableCosts: number;
  operatingProfit: number;
  cashAfterOwner: number;
  dailyOrders: number | null;
}

export interface UnitEconomics {
  input: EconomicsInput;
  missing: string[];
  contributionRate: number | null;
  fixedOperatingCosts: number;
  monthlyInterest: number;
  fixedCashCosts: number;
  operatingBreakEven: number | null;
  cashBreakEven: number | null;
  targetRevenue: number | null;
  dailyTargetRevenue: number | null;
  dailyTargetOrders: number | null;
  scenarios: RevenueScenario[];
  revenueDown20Cash: number | null;
  variableCostUp5Cash: number | null;
  cashRunwayMonths: number | null;
  premiumPaybackMonths: number | null;
  rentReductionEffect: number | null;
}

const nonnegative = (n: number | null) => n !== null && Number.isFinite(n) && n >= 0;

/** Revenue and costs use a consistent, VAT-exclusive basis. This is a scenario,
 * not a sales forecast. Principal and owner drawings are cash uses, not expenses. */
export function calculateUnitEconomics(input: EconomicsInput): UnitEconomics {
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && !nonnegative(value)) throw new Error(`잘못된 손익 입력: ${key}`);
  }
  if (input.variableCostRate !== null && input.variableCostRate > 1) throw new Error('변동비율은 0~100%여야 합니다.');
  if (input.operatingDays !== null && (!Number.isInteger(input.operatingDays) || input.operatingDays < 1 || input.operatingDays > 31)) throw new Error('월 영업일은 1~31일이어야 합니다.');
  if (input.ticketPrice === 0) throw new Error('객단가는 0원보다 커야 합니다.');
  const missing: string[] = [];
  if (input.variableCostRate === null) missing.push('원재료·상품 원가와 판매 수수료를 합친 변동비율');
  if (input.otherFixed === null) missing.push('공과금·광고·보험 등 기타 고정 운영비');
  if (input.ownerPay === null) missing.push('사장님 월 생활비');
  if (input.loanAmount > 0 && input.annualInterestRate === null) missing.push('대출 연 이자율');
  if (input.loanAmount > 0 && input.loanPrincipal === null) missing.push('월 대출 원금 상환액');
  const contributionRate = input.variableCostRate !== null && input.variableCostRate < 1 ? 1 - input.variableCostRate : null;
  const monthlyInterest = Math.round(input.loanAmount * (input.annualInterestRate ?? 0) / 100 / 12);
  const fixedOperatingCosts = input.rent + input.maintenance + input.labor + (input.otherFixed ?? 0) + input.insurance;
  const fixedCashCosts = fixedOperatingCosts + monthlyInterest + (input.loanPrincipal ?? 0) + (input.ownerPay ?? 0);
  const operatingBreakEven = contributionRate === null ? null : Math.ceil(fixedOperatingCosts / contributionRate);
  const cashBreakEven = contributionRate === null ? null : Math.ceil(fixedCashCosts / contributionRate);
  const targetRevenue = contributionRate === null ? null : Math.ceil((fixedCashCosts + (input.targetProfit ?? 0)) / contributionRate);
  const dailyOrders = (revenue: number) => input.operatingDays && input.ticketPrice ? Math.ceil(revenue / input.operatingDays / input.ticketPrice) : null;
  const scenario = (revenue: number, label: string): RevenueScenario => {
    const variableCosts = Math.round(revenue * (input.variableCostRate ?? 0));
    return { label, revenue, variableCosts, operatingProfit: revenue - variableCosts - fixedOperatingCosts,
      cashAfterOwner: revenue - variableCosts - fixedCashCosts, dailyOrders: dailyOrders(revenue) };
  };
  const scenarios = contributionRate === null ? [] : input.expectedRevenue !== null
    ? [scenario(input.expectedRevenue * 0.8, '입력 매출 −20%'), scenario(input.expectedRevenue, '입력 매출'), scenario(input.expectedRevenue * 1.2, '입력 매출 +20%')]
    : cashBreakEven !== null ? [scenario(cashBreakEven * 0.8, '현금 손익분기 −20%'), scenario(cashBreakEven, '현금 손익분기'), scenario(cashBreakEven * 1.2, '현금 손익분기 +20%')] : [];
  const baseCash = input.expectedRevenue !== null && contributionRate !== null ? Math.round(input.expectedRevenue * contributionRate - fixedCashCosts) : null;
  const revenueDown20Cash = input.expectedRevenue !== null && contributionRate !== null ? Math.round(input.expectedRevenue * 0.8 * contributionRate - fixedCashCosts) : null;
  return {
    input, missing, contributionRate, fixedOperatingCosts, monthlyInterest, fixedCashCosts,
    operatingBreakEven, cashBreakEven, targetRevenue,
    dailyTargetRevenue: targetRevenue !== null && input.operatingDays ? Math.ceil(targetRevenue / input.operatingDays) : null,
    dailyTargetOrders: targetRevenue !== null ? dailyOrders(targetRevenue) : null,
    scenarios, revenueDown20Cash,
    variableCostUp5Cash: input.expectedRevenue !== null && contributionRate !== null ? Math.round(input.expectedRevenue * (contributionRate - 0.05) - fixedCashCosts) : null,
    cashRunwayMonths: revenueDown20Cash !== null && revenueDown20Cash < 0 && input.availableCash !== null ? input.availableCash / -revenueDown20Cash : null,
    premiumPaybackMonths: input.premium > 0 && baseCash !== null && baseCash > 0 ? input.premium / baseCash : null,
    rentReductionEffect: contributionRate !== null ? Math.ceil(100000 / contributionRate) : null,
  };
}
