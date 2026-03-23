import { RiskEngine } from "./engine/RiskEngine";
import type { RiskAnalysis, FinancialData, MarketData, CompetitionData, StabilityData, AIAnalysisResult, AnalysisHistoryItem } from "./engine/types";
import { RiskTier } from "./engine/types";
import { RadiusMap } from "./engine/RadiusMap";
import { DataSource } from "./engine/dataMergeRules";
import { applyModeToDocument, conditionalLog, isQaModeActive, isTestRunnerActive } from "./engine/appMode";
import { loadKakaoMap } from "./services/kakaoMapLoader";
import { KakaoMapManager, KakaoPlaceResult } from "./map/KakaoMapManager";
import { AIService } from "./engine/AIService";
import type { AIInput } from "./engine/types";

// Apply mode attributes to <html> element immediately so CSS can hide QA-only elements
applyModeToDocument();

const getEl = (id: string) => document.getElementById(id);
const getVal = (id: string, defaultVal: string = "0") => (getEl(id) as HTMLInputElement | HTMLSelectElement)?.value || defaultVal;
const getNum = (id: string, defaultVal: number = 0) => Number(getVal(id, defaultVal.toString())) || defaultVal;
const getCheck = (id: string) => (getEl(id) as HTMLInputElement)?.checked || false;

interface User {
    id: string;
    email: string;
    isPro: boolean;
}
let currentUser: User | null = JSON.parse(sessionStorage.getItem('jari_user') || 'null');
let analysisCount = Number(sessionStorage.getItem('jari_analysis_count') || '0');
let lastAnalysisResult: RiskAnalysis | null = null;

const elements = {
    // Auth Section (Phase 27)
    authContainer: getEl('authContainer'),
    btnLogin: getEl('btnLogin'),
    btnLogout: getEl('btnLogout'),
    userInfo: getEl('userInfo'),
    userEmail: getEl('userEmail'),
    btnSaveSpot: getEl('btnSaveSpot'),
    proBadge: getEl('proBadge'),
    btnUpgrade: getEl('btnUpgrade'),
    proBenefits: getEl('proBenefits'),
    proResultLabel: getEl('proResultLabel'),
    comparisonSummary: getEl('comparisonSummary'),

    // Buttons & Layout
    startAnalysis: getEl('startAnalysis') as HTMLButtonElement,
    themeToggle: getEl('themeToggle') as HTMLElement,
    themeKnob: getEl('themeKnob') as HTMLElement,
    scenarioToggle: getEl('scenarioToggle') as HTMLElement,
    radiusToggle: getEl('radiusToggle') as HTMLElement,

    // Dashboard Components
    scoreBox: getEl('scoreBox') as HTMLElement,
    compositeScore: getEl('compositeScore') as HTMLElement,
    riskTier: getEl('riskTier') as HTMLElement,
    gaugePath: getEl('gaugePath') as unknown as SVGPathElement,
    fScore: getEl('fScore') as HTMLElement,
    fExp: getEl('fExp') as HTMLElement,
    mScore: getEl('mScore') as HTMLElement,
    mExp: getEl('mExp') as HTMLElement,

    // Confidence Section
    confidenceScore: getEl('confidenceScore') as HTMLElement,
    confidenceBar: getEl('confidenceBar') as HTMLElement,
    sourceSummary: getEl('sourceSummary') as HTMLElement,

    // Evidence & Comparison
    evidenceContainer: getEl('evidenceContainer') as HTMLElement,
    radiusComparison: getEl('radiusComparison') as HTMLElement,

    // LLM Section
    llmCard: getEl('llmCard') as HTMLElement,
    llmContent: getEl('llmContent') as HTMLElement,

    actionGuidance: getEl('actionGuidance') as HTMLElement,
    radiusMap: getEl('radiusMap') as HTMLElement,
    stabilityDistance: getEl('stabilityDistance') as HTMLElement,

    // Automated Parameters (Inputs)
    estimationBanner: getEl('estimationBanner') as HTMLElement,
    householdCount: getEl('householdCount') as HTMLInputElement,
    competitorCount: getEl('competitorCount') as HTMLInputElement,
    officeBuildingCount: getEl('officeBuildingCount') as HTMLInputElement,
    marketActivity: getEl('marketActivity') as HTMLSelectElement,

    // QA Mode Elements
    qaToggleBtn: getEl('qaToggleBtn') as HTMLElement,
    qaPanel: getEl('qaPanel') as HTMLElement,
    qaCloseBtn: getEl('qaCloseBtn') as HTMLElement,
    qaScenarioContainer: getEl('qaScenarioContainer') as HTMLElement,

    // Adjustments
    adjustmentContainer: getEl('adjustmentContainer') as HTMLElement,
    adjustmentContent: getEl('adjustmentContent') as HTMLElement,
    confidenceLabel: getEl('confidenceLabel') as HTMLElement,

    margin: getEl('margin') as HTMLInputElement,
    visitRate: getEl('visitRate') as HTMLInputElement,
    ticketPrice: getEl('ticketPrice') as HTMLInputElement,
    repeatFactor: getEl('repeatFactor') as HTMLInputElement,
    baseRiskLine: getEl('baseRiskLine') as HTMLInputElement,
    laborIntensity: getEl('laborIntensity') as HTMLInputElement,
    albiCount: getEl('albiCount') as HTMLInputElement,
    managerCount: getEl('managerCount') as HTMLInputElement,
    loanAmount: getEl('loanAmount') as HTMLInputElement,
    interestRate: getEl('interestRate') as HTMLInputElement,

    // Metadata & History
    metaRadius: getEl('metaRadius') as HTMLElement,
    metaSource: getEl('metaSource') as HTMLElement,
    metaTime: getEl('metaTime') as HTMLElement,
    criEstimationBadge: getEl('criEstimationBadge') as HTMLElement,
    evidenceEstimationBadge: getEl('evidenceEstimationBadge') as HTMLElement,

    // Judgment Report (Phase 14)
    judgmentReport: getEl('judgmentReport') as HTMLElement,
    reportStatusBadge: getEl('reportStatusBadge') as HTMLElement,
    reportSummary: getEl('reportSummary') as HTMLElement,
    reportReasons: getEl('reportReasons') as HTMLElement,
    reportActions: getEl('reportActions') as HTMLElement,

    // Trust & Transparency (Phase 15)
    reportLocationText: getEl('reportLocationText') as HTMLElement,
    reportCoordsText: getEl('reportCoordsText') as HTMLElement,
    barCompetition: getEl('barCompetition') as HTMLElement,
    valCompetition: getEl('valCompetition') as HTMLElement,
    barDemand: getEl('barDemand') as HTMLElement,
    valDemand: getEl('valDemand') as HTMLElement,
    barDiversity: getEl('barDiversity') as HTMLElement,
    valDiversity: getEl('valDiversity') as HTMLElement,

    // Product Actions (Phase 16)
    btnShare: getEl('btnShare') as HTMLButtonElement,
    btnDownload: getEl('btnDownload') as HTMLButtonElement,
    businessType: getEl('businessType') as HTMLInputElement, // Now a hidden input
    businessTypeTrigger: getEl('businessTypeTrigger') as HTMLElement,
    businessTypeDropdown: getEl('businessTypeDropdown') as HTMLElement,
    sectorSearchInput: getEl('sectorSearchInput') as HTMLInputElement,
    selectedSectorLabel: getEl('selectedSectorLabel') as HTMLElement,
    recommendedSectors: getEl('recommendedSectors') as HTMLElement,
    allSectors: getEl('allSectors') as HTMLElement,

    // Comparison Section (Phase 16 - In-Page)
    comparisonSection: getEl('comparisonSection') as HTMLElement,
    comparisonContent: getEl('comparisonContent') as HTMLElement,

    // Decision UX Refinements (Phase 24)
    finalJudgmentBadge: getEl('finalJudgmentBadge') as HTMLElement,
    btnSaveLocation: getEl('btnSaveLocation') as HTMLButtonElement,
    btnCompareHistory: getEl('btnCompareHistory') as HTMLButtonElement,
    btnReanalyze: getEl('btnReanalyze') as HTMLButtonElement,

    // Decision Helper Service (Phase 25)
    decisionHelperArea: getEl('decisionHelperArea') as HTMLElement,
    mainDecisionBadge: getEl('mainDecisionBadge') as HTMLElement,
    decisionReasonList: getEl('decisionReasonList') as HTMLElement,
    decisionActionList: getEl('decisionActionList') as HTMLElement,
};

let currentCRI = 0;

let selectedHistoryForComparison: AnalysisHistoryItem[] = [];

let selectedLocationsForComparison: any[] = [];

/** ── Product Actions (Phase 16) ─────────────────────────────────────────── */

