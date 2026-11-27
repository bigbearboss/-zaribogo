import { money, type ConsultingAnalysis } from '../engine/consultingAnalysis';
import './consultingReport.css';

export const escapeReportText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const e = escapeReportText;
const list = (items: string[]) => `<ul>${items.map(item => `<li>${e(item)}</li>`).join('')}</ul>`;
const metric = (label: string, value: string, note: string) => `<div class="consult-metric"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(note)}</small></div>`;

export function consultingReportHtml(report: ConsultingAnalysis): string {
  const f = report.economics;
  const p = report.population;
  const c = report.competition;
  const rp = p.radius;
  const number = (n: number | null, unit: string) => n === null ? '미확인' : `${n.toLocaleString('ko-KR')}${unit}`;
  return `<article class="consult-report" aria-label="상권과 손익 검토 보고서">
    <header class="consult-hero"><p class="consult-eyebrow">ZARIBOGO · 계약 전 사업성 검토</p><span class="consult-status">${e(report.decision)}</span><h2>${e(report.summary)}</h2><p>${e(report.address)} · ${e(report.industry)} · 반경 ${report.radiusM}m</p><small>분석 생성: ${e(new Date(report.createdAt).toLocaleDateString('ko-KR'))} · 통계 기준일은 각 자료에 별도 표시</small></header>
    <section class="consult-section"><h3>얼마를 팔아야 남을까요?</h3><p>매출에서 상품·재료비와 판매 수수료를 차감한 뒤, 매달 지출을 감당하는 금액을 역산합니다.</p>
      <div class="consult-metrics">
        ${metric('영업 손익분기 월매출', money(f.operatingBreakEven), '임대료·인건비·입력 운영비를 충당')}
        ${metric('현금 손익분기 월매출', money(f.cashBreakEven), '대출 이자·원금과 사장님 생활비까지 충당')}
        ${metric('목표 잉여금 포함 월매출', money(f.targetRevenue), `사장님 생활비 외 월 ${money(f.input.targetProfit ?? 0)} 추가 확보`)}
        ${metric('하루 필요 주문 수', f.dailyTargetOrders === null ? '객단가·영업일 입력 필요' : `${f.dailyTargetOrders.toLocaleString()}건`, f.dailyTargetRevenue === null ? '객단가와 매출은 같은 부가세 기준' : `하루 매출 ${money(f.dailyTargetRevenue)} · 월 ${f.input.operatingDays}일 영업`)}
      </div>
      ${f.missing.length ? `<div class="consult-alert"><strong>미입력 비용이 있습니다</strong>${list(f.missing)}<p>미입력 금액은 제외했습니다. 표시 금액은 비용 하한이며, 완성된 흑자 기준으로 사용할 수 없습니다.</p></div>` : ''}
      <details><summary>계산에 사용한 조건과 수식</summary><dl class="consult-facts">
        <div><dt>월세 / 관리비 / 직원 인건비</dt><dd>${money(f.input.rent)} / ${money(f.input.maintenance)} / ${money(f.input.labor)}</dd></div>
        <div><dt>기타 고정 운영비 / 보험료</dt><dd>${money(f.input.otherFixed)} / ${money(f.input.insurance)}</dd></div>
        <div><dt>변동비율 / 매출에서 남는 비율</dt><dd>${f.input.variableCostRate === null ? '입력 필요' : `${(f.input.variableCostRate * 100).toFixed(1)}% / ${(100 - f.input.variableCostRate * 100).toFixed(1)}%`}</dd></div>
        <div><dt>사장님 생활비 / 원금 상환</dt><dd>${money(f.input.ownerPay)} / ${money(f.input.loanPrincipal)}</dd></div>
        <div><dt>월 이자 / 월 현금 지출 합계</dt><dd>${money(f.monthlyInterest)} / ${money(f.fixedCashCosts)}</dd></div>
        <div><dt>검토용 월매출 / 객단가</dt><dd>${money(f.input.expectedRevenue)} / ${number(f.input.ticketPrice, '원')}</dd></div>
      </dl><p>현금 손익분기 매출 = (고정 운영비 + 이자 + 원금 상환 + 사장님 생활비) ÷ (1 − 변동비율). 보증금·권리금은 월 비용에 중복 합산하지 않습니다.</p><p>부가세를 제외한 동일 기준으로 입력하세요. 소득세·법인세·감가상각·시설 투자 회수는 미반영이며, 계산상 잉여금은 회계상 순이익과 다릅니다. 실제 세금·재투자 비용을 따로 확보해야 합니다.</p></details>
    </section>
    <section class="consult-section"><h3>매출이 덜 나오면 얼마나 버틸까요?</h3><p>${f.input.expectedRevenue === null ? '예상 매출이 없어 손익분기점을 중심으로 가정한 비교입니다.' : '입력한 매출을 중심으로 비교합니다. 실제 매출 예측이 아닙니다.'}</p>
      ${f.scenarios.length ? `<div class="consult-scenarios">${f.scenarios.map(s => `<div class="consult-scenario ${s.cashAfterOwner < 0 ? 'is-loss' : ''}"><h4>${e(s.label)}</h4><dl><div><dt>월매출</dt><dd>${money(s.revenue)}</dd></div><div><dt>변동비</dt><dd>${money(s.variableCosts)}</dd></div><div><dt>영업 잔액</dt><dd>${money(s.operatingProfit)}</dd></div><div><dt>생활비·대출 후 현금</dt><dd>${money(s.cashAfterOwner)}</dd></div></dl></div>`).join('')}</div>` : '<p class="consult-alert">변동비율을 확인한 후 계산할 수 있습니다.</p>'}
      ${f.variableCostUp5Cash !== null ? `<p>변동비율이 5%p 오르면 입력 매출 기준 생활비·대출 후 현금은 <strong>${money(f.variableCostUp5Cash)}</strong>입니다.</p>` : ''}
    </section>
    <section class="consult-section"><h3>주변에 누가 살고 있나요?</h3>
      ${rp?.status === 'estimated' ? `<div class="consult-metrics">${metric(`반경 ${report.radiusM}m 거주인구 추정`, `약 ${number(rp.population, '명')}`, '집계구 인구를 반경과 겹치는 면적 비율로 배분')}${metric('반경 내 가구 추정', rp.households === null ? '미확인' : `약 ${number(rp.households, '가구')}`, `${p.referenceYear}년 통계 · ${rp.boundaryYear ?? '미확인'}년 경계`)}</div>` : `<div class="consult-alert"><strong>반경 ${report.radiusM}m 거주인구: ${rp?.status === 'partial' ? '일부 자료 누락' : '미확인'}</strong>${rp?.status === 'partial' ? `<p>인구 확인 ${rp.knownPopulationCells} / ${rp.cellCount}개 집계구. ${rp.knownPopulationEstimate === null ? '' : `확인된 자료만 면적 배분한 인구는 약 ${number(rp.knownPopulationEstimate, '명')}입니다. 이는 전체 반경 인구가 아닙니다.`}</p>` : ''}</div>`}
      <p>${e(rp?.note || p.note)}</p>
      ${rp?.spatialBounds ? `<details><summary>추정 오차와 자료 범위 보기</summary><p>반경 안에 완전히 포함된 집계구 인구: ${number(rp.spatialBounds.minimum, '명')}. 반경에 조금이라도 걸친 집계구의 전체 인구: ${number(rp.spatialBounds.maximum, '명')}. 이 두 값은 공간 배치에 따른 범위이며 통계적 신뢰구간이 아닙니다. 경계에 걸친 대단지·공원·업무지역에서는 면적 비례 추정 오차가 클 수 있습니다.</p><p>${rp.cellCount}개 집계구 · 인구 자료가 확인된 교차 면적 ${((rp.populationAreaCoverage ?? 0) * 100).toFixed(1)}%</p></details>` : ''}
      <dl class="consult-facts"><div><dt>참고 통계 범위</dt><dd>${e(p.areaName)} · 행정동 전체</dd></div><div><dt>인구 / 가구</dt><dd>${number(p.population, '명')} / ${number(p.households, '가구')}</dd></div><div><dt>출처 / 기준연도</dt><dd>${e(p.source)} / ${p.referenceYear ?? '미확인'}</dd></div></dl><p>가구 수는 주택 수와 다릅니다. 배후 주거수요를 판단하려면 최신 입주 가구와 실제 도보 접근권 자료가 추가로 필요합니다.</p>
    </section>
    <section class="consult-section"><h3>어떤 점포와 경쟁하나요?</h3><p><strong>${c.status === 'available' ? `분류·상호 기준 ${c.count}개 등록 점포` : c.status === 'unsupported' ? '이 업종의 분류 기준 미지원' : '경쟁점 자료 미확인'}</strong> · 직선 반경 ${c.radiusM}m</p>
      ${c.stores.length ? `<ol class="consult-stores">${c.stores.map(s => `<li><div><strong>${e(s.name)}</strong><span>${e(s.category)} · ${s.match === 'keyword' ? '상호·분류명 일치 후보' : '업종 분류 일치'}</span><small>${e(s.address || '주소 미제공')}</small></div><b>${s.distanceM}m</b></li>`).join('')}</ol><p>가까운 순 최대 30개 표시 · 총 집계 ${c.count}개. 거리는 도보 경로가 아닌 직선거리입니다.</p>` : `<p>${c.count === 0 ? '자료에서 일치 점포가 발견되지 않았습니다. 미등록·최근 개업·유사 대체 업종까지 없다는 뜻은 아닙니다.' : '조회 실패를 경쟁점 0개로 해석하지 않습니다.'}</p>`}
      <p>자료 범위: ${e(c.datasets.join(', ') || '미확인')} · 자료 기준일: ${e(c.referenceDate || '미확인')}</p>${list(c.limitations)}
    </section>
    <section class="consult-section"><h3>이 자리에서 먼저 해결할 위험</h3>${list(report.risks)}</section>
    <section class="consult-section"><h3>계약 전 실행할 일</h3>${list(report.actions)}<details open><summary>현장에서 확인</summary>${list(report.fieldChecks)}</details><details><summary>임대인·양도인에게 확인</summary>${list(report.contractChecks)}</details></section>
    <footer class="consult-section consult-note"><strong>종합 안전 등급은 판단을 보류합니다.</strong><p>실제 유동·소비 매출, 최신 입주와 임대차 근거를 교차 검증하지 않아 성공 확률이나 검증된 CRI 점수를 제시할 수 없습니다. 위 결과는 입력 비용과 확인 가능한 인구·점포 자료에 근거한 조건부 검토입니다.</p></footer>
  </article>`;
}
