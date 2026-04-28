/**
 * financialPressureAnalysis.ts
 *
 * Financial Pressure 4개 세부 지표 계산 모듈.
 * 창업자가 "감당 가능한 비용 구조인지" 판단할 수 있는 근거를 제공합니다.
 *
 * ⚠️ 이 모듈은 월세·보증금·권리금의 '적정/부적정'을 단정하지 않습니다.
 *    대신 '부담률', '유동성 부담', '회수 예상 기간' 등 중립적 표현을 사용합니다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialPressureInput {
  /** 월세 (원) */
  monthlyRent: number;
  /** 보증금 (원) */
  deposit: number;
  /** 권리금 (원) */
  premium: number;
  /** 예상/입력 월매출 (원). 없으면 0 */
  estimatedMonthlyRevenue: number;
  /** 월 고정비 합계 (원). 없으면 monthlyRent 기반 추정 */
  estimatedMonthlyFixedCost?: number;
  /** 업종별 순이익률 (0~1). industryProfiles.margin 값 */
  industryNetMargin?: number;
  /** 안정권 임대료 비율 기준 (기본 0.12) */
  targetRentRatio?: number;
}

/** 단계 레벨 (UI 배지 색상에 사용) */
export type FPLevel = 'stable' | 'adequate' | 'caution' | 'risk';

export interface FPIndicator {
  value: number | null;
  level: FPLevel;
  label: string;
  isEstimated: boolean;
}

export interface FinancialPressureConfidenceFlags {
  rentIsEstimated: boolean;
  depositIsEstimated: boolean;
  premiumIsEstimated: boolean;
  revenueIsEstimated: boolean;
  fixedCostIsEstimated: boolean;
  netProfitIsEstimated: boolean;
}

export interface FinancialPressureResult {
  // ── 원본 입력값 (추정 포함) ────────────────────────────────────────────
  monthlyRent: number;
  deposit: number;
  premium: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlyFixedCost: number;
  estimatedMonthlyNetProfit: number;

  // ── 역산된 안정권 진입 필요 월매출 ────────────────────────────────────
  targetMonthlyRevenue: number;
  targetRentRatio: number;

  // ── 4개 지표 ──────────────────────────────────────────────────────────
  /** A. 월세 부담률: monthlyRent / estimatedMonthlyRevenue */
  rentBurdenRatio: number | null;
  rentBurdenLevel: FPLevel;
  rentBurdenIsEstimated: boolean;

  /** B. 보증금 유동성 부담: deposit / estimatedMonthlyFixedCost (개월) */
  depositLiquidityMonths: number | null;
  depositLiquidityLevel: FPLevel;
  depositLiquidityIsEstimated: boolean;

  /** C. 권리금 회수 부담: premium / estimatedMonthlyNetProfit (개월) */
  premiumPaybackMonths: number | null;
  premiumPaybackLevel: FPLevel;
  premiumPaybackIsEstimated: boolean;

  /** D. 안정권 진입 필요 월매출 부담 (0~1, 목표 대비 현재 매출 비율) */
  requiredRevenueGapRatio: number | null;
  requiredRevenueLevel: FPLevel;

  // ── 종합 점수 (0~100, 높을수록 부담 큼) ──────────────────────────────
  financialPressureScore: number;

  // ── AI 문구 생성용 텍스트 ─────────────────────────────────────────────
  summaryTexts: string[];

