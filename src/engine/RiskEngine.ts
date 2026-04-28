import { RiskLayers as Layers } from "./layers";
import type { FinancialData, MarketData, CompetitionData, StabilityData, RiskAnalysis, LayerResult, PublicDataResult, EvidenceCard, SimulationResult, MinimumAdjustmentItem } from "./types";
import { RiskTier } from "./types";
import { RuleBasedInsightGenerator } from "./formatters/DiagnosticFormatter";
import { calcCardConfidence, computeFallbackState, DataSource } from "./dataMergeRules";
import { analyzeFinancialPressure } from "./financialPressureAnalysis";
// @ts-ignore - json import
import industryProfiles from "./data/industryProfiles.json";

export class RiskEngine {
    static getProfile(code: string) {
        return (industryProfiles as any[]).find((p: any) => p.internal_code === code) || industryProfiles[0];
    }

    static getAllProfiles() {
        return industryProfiles as any[];
    }

    static analyze(
        financial: FinancialData,
        market: MarketData,
        competition: CompetitionData,
        stability: StabilityData,
        publicData?: PublicDataResult
    ): RiskAnalysis {
        const weights = this.getWeights(financial.industryCategory || "SERVICE");

        const fRes = Layers.evaluateFinancialPressure(financial, weights.f);
        const mRes = Layers.evaluateMarketDemand(market, weights.m, publicData);
        const cRes = Layers.evaluateCompetitiveStructure(competition, weights.c, publicData);
        const sRes = Layers.evaluateStructuralStability(stability, weights.s);

        const compositeScore = Math.round(
            (fRes.score * fRes.weight) +
            (mRes.score * mRes.weight) +
            (cRes.score * cRes.weight) +
            (sRes.score * sRes.weight)
        );

        const tier = this.getRiskTier(compositeScore);
        const breakEven = (financial.rent || 0) + (financial.maintenanceFee || 0) + (financial.debtService || 0) + (financial.laborCost || 0);
        const stressGap = (((financial.monthlyRevenue || 1) - breakEven) / (financial.monthlyRevenue || 1)) * 100;

        const confidenceData = this.calculateConfidence(financial);
        const fallbackState = computeFallbackState(publicData?._sources ?? {});
        const evidenceCards = this.generateEvidenceCards(fRes, mRes, cRes, sRes, publicData);
        const hasEstimatedMetric = fallbackState.hasEstimatedMetric;

        // Calculate stability gap (P2)
        const stableScoreTarget = 35;
        const requiredImprovement = Math.max(0, compositeScore - stableScoreTarget);

        const industryCode = financial.industryCode || "cafe_indie_small";
        const profile = this.getProfile(industryCode);
        const probs = this.calculateProbabilities({ revenueStressGap: Number(stressGap.toFixed(1)) } as any, financial);
        const benchmarks = this.calculateRevenueBenchmarks(industryCode, financial, market, competition, stability);
        const stableTactics = this.calculateTacticalTargets(industryCode, benchmarks.stable);

        const aiInsights = RuleBasedInsightGenerator.generate(
            compositeScore,
            { f: fRes.score, m: mRes.score, c: cRes.score, s: sRes.score },
            profile.display_name_ko,
            benchmarks,
            stableTactics,
            probs.breakEven
        );
        // ── Minimum Adjustments Block (riskTier !== stable) ────────────────────────
        // Priority order: rent(1) → laborCost(2) → targetRevenue(3)
        // This reflects practical feasibility: rent renegotiation is fastest,
        // then labor adjustment, then growing sales.
        let minimumAdjustments: MinimumAdjustmentItem[] | undefined;

        if (tier !== RiskTier.STABLE) {
            const rentCurrent = financial.rent;
            const rentTarget = Math.max(0, Math.round(rentCurrent * 0.80));
            const rentDelta = rentTarget - rentCurrent;

            // laborCost: use user-entered value when available, else estimate from headcount
            const laborCurrent = financial.laborCost > 0 ? financial.laborCost
                : (financial.albiCount * 1_500_000) + (financial.managerCount * 2_800_000);
            const laborEstimated = !(financial.laborCost > 0);
            const laborTarget = Math.max(0, Math.round(laborCurrent * 0.88));
            const laborDelta = laborTarget - laborCurrent;

            // targetRevenue: breakEven + 15% safety margin
            const revCurrent = financial.monthlyRevenue;
            const revTarget = Math.round(breakEven * 1.15);
            const revDelta = revTarget - revCurrent;

            const fmt = (n: number) => `${Math.round(Math.abs(n) / 10_000).toLocaleString()}만원`;
            const pct = (r: number) => `${Math.round(Math.abs(r) * 100)}%`;

            minimumAdjustments = [
                {
                    type: 'rent',
                    priority: 1,
                    label: '월 임대료',
                    isEstimated: false,
                    unit: '원/월',
                    current: rentCurrent,
                    target: rentTarget,
                    delta: rentDelta,
                    deltaRate: rentCurrent > 0 ? rentDelta / rentCurrent : 0,
                    description: `현재 기준으로는 임대료를 \u00a0${fmt(rentDelta)}(${pct(rentDelta / rentCurrent)}) 절감할 수 있다면, 안정 구간에 가까워질 가능성이 높아집니다.`,
                } as MinimumAdjustmentItem,
                {
                    type: 'laborCost',
                    priority: 2,
                    label: laborEstimated ? '예상 인건비(추정)' : '월 인건비',
                    isEstimated: laborEstimated,
                    unit: '원/월',
                    current: laborCurrent,
                    target: laborTarget,
                    delta: laborDelta,
                    deltaRate: laborCurrent > 0 ? laborDelta / laborCurrent : 0,
                    description: `현재 기준으로는 인건비를 \u00a0${fmt(laborDelta)} 정도 조정할 수 있다면, 수익 구조 개선에 도움이 될 수 있습니다.${laborEstimated ? ' (인원 수 기반 추정값 기준)' : ''}`,
                } as MinimumAdjustmentItem,
                {
                    type: 'targetRevenue',
                    priority: 3,
                    label: '월 목표 매출',
                    isEstimated: false,
                    unit: '원/월',
                    current: revCurrent,
                    target: revTarget,
                    delta: revDelta,
                    deltaRate: revCurrent > 0 ? revDelta / revCurrent : 0,
                    description: `현재 기준으로는 월 미n·${fmt(revTarget)} 가략 달성되면 손익분기점 + 안전 여유 구간에 가까워질 수 있습니다.`,
                } as MinimumAdjustmentItem,
            ];
        }

        // ── Financial Pressure 세부 지표 계산 (고도화 레이어) ─────────────────
        const industryProfile = this.getProfile(financial.industryCode || 'cafe_indie_small');
        const industryNetMargin = industryProfile?.profiles?.base?.margin ?? 0.15;

        // 월 고정비: 사용자 입력 기반으로 산출 (laborCost + rent + maintenanceFee + debtService + insuranceFee)
        const monthlyInterestForFP = (financial.loanAmount || 0) * ((financial.interestRate || 0) / 100) / 12;
        const computedFixedCost =
            financial.rent +
            (financial.maintenanceFee || 0) +
            (financial.laborCost || 0) +
            (financial.debtService || 0) +
            (financial.insuranceFee || 0) +
            Math.round(monthlyInterestForFP);

        const fpDetail = analyzeFinancialPressure({
            monthlyRent: financial.rent || 0,
            deposit: financial.deposit || 0,
            premium: financial.premium || 0,
            estimatedMonthlyRevenue: financial.monthlyRevenue || 0,
            estimatedMonthlyFixedCost: computedFixedCost > 0 ? computedFixedCost : undefined,
            industryNetMargin,
        });

        return {
            cri: compositeScore,
            riskTier: tier,
            distanceToSafe: requiredImprovement,
            layerScores: {
                financialPressure: fRes,
                marketDemand: mRes,
                competitiveStructure: cRes,
                structuralStability: sRes
            },
            radiusComparison: [],
            evidenceCards,
            confidenceScore: confidenceData.score,
            aiInsights,
            hasEstimatedMetric,
            overallConfidence: evidenceCards.reduce((acc, card) => acc + (card.confidence || 0.5), 0) / Math.max(1, evidenceCards.length),
            recommendedActions: this.getActionGuidance(tier, compositeScore, {
                financialPressure: fRes,
                marketDemand: mRes,
                competitiveStructure: cRes,
                structuralStability: sRes
            }),
            breakEvenRevenue: Math.round(breakEven),
            revenueStressGap: Number(stressGap.toFixed(1)),
            sourceSummary: confidenceData.summary,
            minimumAdjustments,
            financialPressureDetail: fpDetail,
        };
    }

