import { DataSource } from "./dataMergeRules";
export { DataSource };
export type { FinancialPressureResult, FinancialPressureInput, FPLevel, FinancialPressureConfidenceFlags } from "./financialPressureAnalysis";

export enum RiskTier {
    STABLE = "안정",
    MODERATE_RISK = "낮은 리스크",
    ELEVATED_RISK = "주의 필요",
    HIGH_STRUCTURAL_RISK = "구조적 리스크 높음",
    CRITICAL_STRUCTURAL_RISK = "심각한 구조적 위기",
}


export interface LayerResult {
    score: number;
    weight: number;
    explanation: string;
    interpretation?: string; // 한국어 기반 정밀 해석 (P1 대응)
}

// ValueSource kept as alias for backward compatibility; prefer DataSource enum going forward.
export type ValueSource = DataSource | "user_override";

export interface ValueWithSource<T> {
    value: T;
    source: ValueSource;
}

export interface FinancialData {
    industryCode: string;
    industryCategory?: string; // e.g., FNB, RETAIL, etc.
    monthlyRevenue: number;
    rent: number;
    maintenanceFee: number;
    deposit: number;
    premium: number;
    area: number;
    floor: string;
    hasParking: boolean;
    hasInsurance: boolean;
    insuranceFee: number;
    debtService: number;
    operatingExpenses: number;
    cashBufferMonths: number;
    albiCount: number;
    managerCount: number;
    laborCost: number;

    // Debt & Loans
    loanAmount?: number;
    interestRate?: number;

    // Optional overrides
    margin?: number;
    visitRate?: number;
    ticketPrice?: number;
    repeatFactor?: number;
    baseRiskLine?: number;
    laborIntensity?: number;

    // Source tracking for confidence score
    sources?: Record<string, ValueSource>;
}

export interface MarketData {
    householdCount: number; // 배후 세대 수
    officeBuildingCount: number; // 주변 오피스 빌딩 수
    competitorCount: number;
    competitorRadius: number; // KM
    marketActivity: string; // 상가 활성화 정도
    footTrafficScore: number;
    demographicGrowthRate: number;
    vacancyRate: number;
}

export interface CompetitionData {
    competitorProximity: number;
    marketSaturationIndex: number;
    pricingPower: number;
}

export interface StabilityData {
    leaseRemainingYears: number;
    ownershipStructure: "Owned" | "Leased";
    regulatoryRiskIndex: number;
}

export interface PublicDataResult {
    radiusM: number;
    competitorsCount: number;
    poiTotalCount: number;
    diversityIndex: number; // 0~1
    households: number;
    population: number;
    ageShare20_39: number; // 0~1
    volatilityProxy: number; // 0~1 (e.g., business turnover rate)
    cityName?: string;
    districtName?: string;
    districtPoiCount?: number;

    // Metadata for fallback tracking. Prefer DataSource enum values.
    _sources?: Partial<Record<keyof PublicDataResult, DataSource | ValueSource>>;
}

export interface AIAnalysisResult {
    oneLineSummary: string;
    keyRisks: string[];
    recommendedActions: string[];
    precautions: string;
}

export interface AIInput {
    industry: string;
    location: {
        lat: number;
        lng: number;
        address?: string;
    };
    radiusM: number;
    cri: number;
    riskTier: string;
    metrics: {
        competitionStrength: number;
        demandIndex: number;
        financialPressure: number;
        structuralStability: number;
    };
    publicData: {
        competitorsCount: number;
        poiTotalCount: number;
        districtPoiCount: number;
        population: number;
        households: number;
    };
}

export interface AnalysisHistoryItem {
  location: {
    lat: number;
    lng: number;
    address: string;
    placeName: string;
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
    admCd?: string;
  };
  industry: { code: string; name: string } | string;
  radius: number;
  analysis: RiskAnalysis;
  aiResult: AIAnalysisResult | null;
  timestamp: number;
}

export type EvidenceCategory = "competition" | "demand" | "volatility";

export interface EvidenceMetric {
    label: string;
    value: string | number;
    unit?: string;
    highlight?: boolean;
    source?: ValueSource;
    isEstimated?: boolean;
}

export interface EvidenceCard {
    id: string;
    category: EvidenceCategory;
    title: string;
    icon: string;
    metrics: EvidenceMetric[];
    summary: string;
    source: ValueSource;
    confidence: number;
}

export interface RadiusComparisonItem {
    radius: number;
    score: number;
    delta: number;
}

export interface RiskAnalysis {
    cri: number;
    riskTier: RiskTier;
    distanceToSafe: number;
    layerScores: {
        financialPressure: LayerResult;
        marketDemand: LayerResult;
        competitiveStructure: LayerResult;
        structuralStability: LayerResult;
    };
    radiusComparison: RadiusComparisonItem[];
    evidenceCards: EvidenceCard[];
    confidenceScore: number;
    aiInsights: string[]; // Rule-based insights
    recommendedActions: string[];

    // Overall data quality tracking
    hasEstimatedMetric?: boolean;
    overallConfidence?: number;

    // Minimum adjustments required to reach stable zone (riskTier !== 'stable')
    minimumAdjustments?: MinimumAdjustmentItem[];

    // Additional metrics
    breakEvenRevenue: number;
    revenueStressGap: number;
    sourceSummary: Record<ValueSource, number>;

    // Financial Pressure 세부 지표 (고도화 레이어)
    financialPressureDetail?: import('./financialPressureAnalysis').FinancialPressureResult;
}

// ── Minimum Adjustment Block (Step 3) ────────────────────────────────────────
export type AdjustmentType = 'rent' | 'laborCost' | 'targetRevenue';

export interface MinimumAdjustmentItem {
    /** Identifies which lever this adjustment targets. */
    type: AdjustmentType;
    /** Display priority: 1 = highest impact, rendered first. */
    priority: 1 | 2 | 3;
    /** Human-readable label shown in the UI. */
    label: string;
    /** If true, the value was inferred (not user-entered) — show "(추정)" badge. */
    isEstimated: boolean;
    /** Unit string for display (e.g. '원/월'). */
    unit: string;
    /** Current value in raw units (원). */
    current: number;
    /** Target value in raw units (원). */
    target: number;
    /** Difference: target − current. Negative = reduction needed. */
    delta: number;
    /** Fractional change: delta / current. e.g. -0.20 = 20% reduction. */
    deltaRate: number;
    /** Possibility-phrased guidance text for the user. */
    description: string;
}

export interface SimulationResult extends RiskAnalysis {
    previousScore: number;
    delta: number;
    requiredImprovementForStable: number;
}
