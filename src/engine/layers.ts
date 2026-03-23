import type { FinancialData, MarketData, CompetitionData, StabilityData, LayerResult, PublicDataResult } from "./types";

export class RiskLayers {
    static evaluateFinancialPressure(data: FinancialData, weight: number = 0.40): LayerResult {
        const monthlyInterest = (data.loanAmount || 0) * ((data.interestRate || 0) / 100) / 12;
        const totalMonthlyOutflow = data.rent + data.maintenanceFee + data.debtService + data.insuranceFee + (data.laborCost || 0) + monthlyInterest;
        const outflowRatio = (totalMonthlyOutflow / (data.monthlyRevenue || 1)) * 100;

        // Base score from outflow ratio
        let score = outflowRatio * 1.5;

        // Initial capital pressure (Amortized risk of Premium/Deposit)
        const capitalPressure = (data.premium + data.deposit) / ((data.monthlyRevenue || 1) * 12);
        score += capitalPressure * 10;

        const bufferRisk = Math.max(0, (6 - (data.cashBufferMonths || 0)) * 5);
        score += bufferRisk;

        return {
            score: Math.min(95, Math.round(score)),
            weight,
            explanation: `매출 대비 고정 지출 ${outflowRatio.toFixed(1)}%. 초기 자본 지수 ${capitalPressure.toFixed(2)}. 유동성 버퍼: ${data.cashBufferMonths}개월.`
        };
    }

    static evaluateMarketDemand(data: MarketData, weight: number = 0.25, publicData?: PublicDataResult): LayerResult {
        // Source selection (Priority: Public Data > Manual/Mock)
        const households = publicData ? publicData.households : (data.householdCount || 0);
        const officeBuildings = data.officeBuildingCount || 0; // Public data doesn't have offices yet
        const competitorCount = publicData ? publicData.competitorsCount : (data.competitorCount || 0);

        // Household and office influence (higher is better)
        const demandIndex = (households / 100) + (officeBuildings * 10);
        let baseScore = 100 - Math.min(100, demandIndex * 0.5);

        // Competitive pressure
        // For public data, we calculate a density relative to the actual radius used
        const compDensity = publicData
            ? (publicData.competitorsCount / (Math.pow(publicData.radiusM / 1000, 2) * Math.PI))
            : (competitorCount / (Math.pow(data.competitorRadius || 1, 2) * Math.PI || 1));

        baseScore += compDensity * 2;

        // Activity adjustment
        if (data.marketActivity === "low") baseScore += 20;

        return {
            score: Math.max(0, Math.min(95, Math.round(baseScore))),
            weight,
            explanation: `수요 인덱스(세대+오피스): ${demandIndex.toFixed(0)}. 경쟁 밀도: ${compDensity.toFixed(1)}/km². 활성화 정도: ${data.marketActivity}.`
        };
    }

    static evaluateCompetitiveStructure(data: CompetitionData, weight: number = 0.20, publicData?: PublicDataResult): LayerResult {
        // Use industry diversity from public data if available
        const saturation = publicData ? (100 - (publicData.diversityIndex * 100)) : (data.marketSaturationIndex || 0);

        let score = saturation * 0.7;
        if (data.competitorProximity < 1) score += 20;
        else if (data.competitorProximity < 3) score += 10;
        score += (100 - (data.pricingPower || 0)) * 0.3;

        return {
            score: Math.min(95, Math.round(score)),
            weight,
            explanation: `시장 포화도: ${Math.round(saturation)}%. 가격 결정력: ${data.pricingPower || "--"}. 반경 ${data.competitorProximity}km 내 경쟁 업체 존재.`
        };
    }

    static evaluateStructuralStability(data: StabilityData, weight: number = 0.15): LayerResult {
        let score = 0;
        if (data.ownershipStructure === "Leased") {
            score += Math.max(0, (10 - (data.leaseRemainingYears || 0)) * 5);
        }
        score += (data.regulatoryRiskIndex || 0) * 0.5;

        return {
            score: Math.min(95, Math.round(score)),
            weight,
            explanation: `점유 형태: ${data.ownershipStructure === "Leased" ? "임차" : "자가"} (잔여 ${data.leaseRemainingYears}년). 규제 리스크 지수: ${data.regulatoryRiskIndex}.`
        };
    }
}