    private static generateEvidenceCards(
        fRes: LayerResult, mRes: LayerResult, cRes: LayerResult, sRes: LayerResult,
        p?: PublicDataResult
    ): EvidenceCard[] {
        const cards: EvidenceCard[] = [];

        // ── Centralised confidence calc via dataMergeRules ──────────────────
        const getConf = (metrics: Array<keyof PublicDataResult>) =>
            calcCardConfidence(p?._sources ?? {}, metrics);

        // 1. Competition Card
        if (p) {
            const m1Src = p._sources?.competitorsCount;
            const m2Src = p._sources?.poiTotalCount;
            const m3Src = p._sources?.diversityIndex;
            const m4Src = p._sources?.districtPoiCount;

            const conf = getConf(['competitorsCount', 'poiTotalCount', 'diversityIndex', 'districtPoiCount']);

            cards.push({
                id: "comp_evidence",
                category: "competition",
                title: "경쟁 구조",
                icon: "⚔️",
                source: conf >= 0.8 ? DataSource.PUBLIC_DATA : DataSource.INDUSTRY_DEFAULT,
                confidence: Number(conf.toFixed(2)),
                metrics: [
                    { label: "동일 업종 수", value: p.competitorsCount === 0 ? "데이터 기반 미확인 (신뢰도 낮음)" : p.competitorsCount, unit: p.competitorsCount === 0 ? "" : "개", source: m1Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m1Src !== DataSource.PUBLIC_DATA },
                    { label: "경쟁 밀도", value: (p.competitorsCount / (Math.pow(p.radiusM / 1000, 2) * Math.PI)).toFixed(1), unit: "/km²", highlight: true, source: m2Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m2Src !== DataSource.PUBLIC_DATA },
                    { label: "상권 다양성", value: (p.diversityIndex * 100).toFixed(0), unit: "%", source: m3Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m3Src !== DataSource.PUBLIC_DATA },
                    { label: "행정동 전체 업소", value: p.districtPoiCount || 0, unit: "개", source: m4Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m4Src !== DataSource.PUBLIC_DATA }
                ],
                summary: cRes.explanation
            });
        }

        // 2. Demand Card
        if (p) {
            const m1Src = p._sources?.households;
            const m2Src = p._sources?.population;
            const m3Src = p._sources?.ageShare20_39;

            const conf = getConf(['households', 'population', 'ageShare20_39']);

            cards.push({
                id: "demand_evidence",
                category: "demand",
                title: "배후 수요",
                icon: "👥",
                source: conf >= 0.8 ? DataSource.PUBLIC_DATA : DataSource.INDUSTRY_DEFAULT,
                confidence: Number(conf.toFixed(2)),
                metrics: [
                    { label: "세대수", value: p.households.toLocaleString(), unit: "세대", source: m1Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m1Src !== DataSource.PUBLIC_DATA },
                    { label: "인구", value: p.population.toLocaleString(), unit: "명", source: m2Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m2Src !== DataSource.PUBLIC_DATA },
                    { label: "청년층 비중", value: (p.ageShare20_39 * 100).toFixed(0), unit: "%", highlight: p.ageShare20_39 > 0.4, source: m3Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m3Src !== DataSource.PUBLIC_DATA }
                ],
                summary: mRes.explanation
            });
        }

        // 3. Risk Signal Card
        if (p) {
            const m1Src = p._sources?.volatilityProxy;
            const m2Src = p._sources?.diversityIndex;

            const conf = getConf(['volatilityProxy', 'diversityIndex']);

            cards.push({
                id: "risk_signal_evidence",
                category: "volatility",
                title: "변동성/리스크 신호",
                icon: "🚨",
                source: conf >= 0.8 ? DataSource.PUBLIC_DATA : DataSource.INDUSTRY_DEFAULT,
                confidence: Number(conf.toFixed(2)),
                metrics: [
                    { label: "업소 변동률", value: (p.volatilityProxy * 100).toFixed(1), unit: "%", highlight: p.volatilityProxy > 0.2, source: m1Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m1Src !== DataSource.PUBLIC_DATA },
                    { label: "업종 쏠림", value: p.diversityIndex < 0.4 ? "심함" : "보통", highlight: p.diversityIndex < 0.4, source: m2Src || DataSource.INDUSTRY_DEFAULT, isEstimated: m2Src !== DataSource.PUBLIC_DATA }
                ],
                summary: `지역 내 업소 교체율은 ${(p.volatilityProxy * 100).toFixed(1)}%로 측정됩니다. 최근 6개월간 ${p.volatilityProxy > 0.2 ? "높은" : "안정적인"} 변동성을 보이고 있습니다.`
            });
        }

        return cards;
    }