  // ── 데이터 신뢰도 플래그 ─────────────────────────────────────────────
  confidenceFlags: FinancialPressureConfidenceFlags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TARGET_RENT_RATIO = 0.12;

/** 고정비를 별도 입력하지 않은 경우, 월세 × 배율로 보수적 추정 */
const FIXED_COST_RENT_MULTIPLIER = 2.0;

/** 권리금 0원 이하이면 회수 부담 해당 없음으로 처리 */
const PREMIUM_THRESHOLD = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Level classifiers
// ─────────────────────────────────────────────────────────────────────────────

function classifyRentBurden(ratio: number): FPLevel {
  if (ratio <= 0.10) return 'stable';
  if (ratio <= 0.15) return 'adequate';
  if (ratio <= 0.20) return 'caution';
  return 'risk';
}

function classifyDepositLiquidity(months: number): FPLevel {
  if (months <= 3) return 'stable';
  if (months <= 6) return 'adequate';
  if (months <= 12) return 'caution';
  return 'risk';
}

function classifyPremiumPayback(months: number): FPLevel {
  if (months <= 6) return 'stable';
  if (months <= 12) return 'adequate';
  if (months <= 24) return 'caution';
  return 'risk';
}

function classifyRequiredRevenueGap(gapRatio: number): FPLevel {
  // gapRatio = (targetRevenue - currentRevenue) / targetRevenue
  // 0 이하: 현재 매출이 목표를 넘음
  if (gapRatio <= 0) return 'stable';
  if (gapRatio <= 0.2) return 'adequate';
  if (gapRatio <= 0.4) return 'caution';
  return 'risk';
}

// ─────────────────────────────────────────────────────────────────────────────
// Level → score conversion (각 지표를 0~100 점수로 환산)
// ─────────────────────────────────────────────────────────────────────────────

function levelToScore(level: FPLevel): number {
  switch (level) {
    case 'stable':   return 10;
    case 'adequate': return 35;
    case 'caution':  return 65;
    case 'risk':     return 90;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main calculator
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeFinancialPressure(
  input: FinancialPressureInput
): FinancialPressureResult {
  const targetRentRatio = input.targetRentRatio ?? DEFAULT_TARGET_RENT_RATIO;

  const rent = Math.max(0, input.monthlyRent ?? 0);
  const deposit = Math.max(0, input.deposit ?? 0);
  const premium = Math.max(0, input.premium ?? 0);

  // ── 예상 월매출 ────────────────────────────────────────────────────────
  const hasRevenue = input.estimatedMonthlyRevenue > 0;
  const estimatedRevenue = hasRevenue
    ? input.estimatedMonthlyRevenue
    // 매출 없으면 targetRentRatio 역산으로 최소 기준 설정
    : rent > 0 ? rent / targetRentRatio : 0;
  const revenueIsEstimated = !hasRevenue;

  // ── 안정권 진입 필요 월매출 ────────────────────────────────────────────
  const targetMonthlyRevenue = rent > 0 ? Math.round(rent / targetRentRatio) : 0;

  // ── 월 고정비 추정 ─────────────────────────────────────────────────────
  const hasFixedCost =
    input.estimatedMonthlyFixedCost != null && input.estimatedMonthlyFixedCost > 0;
  const estimatedMonthlyFixedCost = hasFixedCost
    ? input.estimatedMonthlyFixedCost!
    : Math.round(rent * FIXED_COST_RENT_MULTIPLIER);
  const fixedCostIsEstimated = !hasFixedCost;

  // ── 월 순이익 추정 ─────────────────────────────────────────────────────
  const netMargin = input.industryNetMargin ?? 0.15; // 기본 15% 순이익률
  const netProfitIsEstimated = !input.industryNetMargin;
  const estimatedMonthlyNetProfit =
    estimatedRevenue > 0
      ? Math.round(estimatedRevenue * netMargin)
      : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // A. 월세 부담률
  // ─────────────────────────────────────────────────────────────────────────
  let rentBurdenRatio: number | null = null;
  let rentBurdenLevel: FPLevel = 'stable';
  const rentBurdenIsEstimated = revenueIsEstimated;

  if (rent > 0 && estimatedRevenue > 0) {
    rentBurdenRatio = rent / estimatedRevenue;
    rentBurdenLevel = classifyRentBurden(rentBurdenRatio);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // B. 보증금 유동성 부담
  // ─────────────────────────────────────────────────────────────────────────
  let depositLiquidityMonths: number | null = null;
  let depositLiquidityLevel: FPLevel = 'stable';
  const depositLiquidityIsEstimated = fixedCostIsEstimated;

  if (deposit > 0 && estimatedMonthlyFixedCost > 0) {
    depositLiquidityMonths = Number((deposit / estimatedMonthlyFixedCost).toFixed(1));
    depositLiquidityLevel = classifyDepositLiquidity(depositLiquidityMonths);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // C. 권리금 회수 부담
  // ─────────────────────────────────────────────────────────────────────────
  let premiumPaybackMonths: number | null = null;
  let premiumPaybackLevel: FPLevel = 'stable';
  const premiumPaybackIsEstimated = netProfitIsEstimated || revenueIsEstimated;

  if (premium > PREMIUM_THRESHOLD && estimatedMonthlyNetProfit > 0) {
    premiumPaybackMonths = Number((premium / estimatedMonthlyNetProfit).toFixed(1));
    premiumPaybackLevel = classifyPremiumPayback(premiumPaybackMonths);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // D. 안정권 진입 필요 월매출 부담
  // ─────────────────────────────────────────────────────────────────────────
  let requiredRevenueGapRatio: number | null = null;
  let requiredRevenueLevel: FPLevel = 'stable';

  if (targetMonthlyRevenue > 0) {
    const gap = targetMonthlyRevenue - (hasRevenue ? input.estimatedMonthlyRevenue : 0);
    requiredRevenueGapRatio = Number((gap / targetMonthlyRevenue).toFixed(3));
    requiredRevenueLevel = classifyRequiredRevenueGap(requiredRevenueGapRatio);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 종합 Financial Pressure Score (0~100, 높을수록 부담 큼)
  // 가중치: 월세 40% / 보증금 20% / 권리금 25% / 필요매출 15%
  // ─────────────────────────────────────────────────────────────────────────
  const scoreA = levelToScore(rentBurdenLevel) * 0.40;
  const scoreB = levelToScore(depositLiquidityLevel) * 0.20;
  const scoreC = levelToScore(premiumPaybackLevel) * 0.25;
  const scoreD = levelToScore(requiredRevenueLevel) * 0.15;
  const financialPressureScore = Math.round(scoreA + scoreB + scoreC + scoreD);

  // ─────────────────────────────────────────────────────────────────────────
  // AI 문구 생성 (단정 표현 금지)
  // ─────────────────────────────────────────────────────────────────────────
  const summaryTexts: string[] = [];
  const fmtManwon = (n: number) => `${Math.round(n / 10_000).toLocaleString()}만원`;
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

  if (rentBurdenRatio !== null) {
    if (rentBurdenLevel === 'risk' || rentBurdenLevel === 'caution') {
      summaryTexts.push(
        `월세 부담률이 약 ${fmtPct(rentBurdenRatio)}${rentBurdenIsEstimated ? '(추정)' : ''}으로 높아 임대 조건 재검토가 필요합니다.`
      );
    } else {
      summaryTexts.push(
        `월세 부담률은 약 ${fmtPct(rentBurdenRatio)}${rentBurdenIsEstimated ? '(추정)' : ''}로 상대적으로 안정적인 수준입니다.`
      );
    }
  }

  if (targetMonthlyRevenue > 0) {
    summaryTexts.push(
      `현재 월세를 안정적으로 감당하려면 월매출 약 ${fmtManwon(targetMonthlyRevenue)} 이상이 필요합니다.`
    );
  }

  if (premiumPaybackMonths !== null) {
    if (premiumPaybackLevel === 'risk') {
      summaryTexts.push(
        `권리금 회수에는 약 ${Math.round(premiumPaybackMonths)}개월${premiumPaybackIsEstimated ? '(추정)' : ''}이 필요할 수 있어 기존 매출자료 확인이 필요합니다.`
      );
    } else if (premiumPaybackLevel === 'caution') {
      summaryTexts.push(
        `권리금 회수 예상 기간이 약 ${Math.round(premiumPaybackMonths)}개월${premiumPaybackIsEstimated ? '(추정)' : ''}으로, 실제 매출 근거를 확인하는 것이 중요합니다.`
      );
    }
  }

  if (depositLiquidityMonths !== null && (depositLiquidityLevel === 'risk' || depositLiquidityLevel === 'caution')) {
    summaryTexts.push(
      `보증금이 월 고정비 약 ${Math.round(depositLiquidityMonths)}개월${depositLiquidityIsEstimated ? '(추정)' : ''}분에 해당해 초기 유동성 부담이 큰 편입니다.`
    );
  }

  return {
    monthlyRent: rent,
    deposit,
    premium,
    estimatedMonthlyRevenue: estimatedRevenue,
    estimatedMonthlyFixedCost,
    estimatedMonthlyNetProfit,

    targetMonthlyRevenue,
    targetRentRatio,

    rentBurdenRatio,
    rentBurdenLevel,
    rentBurdenIsEstimated,

    depositLiquidityMonths,
    depositLiquidityLevel,
    depositLiquidityIsEstimated,

    premiumPaybackMonths,
    premiumPaybackLevel,
    premiumPaybackIsEstimated,

    requiredRevenueGapRatio,
    requiredRevenueLevel,

    financialPressureScore,
    summaryTexts,

    confidenceFlags: {
      rentIsEstimated: rent === 0,
      depositIsEstimated: deposit === 0,
      premiumIsEstimated: premium === 0,
      revenueIsEstimated,
      fixedCostIsEstimated,
      netProfitIsEstimated,
    },
  };
}
