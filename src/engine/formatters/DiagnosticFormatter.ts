export class RuleBasedInsightGenerator {
    static generate(
        cri: number,
        layers: { f: number, m: number, c: number, s: number },
        profileName: string,
        benchmarks: { stable: number, risk: number },
        stableTactics: { dailyCustomers: number, avgTicket: number },
        breakEvenProb: number
    ): string[] {
        const insights: string[] = [];

        // 1. 목표 벤치마킹 (항상 포함하되 문구를 결론 위주로 정제)
        insights.push(`🎯 <strong>목표 벤치마킹</strong>: ${profileName} 안정 운영을 위한 최소 목표 매출은 <strong>₩${benchmarks.stable.toLocaleString()}</strong>이며, 이는 일 <strong>${stableTactics.dailyCustomers}명</strong> (객단가 ₩${stableTactics.avgTicket.toLocaleString()}) 방문 시 달성 가능합니다.`);

        // 2. CRI 점수 기반 전체 판단 규칙
        let criDiagnosis = "";
        if (cri < 45) {
            criDiagnosis = `현재 CRI ${cri}점은 <strong>안정 운영이 가능</strong>한 우수한 지표입니다. 현행 비용 구조를 유지하며 추가적인 마케팅 효율을 도모하십시오.`;
        } else if (cri < 60) {
            criDiagnosis = `현재 CRI ${cri}점은 <strong>조정이 필요</strong>한 단계입니다. 이익 저하를 막기 위해 임대료나 인건비 등의 고정비 비중을 점검해야 합니다.`;
        } else if (cri < 75) {
            criDiagnosis = `현재 CRI ${cri}점은 <strong>조건 조정 전 진입 유보</strong>가 권장되는 높은 리스크 상태입니다. 사업 개시 전 비용 구조의 근본적인 혁신이 필요합니다.`;
        } else {
            criDiagnosis = `현재 CRI ${cri}점은 <strong>진입 재검토 권고</strong> 등급입니다. 구조적 한계로 흑자 전환이 매우 어려울 수 있으니 심사숙고하시기 바랍니다.`;
        }
        insights.push(`📊 <strong>종합 진단</strong>: ${criDiagnosis} (안정권 진입 가능성: <strong>${breakEvenProb}%</strong>)`);

        // 3. 레이어 조합에 따른 오퍼레이션 제언
        const { f, m, c, s } = layers;
        if (f > 80 && m < 50) {
            insights.push(`🛡️ <strong>오퍼레이션 제언</strong>: 고정비 부담은 매우 높은 반면 배후 수요는 정체되어 있습니다. <strong>비용 구조 개선(합리적인 임대료 협상, 인건비 절감)</strong>이 최우선 과제입니다.`);
        } else if (c > 70 && m > 60) {
            insights.push(`🛡️ <strong>오퍼레이션 제언</strong>: 지역 내 수요는 충분하지만 동일 업종 경쟁이 치열합니다. 주변 매장과 차별화된 <strong>고객 묶어두기(Lock-in) 전략</strong> 마련이 시급합니다.`);
        } else if (s < 40) {
            insights.push(`🛡️ <strong>오퍼레이션 제언</strong>: 임차 조건이나 법적 규제 등 장기 운영 불확실성이 큽니다. 사업의 영속성을 보장하기 위해 <strong>계약 조건 재검토</strong>를 우선 진행하십시오.`);
        } else if (f > 70 && c > 70) {
            insights.push(`🛡️ <strong>오퍼레이션 제언</strong>: 과도한 임차료 등의 채산성 악화와 치열한 경쟁 환경이 중첩되어 있습니다. 무리한 매출 증대보다는 <strong>단기적 손실 방어 전략</strong>이 요구됩니다.`);
        } else {
            insights.push(`🛡️ <strong>오퍼레이션 제언</strong>: 안정권 진입을 위해 월 매출 대비 총 고정비 비중을 지속적으로 40% 이하로 통제하는 데 주력하십시오.`);
        }

        // 4. 전문가 클로징 (고정 멘트 또는 간단한 격려로 대체하여 과장 제거)
        insights.push(`💡 <strong>전문가 클로징</strong>: 신규 고객 유치를 위한 일회성 광고비 지출보다는 품질 유지를 통한 <strong>재방문율 확대를 도모하여 마케팅 비용의 구조적 효율</strong>을 높이는 것을 권장합니다.`);

        return insights;
    }
}