    private static getWeights(category: string) {
        const weightsMap: Record<string, { f: number, m: number, c: number, s: number }> = {
            "FNB": { f: 0.35, m: 0.30, c: 0.25, s: 0.10 },
            "RETAIL": { f: 0.40, m: 0.25, c: 0.20, s: 0.15 },
            "SERVICE": { f: 0.40, m: 0.20, c: 0.15, s: 0.25 },
            "EDU": { f: 0.35, m: 0.20, c: 0.15, s: 0.30 },
            "UNMANNED": { f: 0.45, m: 0.20, c: 0.20, s: 0.15 },
            "HEALTH": { f: 0.35, m: 0.25, c: 0.10, s: 0.30 }
        };
        return weightsMap[category] || weightsMap["SERVICE"];
    }

    private static calculateConfidence(financial: FinancialData) {
        const sources = financial.sources || {};
        const sourceValues: Record<string, number> = {
            "public_data": 1.0,
            "user_override": 0.9,
            "industry_default": 0.6
        };

        const totalFields = Object.keys(sources).length || 1;
        let weightedSum = 0;
        const summary: any = { public_data: 0, user_override: 0, industry_default: 0 };

        Object.values(sources).forEach(src => {
            weightedSum += (sourceValues[src] || 0.6);
            summary[src] = (summary[src] || 0) + 1;
        });

        return {
            score: Number((weightedSum / totalFields).toFixed(2)),
            summary
        };
    }