function setupProductActions() {
    // 0. Decision UX CTA Actions
    elements.btnSaveLocation?.addEventListener('click', () => {
        const saveKey = 'riskx_saved_locations';
        const saved: any[] = JSON.parse(localStorage.getItem(saveKey) || '[]');
        const loc = {
            id: Date.now(),
            address: currentLocation.address || currentLocation.placeName,
            cri: currentCRI,
            timestamp: new Date().toISOString()
        };
        saved.unshift(loc);
        localStorage.setItem(saveKey, JSON.stringify(saved.slice(0, 50)));
        alert('해당 위치가 저장되었습니다.');
    });

    elements.btnCompareHistory?.addEventListener('click', () => {
        const historySection = document.getElementById('kakaoRecentHistory');
        historySection?.scrollIntoView({ behavior: 'smooth' });
        // Flash the sidebar to guide user
        historySection?.classList.add('flash-highlight');
        setTimeout(() => historySection?.classList.remove('flash-highlight'), 1000);
    });

    elements.btnReanalyze?.addEventListener('click', () => {
        elements.businessTypeTrigger?.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => elements.businessTypeTrigger?.click(), 500);
    });

    // 1. Share Link
    elements.btnShare?.addEventListener('click', () => {
        syncUrlWithState();
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            alert('자리보고 공유 링크가 클립보드에 복사되었습니다.');
        });
    });

    // 2. Download Image (Snapshot)
    elements.btnDownload?.addEventListener('click', () => {
        if (!elements.judgmentReport) return;

        // Using html2canvas (loaded via CDN)
        const h2c = (window as any).html2canvas;
        if (!h2c) {
            alert('이미지 생성 라이브러리 로드 중입니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        h2c(elements.judgmentReport, {
            backgroundColor: '#0a0a0a',
            scale: 2, // Higher resolution
            logging: false,
            useCORS: true
        }).then((canvas: HTMLCanvasElement) => {
            const link = document.createElement('a');
            link.download = `risk-x-report-${currentLocation.placeName || 'analysis'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    });

    // 4. Sector Change -> Re-run Analysis
    elements.businessType?.addEventListener('change', () => {
        runAnalysis();
    });
}

const RECOMMENDED_SECTORS = [
    { code: 'cafe', name: '☕ 카페/커피전문점' },
    { code: 'restaurant_korean', name: '🍱 일반음식점 (한식)' },
    { code: 'restaurant_western', name: '🍝 일반음식점 (양식/일식)' },
    { code: 'convenience', name: '🏪 편의점' },
    { code: 'retail', name: '🛍️ 일반 소매점' },
    { code: 'beauty', name: '💇 미용/헤어숍' }
];

function initSectors() {
    renderRecommendedSectors();

    // Toggle Dropdown
    elements.businessTypeTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.businessTypeDropdown?.classList.toggle('hidden');
        if (!elements.businessTypeDropdown?.classList.contains('hidden')) {
            elements.sectorSearchInput?.focus();
            renderAllSectors(); // Refresh "All" list from provider if loaded
        }
    });

    // Close on click outside
    document.addEventListener('click', () => {
        elements.businessTypeDropdown?.classList.add('hidden');
    });

    elements.businessTypeDropdown?.addEventListener('click', (e) => e.stopPropagation());

    // Search Filtering
    elements.sectorSearchInput?.addEventListener('input', () => {
        filterSectors();
    });
}

function renderRecommendedSectors() {
    if (!elements.recommendedSectors) return;
    elements.recommendedSectors.innerHTML = RECOMMENDED_SECTORS.map(s =>
        `<div class="sector-item" data-code="${s.code}">${s.name}</div>`
    ).join('');

    elements.recommendedSectors.querySelectorAll('.sector-item').forEach(item => {
        item.addEventListener('click', () => selectSector((item as HTMLElement).dataset.code!, item.textContent!));
    });
}

function renderAllSectors(filter = '') {
    if (!elements.allSectors) return;
    const all = csvProvider.sectors;

    if (all.length === 0) {
        elements.allSectors.innerHTML = `<div class="sector-item-hint">자리를 먼저 선택하여<br>데이터를 로드해 주세요.</div>`;
        return;
    }

    const filtered = filter
        ? all.filter(s => s.name.includes(filter) || s.code.includes(filter))
        : all.slice(0, 50); // Show top 50 by default to avoid lag

    if (filtered.length === 0) {
        elements.allSectors.innerHTML = `<div class="sector-item-hint">검색 결과가 없습니다.</div>`;
        return;
    }

    elements.allSectors.innerHTML = filtered.map(s =>
        `<div class="sector-item" data-code="${s.code}">${s.name}</div>`
    ).join('');

    elements.allSectors.querySelectorAll('.sector-item').forEach(item => {
        item.addEventListener('click', () => selectSector((item as HTMLElement).dataset.code!, item.textContent!));
    });
}

function filterSectors() {
    const val = elements.sectorSearchInput.value.trim();
    renderAllSectors(val);
}

function selectSector(code: string, label: string) {
    if (!elements.businessType) return;

    elements.businessType.value = code;
    elements.selectedSectorLabel.textContent = label;
    elements.businessTypeDropdown.classList.add('hidden');

    // Highlight active
    document.querySelectorAll('.sector-item').forEach(el => {
        el.classList.toggle('active', (el as HTMLElement).dataset.code === code);
    });

    runAnalysis();
}

/** ── URL State Management (Phase 16) ─────────────────────────────────────── */

function syncUrlWithState(): void {
    const params = new URLSearchParams();
    params.set('lat', currentLocation.lat.toFixed(6));
    params.set('lng', currentLocation.lng.toFixed(6));
    params.set('radius', currentRadius.toString());
    params.set('sector', elements.businessType.value);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}

function restoreStateFromUrl(): boolean {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat') || '');
    const lng = parseFloat(params.get('lng') || '');
    const radius = parseInt(params.get('radius') || '');
    const sector = params.get('sector');

    if (!isNaN(lat) && !isNaN(lng)) {
        if (!isNaN(radius)) currentRadius = radius;
        if (sector) {
            elements.businessType.value = sector;
            // Update label to name if it's one of recommended, otherwise just use code as fallback
            const rec = RECOMMENDED_SECTORS.find(r => r.code === sector);
            elements.selectedSectorLabel.textContent = rec ? rec.name : `업종 코드: ${sector}`;
        }

        // Trigger location select (will also run analysis)
        handleLocationSelect(lat, lng, '공유된 위치', 'url_params');
        return true;
    }
    return false;
}

interface LocationState {
    lat: number;
    lng: number;
    address: string;
    placeName: string;
    source: 'map_click' | 'keyword_search' | 'address_search' | 'history' | 'default' | 'url_params';
}

let currentScenario: "conservative" | "base" | "aggressive" = "base";
let currentRadius = 500;

/** Currently selected analysis location — updated by KakaoMapManager or tests. */
let currentLocation: LocationState = {
    lat: 37.5657,
    lng: 126.9769,
    address: '서울특별시 중구 태평로1가 31',
    placeName: '서울시청',
    source: 'default'
};

const fieldSources: Record<string, any> = {
    margin: "industry_default",
    ticketPrice: "industry_default"
};

// ── Debounce Utility ──────────────────────────────────────────────────────────
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// ── Persistence Logic (localStorage) ──────────────────────────────────────────
const HISTORY_KEY = 'riskx_analysis_history';

function saveToHistory(loc: LocationState, industry: { code: string, name: string }, radius: number, analysis: RiskAnalysis, aiResult: AIAnalysisResult | null) {
    let history: any[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    // Remove if exactly the same location + industry + radius already exists to avoid clutter
    history = history.filter(h =>
        !(h.location.lat === loc.lat && h.location.lng === loc.lng && h.industry.code === industry.code && h.radius === radius)
    );

    // Minimize storage: Save only critical fields
    const leanAnalysis = {
        cri: analysis.cri,
        riskTier: analysis.riskTier,
        layerScores: {
            marketDemand: { score: analysis.layerScores.marketDemand.score },
            competitiveStructure: { score: analysis.layerScores.competitiveStructure.score }
        },
        confidenceScore: analysis.confidenceScore,
        competitorsCount: (analysis as any)._rawPublicData?.competitorsCount
    };

    const newItem = {
        location: {
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address,
            placeName: loc.placeName
        },
        industry,
        radius,
        analysis: leanAnalysis,
        aiResult: aiResult ? { oneLineSummary: aiResult.oneLineSummary } : null,
        timestamp: Date.now()
    };

    history.unshift(newItem);
    if (history.length > 20) history.pop(); // Increased limit but smaller items

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const container = document.getElementById('kakaoRecentHistory');
    if (!container) return;

    const history: any[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    // Show selection count
    const selectedCount = selectedHistoryForComparison.length;
    const countBadge = `<span class="selection-counter">${selectedCount}/2 선택됨</span>`;

    if (history.length === 0) {
        container.innerHTML = '<span class="history-empty">최근 확인한 자리가 없습니다.</span>';
        return;
    }

    container.innerHTML = `
        <div class="history-header">${countBadge}</div>
        <div class="history-chips">
            ${history.map((h, i) => {
        try {
            const isSelected = selectedHistoryForComparison.some(item =>
                item.timestamp === h.timestamp
            );

            const indName = (typeof h.industry === 'string') ? h.industry : (h.industry?.name || '알 수 없는 업종');

            return `
                        <div class="history-chip ${isSelected ? 'selected' : ''}" data-idx="${i}">
                            <div class="history-info">
                                <span class="history-name">${h.location.placeName || h.location.address}</span>
                                <span class="history-sub">${indName} | ${h.radius}m</span>
                            </div>
                            <button class="comp-add-btn">${isSelected ? '비교 해제' : '비교 추가'}</button>
                        </div>
                    `;
        } catch (err) {
            return '';
        }
    }).join('')}
        </div>
    `;

    container.querySelectorAll('.history-chip').forEach(el => {
        const idx = Number((el as HTMLElement).dataset.idx);
        const item = history[idx];

        el.querySelector('.comp-add-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleComparison(item);
        });

        el.addEventListener('click', () => {
            handleLocationSelect(item.location.lat, item.location.lng, item.location.placeName || item.location.address, 'history');
        });
    });
}

function toggleComparison(item: AnalysisHistoryItem) {
    const idx = selectedHistoryForComparison.findIndex(h => h.timestamp === item.timestamp);
    if (idx > -1) {
        selectedHistoryForComparison.splice(idx, 1);
    } else {
        if (selectedHistoryForComparison.length >= 2) {
            alert('비교는 최대 2개까지만 가능합니다.');
            return;
        }
        selectedHistoryForComparison.push(item);
    }
    renderHistory();
    renderComparison();
}

function renderComparison() {
    if (!elements.comparisonSection || !elements.comparisonContent) return;

    if (selectedHistoryForComparison.length < 2) {
        elements.comparisonSection.classList.add('hidden');
        return;
    }

    elements.comparisonSection.classList.remove('hidden');

    const [h1, h2] = selectedHistoryForComparison;

    // Generate enhanced conclusion
    let conclusion = "";
    if (h1.analysis.cri < h2.analysis.cri) {
        const diff = h2.analysis.cri - h1.analysis.cri;
        conclusion = `
            <div class="comp-summary-premium">
                <p><strong>${h1.location.placeName || h1.location.address}</strong> 후보지가 <strong>${h2.location.placeName || h2.location.address}</strong>보다 CRI 지수가 ${diff.toFixed(0)}점 낮아 상대적으로 우수한 입지 조건을 갖추고 있습니다.</p>
                <p class="comp-logic-text">💡 ${h1.analysis.layerScores.marketDemand.score > h2.analysis.layerScores.marketDemand.score ? '풍부한 배후 수요(객관적 지표)' : '안정적인 경쟁 환경(시장 과밀도 낮음)'}를 바탕으로 리스크 대비 수익성 확보가 더 수월할 것으로 판단됩니다.</p>
            </div>
        `;
    } else {
        const diff = h1.analysis.cri - h2.analysis.cri;
        conclusion = `
            <div class="comp-summary-premium">
                <p><strong>${h2.location.placeName || h2.location.address}</strong> 후보지가 <strong>${h1.location.placeName || h1.location.address}</strong>보다 지표상 우위에 있습니다. (CRI 격차: ${diff.toFixed(0)}점)</p>
                <p class="comp-logic-text">💡 ${h2.analysis.layerScores.competitiveStructure.score < h1.analysis.layerScores.competitiveStructure.score ? '상대적으로 낮은 경쟁 밀도' : '높은 상권 활성도'} 덕분에 시장 안착 및 초기 운영의 난위도가 더 낮을 것으로 예상됩니다.</p>
            </div>
        `;
    }

    elements.comparisonContent.innerHTML = `
        <div class="comp-table-wrapper">
            <table class="comp-table">
                <thead>
                    <tr>
                        <th>비교 항목</th>
                        <th>${h1.location.placeName || h1.location.address}</th>
                        <th>${h2.location.placeName || h2.location.address}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>업종 / 반경</td>
                        <td>${(typeof h1.industry === 'string' ? h1.industry : h1.industry.name)} / ${h1.radius}m</td>
                        <td>${(typeof h2.industry === 'string' ? h2.industry : h2.industry.name)} / ${h2.radius}m</td>
                    </tr>
                    <tr>
                        <td>종합 지수 (CRI)</td>
                        <td class="score-cell ${h1.analysis.cri < h2.analysis.cri ? 'better' : ''}">${h1.analysis.cri}점</td>
                        <td class="score-cell ${h2.analysis.cri < h1.analysis.cri ? 'better' : ''}">${h2.analysis.cri}점</td>
                    </tr>
                    <tr>
                        <td>종합 판단</td>
                        <td class="tier-cell">${h1.analysis.riskTier}</td>
                        <td class="tier-cell">${h2.analysis.riskTier}</td>
                    </tr>
                    <tr>
                        <td>경쟁 강도</td>
                        <td>${h1.analysis.layerScores.competitiveStructure.score}점</td>
                        <td>${h2.analysis.layerScores.competitiveStructure.score}점</td>
                    </tr>
                    <tr>
                        <td>수요 지표</td>
                        <td>${h1.analysis.layerScores.marketDemand.score}점</td>
                        <td>${h2.analysis.layerScores.marketDemand.score}점</td>
                    </tr>
                    <tr class="ai-row">
                        <td>AI 한 줄 요약</td>
                        <td><p class="ai-mini-text">${h1.aiResult?.oneLineSummary || '-'}</p></td>
                        <td><p class="ai-mini-text">${h2.aiResult?.oneLineSummary || '-'}</p></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="comp-conclusion">
            <span class="conclusion-badge">💡 판단 결론</span>
            <p>${conclusion}</p>
        </div>
    `;
}

// Mock data for comparative analysis
const fDataMock = { monthlyRevenue: 50000000, rent: 5000000, maintenanceFee: 500000, deposit: 50000000, premium: 30000000, area: 66, floor: '1', hasParking: true, hasInsurance: false, insuranceFee: 0, debtService: 0, operatingExpenses: 1000000, cashBufferMonths: 3, albiCount: 2, managerCount: 1, laborCost: 7500000 };
const mDataMock = { householdCount: 3000, officeBuildingCount: 10, competitorCount: 5, competitorRadius: 0.5, marketActivity: 'moderate' as any, footTrafficScore: 50, demographicGrowthRate: 1.2, vacancyRate: 5 };
const cDataMock = { competitorProximity: 1, marketSaturationIndex: 30, pricingPower: 60 };
const sDataMock = { leaseRemainingYears: 5, ownershipStructure: "Leased" as any, regulatoryRiskIndex: 10 };

async function renderAIInsights(analysis: RiskAnalysis, pData: any): Promise<AIAnalysisResult | null> {
    if (!elements.llmCard || !elements.llmContent) return null;

    // Rule-based insights are always rendered by updateJudgmentUI.
    // This AI section is an additional enhancement layer.

    // Construct input for AI
    const aiInput: AIInput = {
        industry: elements.selectedSectorLabel?.textContent || '선택 업종',
        location: {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            address: currentLocation.placeName || currentLocation.address
        },
        radiusM: currentRadius,
        cri: analysis.cri,
        riskTier: analysis.riskTier,
        metrics: {
            competitionStrength: analysis.layerScores.competitiveStructure.score,
            demandIndex: analysis.layerScores.marketDemand.score,
            financialPressure: analysis.layerScores.financialPressure.score,
            structuralStability: analysis.layerScores.structuralStability.score
        },
        publicData: {
            competitorsCount: pData.competitorsCount,
            poiTotalCount: pData.poiTotalCount,
            districtPoiCount: pData.districtPoiCount || 0,
            population: pData.population,
            households: pData.households
        }
    };

    elements.llmCard.style.display = 'block';
    // Add the AI badge to the title area or as a floating chip
    elements.llmCard.innerHTML = `
        <div class="ai-header">
            <h4>✨ AI 참고 요약 (데이터 기반 해석)</h4>
            <span class="ai-badge">🤖 AI 수립 데이터 기반</span>
        </div>
        <div class="llm-content" id="llmContent">
            <div class="loading" style="padding: 20px; text-align: center; color: var(--text-muted);">✨ 자리보고 AI가 판단 내용을 정리 중입니다...</div>
        </div>
    `;

    const contentEl = document.getElementById('llmContent') as HTMLElement;
    const result = await AIService.generateSummary(aiInput);

    if (!result) {
        // Fallback: If AI fails or times out, hide the additional AI section.
        // User still sees the rule-based insights from updateJudgmentUI.
        elements.llmCard.style.display = 'none';
        return null;
    }

    if (contentEl) {
        contentEl.innerHTML = `
            <div class="ai-summary-one-line">
                ${result.oneLineSummary}
            </div>
            <div class="ai-grid">
                <div class="ai-column">
                    <span class="ai-section-label">🚩 핵심 리스크</span>
                    <ul class="ai-list">
                        ${result.keyRisks.map(risk => `<li>${risk}</li>`).join('')}
                    </ul>
                </div>
                <div class="ai-column">
                    <span class="ai-section-label">🚀 추천 액션</span>
                    <ul class="ai-list">
                        ${result.recommendedActions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div class="ai-precautions">
                <span class="ai-section-label" style="color: #ef4444;">⚠️ 주의사항</span>
                <p>${result.precautions}</p>
            </div>
        `;
    }
    return result;
}

import { PublicDataFetcher } from "./engine/PublicDataFetcher";
import { RealPublicDataProvider } from "./engine/RealPublicDataProvider";
import { CsvDatasetProvider } from "./engine/CsvDatasetProvider";

// ── CSV Dataset Provider (CSV-First Architecture) ──────────────────────────
// Single instance shared across fetches. Dataset is loaded lazily on 1st analysis.
const csvProvider = new CsvDatasetProvider();
let csvDataLoaded = false;

async function ensureCsvLoaded(lat: number, lng: number) {
    try {
        const count = await csvProvider.loadForLocation(lat, lng, (progress) => {
            conditionalLog(`[CSV] Loading... ${progress.toLocaleString()} rows indexed`);
        });
        csvDataLoaded = true;
        conditionalLog(`[CSV] Dataset ready: ${count.toLocaleString()} POIs loaded.`);
    } catch (err) {
        console.warn('[CSV] Dataset load failed, will use RealPublicDataProvider only.', err);
    }
}

function updateSourceTag(fieldId: string) {
    const parent = elements[fieldId as keyof typeof elements]?.parentElement;
    if (!parent || !parent.classList.contains('input-field')) return;

    // Remove existing tag
    parent.querySelector('.source-tag')?.remove();

    const tag = document.createElement('span');
    const source = fieldSources[fieldId];
    tag.className = `source - tag ${source} `;
    tag.textContent = source.replace('_', ' ');
    parent.appendChild(tag);
}

function applyProfile() {
    const industryCode = elements.businessType.value;
    const profile = RiskEngine.getProfile(industryCode);
    if (!profile) return;

    const scenarioData = profile.profiles[currentScenario];

    const fields = ['margin', 'ticketPrice'];
    const dataKeys: Record<string, string> = {
        margin: 'margin',
        ticketPrice: 'ticket_krw'
    };

    fields.forEach(f => {
        if (fieldSources[f] !== "user_override") {
            let val = scenarioData[dataKeys[f]];
            if (f === 'margin') val *= 100; // Display as %
            (elements[f as keyof typeof elements] as HTMLInputElement).value = val.toString();
            fieldSources[f] = "industry_default";
        }
    });
}

import { EvidenceCard } from "./engine/types";

function renderEvidenceCards(cards: EvidenceCard[]) {
    if (!elements.evidenceContainer) return;
    elements.evidenceContainer.innerHTML = '';

    cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'evidence-card';
        div.innerHTML = `
            <div class="evidence-header">
                <span class="title">${card.icon} ${card.title}</span>
                <span class="source-tag ${card.source}">${card.source.replace('_', ' ')}</span>
            </div>
            <div class="evidence-metrics">
                ${card.metrics.map(m => `
                    <div class="metric-item ${m.highlight ? 'highlight-metric' : ''} ${m.isEstimated ? 'estimated-metric' : ''}">
                        <span class="metric-label">
                            ${m.label}
                            ${m.isEstimated ? '<span class="estimated-tag" title="추정치 (Fallback)">*추정</span>' : ''}
                        </span>
                        <span class="metric-value">${m.value}${m.unit || ''}</span>
                    </div>
                `).join('')}
            </div>
            <p class="evidence-summary">${card.summary}</p>
        `;
        elements.evidenceContainer.appendChild(div);
    });
}

function renderRadiusComparison(comparison: any[], activeRadius: number) {
    if (!elements.radiusComparison) return;
    elements.radiusComparison.innerHTML = '';

    let bestRadiusItem = comparison[0];
    comparison.forEach(item => {
        if (item.score > (bestRadiusItem?.score || 0)) {
            bestRadiusItem = item;
        }

        const div = document.createElement('div');
        div.className = `comparison-card ${item.radius === activeRadius ? 'active' : ''}`;
        const deltaClass = item.delta > 0 ? 'up' : 'down';
        const deltaSymbol = item.delta > 0 ? '+' : '';

        div.innerHTML = `
            <div class="comp-radius">${item.radius}m</div>
            <div class="comp-score">${item.score}</div>
            <div class="comp-delta ${deltaClass}">${deltaSymbol}${item.delta}</div>
        `;
        elements.radiusComparison.appendChild(div);
    });

    // Generate Summary (Phase 28 Polish)
    if (elements.comparisonSummary && bestRadiusItem) {
        elements.comparisonSummary.classList.remove('hidden');
        let summaryHtml = `<strong>🏁 최적 반경 판단:</strong> ${bestRadiusItem.radius}m 지점이 현재 가장 유리한 조율점을 보여줍니다.`;

        if (bestRadiusItem.radius === 300) {
            summaryHtml += `<br>초근접 배후 수요에 집중하는 밀착형 전략이 효과적인 입지입니다.`;
        } else if (bestRadiusItem.radius === 500) {
            summaryHtml += `<br>유동 인구와 경쟁 밀도의 밸런스가 가장 안정적인 표준 반경입니다.`;
        } else {
            summaryHtml += `<br>광역 수요를 끌어올 수 있는 잠재력이 커서 브랜드 파워가 중요해 보입니다.`;
        }

        // Pro Insight Hook
        if (currentUser?.isPro) {
            summaryHtml += `
                <div class="pro-only-insight">
                    <span>💎 PRO Insight:</span>
                    반경별 점수 편차가 ${Math.abs(comparison[0].score - comparison[2].score)}점입니다. 
                    핵심 타겟층의 이동 동선을 재검증하세요.
                </div>
            `;
        }

        elements.comparisonSummary.innerHTML = summaryHtml;
    }
}

const debouncedAnalysis = debounce(runAnalysis, 500);

async function runAnalysis() {
    const startTime = Date.now();
    const analysisId = `analysis_${Date.now()} `;

    // Billing Gating (Phase 28)
    const isPro = currentUser?.isPro || false;
    if (!isPro && analysisCount >= 3) {
        showLimitNotice();
        return;
    }

    performance.mark(`${analysisId}: start`);
    const rent = getNum('rent', 0);
    const maintenance = getNum('maintenanceFee', 0);
    const labor = getNum('laborCost', 0);
    const industryCode = getVal('businessType', 'cafe_indie_small');
    const profile = RiskEngine.getProfile(industryCode);

    const location = currentLocation; // Set by KakaoMapManager or default Seoul coords

    // ── CSV-First Hybrid Fetch ─────────────────────────────────────────────
    // 1. Get auxiliary API data (population, district density) from ODCloud
    const publicDataFetcher = new PublicDataFetcher(new RealPublicDataProvider());
    const apiData = await publicDataFetcher.fetchByRadius(location, currentRadius, industryCode);

    // 2. Attempt CSV-based spatial query for primary competitor metrics
    await ensureCsvLoaded(location.lat, location.lng);
    if (csvDataLoaded) {
        try {
            const csvResult = await csvProvider.queryRadius(location, currentRadius, industryCode);
            // Merge: CSV wins for competitor/POI metrics, API wins for population/district
            apiData.competitorsCount = csvResult.competitorsCount;
            apiData.poiTotalCount = csvResult.poiTotalCount;
            apiData.diversityIndex = csvResult.diversityIndex;
            apiData._sources = {
                ...apiData._sources,
                competitorsCount: DataSource.PUBLIC_DATA,
                poiTotalCount: DataSource.PUBLIC_DATA,
                diversityIndex: DataSource.PUBLIC_DATA
            };
            conditionalLog(`[CSV] Injected ${csvResult.competitorsCount} competitors from local dataset.`);
        } catch (err) {
            console.warn('[CSV] Spatial query failed; using API fallback.', err);
        }
    }
    const pData = apiData;

    performance.mark(`${analysisId}: data_ready`);
    performance.measure('analysis:data_fetch_time', `${analysisId}: start`, `${analysisId}: data_ready`);
    const [dMeasure] = performance.getEntriesByName('analysis:data_fetch_time').slice(-1);
    conditionalLog(`[Perf] analysis: data_fetch_time = ${dMeasure?.duration.toFixed(0)} ms(API + CSV merge)`);

    // Sync UI with data for read-only fields
    if (pData) {
        if (elements.householdCount) elements.householdCount.value = pData.households.toString();
        if (elements.competitorCount) elements.competitorCount.value = pData.competitorsCount.toString();
        if (elements.officeBuildingCount) elements.officeBuildingCount.value = Math.round(pData.poiTotalCount * 0.1).toString();

        if (elements.marketActivity) {
            const vol = pData.volatilityProxy;
            if (vol > 0.4) elements.marketActivity.value = "booming";
            else if (vol > 0.2) elements.marketActivity.value = "high";
            else if (vol > 0.1) elements.marketActivity.value = "moderate";
            else elements.marketActivity.value = "low";
        }
    }

    // Fetch comparative data for other radii
    const otherRadii = [300, 500, 1000].filter(r => r !== currentRadius);
    const comparisonResults = await Promise.all(otherRadii.map(async r => {
        const rData = await publicDataFetcher.fetchByRadius(location, r, industryCode);
        const analysis = RiskEngine.analyze(
            { ...fDataMock, industryCode, industryCategory: profile.industry_category },
            mDataMock, cDataMock, sDataMock, rData
        );
        return { radius: r, score: analysis.cri };
    }));

    const fData: FinancialData = {
        industryCode,
        industryCategory: profile.industry_category,
        monthlyRevenue: Math.round((rent + maintenance + labor) / 0.6),
        rent,
        maintenanceFee: maintenance,
        deposit: getNum('deposit', 0),
        premium: getNum('premium', 0),
        area: getNum('area', 0),
        floor: getVal('floor', '1'),
        hasParking: getCheck('hasParking'),
        hasInsurance: false,
        insuranceFee: 0,
        debtService: 0,
        operatingExpenses: rent * 0.2,
        cashBufferMonths: 3,
        albiCount: getNum('albiCount', 0),
        managerCount: getNum('managerCount', 0),
        laborCost: labor,

        // Debt & Loans
        loanAmount: getNum('loanAmount', 0),
        interestRate: getNum('interestRate', 0),

        // Optional overrides
        margin: getNum('margin') ? getNum('margin') / 100 : undefined,
        ticketPrice: getNum('ticketPrice') || undefined,
        sources: fieldSources
    };

    // Generic mock data for other layers (will be refined by evidence cards)
    const mData: MarketData = { householdCount: 3000, officeBuildingCount: 10, competitorCount: 5, competitorRadius: 0.5, marketActivity: 'moderate', footTrafficScore: 50, demographicGrowthRate: 1.2, vacancyRate: 5 };
    const cData: CompetitionData = { competitorProximity: 1, marketSaturationIndex: 30, pricingPower: 60 };
    const sData: StabilityData = { leaseRemainingYears: 5, ownershipStructure: "Leased", regulatoryRiskIndex: 10 };

    const analysis: RiskAnalysis = RiskEngine.analyze(fData, mData, cData, sData, pData);
    currentCRI = analysis.cri;

    console.log('[PublicData Debug]', {
        poiTotalCount: pData.poiTotalCount,
        competitorsCount: pData.competitorsCount,
        households: pData.households,
        population: pData.population,
        districtPoiCount: pData.districtPoiCount,
        _sources: pData._sources,
        confidence: analysis.confidenceScore
    });

    performance.mark(`${analysisId}: end`);
    performance.measure('analysis:total_time', `${analysisId}: start`, `${analysisId}: end`);
    const [tMeasure] = performance.getEntriesByName('analysis:total_time').slice(-1);
    conditionalLog(`[Perf] analysis: total_time = ${tMeasure?.duration.toFixed(0)} ms(click → engine done)`);

    if (elements.estimationBanner) {
        if (analysis.hasEstimatedMetric) {
            elements.estimationBanner.classList.remove('hidden');
        } else {
            elements.estimationBanner.classList.add('hidden');
        }
    }

    // Update Analysis Metadata UI
    if (elements.metaRadius) elements.metaRadius.textContent = `${currentRadius} m`;
    if (elements.metaSource) {
        const sources = Object.values(pData?._sources || {});
        const hasApi = sources.includes(DataSource.PUBLIC_DATA);
        const hasCsv = csvDataLoaded;
        elements.metaSource.textContent = hasCsv ? (hasApi ? 'CSV + API 하이브리드' : '로컬 CSV 데이터') : (hasApi ? '공공 API 데이터' : '기본 추정치');
    }
    if (elements.metaTime) {
        elements.metaTime.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // Build comparison list
    const radiusComparison = [
        ...comparisonResults,
        { radius: currentRadius, score: analysis.cri }
    ].sort((a, b) => a.radius - b.radius).map(item => ({
        ...item,
        delta: item.score - analysis.cri
    }));

    // SVG Gauge Animation
    if (elements.gaugePath) {
        const fullLength = 251.3;
        const offset = fullLength * (1 - analysis.cri / 100);
        (elements.gaugePath as unknown as SVGPathElement).style.strokeDashoffset = offset.toString();
    }

    // Number Count-Up Effect
    if (elements.compositeScore) {
        const target = analysis.cri;
        const duration = 1500;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(easedProgress * target);
            if (elements.compositeScore) elements.compositeScore.textContent = current.toString();
            if (progress < 1) requestAnimationFrame(animate);
            else if (elements.compositeScore) elements.compositeScore.textContent = target.toString();
        };
        requestAnimationFrame(animate);
    }

    // Stability Distance Update (P2)
    if (elements.stabilityDistance) {
        if (analysis.distanceToSafe > 0) {
            elements.stabilityDistance.innerHTML = `안정권(35점)까지 <span class="highlight">-${analysis.distanceToSafe}점</span> 개선이 필요합니다.`;
        } else {
            elements.stabilityDistance.innerHTML = `<span class="highlight" style="color: #10b981;">현재 안정권 지표를 보이고 있습니다.</span>`;
        }
    }

    if (elements.riskTier) elements.riskTier.textContent = analysis.riskTier;

    if (elements.scoreBox) {
        elements.scoreBox.classList.remove('status-stable', 'status-moderate', 'status-risk');
        let themeColor = '#10b981';
        let secondaryColor = '#34d399';

        if (analysis.cri < 35) {
            elements.scoreBox.classList.add('status-stable');
        } else if (analysis.cri < 55) {
            elements.scoreBox.classList.add('status-moderate');
            themeColor = '#f59e0b';
            secondaryColor = '#fbbf24';
        } else {
            elements.scoreBox.classList.add('status-risk');
            themeColor = '#ef4444';
            secondaryColor = '#f87171';
        }
        document.documentElement.style.setProperty('--accent-primary', themeColor);
        document.documentElement.style.setProperty('--accent-secondary', secondaryColor);
    }

    updateJudgmentUI(analysis);

    renderEvidenceCards(analysis.evidenceCards);
    renderRadiusComparison(radiusComparison, currentRadius);

    if (elements.radiusMap && pData) {
        RadiusMap.render(elements.radiusMap, currentRadius, pData.competitorsCount, pData.poiTotalCount);
    }

    // New Results: Confidence & Source Summary
    if (elements.confidenceScore) elements.confidenceScore.textContent = analysis.confidenceScore.toFixed(2);
    if (elements.confidenceBar) elements.confidenceBar.style.width = `${analysis.confidenceScore * 100}%`;

    if (elements.confidenceLabel) {
        let text = '낮음 (추정 데이터 기반 판단)'; let cls = 'low';
        if (analysis.confidenceScore >= 0.8) {
            text = '높음 (신뢰할 수 있는 데이터)'; cls = 'high';
        } else if (analysis.confidenceScore >= 0.6) {
            text = '보통 (일부 추정 데이터 포함)'; cls = 'medium';
        }
        elements.confidenceLabel.className = `conf-label ${cls}`;
        elements.confidenceLabel.textContent = text;
    }

    if (elements.sourceSummary) {
        elements.sourceSummary.innerHTML = '';
        Object.entries(analysis.sourceSummary).forEach(([src, count]) => {
            if (count === 0) return;
            const item = document.createElement('div');
            item.className = 'source-item';
            const dot = document.createElement('span');
            dot.className = `source-dot ${src}`;
            item.appendChild(dot);
            item.appendChild(document.createTextNode(`${src.replace('_', ' ')}: ${count}`));
            elements.sourceSummary.appendChild(item);
        });
    }

    if (elements.fScore) elements.fScore.textContent = analysis.layerScores.financialPressure.score.toString();
    if (elements.fExp) elements.fExp.textContent = analysis.layerScores.financialPressure.explanation;
    if (elements.mScore) elements.mScore.textContent = analysis.layerScores.marketDemand.score.toString();
    if (elements.mExp) elements.mExp.textContent = analysis.layerScores.marketDemand.explanation;

    if (elements.actionGuidance) {
        elements.actionGuidance.innerHTML = '';
        analysis.recommendedActions.forEach(guide => {
            const li = document.createElement('li');
            li.innerHTML = guide; // Use innerHTML to allow highlights
            li.style.borderLeft = `4px solid ${analysis.cri > 60 ? '#ef4444' : (analysis.cri > 35 ? '#f59e0b' : '#10b981')}`;
            li.style.padding = '12px';
            li.style.marginBottom = '10px';
            li.style.listStyle = 'none';
            li.style.background = 'rgba(255,255,255,0.03)';
            li.style.borderRadius = '0 10px 10px 0';
            li.style.fontSize = '0.88rem';
            elements.actionGuidance.appendChild(li);
        });
    }

    if (elements.adjustmentContainer && elements.adjustmentContent) {
        const adjs = analysis.minimumAdjustments;
        if (adjs && adjs.length > 0 && analysis.riskTier !== RiskTier.STABLE) {
            elements.adjustmentContainer.style.display = 'block';

            const ICONS: Record<string, string> = {
                rent: '🏢',
                laborCost: '👥',
                targetRevenue: '💰',
            };
            const fmtMan = (n: number) =>
                `${Math.round(Math.abs(n) / 10_000).toLocaleString()}만원`;
            const fmtPct = (r: number) =>
                `${Math.round(Math.abs(r) * 100)}%`;
            const deltaLabel = (item: typeof adjs[0]) =>
                item.delta < 0
                    ? `▼ ${fmtMan(item.delta)} (${fmtPct(item.deltaRate)})`
                    : `▲ ${fmtMan(item.delta)} (${fmtPct(item.deltaRate)})`;
            const deltaClass = (item: typeof adjs[0]) =>
                item.delta < 0 ? 'adj-delta-reduce' : 'adj-delta-increase';

            elements.adjustmentContent.innerHTML = `
                <div class="adj-header">
                    <span class="adj-header-title">💡 1차 조정 가이드라인</span>
                    <span class="adj-header-badge">참고용</span>
                </div>
                <p class="adj-disclaimer">현재 입력값과 추정 데이터 기준의 가이드라인입니다. 실제 상황에 맞게 직접 판단하세요.</p>
                <div class="adj-items">
                    ${adjs.map(item => `
                    <div class="adj-item">
                        <div class="adj-item-top">
                            <span class="adj-priority">①②③`.split('').filter((_, i) => i === (item.priority - 1) * 3 || i === (item.priority - 1) * 3 + 1 || i === (item.priority - 1) * 3 + 2).join('').trimStart() +
                `<span class="adj-priority-num">${item.priority}</span>
                            <span class="adj-icon">${ICONS[item.type] || '📌'}</span>
                            <span class="adj-label">${item.label}${item.isEstimated ? ' <span class="adj-estimated">(추정)</span>' : ''}</span>
                        </div>
                        <div class="adj-values">
                            <span class="adj-current">${Math.round(item.current / 10_000).toLocaleString()}만원</span>
                            <span class="adj-arrow">→</span>
                            <span class="adj-target">${Math.round(item.target / 10_000).toLocaleString()}만원</span>
                            <span class="${deltaClass(item)}">${deltaLabel(item)}</span>
                        </div>
                        <p class="adj-desc">${item.description}</p>
                    </div>
                    `).join('')}
                </div>
                <p class="adj-footer">※ 3가지 중 1~2가지를 동시에 개선할 수 있다면 안정 구간 진입 가능성이 높아집니다.</p>
            `;
        } else {
            elements.adjustmentContainer.style.display = 'none';
        }
    }

    // Save to history including AI results
    renderAIInsights(analysis, pData).then(aiResult => {
        const industry = {
            code: industryCode,
            name: elements.selectedSectorLabel?.textContent || '선택 업종'
        };
        saveToHistory(currentLocation, industry, currentRadius, analysis, aiResult);
    });

    // Store for saving (Phase 27)
    lastAnalysisResult = analysis;

    // Increment Usage (Phase 28 Polish)
    if (!currentUser?.isPro) {
        analysisCount++;
        sessionStorage.setItem('jari_analysis_count', analysisCount.toString());

        // Usage Warning (Conversion Refactoring)
        if (analysisCount === 2) {
            alert('💡 이번이 마지막 무료 판단입니다. 결정의 순간을 놓치지 않도록 주의하세요!');
        }
    }
}

// @ts-ignore
import industryProfiles from "./engine/data/industryProfiles.json";

// Legacy industry population removed in favor of searchable Phase 18 UI

// Event Listeners
elements.startAnalysis?.addEventListener('click', () => {
    runAnalysis();
});

elements.businessType?.addEventListener('change', () => {
    Object.keys(fieldSources).forEach(f => fieldSources[f] = "industry_default");
    applyProfile();
    runAnalysis();
});

elements.scenarioToggle?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.scenario-btn');
    if (!btn) return;

    elements.scenarioToggle.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentScenario = btn.getAttribute('data-scenario') as any;
    applyProfile();
    runAnalysis();
});

// QA Mode Logic
let activeQaScenario: string | undefined = undefined;

elements.qaToggleBtn?.addEventListener('click', () => {
    elements.qaPanel?.classList.toggle('hidden');
});
elements.qaCloseBtn?.addEventListener('click', () => {
    elements.qaPanel?.classList.add('hidden');
});

const qaScenarios = [
    { id: 'QA01', name: '🏢 강남 오피스 (경쟁 극도)' },
    { id: 'QA02', name: '🏡 신도시 주거 (가족 위주)' },
    { id: 'QA03', name: '🎓 홍대 대학가 (청년 압도적)' },
    { id: 'QA04', name: '🚉 구도심 역세권 (안정 유동)' },
    { id: 'QA05', name: '🏢 지방 대단지 (세대수 극대)' },
    { id: 'QA06', name: '🚗 외곽 국도변 (차량 유입)' },
    { id: 'QA07', name: '🏦 여의도 금융가 (직장인)' },
    { id: 'QA08', name: '🛒 전통시장 인근 (가족 밀집)' },
    { id: 'QA09', name: '🎪 성수동 팝업거리 (변동성 극대)' },
    { id: 'QA10', name: '🏗️ 신규 택지지구 (독점 가능)' }
];

// ── QA Scenario Section (qa mode only) ─────────────────────────────────────
if (isQaModeActive() && elements.qaScenarioContainer) {
    qaScenarios.forEach(sc => {
        const btn = document.createElement('button');
        btn.className = 'qa-case-btn';
        btn.textContent = sc.name;
        btn.addEventListener('click', () => {
            activeQaScenario = sc.id;

            // Randomly pick an industry to test with
            if (elements.businessType) {
                // Randomly pick from recommended for QA scenario
                const randomRec = RECOMMENDED_SECTORS[Math.floor(Math.random() * RECOMMENDED_SECTORS.length)];
                selectSector(randomRec.code, randomRec.name);
            }

            // Random financial settings to induce different combinations
            const getElVal = (id: string, val: string) => { const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = val; };
            getElVal('rent', (Math.floor(10 + Math.random() * 40) * 100000).toString());
            getElVal('albiCount', Math.floor(Math.random() * 4).toString());
            getElVal('managerCount', Math.floor(Math.random() * 2).toString());

            // Override global fetch
            const originalFetch = PublicDataFetcher.prototype.fetchByRadius;
            PublicDataFetcher.prototype.fetchByRadius = function (loc, rad, ind) {
                return originalFetch.call(this, { ...loc, qaScenario: activeQaScenario }, rad, ind);
            };

            Object.keys(fieldSources).forEach(f => fieldSources[f] = "industry_default");
            applyProfile();
            runAnalysis();

            // Reset override after fetch
            setTimeout(() => { PublicDataFetcher.prototype.fetchByRadius = originalFetch; }, 1000);

            window.scrollTo({ top: 0, behavior: 'smooth' });
            elements.qaPanel?.classList.add('hidden');
        });
        elements.qaScenarioContainer.appendChild(btn);
    });
}

elements.radiusToggle?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.radius-btn');
    if (!btn) return;

    elements.radiusToggle.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentRadius = Number(btn.getAttribute('data-radius'));
    // mapManager.updateRadius(currentRadius); // MVP component handles internal map state for now
    debouncedAnalysis();
});

// Track User Overrides
['margin', 'visitRate', 'ticketPrice', 'repeatFactor', 'baseRiskLine', 'laborIntensity'].forEach(f => {
    elements[f as keyof typeof elements]?.addEventListener('input', () => {
        fieldSources[f] = "user_override";
        updateSourceTag(f);
    });
});

elements.themeToggle?.addEventListener('click', () => {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    if (elements.themeKnob) {
        elements.themeKnob.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    }
});

// ── Test Runner (/?mode=test only) ──────────────────────────────────────────
if (isTestRunnerActive()) {
    import('./engine/testCases/testCaseRunner').then(({ TestCaseRunner, }) => {
        const runner = new TestCaseRunner();
        const runBtn = document.getElementById('runAllTestsBtn') as HTMLButtonElement | null;
        const statusEl = document.getElementById('testRunnerStatus');
        const resultsEl = document.getElementById('testRunnerResults');

        runBtn?.addEventListener('click', async () => {
            if (!runBtn || !resultsEl) return;
            runBtn.disabled = true;
            runBtn.textContent = '⏳ 실행 중...';
            if (statusEl) statusEl.textContent = '준비 중...';

            await runner.runAll((idx, total, result) => {
                if (statusEl) statusEl.textContent = `[${idx}/${total}] ${result.name} → ${result.pass ? '✅ Pass' : '❌ Fail'}`;
            }).then(results => {
                if (resultsEl) TestCaseRunner.renderResultTable(results, resultsEl);
                const passed = results.filter(r => r.pass).length;
                if (statusEl) statusEl.textContent = `완료: ${passed}/${results.length} passed`;
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = '↺ Re-run'; }
            });
        });
    });
}

// ── Kakao Map Initialization ───────────────────────────────────────────────
const mapManager = new KakaoMapManager();

/** Unified location selection handler */
function handleLocationSelect(lat: number, lng: number, label: string, source: LocationState['source'] = 'map_click'): void {
    currentLocation = {
        lat,
        lng,
        address: label, // We use label as address for now, _reverseGeocode provides the address
        placeName: label,
        source
    };
    mapManager.setMarker(lat, lng, currentRadius);

    // Update UI labels
    const labelEl = document.getElementById('kakaoSelectedLabel');
    if (labelEl) labelEl.textContent = label;

    const locationSearchEl = document.getElementById('locationSearch') as HTMLInputElement | null;
    if (locationSearchEl) locationSearchEl.value = label;

    console.log(`[KakaoMap] Location Selected: ${label} (${lat}, ${lng}) [${source}]`);

    debouncedAnalysis();
}

// Attach history select handler to window so it can be called from renderHistory
(window as any)._onHistorySelect = (loc: LocationState) => {
    currentLocation = loc;
    mapManager.setMarker(loc.lat, loc.lng, currentRadius);

    const labelEl = document.getElementById('kakaoSelectedLabel');
    if (labelEl) labelEl.textContent = loc.placeName || loc.address;

    const searchInput = document.getElementById('kakaoSearchInput') as HTMLInputElement | null;
    if (searchInput) searchInput.value = loc.placeName || loc.address;

    debouncedAnalysis();
};

// 2. Initialize Interactive Sidebar Map
loadKakaoMap()
    .then(() => {
        mapManager.init('kakaoMapContainer', currentLocation.lat, currentLocation.lng);
        mapManager.setMarker(currentLocation.lat, currentLocation.lng, currentRadius);
        mapManager.onLocationSelect = handleLocationSelect;

        // ── Phase 16 Initialization ───────────────────────────────────────────
        initSectors();
        setupProductActions();
        renderHistory();

        // Restore from URL if present
        if (!restoreStateFromUrl()) {
            // If no URL state, trigger initial analysis for default location
            debouncedAnalysis();
        }

        // ── Search Logic ───────────────────────────────────────────────
        const searchInput = document.getElementById('kakaoSearchInput') as HTMLInputElement | null;
        const searchBtn = document.getElementById('kakaoSearchBtn') as HTMLButtonElement | null;
        const resultsListEl = document.getElementById('kakaoSearchResults');

        let searchResults: KakaoPlaceResult[] = [];

        async function doSearch() {
            const query = searchInput?.value.trim();
            if (!query || !resultsListEl) return;

            // Hybrid search: Start with keyword (places), then try address
            const keywordResults = await mapManager.searchKeyword(query);
            const addressResults = await mapManager.searchAddress(query);

            // Merge results (simple concat, dedupe by ID if necessary)
            searchResults = [...keywordResults, ...addressResults].slice(0, 10);

            if (searchResults.length === 0) {
                resultsListEl.innerHTML = '<li class="kakao-no-result">검색 결과가 없습니다.</li>';
                resultsListEl.style.display = 'block';
                return;
            }

            resultsListEl.innerHTML = searchResults.map((r, i) =>
                `<li class="kakao-result-item" data-idx="${i}">
                    <strong>${r.placeName}</strong>
                    <span>${r.roadAddressName || r.addressName}</span>
                </li>`
            ).join('');
            resultsListEl.style.display = 'block';
        }

        searchBtn?.addEventListener('click', () => doSearch());
        searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

        resultsListEl?.addEventListener('click', (e) => {
            const item = (e.target as HTMLElement).closest('.kakao-result-item') as HTMLElement | null;
            if (!item) return;
            const idx = Number(item.dataset.idx);
            const r = searchResults[idx];
            if (!r) return;

            handleLocationSelect(r.lat, r.lng, r.placeName, 'keyword_search');
            resultsListEl.style.display = 'none';
            if (searchInput) searchInput.value = r.placeName;
        });

        // Initial history render
        renderHistory();

        // Dismiss search results when clicking outside
        document.addEventListener('click', (e) => {
            if (resultsListEl && !resultsListEl.contains(e.target as Node) && e.target !== searchInput && e.target !== searchBtn) {
                resultsListEl.style.display = 'none';
            }
        });
    })
    .catch((err: Error) => {
        console.warn('[KakaoMap] Failed to load interactive map:', err.message);
        KakaoMapManager.showError('kakaoMapContainer', '지도를 불러올 수 없습니다.');
    });

// Ensure radius toggle updates the map circle
const originalRadiusToggle = elements.radiusToggle;
if (originalRadiusToggle) {
    originalRadiusToggle.addEventListener('click', () => {
        // The existing listener in main.ts already sets currentRadius
        // We just need to ensure mapManager is updated.
        // Since we're in the same file, we can just call it (after a micro-tick to ensure currentRadius is updated)
        setTimeout(() => mapManager.updateRadius(currentRadius), 0);
    });
}


/** ── Interpretation Layer (Phase 14) ─────────────────────────────────────── */

function updateJudgmentUI(analysis: RiskAnalysis) {
    if (!elements.judgmentReport) return;

    // 1. Location Context Header
    const reportLocationHeader = document.getElementById('reportLocationHeader');
    if (reportLocationHeader) {
        const address = currentLocation.address || currentLocation.placeName || '선택된 위치';
        const sectorLabel = elements.selectedSectorLabel.innerText || '해당 업종';

        // PRO Result Label Sync
        if (currentUser?.isPro) {
            elements.proResultLabel?.classList.remove('hidden');
        } else {
            elements.proResultLabel?.classList.add('hidden');
        }

        reportLocationHeader.innerHTML = `
            ${currentUser?.isPro ? '<span class="pro-result-label">💎 프리미엄 판단 결과</span>' : ''}
            <div class="report-lead-text">자리보고의 판단 결정입니다</div>
            <span class="context-icon">📍</span>
            <span class="report-location-text">${address} | ${sectorLabel}</span>
        `;
    }
    if (elements.reportCoordsText) elements.reportCoordsText.textContent = `(${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)})`;

    // 2. Score Breakdown & Progress Bars
    const mScore = analysis.layerScores.marketDemand.score;
    const cScore = analysis.layerScores.competitiveStructure.score;
    const rawPData = (analysis as any)._rawPublicData;
    const dScore = Math.round((rawPData?.diversityIndex || 0.5) * 100);

    if (elements.barCompetition) elements.barCompetition.style.width = `${cScore}%`;
    if (elements.valCompetition) elements.valCompetition.textContent = `${cScore}점`;
    if (elements.barDemand) elements.barDemand.style.width = `${mScore}%`;
    if (elements.valDemand) elements.valDemand.textContent = `${mScore}점`;
    if (elements.barDiversity) elements.barDiversity.style.width = `${dScore}%`;
    if (elements.valDiversity) elements.valDiversity.textContent = `${dScore}점`;

    // 3. Decision Helper UI (Phase 25)
    const decisionLevel = (100 - analysis.cri) / 100;
    if (elements.decisionHelperArea) {
        elements.decisionHelperArea.classList.remove('hidden');
        const badge = elements.mainDecisionBadge;
        if (badge) {
            badge.classList.remove('recommend', 'moderate', 'risk');
            if (decisionLevel >= 0.7) {
                badge.textContent = "진입 추천";
                badge.classList.add('recommend');
            } else if (decisionLevel >= 0.4) {
                badge.textContent = "조건부 진입";
                badge.classList.add('moderate');
            } else {
                badge.textContent = "진입 비추천";
                badge.classList.add('risk');
            }
        }
    }

    // 4. Consultative Summaries (Tone: Helper/Consultant)
    const sectorLabel = elements.selectedSectorLabel.innerText || '해당 업종';
    const reasons: string[] = [];

    // Competition
    const competitorsCount = (analysis as any).competitorsCount ?? rawPData?.competitorsCount;
    if (competitorsCount === 0 || competitorsCount === '0') {
        reasons.push(`현재 데이터상으로 경쟁점이 확인되지 않아 현장 검증이 반드시 필요합니다.`);
    } else if (cScore > 70) {
        reasons.push(`주변 경쟁 밀도가 높은 편이라 차별화된 매력이 없으면 고전할 수 있습니다.`);
    } else {
        reasons.push(`경쟁 환경은 비교적 안정적이라 초기 안착에 유리한 조건입니다.`);
    }

    // Demand
    if (mScore < 30) {
        reasons.push(`배후 수요가 기대에 못 미쳐 초기 매출 확보가 더딜 가능성이 큽니다.`);
    } else if (mScore > 70) {
        reasons.push(`유동 인구와 배후 수요가 풍부하여 기본적인 잠재력은 충분한 입지입니다.`);
    }

    // Financial
    if (analysis.layerScores.financialPressure.score > 60) {
        reasons.push(`임대료를 포함한 고정비 비중이 높아 수익성 확보에 대한 정밀한 검토가 필요합니다.`);
    }

    if (elements.decisionReasonList) {
        elements.decisionReasonList.innerHTML = reasons.slice(0, 3).map(r => `<li>${r}</li>`).join('');
    }

    const actions: string[] = [];
    if (decisionLevel >= 0.7) {
        actions.push('오픈 초기에 공격적인 홍보를 통해 충성 고객을 빠르게 확보하세요.');
        actions.push('안정적인 운영을 위해 재방문 유도 프로그램을 조기에 도입하시길 추천합니다.');
    } else if (decisionLevel >= 0.4) {
        actions.push('주변 이동 동선을 고려하여 피크 타임에 마케팅 역량을 집중해 보세요.');
        actions.push('가격보다는 서비스 품질 중심의 차별화로 브랜드 가치를 키우는 것이 좋습니다.');
    } else {
        actions.push('투자비를 낮추기 위해 소형 매장이나 배달 중심의 모델 전환을 검토해 보세요.');
        actions.push('기존 점포들과는 확실히 구분되는 핵심 타겟용 특화 메뉴가 반드시 필요합니다.');
    }

    if (elements.decisionActionList) {
        elements.decisionActionList.innerHTML = actions.slice(0, 3).map(a => `<li>${a}</li>`).join('');
    }

    // Toggle Estimation Disclaimer
    if (elements.estimationBanner) {
        elements.estimationBanner.classList.toggle('hidden', !analysis.hasEstimatedMetric);
    }

    // Update existing report lists for fallback (as technical supporting data)
    if (elements.reportReasons) {
        elements.reportReasons.innerHTML = reasons.map(r => `<li>${r}</li>`).join('');
    }
    if (elements.reportActions) {
        elements.reportActions.innerHTML = actions.map(a => `<li>${a}</li>`).join('');
    }

    elements.judgmentReport.classList.remove('hidden', 'status-recommend', 'status-caution', 'status-risk');
    elements.judgmentReport.classList.add(analysis.cri < 35 ? 'status-recommend' : (analysis.cri < 55 ? 'status-caution' : 'status-risk'));
    syncUrlWithState();
}

// ── Landing Page Transition (Phase 26) ───────────────────────────
document.querySelectorAll('.btn-start-app').forEach(btn => {
    btn.addEventListener('click', () => {
        const landing = document.getElementById('landingPage');
        const app = document.getElementById('app');
        if (landing && app) {
            landing.style.display = 'none';
            app.classList.remove('hidden');
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event('resize'));
        }
    });
});

// ── Auth & Billing Logic (Phase 27/28) ───────────────────────────
function updateAuthUI() {
    if (currentUser) {
        elements.btnLogin?.classList.add('hidden');
        elements.userInfo?.classList.remove('hidden');
        if (elements.userEmail) {
            elements.userEmail.textContent = currentUser.email;
        }

        // Billing UI Sync
        if (currentUser.isPro) {
            elements.proBadge?.classList.remove('hidden');
            elements.btnUpgrade?.classList.add('hidden');
            elements.proBenefits?.classList.add('hidden');
        } else {
            elements.proBadge?.classList.add('hidden');
            elements.btnUpgrade?.classList.remove('hidden');
            elements.proBenefits?.classList.remove('hidden');
        }
    } else {
        elements.btnLogin?.classList.remove('hidden');
        elements.userInfo?.classList.add('hidden');
        elements.btnUpgrade?.classList.add('hidden');
        elements.proBadge?.classList.add('hidden');
        elements.proBenefits?.classList.remove('hidden'); // Show benefits to guests too
    }
}

function login() {
    currentUser = { id: 'user_123', email: 'pro_founder@jaribogo.com', isPro: false };
    sessionStorage.setItem('jari_user', JSON.stringify(currentUser));
    updateAuthUI();
    alert('성공적으로 로그인되었습니다 (Mock)');
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('jari_user');
    updateAuthUI();
}

function upgradeToPro() {
    if (!currentUser) {
        alert('로그인이 필요한 기능입니다.');
        login();
        return;
    }

    if (confirm('프리미엄 멤버십으로 업그레이드 하시겠습니까?\n(무제한 판단 및 정밀 비교 기능이 해제됩니다)')) {
        currentUser.isPro = true;
        sessionStorage.setItem('jari_user', JSON.stringify(currentUser));
        updateAuthUI();
        alert('축하합니다! 이제 자리보고 Pro 멤버십을 이용하실 수 있습니다.');

        // Clear any limit notices
        const existingNotice = document.querySelector('.limit-notice-banner');
        existingNotice?.remove();
    }
}

function showLimitNotice() {
    // Check if notice already exists
    if (document.querySelector('.limit-notice-banner')) return;

    const notice = document.createElement('div');
    notice.className = 'limit-notice-banner';
    notice.innerHTML = `
        <span class="limit-reached-title">여기서 멈추면 중요한 판단을 놓칠 수 있습니다</span>
        <span class="limit-reached-sub">이 자리, 끝까지 확인해보시겠어요? (3/3 시도 완료)</span>
    `;

    // Insert before the upgrade container in sidebar
    const upgradeContainer = document.getElementById('upgradeContainer');
    if (upgradeContainer) {
        upgradeContainer.prepend(notice);
    } else {
        elements.authContainer?.appendChild(notice);
    }

    alert('지금 멈추면 가장 중요한 결론을 놓칠 수 있습니다.\n프리미엄 무제한 이용으로 명확한 결정을 내려보세요!');
}

elements.btnLogin?.addEventListener('click', login);
elements.btnLogout?.addEventListener('click', logout);
elements.btnUpgrade?.addEventListener('click', upgradeToPro);

// Initialize UI
updateAuthUI();

// ── Save Spot Logic (Phase 27) ───────────────────────────
elements.btnSaveSpot?.addEventListener('click', () => {
    if (!currentUser) {
        if (confirm('내 자리를 저장하려면 로그인이 필요합니다. 로그인하시겠습니까?')) {
            login();
        }
        return;
    }

    if (!lastAnalysisResult) {
        alert('먼저 판단을 진행해주세요.');
        return;
    }

    // Capture current judgment data
    const spotData = {
        id: `spot_${Date.now()}`,
        address: currentLocation.address || currentLocation.placeName || '알 수 없는 위치',
        sectorLabel: elements.selectedSectorLabel?.innerText || '업종 미정',
        cri: lastAnalysisResult.cri || 0,
        judgment: document.getElementById('mainDecisionBadge')?.innerText || '판단 대기',
        timestamp: new Date().toISOString()
    };

    // Save to user-based storage
    const storageKey = `saved_spots_${currentUser.id}`;
    const savedSpots = JSON.parse(localStorage.getItem(storageKey) || '[]');

    // Simple duplicate check
    const exists = savedSpots.some((s: any) => s.address === spotData.address && s.sectorLabel === spotData.sectorLabel);
    if (exists) {
        alert('이미 저장된 자리입니다.');
        return;
    }

    savedSpots.push(spotData);
    localStorage.setItem(storageKey, JSON.stringify(savedSpots));

    // UI Feedback
    elements.btnSaveSpot?.classList.add('saved');
    const label = elements.btnSaveSpot?.querySelector('.label');
    if (label) label.textContent = '저장됨';

    alert('내 자리에 저장되었습니다.');
});

// Reset Save Button when new analysis starts
function resetSaveButton() {
    elements.btnSaveSpot?.classList.remove('saved');
    const label = elements.btnSaveSpot?.querySelector('.label');
    if (label) label.textContent = '내 자리 저장';
}

// Hook into startAnalysis
elements.startAnalysis?.addEventListener('click', resetSaveButton);
