import { RiskEngine } from '../engine/RiskEngine';

/** Synthetic layout fixture: no API calls, persistence or real-world claims. */
export function createPreviewAnalysis() {
  return RiskEngine.analyze(
    {
      industryCode: 'cafe_indie_small', industryCategory: 'FNB',
      monthlyRevenue: 18000000, rent: 2500000, maintenanceFee: 300000,
      deposit: 50000000, premium: 20000000, area: 66, floor: '1',
      hasParking: false, hasInsurance: false, insuranceFee: 0,
      debtService: 0, operatingExpenses: 500000, cashBufferMonths: 6,
      albiCount: 1, managerCount: 1, laborCost: 5000000,
      margin: 65, ticketPrice: 6500,
    },
    {
      householdCount: 2400, officeBuildingCount: 8, competitorCount: 24,
      competitorRadius: 0.5, marketActivity: 'medium', footTrafficScore: 60,
      demographicGrowthRate: 0.02, vacancyRate: 0.08,
    },
    { competitorProximity: 100, marketSaturationIndex: 0.65, pricingPower: 0.4 },
    { leaseRemainingYears: 2, ownershipStructure: 'Leased', regulatoryRiskIndex: 0.1 },
  );
}