    static calculateProbabilities(analysis: RiskAnalysis, financial: FinancialData): { cashExhaustion: number, breakEven: number } {
        const months = financial.cashBufferMonths || 0;
        const gap = analysis.revenueStressGap;

        let cashExhaustion = 0;
        if (months < 1) cashExhaustion = 85;
        else if (months < 3) cashExhaustion = 50 + (gap < 0 ? 30 : 0);
        else if (months < 6) cashExhaustion = 20 + (gap < 0 ? 40 : 0);
        else cashExhaustion = 5 + (gap < 0 ? 25 : 0);

        let breakEven = Math.max(0, Math.min(100, 50 + gap));

        return {
            cashExhaustion: Math.round(cashExhaustion),
            breakEven: Math.round(breakEven)
        };
    }

    static calculateRevenueBenchmarks(
        industryCode: string,
        f: FinancialData, m: MarketData, c: CompetitionData, s: StabilityData
    ): { stable: number, risk: number } {
        const breakEven = (f.rent || 0) + (f.maintenanceFee || 0) + (f.debtService || 0) + (f.laborCost || 0);
        const profile = this.getProfile(industryCode);

        // Use margin from base profile to estimate revenue needs
        const margin = profile.profiles.base.margin;
        const baseRisk = profile.profiles.base.base_risk;

        // Stable revenue: fixed costs are ~35% or industry base_risk
        const stableRevenue = Math.round(breakEven / Math.min(0.4, baseRisk));
        const riskRevenue = Math.round(breakEven / 0.7);

        return { stable: stableRevenue, risk: riskRevenue };
    }

