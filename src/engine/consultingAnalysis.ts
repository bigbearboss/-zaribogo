import { emptyPublicData, type PopulationEvidence, type CompetitionEvidence } from './analysisEvidence';
import { calculateUnitEconomics, type EconomicsInput, type UnitEconomics } from './unitEconomics';
import type { PublicDataResult } from './types';

export interface ConsultingAnalysis {
  version: 3;
  address: string;
  industry: string;
  radiusM: number;
  createdAt: string;
  economics: UnitEconomics;
  population: PopulationEvidence;
  competition: CompetitionEvidence;
  decision: string;
  summary: string;
  risks: string[];
  actions: string[];
  fieldChecks: string[];
  contractChecks: string[];
  scoreWithheld: true;
}

export const money = (value: number | null): string => value === null ? '입력 필요' : `${(Math.round(value / 1000) / 10).toLocaleString('ko-KR')}만원`;

export function buildConsultingAnalysis(input: EconomicsInput, data: PublicDataResult, address: string, industry: string, createdAt = new Date().toISOString()): ConsultingAnalysis {
  const economics = calculateUnitEconomics(input);
  const fallback = emptyPublicData(data.radiusM);
  const population = data.populationEvidence ?? fallback.populationEvidence!;
  const competition = data.competitionEvidence ?? fallback.competitionEvidence!;
  const risks: string[] = [];
  const actions: string[] = [];
  const baseCash = economics.scenarios.find(s => s.label === '입력 매출')?.cashAfterOwner;
  let decision = '매출·수요 검증 후 판단';
  if (economics.missing.length) decision = '비용 입력 보완 필요';
  if (input.variableCostRate === 1 || (baseCash !== undefined && baseCash < 0)) decision = '비용 구조 재검토';
  if (economics.contributionRate === null) {
    risks.push(input.variableCostRate === 1 ? '매출 전액이 변동비로 나가는 조건입니다. 판매량을 늘려도 고정비를 회수할 수 없습니다.' : '변동비율이 없어 손익분기 매출을 계산할 수 없습니다.');
    actions.push('상품·재료 매입, 폐기, 카드·배달 수수료, 포장·판매 로열티를 매출 비율로 합산하세요.');
  }
  if (baseCash !== undefined && baseCash < 0) risks.push(`입력한 월매출 ${money(input.expectedRevenue)}에서는 사장님 생활비·원금 상환 후 매월 ${money(-baseCash)}의 현금이 부족합니다.`);
  if (economics.revenueDown20Cash !== null && economics.revenueDown20Cash < 0) risks.push(`매출이 입력값보다 20% 낮으면 매월 ${money(-economics.revenueDown20Cash)}의 현금 부족이 발생합니다.${economics.cashRunwayMonths !== null ? ` 입력한 예비자금으로 약 ${economics.cashRunwayMonths.toFixed(1)}개월을 감당합니다.` : ' 계약금·보증금을 제외한 예비자금 확인이 필요합니다.'}`);
  if (economics.missing.length) risks.push(`미입력 비용: ${economics.missing.join(', ')}. 현재 계산은 미입력 금액을 제외한 하한이며 실제 필요 매출은 더 높을 수 있습니다.`);
  if (population.radius?.status === 'estimated') risks.push(`반경 ${data.radiusM}m 인구 약 ${population.radius.population?.toLocaleString()}명은 ${population.referenceYear}년 집계구 인구의 면적 비례 추정입니다. 실제 도보 접근 고객이나 구매 고객 수가 아니며 이후 입주는 반영하지 못합니다.`);
  else if (population.radius?.status === 'partial') risks.push(`반경 ${data.radiusM}m에 걸친 ${population.radius.cellCount}개 집계구 중 ${population.radius.knownPopulationCells}개의 인구만 확인했습니다. 누락 인구를 0명으로 처리하지 않으며 전체 반경 인구 확정은 보류합니다.`);
  else risks.push(`반경 ${data.radiusM}m 거주인구는 아직 확보되지 않았습니다.${population.status === 'available' ? ` ${population.areaName} ${population.referenceYear ?? '기준연도 미확인'}년 통계는 행정동 전체 참고 자료입니다.` : ' 인구 자료 조회도 완료되지 않았습니다.'}`);
  if (competition.status !== 'available') risks.push('경쟁점 집계가 확인되지 않아 경쟁 강도와 시장 공백 여부를 판단할 수 없습니다.');
  else {
    risks.push(`선택 반경·업종에 해당하는 등록 점포 ${competition.count}개를 확인했습니다. 영업 여부·매출·가격 우위는 미확인입니다. 점포 수만으로 시장 포화나 기회를 단정하지 않습니다.`);
    const near = competition.stores.slice(0, 3);
    if (near.length) actions.push(`${near.map(s => `${s.name}(${s.distanceM}m)`).join(', ')}의 주력 상품 가격·시간대별 주문 수·영업시간을 같은 기준으로 비교하세요.`);
  }
  if (economics.targetRevenue !== null) actions.push(`월 ${money(economics.targetRevenue)}${economics.dailyTargetOrders !== null ? `, 하루 ${economics.dailyTargetOrders}건(영업 ${input.operatingDays}일·객단가 ${input.ticketPrice!.toLocaleString()}원)` : ''}을 달성할 근거를 확인하세요. 이는 비용을 역산한 목표이지 예상 매출이 아닙니다.`);
  if (economics.rentReductionEffect !== null) actions.push(`월세 10만원 인하는 필요한 월매출을 약 ${money(economics.rentReductionEffect)} 낮춥니다. 판매량 증가와 임대료 조정 중 실현 가능한 쪽을 검토하세요.`);
  if (input.premium > 0) actions.push(economics.premiumPaybackMonths !== null ? `입력 매출이 유지되고 잉여 현금을 모두 회수에 쓰면 권리금 회수에 약 ${economics.premiumPaybackMonths.toFixed(1)}개월이 걸립니다. 시설 교체·세금은 별도입니다.` : '권리금 회수 기간은 계산할 수 없습니다. 매출과 비용을 확인하고, 양도인의 POS·부가세 신고 자료로 대조하세요.');
  const summary = economics.targetRevenue === null
    ? '변동비와 운영 조건을 먼저 확인해야 필요한 매출을 계산할 수 있습니다.'
    : `입력 비용 기준 월 ${money(economics.targetRevenue)}${economics.dailyTargetOrders !== null ? ` · 하루 ${economics.dailyTargetOrders}건` : ''}이 필요합니다. 이 판매량을 확보할 수 있는지는 주변 수요와 경쟁점 실사로 검증해야 합니다.`;
  return {
    version: 3, address, industry, radiusM: data.radiusM, createdAt, economics, population, competition,
    decision, summary, risks, actions, scoreWithheld: true,
    fieldChecks: [
      `반경 ${data.radiusM}m 내 아파트별 입주 완료 가구, 공실·입주 예정 가구를 구분하고 큰 도로·단지 출입구로 끊기는 도보 동선을 확인하세요.`,
      '평일 2일·주말 1일, 오전·점심·저녁에 같은 지점의 통행과 경쟁점 실제 주문을 기록하세요. 통행인 전원을 구매 고객으로 계산하지 마세요.',
      economics.dailyTargetOrders !== null ? `하루 필요 주문 ${economics.dailyTargetOrders}건을 매장·배달·포장으로 나누고, 각 채널에서 확보 가능한 주문 수와 중복을 검증하세요.` : '객단가와 월 영업일을 입력해 하루 필요 주문 수를 먼저 확인하세요.',
    ],
    contractChecks: [
      '월세의 부가세 포함 여부, 관리비 명세, 연간 인상 조건, 원상복구·수선 부담을 계약서와 대조하세요.',
      '동일 업종 입점 제한, 인허가·전력·배기·주차 조건을 확인하고 추가 시설 비용을 초기 투자에 반영하세요.',
      '보증금은 월 비용이 아닌 묶이는 자금입니다. 보증금·권리금·인테리어를 지출한 후 남는 운영 예비자금을 별도로 확보하세요.',
    ],
  };
}
