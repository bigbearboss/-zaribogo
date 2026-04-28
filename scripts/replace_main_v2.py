import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_tag = '<main class="dashboard briefing-dashboard">'
end_tag = '</main>'

start_idx = content.find(start_tag)
if start_idx == -1:
    print("Could not find start tag")
    exit()

end_idx = content.find(end_tag, start_idx)
if end_idx == -1:
    print("Could not find end tag")
    exit()

end_idx += len(end_tag)

new_main = """<main class="dashboard briefing-dashboard">
    <div class="dashboard-content-wrapper">
        <!-- 1. Verdict Banner -->
        <div class="verdict-banner">
            <div class="verdict-header">
                <div id="reportStatusBadge" class="status-badge">판단 대기 중</div>
                <span id="reportLocationText">위치를 선택해주세요</span>
                <span class="context-coords" id="reportCoordsText"></span>
            </div>
            <h3 id="reportSummary" class="verdict-title">자리를 선택하여 판단을 시작하세요.</h3>
            
            <div id="estimationBanner" class="estimation-banner hidden" style="margin-top: 12px; padding: 10px; font-size: 0.85rem; border-radius: 8px;">
                ⚠️ 일부 지표는 구역 평균값을 사용하여 추정되었습니다. 주변 환경을 직접 확인하는 현장 답사를 꼭 병행해주세요.
            </div>

            <!-- hidden elements needed for main.ts without disrupting flow -->
            <div style="display:none;">
                <div id="finalJudgmentBadge" class="final-judgment-badge hidden">--</div>
                <div id="mainDecisionBadge" class="decision-main-badge hidden">--</div>
            </div>
        </div>

        <!-- 3. Key Evidence Summary (Top 3 Risks) -->
        <section class="top-risk-factors dashboard-card" id="judgmentReport">
            <h3 class="section-heading">🚨 핵심 위험 및 주의 요소</h3>
            <!-- reportReasons populated by main.ts (<li> tags) -->
            <ul id="reportReasons" class="top-risk-list">
                <li class="risk-placeholder">자리를 선택하면 상권 내 가장 취약한 위험 요소가 여기에 요약됩니다.</li>
            </ul>
            
            <!-- Hide extra headings but keep elements so main.ts doesn't crash -->
            <div style="display: none;">
                <div id="evidenceEstimationBadge" class="estimation-badge-mini hidden">⚠️ 일부 지표 추정됨</div>
                <div class="evidence-grid risk-evidence" id="evidenceContainer"></div>
                <span id="proResultLabel"></span>
                <button id="btnShare"></button>
                <button id="btnDownload"></button>
                <ul id="reportActions"></ul>
            </div>
        </section>

        <!-- 2. CRI Summary Card -->
        <section class="cri-summary-card dashboard-card" id="scoreBox">
            <div class="cri-summary-layout">
                <div class="cri-summary-left">
                    <h4 class="cri-title">창업 위험 지수 (CRI)</h4>
                    <div class="gauge-container cri-gauge-compact">
                        <svg class="gauge-svg" viewBox="0 0 200 110">
                            <defs>
                                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stop-color="var(--accent-primary)" />
                                    <stop offset="100%" stop-color="var(--accent-secondary)" />
                                </linearGradient>
                            </defs>
                            <path class="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke-width="12" stroke-linecap="round" />
                            <path class="gauge-fill" id="gaugePath" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke-width="12" stroke-linecap="round" stroke="url(#gaugeGradient)" />
                        </svg>
                        <div class="gauge-content">
                            <div class="score-display" id="compositeScore">--</div>
                            <div class="score-label">점</div>
                        </div>
                    </div>
                    <div class="cri-score-info">
                        <div class="tier-label" id="riskTier">판단 대기 중</div>
                        <div class="stability-distance" id="stabilityDistance"></div>
                        <div id="criEstimationBadge" class="estimation-badge-mini hidden">⚠️ 추정 데이터 포함</div>
                    </div>
                </div>
                
                <div class="cri-summary-right">
                    <div class="cri-disclaimer-box">* 안정권 34점 이하 / 주의 35~69점 / 위험 70점 이상</div>
                    <div class="cri-breakdown-row compact-metrics" id="reportBreakdown">
                        <div class="cri-layer compact-layer">
                            <span class="layer-title">💸 재무적 압박</span>
                            <div class="layer-value" id="fScore">--</div>
                            <div class="layer-hint" id="fExp">--</div>
                        </div>
                        <div class="cri-layer compact-layer">
                            <span class="layer-title">🏢 시장 및 수요</span>
                            <div class="layer-value" id="mScore">--</div>
                            <div class="layer-hint" id="mExp">--</div>
                        </div>
                        <div class="cri-layer compact-layer">
                            <span class="layer-title">⚔️ 경쟁 강도</span>
                            <div class="breakdown-bar-bg"><div id="barCompetition" class="breakdown-bar-fill"></div></div>
                            <span id="valCompetition" class="breakdown-val">--</span>
                        </div>
                        <div class="cri-layer compact-layer">
                            <span class="layer-title">🎯 업종 다양성</span>
                            <div class="breakdown-bar-bg"><div id="barDiversity" class="breakdown-bar-fill"></div></div>
                            <span id="valDiversity" class="breakdown-val">--</span>
                        </div>
                    </div>
                </div>
                <!-- Hidden elements for main.ts compatibility -->
                <div class="hidden" style="display:none;">
                    <div id="barDemand"></div><span id="valDemand"></span>
                </div>
            </div>
        </section>

        <!-- 4. AI Strategy Summary -->
        <section class="ai-strategy-section dashboard-card ai-conclusion-card">
            <h3 class="section-heading"><span class="ai-badge">✨ AI 통합 가이드</span> 결론 및 행동 방안</h3>
            <div class="llm-card" id="llmCard" style="display: none; box-shadow: none; padding: 0; background: transparent; border: none;">
                <div class="llm-content" id="llmContent">
                    <div class="loading ai-skeleton">
                        <div class="skeleton-line title"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-pulse-text">AI 엔진이 결과를 종합하고 핵심 방안을 도출하고 있습니다...</div>
                    </div>
                </div>
            </div>

            <div id="decisionHelperArea" class="decision-helper-section hidden" style="border: none; padding: 0; box-shadow: none; margin-top: 16px;">
                <ul id="decisionReasonList" class="decision-list hidden" style="display: none;"></ul>
                <ul id="decisionActionList" class="decision-list highlight action-first"></ul>
            </div>
            
            <div id="adjustmentContainer" class="diagnosis-card guidance-panel hidden" style="display:none;">
                <div id="adjustmentContent"></div>
            </div>
            
            <div class="cta-group briefing-cta mid-cta" style="margin-top: 24px; padding-top: 24px; border-top: 1px dashed var(--border-color);">
                <button class="cta-btn secondary" onclick="document.querySelector('.detail-accordion').setAttribute('open', '') || window.scrollTo({top: document.querySelector('.detail-accordion-section').offsetTop, behavior: 'smooth'})">
                    <span class="icon">📊</span> 상세 데이터 펼쳐보기
                </button>
            </div>
        </section>

        <!-- 5. Field Verification Checklist -->
        <section class="field-checklist-section dashboard-card compact-checklist">
            <h3 class="section-heading">📋 현장 확인 필수 체크리스트</h3>
            <div class="checklist-hint">가계약 혹은 본계약 전 아래 항목들을 점검표로 활용하세요.</div>
            <div class="checklist-tabs">
                <button class="tab-btn active" onclick="activateTab('tab-visit', event)">📍 현장 방문 시</button>
                <button class="tab-btn" onclick="activateTab('tab-realtor', event)">🏢 부동산 방문 시</button>
                <button class="tab-btn" onclick="activateTab('tab-contract', event)">📝 계약 직전</button>
            </div>
            <div class="tab-content active" id="tab-visit">
                <label class="check-item"><input type="checkbox"> <span>평일/주말 주요 영업 시간대 유동인구 30분 이상 관찰</span></label>
                <label class="check-item"><input type="checkbox"> <span>주변 동종 업계 매장(경쟁점)의 피크 타임 고객 수 파악</span></label>
                <label class="check-item"><input type="checkbox"> <span>매장 앞 간판 가시성 방해물(가로수 등) 점검</span></label>
            </div>
            <div class="tab-content" id="tab-realtor" style="display: none;">
                <label class="check-item"><input type="checkbox"> <span>이전 매장의 구체적인 폐업(이전) 사유 및 기간 파악</span></label>
                <label class="check-item"><input type="checkbox"> <span>관리비 세부 내역(수도, 전기, 공용청소비 등) 고지서 요구</span></label>
                <label class="check-item"><input type="checkbox"> <span>동일 상가 건물 내 동종 업계 입점 금지 특약 가능 여부</span></label>
            </div>
            <div class="tab-content" id="tab-contract" style="display: none;">
                <label class="check-item"><input type="checkbox"> <span>등기부등본 최종 확인 (근저당권, 가압류 등 권리관계 하자)</span></label>
                <label class="check-item"><input type="checkbox"> <span>건축물대장 확인 (불법 건축물 여부 및 용도 제한 위반)</span></label>
                <label class="check-item"><input type="checkbox"> <span>임대료 인상 상한선 및 임대차 보호법 해당 여부 확인</span></label>
            </div>
            <script>
                function activateTab(tabId, event) {
                    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
                    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                    document.getElementById(tabId).style.display = 'flex';
                    if(event && event.currentTarget) {
                        event.currentTarget.classList.add('active');
                    }
                }
            </script>
        </section>

        <!-- 6. Detail Accordion -->
        <section class="detail-accordion-section dashboard-card" style="padding: 0; box-shadow: none; background: transparent; border: none; display: block !important; visibility: visible !important;">
            <details class="detail-accordion" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; display: block !important;">
                <summary class="accordion-summary" style="margin: 0;">📊 상세 데이터 및 분석 지도 펼쳐보기</summary>
                <div class="accordion-content" style="padding: 24px; border-top: 1px solid var(--border-color); display: block !important;">
                    <section class="map-visualization-section">
                        <h4 style="margin-bottom: 12px; font-weight: 700;">📍 상권 반경 밀도 시각화</h4>
                        <!-- enforce height so map renders properly -->
                        <div class="map-container-mock" id="radiusMap" style="min-height: 300px; width: 100%;"></div>
                    </section>
                    
                    <section class="radius-comparison-section" style="margin-top: 32px;">
                        <h4 style="margin-bottom: 12px; font-weight: 700;">⚖️ 반경별 환경 비교</h4>
                        <div id="radiusComparison" class="radius-comparison-grid"></div>
                        <div id="comparisonSummary" class="comparison-summary-box hidden"></div>
                    </section>
                    
                    <section id="comparisonSection" class="comparison-section hidden" style="margin-top: 32px;">
                        <div class="comp-header">
                            <h3 style="font-weight: 700; font-size: 1.1rem; margin-bottom: 12px;">⚖️ 다른 후보지와의 비교 결과</h3>
                        </div>
                        <div id="comparisonContent" class="comp-content"></div>
                    </section>

                    <section class="confidence-section" style="margin-top: 32px;">
                        <div class="confidence-card" style="box-shadow: none; border: 1px solid var(--border-color); border-radius: 12px;">
                            <div class="conf-header">
                                <h4 style="margin: 0; font-size: 1rem; font-weight: 700;">데이터 신뢰도 <span id="confidenceLabel" class="conf-label">-</span></h4>
                                <div class="conf-score" id="confidenceScore">0.00</div>
                            </div>
                            <div class="conf-bar-bg"><div class="conf-bar-fill" id="confidenceBar"></div></div>
                            <div class="source-summary" id="sourceSummary"></div>
                        </div>
                    </section>
                    
                    <div class="analysis-meta mt-4" id="analysisMeta" style="margin-top: 24px; color: var(--text-muted); font-size: 0.85rem; text-align: center; border-top: 1px dashed var(--border-color); padding-top: 20px;">
                        <span class="meta-item">판단 반경: <span id="metaRadius">--</span></span> |
                        <span class="meta-item ml-2">데이터 출처: <span id="metaSource">--</span></span> |
                        <span class="meta-item ml-2">최종 판단 시각: <span id="metaTime">--</span></span>
                    </div>
                </div>
            </details>
        </section>

        <!-- 7. CTA Area -->
        <section class="cta-area-section sticky-bottom-mobile" style="margin-top: 32px;">
            <div class="cta-group briefing-cta" id="ctaGroup">
                <button id="btnSaveLocation" class="cta-btn primary" style="flex: 1; padding: 18px; font-size: 1.1rem;">
                    <span class="icon">💾</span> <span class="lbl">진단 리포트 보관함에 저장하기</span>
                </button>
                <div class="bottom-secondary-ctas" style="display: flex; gap: 12px; margin-top: 12px; width: 100%;">
                    <button id="btnCompareHistory" class="cta-btn secondary" style="flex: 1; padding: 14px;">
                        <span class="icon">⚖️</span> 보관함 후보지 비교
                    </button>
                    <button id="btnReanalyze" class="cta-btn secondary" style="flex: 1; padding: 14px;">
                        <span class="icon">🔄</span> 분석 조건 변경
                    </button>
                </div>
            </div>
            <ul id="actionGuidance" class="hidden" style="display:none;"></ul>
        </section>

        <footer style="margin-top: 80px; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding-bottom: 120px;">
            <div class="disclaimer" style="margin-bottom: 8px;">💡 제안된 CRI 브리핑은 100% 확정적 수익을 보장하지 않습니다.</div>
            &copy; 2026 Zaribogo.
        </footer>
    </div>
</main>"""

content = content[:start_idx] + new_main + content[end_idx:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement done.")