    static calculateTacticalTargets(industryCode: string, targetRevenue: number): { dailyCustomers: number, avgTicket: number } {
        const profile = this.getProfile(industryCode);
        const avgTicket = profile.profiles.base.ticket_krw;
        const dailyCustomers = Math.ceil(targetRevenue / avgTicket / 30);

        return { dailyCustomers, avgTicket };
    }

    static findStabilityPath(
        businessType: string,
        f: FinancialData, m: MarketData, c: CompetitionData, s: StabilityData
    ): { factor: string, adjustment: string, targetCRI: number }[] {
        const results = [];

        // Scenario: Rent Reduction (8%)
        const f1 = { ...f, rent: Math.round(f.rent * 0.92) };
        results.push({ factor: "임대료 8% 인하", adjustment: "-8%", targetCRI: this.analyze(f1, m, c, s).cri });

        // Scenario: Labor Cut (5%)
        const f2 = { ...f, laborCost: Math.round(f.laborCost * 0.95) };
        results.push({ factor: "인건비 5% 절감", adjustment: "-5%", targetCRI: this.analyze(f2, m, c, s).cri });

        // Scenario: Revenue to Stable
        const benchmarks = this.calculateRevenueBenchmarks(businessType, f, m, c, s);
        const f3 = { ...f, monthlyRevenue: benchmarks.stable };
        results.push({ factor: "안정 매출 달성", adjustment: `₩${benchmarks.stable.toLocaleString()}`, targetCRI: this.analyze(f3, m, c, s).cri });

        return results;
    }

    static simulate(
        baseData: { f: FinancialData, m: MarketData, c: CompetitionData, s: StabilityData },
        modifier: (d: { f: FinancialData, m: MarketData, c: CompetitionData, s: StabilityData }) => void
    ): SimulationResult {
        const baseAnalysis = this.analyze(baseData.f, baseData.m, baseData.c, baseData.s);
        const simulatedData = JSON.parse(JSON.stringify(baseData));
        modifier(simulatedData);

        const simulatedAnalysis = this.analyze(
            simulatedData.f, simulatedData.m, simulatedData.c, simulatedData.s
        );

        return {
            ...simulatedAnalysis,
            previousScore: baseAnalysis.cri,
            delta: simulatedAnalysis.cri - baseAnalysis.cri,
            requiredImprovementForStable: Math.max(0, simulatedAnalysis.cri - 35) // Updated to 35 for Stable
        };
    }

    private static getRiskTier(score: number): RiskTier {
        if (score < 35) return RiskTier.STABLE;
        if (score < 55) return RiskTier.MODERATE_RISK;
        if (score < 70) return RiskTier.ELEVATED_RISK;
        if (score < 85) return RiskTier.HIGH_STRUCTURAL_RISK;
        return RiskTier.CRITICAL_STRUCTURAL_RISK;
    }

