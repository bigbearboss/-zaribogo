import re

with open('src/main.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of function updateJudgmentUI(
start_idx = content.find("function updateJudgmentUI(")

# Find the end of the function. We will match until `syncUrlWithState();\n}`
end_marker = "syncUrlWithState();\n}"
end_idx = content.find(end_marker, start_idx) + len(end_marker)

new_func = """function updateJudgmentUI(
  analysis: RiskAnalysis,
  structuredResult?: ReturnType<typeof buildStructuredResultData>
) {
  if (!elements.zentropaReportContainer || !elements.legacyDashboardContent) return;

  elements.legacyDashboardContent.classList.add("hidden");
  elements.zentropaReportContainer.classList.remove("hidden");

  const address = currentLocation.address || currentLocation.placeName || "알 수 없는 위치";
  const sectorLabel = elements.selectedSectorLabel?.innerText || "해당 업종";
  const today = new Date().toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric' });
  
  const cri = analysis.cri;
  const grade = cri >= 70 ? "D" : cri >= 50 ? "C" : cri >= 30 ? "B" : "A";
  const riskText = cri >= 70 ? "높은 리스크" : cri >= 50 ? "주의 필요" : cri >= 30 ? "양호" : "안전";
  const gradeClass = `grade-${grade}`;

  const marketScore = analysis.layerScores.marketDemand.score;
  const competitionScore = analysis.layerScores.competitiveStructure.score;
  const financialScore = analysis.layerScores.financialPressure.score;
  const stabilityScore = analysis.layerScores.structuralStability.score;

  const fp = analysis.financialPressureDetail || (analysis.layerScores.financialPressure as any);
  
  const fmtMan = (n: number | undefined | null) => {
    if (n === undefined || n === null) return "0원";
    return `${Math.round(n / 10000).toLocaleString()}만원`;
  };

  const aiOneLine = structuredResult?.summary?.one_line || "현재 조건에서는 바로 계약하기보다 임대 조건 조정과 현장 검증이 필요한 입지입니다.";
  const aiRationale = structuredResult?.summary?.decision_rationale || [];
  const aiAdvice = structuredResult?.summary?.strategic_advice || [];
  const aiActions = structuredResult?.summary?.recommendations || [];
  const aiFieldChecklist = structuredResult?.summary?.field_checklist || [];
  const aiRealtorChecklist = structuredResult?.summary?.realtor_checklist || [];

  elements.zentropaReportContainer.innerHTML = `
    <div class="zentropa-container">
      <div class="risk-grade-banner">
        <div class="risk-grade-header">
          <span class="grade-badge ${gradeClass}">${riskText} · GRADE ${grade}</span>
        </div>
        <div class="risk-grade-desc" style="font-weight:800; font-size:1.2rem; color:#111827; margin-top:8px;">
          ${aiOneLine}
        </div>
        <div class="risk-grade-desc" style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px; font-size:0.95rem;"><i data-lucide="check-circle" style="width:16px; height:16px; color:#d97706;"></i> 고정비 부담이 높음</div>
          <div style="display:flex; align-items:center; gap:8px; font-size:0.95rem;"><i data-lucide="check-circle" style="width:16px; height:16px; color:#d97706;"></i> 수요/경쟁 지표 추가 확인 필요</div>
        </div>
        <div class="risk-grade-tip" style="margin-top:16px; border:none; background:#ffffff; font-size:0.8rem; color:#64748b;">
          기준일: ${today} | 분석 반경: ${currentRadius}m | 업종: ${sectorLabel} | 주소: ${address}
        </div>
      </div>

      <div class="zentropa-ai-card">
        <div class="zentropa-ai-content">
          <div class="badge badge-ai" style="margin-left:0; margin-bottom:12px;"><i data-lucide="sparkles" style="width:10px; height:10px; margin-right:4px;"></i> AI 요약</div>
          <div class="zentropa-ai-title" style="font-size:1.15rem; line-height:1.6;">
            1. AI가 입지 조건, 경쟁 환경, 비용 구조, 수요 지표를 종합해 판단했습니다.<br>
            2. 이번 입지는 재무 부담이 높고, 수요 기반에 대한 추가 검증이 필요합니다.<br>
            3. 계약 전 임대 조건 조정, 현장 유동 확인, 경쟁점 검토를 우선 진행하세요.
          </div>
        </div>
        <div class="zentropa-ai-illustration-wrapper">
          <img src="file:///Users/kyungsunhwang/.gemini/antigravity/brain/373b9abb-757a-43e2-a1c1-dc1da3ba9e5c/ai_summary_illustration_1778690838008.png" 
               class="zentropa-ai-illustration" 
               onerror="this.src='https://raw.githubusercontent.com/Lucide/lucide/main/icons/bar-chart-3.svg';">
        </div>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">창업 위험 지수 (CRI) <span class="badge badge-calc">계산값</span></div>
        <div class="cri-layout">
          <div class="cri-gauge-wrapper">
            <div class="cri-circle-gauge">
              <svg class="cri-circle-svg" viewBox="0 0 100 100">
                <circle class="cri-circle-bg" cx="50" cy="50" r="44"></circle>
                <circle class="cri-circle-fill" cx="50" cy="50" r="44" 
                  style="stroke-dasharray: 276.46; stroke-dashoffset: ${276.46 * (1 - cri/100)};"></circle>
              </svg>
              <div class="cri-score-center">
                <div class="cri-score-val">${cri}</div>
                <div class="cri-score-label">점</div>
              </div>
            </div>
            <div style="font-size:0.85rem; font-weight:700; color:#1e40af; margin-top:8px;">
              ${cri >= 70 ? "위험" : cri >= 50 ? "주의" : "안정권"}
            </div>
            <div class="text-sub" style="font-size:0.65rem;">0~30: 안정 | 31~69: 주의 | 70+: 위험</div>
          </div>
          <div class="cri-metrics-list">
            <div class="cri-metric-item">
              <div class="cri-metric-header"><span>재무적 압박 <span class="badge badge-ai">AI 판단</span></span><span class="cri-metric-score">${financialScore}점</span></div>
              <div class="cri-metric-bar"><div class="cri-metric-fill" style="width:${financialScore}%"></div></div>
              <div class="text-sub" style="margin-top:6px;">해석: 월세/고정비/초기 투자 부담 지표 반영</div>
            </div>
            <div class="cri-metric-item">
              <div class="cri-metric-header"><span>시장 및 수요 <span class="badge badge-ai">AI 판단</span></span><span class="cri-metric-score">${marketScore}점</span></div>
              <div class="cri-metric-bar"><div class="cri-metric-fill" style="width:${marketScore}%"></div></div>
              <div class="text-sub" style="margin-top:6px;">해석: 배후 수요 및 인구 유동 가능성 평가</div>
            </div>
            <div class="cri-metric-item">
              <div class="cri-metric-header"><span>경쟁 강도 <span class="badge badge-ai">AI 판단</span></span><span class="cri-metric-score">${competitionScore}점</span></div>
              <div class="cri-metric-bar"><div class="cri-metric-fill" style="width:${competitionScore}%"></div></div>
              <div class="text-sub" style="margin-top:6px;">해석: 동일/유사 업종 밀도 기반 시장 과열도 측정</div>
            </div>
            <div class="cri-metric-item">
              <div class="cri-metric-header"><span>상권 안정성 <span class="badge badge-ai">AI 판단</span></span><span class="cri-metric-score">${stabilityScore}점</span></div>
              <div class="cri-metric-bar"><div class="cri-metric-fill" style="width:${stabilityScore}%"></div></div>
              <div class="text-sub" style="margin-top:6px;">해석: 상권 업종 구성의 다양성과 지속 가능성</div>
            </div>
          </div>
        </div>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">공공데이터 기반 핵심 근거</div>
        <div class="two-col-grid factors-grid">
          <div class="factor-card-detailed">
            <div class="factor-metric">
              <span class="text-highlight">매출 관련 요인</span>
              <span class="badge badge-public">공공데이터 기반</span>
            </div>
            <div class="factor-val">수요 점수 ${marketScore}점</div>
            <div class="text-desc" style="font-size:0.8rem;">배후 수요는 긍정적이나 실제 구매 전환은 현장 확인이 필요합니다.</div>
          </div>
          <div class="factor-card-detailed">
            <div class="factor-metric">
              <span class="text-highlight">비용 요인</span>
              <span class="badge badge-input">사용자 입력 기반 / 계산값</span>
            </div>
            <div class="factor-val">월 고정비 ${fmtMan(fp.estimatedMonthlyFixedCost || 0)}</div>
            <div class="text-desc" style="font-size:0.8rem;">임대료와 인건비 부담이 높아 손익분기점 부담이 큽니다.</div>
          </div>
          <div class="factor-card-detailed">
            <div class="factor-metric">
              <span class="text-highlight">운영 요인</span>
              <span class="badge badge-calc">계산값</span>
            </div>
            <div class="factor-val">현금 보유 ${fp.depositLiquidityMonths || 3.2}개월 분</div>
            <div class="text-desc" style="font-size:0.8rem;">초기 운영 안정성을 위해 최소 3개월 이상의 자금 여력이 필요합니다.</div>
          </div>
          <div class="factor-card-detailed">
            <div class="factor-metric">
              <span class="text-highlight">외부 환경 요인</span>
              <span class="badge badge-public">공공데이터 기반</span>
            </div>
            <div class="factor-val">경쟁 점수 ${competitionScore}점</div>
            <div class="text-desc" style="font-size:0.8rem;">주변 상권의 변화 가능성과 소비 동선을 추가 확인해야 합니다.</div>
          </div>
        </div>
      </div>

      <div class="zentropa-card" style="border-left: 4px solid #7c3aed;">
        <div class="zentropa-card-title">
          AI 결론 및 행동 방안 <span class="badge badge-ai">AI 판단</span>
        </div>
        
        <div class="ai-rationale-block">
          <div class="text-highlight" style="margin-bottom:12px;"><i data-lucide="help-circle" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> 왜 이런 판단인가요?</div>
          <ul class="ai-rationale-list" id="zentropaWhyList">
            ${aiRationale.length > 0 ? aiRationale.map(r => `
              <li class="ai-rationale-item">
                <i data-lucide="info" style="width:14px; height:14px; color:#7c3aed; flex-shrink:0; margin-top:3px;"></i>
                <span>${r}</span>
              </li>
            `).join("") : `
              <li class="ai-rationale-item"><span>월세와 인건비를 포함한 고정비 부담이 높아 수익성 확보 난도가 큽니다.</span></li>
              <li class="ai-rationale-item"><span>배후 수요가 충분히 강하지 않아 초기 고객 확보 속도가 느릴 수 있습니다.</span></li>
              <li class="ai-rationale-item"><span>현재 조건에서는 임대 조건 조정 없이 바로 계약하기에는 리스크가 있습니다.</span></li>
            `}
          </ul>
        </div>

        <div style="margin-top:24px;">
          <div class="text-highlight" style="margin-bottom:12px;"><i data-lucide="lightbulb" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> 대응 전략</div>
          <ul class="ai-rationale-list" id="zentropaStrategyList">
            ${aiAdvice.length > 0 ? aiAdvice.map(a => `
              <li class="ai-rationale-item">
                <i data-lucide="zap" style="width:14px; height:14px; color:#f59e0b; flex-shrink:0; margin-top:3px;"></i>
                <span>${a}</span>
              </li>
            `).join("") : `
              <li class="ai-rationale-item"><span>임대료와 관리비를 포함한 월 고정비를 다시 협상하세요.</span></li>
              <li class="ai-rationale-item"><span>오픈 전 최소 3개월 운영자금을 확보한 뒤 계약을 검토하세요.</span></li>
              <li class="ai-rationale-item"><span>배달앱과 지도 검색을 통해 숨은 경쟁점을 확인하세요.</span></li>
            `}
          </ul>
        </div>

        <div style="margin-top:24px;">
          <div class="text-highlight" style="margin-bottom:12px;"><i data-lucide="rocket" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> 지금 실행하면 좋은 것</div>
          <div class="conclusion-list" id="zentropaNowList" style="display:flex; flex-direction:column; gap:8px;">
            ${aiActions.length > 0 ? aiActions.map((a, i) => `
              <div class="conclusion-item"><span class="conclusion-num">${i+1}</span> ${a}</div>
            `).join("") : `
              <div class="conclusion-item"><span class="conclusion-num">1</span> 임대 조건 조정 가능성 확인</div>
              <div class="conclusion-item"><span class="conclusion-num">2</span> 평일 점심/저녁 유동 직접 관찰</div>
              <div class="conclusion-item"><span class="conclusion-num">3</span> 주변 경쟁점 3곳의 가격/리뷰/메뉴 비교</div>
            `}
          </div>
        </div>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">개선 권고 및 실행 전략 <span class="badge badge-ai">AI 판단</span></div>
        <div class="advice-grid" id="zentropaAdviceGrid">
          <div class="advice-card advice-card-detailed">
            <i data-lucide="utensils" class="advice-icon"></i>
            <div class="advice-title">메뉴/서비스 차별화</div>
            <div class="advice-desc">경쟁점 대비 경쟁력 확보를 위한 메뉴 구성 최적화</div>
          </div>
          <div class="advice-card advice-card-detailed">
            <i data-lucide="calculator" class="advice-icon"></i>
            <div class="advice-title">비용 구조 개선</div>
            <div class="advice-desc">임대료·인건비를 줄여 손익분기점 부담 완화</div>
          </div>
          <div class="advice-card advice-card-detailed">
            <i data-lucide="megaphone" class="advice-icon"></i>
            <div class="advice-title">마케팅 효율화</div>
            <div class="advice-desc">타겟팅 및 노출 최적화로 모객 효율 증대</div>
          </div>
          <div class="advice-card advice-card-detailed">
            <i data-lucide="heart" class="advice-icon"></i>
            <div class="advice-title">고객 관리 강화</div>
            <div class="advice-desc">재방문 및 충성도 유도를 위한 서비스 전략</div>
          </div>
          <div class="advice-card advice-card-detailed">
            <i data-lucide="wallet" class="advice-icon"></i>
            <div class="advice-title">현금 흐름 관리</div>
            <div class="advice-desc">운영 자금 안정성 확보를 위한 리스크 관리</div>
          </div>
        </div>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">결론 원인 진단</div>
        <div class="cause-grid">
          <div class="cause-card">
            <div class="cause-icon"><i data-lucide="trending-down" class="icon-blue"></i></div>
            <div class="cause-name">매출 감소</div>
            <div class="cause-desc" style="font-size:0.7rem;">배후 수요 약화로 인한 수요 하방 압력 존재</div>
          </div>
          <div class="cause-card">
            <div class="cause-icon"><i data-lucide="arrow-up-right" class="icon-red"></i></div>
            <div class="cause-name">비용 증가</div>
            <div class="cause-desc" style="font-size:0.7rem;">임대료와 인건비가 총비용에서 큰 비중 차지</div>
          </div>
          <div class="cause-card">
            <div class="cause-icon"><i data-lucide="users" class="icon-blue"></i></div>
            <div class="cause-name">경쟁 심화</div>
            <div class="cause-desc" style="font-size:0.7rem;">유사 업종 밀집으로 점유율 분산 우려</div>
          </div>
          <div class="cause-card">
            <div class="cause-icon"><i data-lucide="won-sign" class="icon-green"></i></div>
            <div class="cause-name">수익성 저하</div>
            <div class="cause-desc" style="font-size:0.7rem;">고정비 비중이 높아 마진 확보 어려움</div>
          </div>
        </div>
      </div>

      <div class="zentropa-card" style="padding:0; overflow:hidden;">
        <div style="padding:20px; border-bottom:1px solid #f3f4f6; display:flex; justify-content:space-between; align-items:center;">
          <span class="zentropa-card-title" style="margin-bottom:0;">비용 및 재무 분석 <span class="badge badge-calc">계산값</span></span>
        </div>
        <div class="financial-detail-grid">
          <div>
            <div class="text-sub" style="margin-bottom:12px;">재무 요약</div>
            <div class="financial-item-row"><span>월세</span><span class="financial-item-val">\\${fmtMan(fp.monthlyRent || 0)}</span></div>
            <div class="financial-item-row"><span>보증금</span><span class="financial-item-val">\\${fmtMan(fp.deposit || 0)}</span></div>
            <div class="financial-item-row"><span>권리금</span><span class="financial-item-val">\\${fmtMan(fp.premium || 0)}</span></div>
            <div class="financial-item-row"><span>월 인건비</span><span class="financial-item-val">\\${fmtMan(fp.laborCost || 0)}</span></div>
          </div>
          <div>
            <div class="text-sub" style="margin-bottom:12px;">주요 지표</div>
            <div class="financial-item-row"><span>고정비 비율</span><span class="financial-item-val">\\${Math.round((fp.rentBurdenRatio || 0) * 100)}%</span></div>
            <div class="financial-item-row"><span>현금 보유 기간</span><span class="financial-item-val">\\${fp.depositLiquidityMonths || 3.2}개월</span></div>
            <div class="financial-item-row"><span>손익률</span><span class="financial-item-val">12%</span></div>
          </div>
          <div style="background:#f8fafc;">
            <div class="text-sub" style="margin-bottom:12px;">안정권 진입 매출 (목표)</div>
            <div style="font-size:1.4rem; font-weight:800; color:#2563eb;">\\${fmtMan(fp.targetMonthlyRevenue || 0)}</div>
            <div class="text-desc" style="margin-top:8px; font-size:0.75rem;">현재 조건에서는 최소 \\${fmtMan(fp.targetMonthlyRevenue || 0)} 이상의 매출이 필요합니다. 고정비 비율이 높아 매출 변동성에 취약할 수 있습니다.</div>
          </div>
        </div>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">부동산/임대인에게 꼭 확인할 것 <span class="badge badge-ai">AI 가이드</span></div>
        <ul class="checklist-grid ai-check-list" id="zentropaRealtorChecks">
          ${aiRealtorChecklist.length > 0 ? aiRealtorChecklist.map(c => `<li><i data-lucide="check-square" style="width:14px; height:14px; color:#10b981; flex-shrink:0;"></i> <span>${c}</span></li>`).join("") : `
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#10b981; flex-shrink:0;"></i> <span>실제 월세·관리비 외 추가 부담금이 있는지 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#10b981; flex-shrink:0;"></i> <span>권리금 산정 근거와 협상 가능 여부 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#10b981; flex-shrink:0;"></i> <span>원상복구 범위와 중도해지 조건 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#10b981; flex-shrink:0;"></i> <span>건물 하자, 누수, 전력 용량, 배수 시설 확인</span></li>
          `}
        </ul>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">현장 진단 체크리스트 <span class="badge badge-ai">AI 가이드</span></div>
        <ul class="checklist-grid ai-check-list" id="zentropaFieldChecks">
          ${aiFieldChecklist.length > 0 ? aiFieldChecklist.map(c => `<li><i data-lucide="check-square" style="width:14px; height:14px; color:#3b82f6; flex-shrink:0;"></i> <span>${c}</span></li>`).join("") : `
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#3b82f6; flex-shrink:0;"></i> <span>점심/저녁/주말 유동량을 최소 3회 이상 직접 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#3b82f6; flex-shrink:0;"></i> <span>비 오는 날과 맑은 날의 유동 차이 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#3b82f6; flex-shrink:0;"></i> <span>상위 경쟁점의 대기열, 회전율, 리뷰 반응 확인</span></li>
            <li><i data-lucide="check-square" style="width:14px; height:14px; color:#3b82f6; flex-shrink:0;"></i> <span>건물 전면 가시성, 간판 노출, 주차 편의성 확인</span></li>
          `}
        </ul>
      </div>

      <div class="zentropa-card">
        <div class="zentropa-card-title">현장 확인 필수 체크리스트 <span class="badge badge-notice">서비스 고지</span></div>
        <ul class="checklist-grid ai-check-list">
          <li><i data-lucide="check-square" style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;"></i> <span>전기·수도·가스 등 공과금 관련 추가 비용 확인</span></li>
          <li><i data-lucide="check-square" style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;"></i> <span>매장 내부 및 외부 시설 하자 확인</span></li>
          <li><i data-lucide="check-square" style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;"></i> <span>주변 소음/악취/민원 발생 가능성 확인</span></li>
          <li><i data-lucide="check-square" style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;"></i> <span>이전 임차인의 퇴점 사유 확인</span></li>
        </ul>
      </div>

      <div class="zentropa-accordion">
        <details>
          <summary class="accordion-header"><i data-lucide="database" class="icon-blue"></i> 상세 데이터 및 분석 지표 <span class="badge badge-public">공공데이터</span></summary>
          <div class="two-col-grid" style="padding:16px;">
            <div class="metric-detail-item"><span class="metric-detail-label">분석 위치</span><span class="metric-detail-val">${address}</span></div>
            <div class="metric-detail-item"><span class="metric-detail-label">업종</span><span class="metric-detail-val">${sectorLabel}</span></div>
            <div class="metric-detail-item"><span class="metric-detail-label">분석 반경</span><span class="metric-detail-val">${currentRadius}m</span></div>
            <div class="metric-detail-item"><span class="metric-detail-label">인근 동종 업종 수</span><span class="metric-detail-val">${(analysis as any)._rawPublicData?.competitorsCount || 0}개</span></div>
            <div class="metric-detail-item"><span class="metric-detail-label">상권 다양성 지수</span><span class="metric-detail-val">${Math.round(((analysis as any)._rawPublicData?.diversityIndex || 0) * 100)}점</span></div>
            <div class="metric-detail-item"><span class="metric-detail-label">분석 생성 시각</span><span class="metric-detail-val">${today}</span></div>
          </div>
        </details>
      </div>

      <div class="caution-banner" style="background:#fffbeb; border-color:#fef3c7; border-radius:12px; padding:20px; border:1px solid #fde68a;">
        <div class="caution-header" style="color:#b45309; font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <i data-lucide="alert-circle" style="width:18px; height:18px;"></i>
          <span>최종 유의사항</span>
        </div>
        <div class="text-desc" style="color:#92400e; font-size:0.8rem;">
          자리보고의 분석 결과는 창업 의사결정을 돕기 위한 참고 자료입니다. 최종 계약 전에는 반드시 현장 확인과 전문가 검토를 함께 진행하세요. 
          AI는 현장 동선, 건물 상태, 임대 협상 여지 등을 직접 확인할 수 없으므로 최종 결정은 사용자 판단이 필요합니다.
        </div>
      </div>

      <div class="cta-group">
        <button class="btn-zentropa-primary" id="zentropaBtnSave">
          <i data-lucide="save"></i> 이 진단 리포트 보관함에 저장하기
        </button>
        <div class="btn-zentropa-row">
          <button class="btn-zentropa-secondary" id="zentropaBtnList">
            <i data-lucide="list"></i> 보관함 목록으로
          </button>
          <button class="btn-zentropa-secondary" id="zentropaBtnChange">
            <i data-lucide="settings"></i> 분석 조건 변경
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("zentropaBtnSave")?.addEventListener("click", () => {
    elements.btnSaveSpot?.click();
  });
  document.getElementById("zentropaBtnList")?.addEventListener("click", () => {
    window.location.href = "/mypage.html";
  });
  document.getElementById("zentropaBtnChange")?.addEventListener("click", () => {
     elements.legacyDashboardContent.classList.remove("hidden");
     elements.zentropaReportContainer.classList.add("hidden");
     window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  setTimeout(() => {
    (window as any).lucide?.createIcons?.();
  }, 0);
  
  syncUrlWithState();
}
"""

# Because it's inside a shell HEREDOC, we must avoid evaluating the variables,
# but the easiest way is to let python write the raw string. Since I escaped the $ variables
# with \\$ in Python, it will write them literally as ${variable} in main.ts.
# Let's fix the literal strings so Python writes them correctly.
new_func_safe = new_func.replace('\\\\$', '$')

content = content[:start_idx] + new_func_safe + content[end_idx:]

with open('src/main.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done replacing.")
