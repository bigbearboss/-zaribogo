import { buildConsultingAnalysis } from '../engine/consultingAnalysis';
import { emptyPublicData, populationEvidence } from '../engine/analysisEvidence';
import { RiskEngine } from '../engine/RiskEngine';

/** Synthetic layout fixture: no API calls, persistence or real-world claims. */
export function createPreviewAnalysis() {
  const analysis = RiskEngine.analyze(
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
  const data = emptyPublicData(500);
  data.populationEvidence = populationEvidence({ schemaVersion: 2,
    population: { adm_nm: '화면 검토용 가상동', tot_ppltn: '17000', tot_family: '6500', tot_house: '7000', year: 2024 },
    radiusPopulation: { status: 'estimated', radiusM: 500, population: 6200, households: 2400,
      cellCount: 20, knownPopulationCells: 20, boundaryCoverage: 1, populationAreaCoverage: 1, boundaryYear: 2025,
      spatialBounds: { minimum: 4100, maximum: 8200 },
      note: '화면 검토용 가상 인구입니다. 실제 보고서는 집계구 인구를 면적 비례로 추정하고 범위·누락을 함께 표시합니다.' }
  }, 500);
  data.competitionEvidence = { status: 'available', count: 3, totalStores: 125, radiusM: 500,
    datasets: ['화면 검토용 가상 데이터'], referenceDate: null,
    limitations: ['실제 점포·주소·시장 데이터가 아닌 개발용 예시입니다.'],
    stores: [
      { id: 'preview-1', name: '가상 커피점 A', category: '커피전문점', address: '화면 검토용 가상 주소', distanceM: 85, match: 'category' },
      { id: 'preview-2', name: '가상 커피점 B', category: '커피전문점', address: '화면 검토용 가상 주소', distanceM: 180, match: 'category' },
      { id: 'preview-3', name: '가상 베이커리 카페 C', category: '카페', address: '화면 검토용 가상 주소', distanceM: 310, match: 'keyword' },
    ] };
  analysis.consulting = buildConsultingAnalysis({
    rent: 2500000, maintenance: 300000, labor: 5000000, otherFixed: 700000, insurance: 0,
    variableCostRate: 0.4, ownerPay: 3000000, loanAmount: 30000000, annualInterestRate: 6,
    loanPrincipal: 500000, operatingDays: 26, ticketPrice: 6500, expectedRevenue: 18000000,
    targetProfit: 1000000, availableCash: 15000000, premium: 20000000,
  }, data, '화면 검토용 가상 주소', '카페 · 가상 예시');
  return analysis;
}