    private static getActionGuidance(tier: RiskTier, score: number, layers: Record<string, LayerResult>): string[] {
        const guidance: string[] = [];

        // Simple Score based diagnosis
        const diagnosisMap: Record<RiskTier, string> = {
            [RiskTier.STABLE]: "현재 사업구조는 매우 안정적이며 지속 성장이 가능한 상태입니다.",
            [RiskTier.MODERATE_RISK]: "전반적으로 안정적이나 특정 지표에서 비효율성이 관찰됩니다.",
            [RiskTier.ELEVATED_RISK]: "리스크 요인이 누적되고 있어 적극적인 관리와 예방 조치가 필요합니다.",
            [RiskTier.HIGH_STRUCTURAL_RISK]: "구조적 결함으로 인해 안정적인 수익 창출이 어려운 위험한 상태입니다.",
            [RiskTier.CRITICAL_STRUCTURAL_RISK]: "사업 지속 가능성에 심각한 위협이 있으며 즉각적인 혁신이 필수적입니다."
        };
        guidance.push(`[현상 진단] ${diagnosisMap[tier]}`);

        // 1. Combination Rule Logic (Pattern Detection)
        const f = layers.financialPressure.score;
        const m = layers.marketDemand.score;
        const c = layers.competitiveStructure.score;
        const s = layers.structuralStability.score;

        let patternDescription = "";
        if (f > 65 && m < 40) {
            patternDescription = "높은 고정비 부담과 배후 수요 정체가 결합된 '구조적 수익성 저하' 패턴이 보입니다.";
        } else if (c > 70 && s < 40) {
            patternDescription = "심화된 경쟁 환경과 낮은 계약 안정성이 결합되어 외부 충격에 매우 취약한 상태입니다.";
        } else if (f > 60 && c > 60) {
            patternDescription = "공급 과잉 상권에서 과도한 비용 구조를 유지하고 있어 마진 확보에 어려움이 큽니다.";
        }

        if (patternDescription) {
            guidance.push(`[패턴 감지] ${patternDescription}`);
        }

        // 2. Cause (Worst Layer Focus)
        const sortedLayers = Object.entries(layers).sort((a, b) => b[1].score - a[1].score);
        const worstLayerName = sortedLayers[0][0];

        const causeMap: Record<string, string> = {
            financialPressure: "고정비 지출이 과다하거나 유동성 버퍼가 부족하여 재무적 압박이 매우 높습니다.",
            marketDemand: "입지 대비 배후지의 수요가 충분하지 않거나 상권 활성화 정도가 낮습니다.",
            competitiveStructure: "주변 상권의 경쟁이 과열되어 있고 차별화 요소가 부족하여 고객 확보가 어렵습니다.",
            structuralStability: "임대차 계약이나 장기 운영 안정성이 낮아 미래 불확실성이 큰 상태입니다."
        };
        guidance.push(`[핵심 원인] ${causeMap[worstLayerName]}`);

        // 3. Strategy (Actionable Items)
        const strategyMap: Record<string, string[]> = {
            financialPressure: [
                "임대료 재협상 또는 인력 효율화를 통해 고정비 비중을 전체 매출의 30% 이하로 낮추십시오.",
                "최소 3개월분 이상의 현금 유동성(Safety Buffer)을 즉시 확보하시길 권고합니다."
            ],
            marketDemand: [
                "타겟 고객층을 명확히 하는 마케팅 전략을 통해 객단가를 높이거나 재방문율을 개선하십시오.",
                "반경 500m 이내의 유동 인구 동선을 재분석하여 노출도를 강화해야 합니다."
            ],
            competitiveStructure: [
                "경쟁점과 차별화된 시그니처 메뉴나 서비스 도입을 통해 가격 결정력을 확보하십시오.",
                "니치 마켓(Niche Market) 공략을 위한 주력 타겟 전환을 검토하시기 바랍니다."
            ],
            structuralStability: [
                "장기적인 임대차 계약 안정성 확보를 위한 건물주와의 협의를 선제적으로 시작하십시오.",
                "지역 상생 프로그램 참여 등을 통해 영업권 보호 조치를 마련하십시오."
            ]
        };

        const strategies = strategyMap[worstLayerName] || ["비용 구조를 재점검하고 운영 효율을 극대화하십시오."];
        strategies.forEach(s => guidance.push(`[대응 전략] ${s}`));

        return guidance;
    }
}
