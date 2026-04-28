import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Using regex to find the <main class="dashboard"> ... </main> block
# We know it starts at <main class="dashboard"> and ends at the corresponding </main>
import re

start_tag = '<main class="dashboard">'
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
            <!-- 1. Verdict Banner -->
            <div class="verdict-banner">
                <div class="verdict-header">
                    <div id="reportStatusBadge" class="status-badge">판단 대기 중</div>
                    <span id="reportLocationText">위치를 선택해주세요</span>
                    <span class="context-coords" id="reportCoordsText"></span>
                </div>
                <h3 id="reportSummary" class="verdict-title">자리를 선택하여 판단을 시작하세요.</h3>
                <!-- hidden badges needed for main.ts -->
                <div id="finalJudgmentBadge" class="final-judgment-badge hidden">--</div>
                <div id="mainDecisionBadge" class="decision-main-badge hidden">--</div>
                
                <div id="estimationBanner" class="estimation-banner hidden" style="margin-top: 10px;">
                    ⚠️ 일부 지표는 주변 평균값으로 추정되었습니다. 참고용으로 활용하세요.
                </div>
            </div>

            <!-- 2. CRI Summary Card -->
            <section class="cri-summary-card dashboard-card" id="scoreBox">
                <div class="cri-header">
                    <h4>창업 위험 지수 (CRI)</h4>
                    <div class="cri-disclaimer">* 안정권 (35점 미만) / 주의 (40~69) / 위험 (70 이상)</div>
                </div>
                
                <div class="cri-main-row">
                    <div class="gauge-container">
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

                <div class="cri-breakdown-row" id="reportBreakdown">
                    <div class="cri-layer">
                        <span class="layer-title">💸 재무적 압박</span>
                        <div class="layer-value" id="fScore">--</div>
                        <div class="layer-hint" id="fExp">--</div>
                    </div>
                    <div class="cri-layer">
                        <span class="layer-title">🏢 시장 및 수요</span>
                        <div class="layer-value" id="mScore">--</div>
                        <div class="layer-hint" id="mExp">--</div>
                    </div>
                    <div class="cri-layer">
                        <span class="layer-title">⚔️ 경쟁 강도</span>
                        <div class="breakdown-bar-bg"><div id="barCompetition" class="breakdown-bar-fill"></div></div>
                        <span id="valCompetition" class="breakdown-val">--</span>
                    </div>
                    <div class="cri-layer">
                        <span class="layer-title">🎯 업종 다양성</span>
                        <div class="breakdown-bar-bg"><div id="barDiversity" class="breakdown-bar-fill"></div></div>
                        <span id="valDiversity" class="breakdown-val">--</span>
                    </div>
                    <div class="hidden" style="display:none;">
                        <div id="barDemand"></div><span id="valDemand"></span>
                    </div>
                </div>
            </section>

            <!-- 3. Top Risk Factors -->
            <section class="top-risk-factors dashboard-card" id="judgmentReport">
                <h3 class="section-heading">🚨 핵심 리스크 브리핑</h3>
                <ul id="reportReasons" class="top-risk-list">
                    <li class="risk-placeholder">자리를 선택하면 위험 요인이 정리됩니다.</li>
                </ul>
                
                <h4 class="sub-heading mt-4" style="margin-top: 24px; font-size: 0.95rem; color: var(--text-secondary);">🔍 주요 판단 근거 수치</h4>
                <div id="evidenceEstimationBadge" class="estimation-badge-mini hidden">⚠️ 일부 지표 추정됨</div>
                <div class="evidence-grid risk-evidence" id="evidenceContainer">
                    <!-- Populated by main.ts -->
                </div>
                
                <div class="hidden" style="display:none;">
                    <span id="proResultLabel"></span>
                    <button id="btnShare"></button>
                    <button id="btnDownload"></button>
                    <ul id="reportActions"></ul>
                </div>
            </section>

            <!-- 4. AI Strategy Summary -->
            <section class="ai-strategy-section dashboard-card" style="padding: 24px;">
                <div class="llm-card" id="llmCard" style="display: none; border: none; padding: 0; box-shadow: none;">
                    <div class="ai-header" style="background: none; padding: 0 0 16px 0;">
                        <h3 class="section-heading" style="margin: 0;">✨ AI 실행 전략 요약</h3>
                        <span class="ai-badge">✨ AI 분석</span>
                    </div>
                    <div class="llm-content" id="llmContent">
                        <div class="loading ai-skeleton">
                            <div class="skeleton-line title"></div>
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line"></div>
                            <div class="skeleton-pulse-text">AI가 데이터를 분석하여 요약 중입니다...</div>
                        </div>
                    </div>
                </div>

                <div id="decisionHelperArea" class="decision-helper-section hidden" style="border: none; padding: 0; box-shadow: none; margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 24px;">
                    <h3 class="section-heading mb-3">💡 행동 가이드</h3>
                    <ul id="decisionReasonList" class="decision-list" style="margin-bottom: 16px;"></ul>
                    <ul id="decisionActionList" class="decision-list highlight"></ul>
                </div>
                
                <div id="adjustmentContainer" class="diagnosis-card guidance-panel hidden" style="display:none;">
                    <h4>💡 안정권 진입 1차 가이드</h4>
                    <div id="adjustmentContent"></div>
                </div>
            </section>

            <!-- 5. Field Verification Checklist -->
            <section class="field-checklist-section dashboard-card">
                <h3 class="section-heading">📋 현장 확인 체크리스트</h3>
                <div class="checklist-tabs">
                    <button class="tab-btn active" onclick="activateTab('tab-visit', event)">📍 현장 방문</button>
                    <button class="tab-btn" onclick="activateTab('tab-realtor', event)">🏢 부동산 문의</button>
                    <button class="tab-btn" onclick="activateTab('tab-contract', event)">📝 계약 전</button>
                </div>
                <div class="tab-content active" id="tab-visit">
                    <label class="check-item"><input type="checkbox"> <span>평일/주말 주요 시간대 유동인구 30분 관찰</span></label>
                    <label class="check-item"><input type="checkbox"> <span>주변 동종 업계 매장 피크 고객 수 확인</span></label>
                    <label class="check-item"><input type="checkbox"> <span>매장 앞 시야 확보 및 간판 가시성 점검</span></label>
                    <label class="check-item"><input type="checkbox"> <span>진입로(계단, 턱) 고객 접근 편의성 확인</span></label>
                </div>
                <div class="tab-content" id="tab-realtor" style="display: none;">
                    <label class="check-item"><input type="checkbox"> <span>이전 매장 폐업(이전) 사유 등 과거 이력 확인</span></label>
                    <label class="check-item"><input type="checkbox"> <span>관리비 세부 내역(수도, 전기) 증빙 요청</span></label>
                    <label class="check-item"><input type="checkbox"> <span>동일 상가 내 동종 업계 입점 금지 특약 확인</span></label>
                    <label class="check-item"><input type="checkbox"> <span>누수/외벽 보수 시 임대인 부담 범위 확인</span></label>
                </div>
                <div class="tab-content" id="tab-contract" style="display: none;">
                    <label class="check-item"><input type="checkbox"> <span>등기부등본 확인 (근저당, 가압류 등)</span></label>
                    <label class="check-item"><input type="checkbox"> <span>건축물대장 확인 (불법 건축, 용도 제한)</span></label>
                    <label class="check-item"><input type="checkbox"> <span>권리금 양도양수 계약서 상세 조항 확인</span></label>
                    <label class="check-item"><input type="checkbox"> <span>임대료 인상 기한 및 상한 특약 명시</span></label>
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
            <section class="detail-accordion-section dashboard-card" style="padding: 0; overflow: hidden;">
                <details class="detail-accordion">
                    <summary class="accordion-summary">📊 상세 데이터 및 분석 지도 펼쳐보기</summary>
                    <div class="accordion-content" style="padding: 24px; border-top: 1px solid var(--border-color);">
                        <section class="map-visualization-section">
                            <h4 style="margin-bottom: 12px;">📍 상권 반경 시각화</h4>
                            <div class="map-container-mock" id="radiusMap"></div>
                        </section>
                        
                        <section class="radius-comparison-section" style="margin-top: 32px;">
                            <h4 style="margin-bottom: 12px;">⚖️ 반경별 환경 비교</h4>
                            <div id="radiusComparison" class="radius-comparison-grid"></div>
                            <div id="comparisonSummary" class="comparison-summary-box hidden"></div>
                        </section>
                        
                        <section id="comparisonSection" class="dashboard-card comparison-section hidden" style="margin-top: 32px; box-shadow: none;">
                            <div class="comp-header">
                                <h3>⚖️ 어디가 더 나은 선택일까?</h3>
                            </div>
                            <div id="comparisonContent" class="comp-content"></div>
                        </section>

                        <section class="confidence-section" style="margin-top: 32px;">
                            <div class="confidence-card" style="box-shadow: none; border: 1px solid var(--border-color);">
                                <div class="conf-header">
                                    <h4>데이터 신뢰도 <span id="confidenceLabel" class="conf-label">-</span></h4>
                                    <div class="conf-score" id="confidenceScore">0.00</div>
                                </div>
                                <div class="conf-bar-bg"><div class="conf-bar-fill" id="confidenceBar"></div></div>
                                <div class="source-summary" id="sourceSummary"></div>
                            </div>
                        </section>
                        
                        <div class="analysis-meta mt-3" id="analysisMeta" style="margin-top: 24px; color: var(--text-muted); font-size: 0.8rem; text-align: center;">
                            <span class="meta-item">반경: <span id="metaRadius">--</span></span>
                            <span class="meta-item ml-2">출처: <span id="metaSource">--</span></span>
                            <span class="meta-item ml-2">판단: <span id="metaTime">--</span></span>
                        </div>
                    </div>
                </details>
            </section>

            <!-- 7. CTA Area -->
            <section class="cta-area-section" style="margin-top: 32px;">
                <div class="cta-group briefing-cta" id="ctaGroup" style="flex-direction: column;">
                    <button id="btnSaveLocation" class="cta-btn primary" style="width: 100%; min-height: 56px; font-size: 1.1rem;">
                        <span class="icon">💾</span> <span class="lbl">이 진단 리포트 내 자리로 저장하기</span>
                    </button>
                    <div style="display: flex; gap: 12px; margin-top: 12px; width: 100%;">
                        <button id="btnCompareHistory" class="cta-btn secondary" style="flex: 1; min-height: 48px;">
                            <span class="icon">⚖️</span> 다른 후보 비교
                        </button>
                        <button id="btnReanalyze" class="cta-btn secondary" style="flex: 1; min-height: 48px;">
                            <span class="icon">🔄</span> 분석 조건 변경
                        </button>
                    </div>
                </div>
                <ul id="actionGuidance" class="hidden" style="display:none;"></ul>
            </section>

            <footer style="margin-top: 60px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                <div class="disclaimer" style="margin-bottom: 8px;">💡 CRI는 창업 성공을 보장하지 않으며 참조 지표로만 활용해야 합니다.</div>
                &copy; 2026 자리보고.
            </footer>
        </main>"""

content = content[:start_idx] + new_main + content[end_idx:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement done.")
