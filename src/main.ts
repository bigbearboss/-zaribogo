import { RiskEngine } from "./engine/RiskEngine";
import type {
  RiskAnalysis,
  FinancialData,
  MarketData,
  CompetitionData,
  StabilityData,
  AIAnalysisResult,
  AnalysisHistoryItem,
  AIInput,
  EvidenceCard,
} from "./engine/types";
import { RiskTier } from "./engine/types";
import { RadiusMap } from "./engine/RadiusMap";
import { DataSource } from "./engine/dataMergeRules";
import {
  applyModeToDocument,
  conditionalLog,
  isQaModeActive,
  isTestRunnerActive,
} from "./engine/appMode";
import { loadKakaoMap } from "./services/kakaoMapLoader";
import { KakaoMapManager, KakaoPlaceResult } from "./map/KakaoMapManager";
import { AIService } from "./engine/AIService";
import { authService } from "./services/AuthService";
import { historyService } from "./services/HistoryService";
import { PublicDataFetcher } from "./engine/PublicDataFetcher";
import { RealPublicDataProvider } from "./engine/RealPublicDataProvider";
import { CsvDatasetProvider } from "./engine/CsvDatasetProvider";
import { getZeroCompetitionInsight } from "./engine/zeroCompetitionInsight";
import { supabase } from "./services/supabase";
// @ts-ignore
import industryProfiles from "./engine/data/industryProfiles.json";
import admCodeMap from "./engine/data/admCodeMap";

// Apply mode attributes to <html> element immediately so CSS can hide QA-only elements
applyModeToDocument();


const getEl = (id: string) => document.getElementById(id);
const getVal = (id: string, defaultVal: string = "0") =>
  (getEl(id) as HTMLInputElement | HTMLSelectElement)?.value || defaultVal;
const getNum = (id: string, defaultVal: number = 0) =>
  Number(getVal(id, defaultVal.toString())) || defaultVal;
const getCheck = (id: string) => (getEl(id) as HTMLInputElement)?.checked || false;

let lastAnalysisResult: RiskAnalysis | null = null;

const elements = {
  authContainer: getEl("authContainer"),
  btnLogin: getEl("btnLogin"),
  btnLogout: getEl("btnLogout"),
  userInfo: getEl("userInfo"),
  userEmail: getEl("userEmail"),
  btnSaveSpot: getEl("btnSaveSpot"),
  proBadge: getEl("proBadge"),
  btnUpgrade: getEl("btnUpgrade"),
  proBenefits: getEl("proBenefits"),
  proResultLabel: getEl("proResultLabel"),
  comparisonSummary: getEl("comparisonSummary"),

  startAnalysis: getEl("startAnalysis") as HTMLButtonElement,
  themeToggle: getEl("themeToggle") as HTMLElement,
  themeKnob: getEl("themeKnob") as HTMLElement,
  scenarioToggle: getEl("scenarioToggle") as HTMLElement,
  radiusToggle: getEl("radiusToggle") as HTMLElement,

  scoreBox: getEl("scoreBox") as HTMLElement,
  compositeScore: getEl("compositeScore") as HTMLElement,
  riskTier: getEl("riskTier") as HTMLElement,
  gaugePath: getEl("gaugePath") as unknown as SVGPathElement,
  fScore: getEl("fScore") as HTMLElement,
  fExp: getEl("fExp") as HTMLElement,
  mScore: getEl("mScore") as HTMLElement,
  mExp: getEl("mExp") as HTMLElement,

  confidenceScore: getEl("confidenceScore") as HTMLElement,
  confidenceBar: getEl("confidenceBar") as HTMLElement,
  sourceSummary: getEl("sourceSummary") as HTMLElement,

  evidenceContainer: getEl("evidenceContainer") as HTMLElement,
  radiusComparison: getEl("radiusComparison") as HTMLElement,

  llmCard: getEl("llmCard") as HTMLElement,
  llmContent: getEl("llmContent") as HTMLElement,

  actionGuidance: getEl("actionGuidance") as HTMLElement,
  radiusMap: getEl("radiusMap") as HTMLElement,
  stabilityDistance: getEl("stabilityDistance") as HTMLElement,

  estimationBanner: getEl("estimationBanner") as HTMLElement,
  householdCount: getEl("householdCount") as HTMLInputElement,
  competitorCount: getEl("competitorCount") as HTMLInputElement,
  officeBuildingCount: getEl("officeBuildingCount") as HTMLInputElement,
  marketActivity: getEl("marketActivity") as HTMLSelectElement,

  qaToggleBtn: getEl("qaToggleBtn") as HTMLElement,
  qaPanel: getEl("qaPanel") as HTMLElement,
  qaCloseBtn: getEl("qaCloseBtn") as HTMLElement,
  qaScenarioContainer: getEl("qaScenarioContainer") as HTMLElement,

  adjustmentContainer: getEl("adjustmentContainer") as HTMLElement,
  adjustmentContent: getEl("adjustmentContent") as HTMLElement,
  confidenceLabel: getEl("confidenceLabel") as HTMLElement,

  margin: getEl("margin") as HTMLInputElement,
  visitRate: getEl("visitRate") as HTMLInputElement,
  ticketPrice: getEl("ticketPrice") as HTMLInputElement,
  repeatFactor: getEl("repeatFactor") as HTMLInputElement,
  baseRiskLine: getEl("baseRiskLine") as HTMLInputElement,
  laborIntensity: getEl("laborIntensity") as HTMLInputElement,
  albiCount: getEl("albiCount") as HTMLInputElement,
  managerCount: getEl("managerCount") as HTMLInputElement,
  loanAmount: getEl("loanAmount") as HTMLInputElement,
  interestRate: getEl("interestRate") as HTMLInputElement,

  metaRadius: getEl("metaRadius") as HTMLElement,
  metaSource: getEl("metaSource") as HTMLElement,
  metaTime: getEl("metaTime") as HTMLElement,
  criEstimationBadge: getEl("criEstimationBadge") as HTMLElement,
  evidenceEstimationBadge: getEl("evidenceEstimationBadge") as HTMLElement,

  judgmentReport: getEl("judgmentReport") as HTMLElement,
  reportStatusBadge: getEl("reportStatusBadge") as HTMLElement,
  reportSummary: getEl("reportSummary") as HTMLElement,
  reportReasons: getEl("reportReasons") as HTMLElement,
  reportActions: getEl("reportActions") as HTMLElement,

  reportLocationText: getEl("reportLocationText") as HTMLElement,
  reportCoordsText: getEl("reportCoordsText") as HTMLElement,
  barCompetition: getEl("barCompetition") as HTMLElement,
  valCompetition: getEl("valCompetition") as HTMLElement,
  barDemand: getEl("barDemand") as HTMLElement,
  valDemand: getEl("valDemand") as HTMLElement,
  barDiversity: getEl("barDiversity") as HTMLElement,
  valDiversity: getEl("valDiversity") as HTMLElement,

  btnShare: getEl("btnShare") as HTMLButtonElement,
  btnDownload: getEl("btnDownload") as HTMLButtonElement,
  businessType: getEl("businessType") as HTMLInputElement,
  businessTypeTrigger: getEl("businessTypeTrigger") as HTMLElement,
  businessTypeDropdown: getEl("businessTypeDropdown") as HTMLElement,
  sectorSearchInput: getEl("sectorSearchInput") as HTMLInputElement,
  selectedSectorLabel: getEl("selectedSectorLabel") as HTMLElement,
  recommendedSectors: getEl("recommendedSectors") as HTMLElement,
  allSectors: getEl("allSectors") as HTMLElement,

  comparisonSection: getEl("comparisonSection") as HTMLElement,
  comparisonContent: getEl("comparisonContent") as HTMLElement,

  finalJudgmentBadge: getEl("finalJudgmentBadge") as HTMLElement,
  btnSaveLocation: getEl("btnSaveLocation") as HTMLButtonElement,
  btnCompareHistory: getEl("btnCompareHistory") as HTMLButtonElement,
  btnReanalyze: getEl("btnReanalyze") as HTMLButtonElement,

  decisionHelperArea: getEl("decisionHelperArea") as HTMLElement,
  mainDecisionBadge: getEl("mainDecisionBadge") as HTMLElement,
  decisionReasonList: getEl("decisionReasonList") as HTMLElement,
  decisionActionList: getEl("decisionActionList") as HTMLElement,
};

let currentCRI = 0;
let selectedHistoryForComparison: AnalysisHistoryItem[] = [];
let selectedLocationsForComparison: any[] = [];

function setupProductActions() {
  elements.btnSaveLocation?.addEventListener("click", () => {
    const saveKey = "riskx_saved_locations";
    const saved: any[] = JSON.parse(localStorage.getItem(saveKey) || "[]");
    const loc = {
      id: Date.now(),
      address: currentLocation.address || currentLocation.placeName,
      cri: currentCRI,
      timestamp: new Date().toISOString(),
    };
    saved.unshift(loc);
    localStorage.setItem(saveKey, JSON.stringify(saved.slice(0, 50)));
    alert("해당 위치가 저장되었습니다.");
  });

  elements.btnCompareHistory?.addEventListener("click", () => {
    const historySection = document.getElementById("kakaoRecentHistory");
    historySection?.scrollIntoView({ behavior: "smooth" });
    historySection?.classList.add("flash-highlight");
    setTimeout(() => historySection?.classList.remove("flash-highlight"), 1000);
  });

  elements.btnReanalyze?.addEventListener("click", () => {
    elements.businessTypeTrigger?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => elements.businessTypeTrigger?.click(), 500);
  });

  elements.btnShare?.addEventListener("click", () => {
    syncUrlWithState();
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert("자리보고 공유 링크가 클립보드에 복사되었습니다.");
    });
  });

  elements.btnDownload?.addEventListener("click", () => {
    if (!elements.judgmentReport) return;
    const h2c = (window as any).html2canvas;
    if (!h2c) {
      alert("이미지 생성 라이브러리 로드 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    h2c(elements.judgmentReport, {
      backgroundColor: "#0a0a0a",
      scale: 2,
      logging: false,
      useCORS: true,
    }).then((canvas: HTMLCanvasElement) => {
      const link = document.createElement("a");
      link.download = `risk-x-report-${currentLocation.placeName || "analysis"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  });

  elements.businessType?.addEventListener("change", () => {
  resetAnalysisView();
});
}

const RECOMMENDED_SECTORS = [
  { code: "cafe", name: "☕ 카페/커피전문점" },
  { code: "restaurant_korean", name: "🍱 일반음식점 (한식)" },
  { code: "restaurant_western", name: "🍝 일반음식점 (양식/일식)" },
  { code: "convenience", name: "🏪 편의점" },
  { code: "retail", name: "🛍️ 일반 소매점" },
  { code: "beauty", name: "💇 미용/헤어숍" },
];

function initSectors() {
  renderRecommendedSectors();

  elements.businessTypeTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    elements.businessTypeDropdown?.classList.toggle("hidden");
    if (!elements.businessTypeDropdown?.classList.contains("hidden")) {
      elements.sectorSearchInput?.focus();
      renderAllSectors();
    }
  });

  document.addEventListener("click", () => {
    elements.businessTypeDropdown?.classList.add("hidden");
  });

  elements.businessTypeDropdown?.addEventListener("click", (e) => e.stopPropagation());

  elements.sectorSearchInput?.addEventListener("input", () => {
    filterSectors();
  });
}

function renderRecommendedSectors() {
  if (!elements.recommendedSectors) return;
  elements.recommendedSectors.innerHTML = RECOMMENDED_SECTORS.map(
    (s) => `<div class="sector-item" data-code="${s.code}">${s.name}</div>`
  ).join("");

  elements.recommendedSectors.querySelectorAll(".sector-item").forEach((item) => {
    item.addEventListener("click", () =>
      selectSector((item as HTMLElement).dataset.code!, item.textContent!)
    );
  });
}

function renderAllSectors(filter = "") {
  if (!elements.allSectors) return;

  const all = RiskEngine.getAllProfiles();

  if (all.length === 0) {
    elements.allSectors.innerHTML = `<div class="sector-item-hint">업종 데이터를 불러오는 중 오류가 발생했습니다.</div>`;
    return;
  }

  const filtered = filter
    ? all.filter(
        (s) =>
          (s.display_name_ko && s.display_name_ko.includes(filter)) ||
          (s.display_name_en &&
            s.display_name_en.toLowerCase().includes(filter.toLowerCase())) ||
          (s.internal_code && s.internal_code.includes(filter))
      )
    : all.slice(0, 50);

  if (filtered.length === 0) {
    elements.allSectors.innerHTML = `<div class="sector-item-hint">검색 결과가 없습니다.</div>`;
    return;
  }

  elements.allSectors.innerHTML = filtered
    .map((s) => `<div class="sector-item" data-code="${s.internal_code}">${s.display_name_ko}</div>`)
    .join("");

  elements.allSectors.querySelectorAll(".sector-item").forEach((item) => {
    item.addEventListener("click", () =>
      selectSector((item as HTMLElement).dataset.code!, item.textContent!)
    );
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
  elements.businessTypeDropdown.classList.add("hidden");

  document.querySelectorAll(".sector-item").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.code === code);
  });

  resetAnalysisView();
}

function syncUrlWithState(): void {
  const params = new URLSearchParams();
  params.set("lat", currentLocation.lat.toFixed(6));
  params.set("lng", currentLocation.lng.toFixed(6));
  params.set("radius", currentRadius.toString());
  params.set("sector", elements.businessType.value);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({ path: newUrl }, "", newUrl);
}

function restoreStateFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get("lat") || "");
  const lng = parseFloat(params.get("lng") || "");
  const radius = parseInt(params.get("radius") || "");
  const sector = params.get("sector");

  if (!isNaN(lat) && !isNaN(lng)) {
    if (!isNaN(radius)) currentRadius = radius;
    if (sector) {
      elements.businessType.value = sector;
      const rec = RECOMMENDED_SECTORS.find((r) => r.code === sector);
      elements.selectedSectorLabel.textContent = rec ? rec.name : `업종 코드: ${sector}`;
    }

    handleLocationSelect({
  lat,
  lng,
  label: "공유된 위치",
  source: "url_params",
  address: "공유된 위치",
  placeName: "공유된 위치",
});
    return true;
  }
  return false;
}

interface LocationState {
  lat: number;
  lng: number;
  address: string;
  placeName: string;
  source: "map_click" | "keyword_search" | "address_search" | "history" | "default" | "url_params";
  sidoName?: string;
  sigunguName?: string;
  dongName?: string;
  admCd?: string;
}

function normalizeRegionName(value?: string): string {
  return (value || "").replace(/\s+/g, "").trim();
}

/**
 * 임시 매핑 함수
 * 다음 단계에서 실제 admCode 테이블(JSON/CSV) 연결 예정
 */
function resolveAdmCdFromAddress(
  sidoName?: string,
  sigunguName?: string,
  dongName?: string
): string | undefined {
  const sido = normalizeRegionName(sidoName);
  const sigungu = normalizeRegionName(sigunguName);
  const dong = normalizeRegionName(dongName);

  console.log("[ADM] resolve request", { sido, sigungu, dong });

  if (!sido || !sigungu || !dong) return undefined;

  const found = admCodeMap.find((row: any) => {
    return (
      normalizeRegionName(row.sidoName) === sido &&
      normalizeRegionName(row.sigunguName) === sigungu &&
      normalizeRegionName(row.dongName) === dong
    );
  });

  console.log("[ADM] resolved admCd", found?.admCd);

  return found?.admCd;
}

let currentScenario: "conservative" | "base" | "aggressive" = "base";
let currentRadius = 500;

let currentLocation: LocationState = {
  lat: 37.5657,
  lng: 126.9769,
  address: "서울특별시 중구 태평로1가 31",
  placeName: "서울시청",
  source: "default",
  sidoName: "서울특별시",
  sigunguName: "중구",
  dongName: "태평로1가",
  admCd: undefined,
};

const fieldSources: Record<string, any> = {
  margin: "industry_default",
  ticketPrice: "industry_default",
};

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetAnalysisView() {
  lastAnalysisResult = null;

  if (elements.judgmentReport) {
    elements.judgmentReport.classList.add("hidden");
  }

  if (elements.decisionHelperArea) {
    elements.decisionHelperArea.classList.add("hidden");
  }

  if (elements.llmCard) {
    elements.llmCard.style.display = "none";
  }

  if (elements.comparisonSummary) {
    elements.comparisonSummary.classList.add("hidden");
  }

  if (elements.estimationBanner) {
    elements.estimationBanner.classList.add("hidden");
  }
}

function showAnalysisProgress(message: string) {
  if (!elements.judgmentReport) return;

  elements.judgmentReport.classList.remove("hidden");
  elements.judgmentReport.innerHTML = `
    <div class="analysis-progress-card">
      <div class="analysis-progress-badge">AI 분석 진행 중</div>
      <h3>${message}</h3>
      <p>입지 조건, 경쟁 환경, 수요 지표를 순차적으로 검토하고 있습니다.</p>
    </div>
  `;
}

async function saveToHistory(
  loc: LocationState,
  industry: { code: string; name: string },
  radius: number,
  analysis: RiskAnalysis,
  aiResult: AIAnalysisResult | null
) {
  const leanAnalysis = {
    cri: analysis.cri,
    riskTier: analysis.riskTier,
    layerScores: {
      marketDemand: { score: analysis.layerScores.marketDemand.score },
      competitiveStructure: { score: analysis.layerScores.competitiveStructure.score },
    },
    confidenceScore: analysis.confidenceScore,
    competitorsCount: (analysis as any)._rawPublicData?.competitorsCount,
  } as unknown as RiskAnalysis;

  const newItem: AnalysisHistoryItem = {
    location: {
  lat: loc.lat,
  lng: loc.lng,
  address: loc.address || loc.placeName || "",
  placeName: loc.placeName || "",
  sidoName: loc.sidoName,
  sigunguName: loc.sigunguName,
  dongName: loc.dongName,
  admCd: loc.admCd,
},
    industry,
    radius,
    analysis: leanAnalysis,
    aiResult: aiResult ? ({ oneLineSummary: aiResult.oneLineSummary } as AIAnalysisResult) : null,
    timestamp: Date.now(),
  };

  await historyService.saveResult(newItem);
  renderHistory();
}

async function renderHistory() {
  const container = document.getElementById("kakaoRecentHistory");
  if (!container) return;

  const history = await historyService.getHistory();
  const selectedCount = selectedHistoryForComparison.length;
  const countBadge = `<span class="selection-counter">${selectedCount}/2 선택됨</span>`;

  if (history.length === 0) {
    container.innerHTML = '<span class="history-empty">최근 확인한 자리가 없습니다.</span>';
    return;
  }

  container.innerHTML = `
        <div class="history-header">${countBadge}</div>
        <div class="history-chips">
            ${history
              .map((h, i) => {
                try {
                  const isSelected = selectedHistoryForComparison.some(
                    (item) => item.timestamp === h.timestamp
                  );

                  const indName =
                    typeof h.industry === "string"
                      ? h.industry
                      : h.industry?.name || "알 수 없는 업종";

                  return `
                        <div class="history-chip ${isSelected ? "selected" : ""}" data-idx="${i}">
                            <div class="history-info">
                                <span class="history-name">${h.location.placeName || h.location.address}</span>
                                <span class="history-sub">${indName} | ${h.radius}m</span>
                            </div>
                            <button class="comp-add-btn">${isSelected ? "비교 해제" : "비교 추가"}</button>
                        </div>
                    `;
                } catch {
                  return "";
                }
              })
              .join("")}
        </div>
    `;

  container.querySelectorAll(".history-chip").forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.idx);
    const item = history[idx];

    el.querySelector(".comp-add-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleComparison(item);
    });

    el.addEventListener("click", () => {
      handleLocationSelect({
  lat: item.location.lat,
  lng: item.location.lng,
  label: item.location.placeName || item.location.address,
  source: "history",
  address: item.location.address,
  placeName: item.location.placeName,
  sidoName: (item.location as any).sidoName,
  sigunguName: (item.location as any).sigunguName,
  dongName: (item.location as any).dongName,
});
    });
  });
}

function toggleComparison(item: AnalysisHistoryItem) {
  const idx = selectedHistoryForComparison.findIndex((h) => h.timestamp === item.timestamp);
  if (idx > -1) {
    selectedHistoryForComparison.splice(idx, 1);
  } else {
    if (selectedHistoryForComparison.length >= 2) {
      alert("비교는 최대 2개까지만 가능합니다.");
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
    elements.comparisonSection.classList.add("hidden");
    return;
  }

  elements.comparisonSection.classList.remove("hidden");

  const [h1, h2] = selectedHistoryForComparison;

  let conclusion = "";
  if (h1.analysis.cri < h2.analysis.cri) {
    const diff = h2.analysis.cri - h1.analysis.cri;
    conclusion = `
            <div class="comp-summary-premium">
                <p><strong>${h1.location.placeName || h1.location.address}</strong> 후보지가 <strong>${h2.location.placeName || h2.location.address}</strong>보다 CRI 지수가 ${diff.toFixed(
      0
    )}점 낮아 상대적으로 우수한 입지 조건을 갖추고 있습니다.</p>
                <p class="comp-logic-text">💡 ${
                  h1.analysis.layerScores.marketDemand.score >
                  h2.analysis.layerScores.marketDemand.score
                    ? "풍부한 배후 수요(객관적 지표)"
                    : "안정적인 경쟁 환경(시장 과밀도 낮음)"
                }를 바탕으로 리스크 대비 수익성 확보가 더 수월할 것으로 판단됩니다.</p>
            </div>
        `;
  } else {
    const diff = h1.analysis.cri - h2.analysis.cri;
    conclusion = `
            <div class="comp-summary-premium">
                <p><strong>${h2.location.placeName || h2.location.address}</strong> 후보지가 <strong>${h1.location.placeName || h1.location.address}</strong>보다 지표상 우위에 있습니다. (CRI 격차: ${diff.toFixed(
      0
    )}점)</p>
                <p class="comp-logic-text">💡 ${
                  h2.analysis.layerScores.competitiveStructure.score <
                  h1.analysis.layerScores.competitiveStructure.score
                    ? "상대적으로 낮은 경쟁 밀도"
                    : "높은 상권 활성도"
                } 덕분에 시장 안착 및 초기 운영의 난위도가 더 낮을 것으로 예상됩니다.</p>
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
                        <td>${typeof h1.industry === "string" ? h1.industry : h1.industry.name} / ${h1.radius}m</td>
                        <td>${typeof h2.industry === "string" ? h2.industry : h2.industry.name} / ${h2.radius}m</td>
                    </tr>
                    <tr>
                        <td>종합 지수 (CRI)</td>
                        <td class="score-cell ${h1.analysis.cri < h2.analysis.cri ? "better" : ""}">${h1.analysis.cri}점</td>
                        <td class="score-cell ${h2.analysis.cri < h1.analysis.cri ? "better" : ""}">${h2.analysis.cri}점</td>
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
                        <td><p class="ai-mini-text">${h1.aiResult?.oneLineSummary || "-"}</p></td>
                        <td><p class="ai-mini-text">${h2.aiResult?.oneLineSummary || "-"}</p></td>
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

const fDataMock = {
  monthlyRevenue: 50000000,
  rent: 5000000,
  maintenanceFee: 500000,
  deposit: 50000000,
  premium: 30000000,
  area: 66,
  floor: "1",
  hasParking: true,
  hasInsurance: false,
  insuranceFee: 0,
  debtService: 0,
  operatingExpenses: 1000000,
  cashBufferMonths: 3,
  albiCount: 2,
  managerCount: 1,
  laborCost: 7500000,
};
const mDataMock = {
  householdCount: 3000,
  officeBuildingCount: 10,
  competitorCount: 5,
  competitorRadius: 0.5,
  marketActivity: "moderate" as any,
  footTrafficScore: 50,
  demographicGrowthRate: 1.2,
  vacancyRate: 5,
};
const cDataMock = {
  competitorProximity: 1,
  marketSaturationIndex: 30,
  pricingPower: 60,
};
const sDataMock = {
  leaseRemainingYears: 5,
  ownershipStructure: "Leased" as any,
  regulatoryRiskIndex: 10,
};

async function renderAIInsights(
  analysis: RiskAnalysis,
  pData: any
): Promise<AIAnalysisResult | null> {
  if (!elements.llmCard || !elements.llmContent) return null;

  const aiInput: AIInput = {
    industry: elements.selectedSectorLabel?.textContent || "선택 업종",
    location: {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      address: currentLocation.placeName || currentLocation.address,
    },
    radiusM: currentRadius,
    cri: analysis.cri,
    riskTier: analysis.riskTier,
    metrics: {
      competitionStrength: analysis.layerScores.competitiveStructure.score,
      demandIndex: analysis.layerScores.marketDemand.score,
      financialPressure: analysis.layerScores.financialPressure.score,
      structuralStability: analysis.layerScores.structuralStability.score,
    },
    publicData: {
      competitorsCount: pData.competitorsCount,
      poiTotalCount: pData.poiTotalCount,
      districtPoiCount: pData.districtPoiCount || 0,
      population: pData.population,
      households: pData.households,
    },
  };

  elements.llmCard.style.display = "block";
  elements.llmCard.innerHTML = `
        <div class="ai-header">
            <h4>✨ AI 참고 요약 (데이터 기반 해석)</h4>
            <span class="ai-badge">🤖 AI 수립 데이터 기반</span>
        </div>
        <div class="llm-content" id="llmContent">
            <div class="loading" style="padding: 20px; text-align: center; color: var(--text-muted);">✨ 자리보고 AI가 판단 내용을 정리 중입니다...</div>
        </div>
    `;

  const contentEl = document.getElementById("llmContent") as HTMLElement;
  const result = await AIService.generateSummary(aiInput);

  if (!result) {
    elements.llmCard.style.display = "none";
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
                        ${result.keyRisks.map((risk) => `<li>${risk}</li>`).join("")}
                    </ul>
                </div>
                <div class="ai-column">
                    <span class="ai-section-label">🚀 추천 액션</span>
                    <ul class="ai-list">
                        ${result.recommendedActions.map((action) => `<li>${action}</li>`).join("")}
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


const csvProvider = new CsvDatasetProvider();
let csvDataLoaded = false;
let csvLoadedRegionHint: string | null = null;

async function ensureCsvLoaded(
  lat: number,
  lng: number,
  regionNameHint?: string
) {
  try {
    const effectiveHint =
      regionNameHint?.trim() || currentLocation.placeName || currentLocation.address || "";

    const count = await csvProvider.loadForLocation(
      lat,
      lng,
      effectiveHint,
      (progress) => {
        conditionalLog(`[CSV] Loading... ${progress.toLocaleString()} rows indexed`);
      }
    );

    csvDataLoaded = count > 0;
    csvLoadedRegionHint = effectiveHint || null;

    conditionalLog(
      `[CSV] Dataset ready: ${count.toLocaleString()} POIs loaded. hint="${effectiveHint || "none"}"`
    );
  } catch (err) {
    csvDataLoaded = false;
    console.warn("[CSV] Dataset load failed, will use RealPublicDataProvider only.", err);
    alert(
      "해당 지역의 상세 데이터(CSV)를 불러오지 못했습니다. 실시간 공공 데이터만 사용하여 분석을 진행합니다."
    );
  }
}

function updateSourceTag(fieldId: string) {
  const parent = elements[fieldId as keyof typeof elements]?.parentElement;
  if (!parent || !parent.classList.contains("input-field")) return;

  parent.querySelector(".source-tag")?.remove();

  const tag = document.createElement("span");
  const source = fieldSources[fieldId];
  tag.className = `source - tag ${source} `;
  tag.textContent = source.replace("_", " ");
  parent.appendChild(tag);
}

function applyProfile() {
  const industryCode = elements.businessType.value;
  const profile = RiskEngine.getProfile(industryCode);
  if (!profile) return;

  const scenarioData = profile.profiles[currentScenario];

  const fields = ["margin", "ticketPrice"];
  const dataKeys: Record<string, string> = {
    margin: "margin",
    ticketPrice: "ticket_krw",
  };

  fields.forEach((f) => {
    if (fieldSources[f] !== "user_override") {
      let val = (scenarioData as any)[dataKeys[f]];
      if (f === "margin") val *= 100;
      (elements[f as keyof typeof elements] as HTMLInputElement).value = val.toString();
      fieldSources[f] = "industry_default";
    }
  });
}


function renderEvidenceCards(cards: EvidenceCard[]) {
  if (!elements.evidenceContainer) return;
  elements.evidenceContainer.innerHTML = "";

  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "evidence-card";
    div.innerHTML = `
            <div class="evidence-header">
                <span class="title">${card.icon} ${card.title}</span>
                <span class="source-tag ${card.source}">${card.source.replace("_", " ")}</span>
            </div>
            <div class="evidence-metrics">
                ${card.metrics
                  .map(
                    (m) => `
                    <div class="metric-item ${m.highlight ? "highlight-metric" : ""} ${m.isEstimated ? "estimated-metric" : ""}">
                        <span class="metric-label">
                            ${m.label}
                            ${m.isEstimated ? '<span class="estimated-tag" title="추정치 (Fallback)">*추정</span>' : ""}
                        </span>
                        <span class="metric-value">${m.value}${m.unit || ""}</span>
                    </div>
                `
                  )
                  .join("")}
            </div>
            <p class="evidence-summary">${card.summary}</p>
        `;
    elements.evidenceContainer.appendChild(div);
  });
}

function renderRadiusComparison(comparison: any[], activeRadius: number) {
  if (!elements.radiusComparison) return;
  elements.radiusComparison.innerHTML = "";

  let bestRadiusItem = comparison[0];
  comparison.forEach((item) => {
    if (item.score > (bestRadiusItem?.score || 0)) {
      bestRadiusItem = item;
    }

    const div = document.createElement("div");
    div.className = `comparison-card ${item.radius === activeRadius ? "active" : ""}`;
    const deltaClass = item.delta > 0 ? "up" : "down";
    const deltaSymbol = item.delta > 0 ? "+" : "";

    div.innerHTML = `
            <div class="comp-radius">${item.radius}m</div>
            <div class="comp-score">${item.score}</div>
            <div class="comp-delta ${deltaClass}">${deltaSymbol}${item.delta}</div>
        `;
    elements.radiusComparison.appendChild(div);
  });

  if (elements.comparisonSummary && bestRadiusItem) {
    elements.comparisonSummary.classList.remove("hidden");
    let summaryHtml = `<strong>🏁 최적 반경 판단:</strong> ${bestRadiusItem.radius}m 지점이 현재 가장 유리한 조율점을 보여줍니다.`;

    if (bestRadiusItem.radius === 300) {
      summaryHtml += `<br>초근접 배후 수요에 집중하는 밀착형 전략이 효과적인 입지입니다.`;
    } else if (bestRadiusItem.radius === 500) {
      summaryHtml += `<br>유동 인구와 경쟁 밀도의 밸런스가 가장 안정적인 표준 반경입니다.`;
    } else {
      summaryHtml += `<br>광역 수요를 끌어올 수 있는 잠재력이 커서 브랜드 파워가 중요해 보입니다.`;
    }

    const user = authService.getUser();
    const isPro = (user as any)?.user_metadata?.is_pro || false;
    if (isPro) {
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

type RunAnalysisOptions = {
  persist?: boolean;
  userId?: string;
};

async function getUserCreditStatus(userId: string) {
  const { data, error } = await supabase
    .from("usage_credits")
    .select("total_credits, used_credits")
    .eq("user_id", userId)
    .single();

  if (error) {
  console.error("[usage_credits select error]", error);
  throw new Error(`크레딧 정보를 불러올 수 없습니다. (${error.message})`);
}

  const totalCredits = data?.total_credits ?? 0;
  const usedCredits = data?.used_credits ?? 0;
  const remainingCredits = Math.max(totalCredits - usedCredits, 0);

  return {
    totalCredits,
    usedCredits,
    remainingCredits,
  };
}

function showUpgradeModal() {
  const modal = document.getElementById("upgradeModal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    alert("무료 분석 2회를 모두 사용했어요.\n프리미엄 플랜이 필요합니다.");
  }
}

async function saveAnalysisResultToSupabase(params: {
  userId: string;
  location: LocationState;
  businessTypeCode: string;
  businessTypeLabel: string;
  analysis: RiskAnalysis;
  aiResult: AIAnalysisResult;
}) {
  const { userId, location, businessTypeCode, businessTypeLabel, analysis, aiResult } = params;

  const normalizedResult = {
    oneLineSummary: aiResult?.oneLineSummary ?? "",
    keyRisks: Array.isArray(aiResult?.keyRisks) ? aiResult.keyRisks : [],
    recommendedActions: Array.isArray(aiResult?.recommendedActions)
      ? aiResult.recommendedActions
      : [],
    precautions: aiResult?.precautions ?? "",
    cri: analysis.cri,
    riskTier: analysis.riskTier,
    confidenceScore: analysis.confidenceScore,
    location: {
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      placeName: location.placeName,
    },
    industry: {
      code: businessTypeCode,
      label: businessTypeLabel,
    },
    savedAt: new Date().toISOString(),
  };

  const reportTitle = `[${businessTypeLabel}] ${location.placeName || location.address} 분석 리포트`;

  const { error } = await supabase.from("analysis_results").insert([
    {
      user_id: userId,
      title: reportTitle,
      location: location.placeName || location.address,
      business_type: businessTypeCode,
      result_data: normalizedResult,
      is_favorite: false,
    },
  ]);

  if (error) {
    throw new Error(`분석 결과 저장 실패: ${error.message}`);
  }
}

async function consumeCredit(userId: string) {
  const { error } = await supabase.rpc("increment_used_credit", {
    user_id_input: userId,
  });

  if (error) {
    throw new Error(`크레딧 차감 실패: ${error.message}`);
  }
}

async function handleStartAnalysisClick() {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`로그인 정보를 확인할 수 없습니다. (${authError.message})`);
  }

  const user = authData.user;

  if (!user) {
    if (confirm("분석 결과 저장과 마이페이지 이용을 위해 로그인이 필요합니다. 로그인하시겠습니까?")) {
      login();
    }
    return;
  }

  const btn = elements.startAnalysis;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "권한 확인 중...";
  }

  try {
    const credit = await getUserCreditStatus(user.id);

    if (credit.remainingCredits <= 0) {
      showUpgradeModal();
      return;
    }

    resetSaveButton();

    showAnalysisProgress("선택하신 위치의 기본 입지 정보를 확인하고 있습니다.");
    await wait(800);

    showAnalysisProgress("선택하신 위치 인근 상권과 경쟁 환경을 분석하고 있습니다.");
    await wait(900);

    showAnalysisProgress("수익성, 배후 수요, 진입 리스크를 종합 판단하고 있습니다.");
    await wait(900);

    if (btn) {
      btn.textContent = "최종 분석 결과 정리 중...";
    }

    await runAnalysis({
      persist: true,
      userId: user.id,
    });

    alert("분석이 완료되었어요.");
  } catch (error: any) {
    console.error("[handleStartAnalysisClick] Error:", error);
    alert(error?.message || "분석 처리 중 문제가 발생했습니다.");
    resetAnalysisView();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "자리 판단하기";
    }
  }
}


const debouncedAnalysis = debounce(runAnalysis, 500);

async function runAnalysis(options: RunAnalysisOptions = {}) {
  const { persist = false, userId } = options;

  const analysisId = `analysis_${Date.now()}`;
  performance.mark(`${analysisId}: start`);

  const rent = getNum("rent", 0);
  const maintenance = getNum("maintenanceFee", 0);
  const labor = getNum("laborCost", 0);
  const industryCode = getVal("businessType", "cafe_indie_small");
  const profile = RiskEngine.getProfile(industryCode);
  const location = currentLocation;

  const publicDataFetcher = new PublicDataFetcher(new RealPublicDataProvider());
  const apiData = await publicDataFetcher.fetchByRadius(location, currentRadius, industryCode);

  const regionHint = location.placeName || location.address || "";
  await ensureCsvLoaded(location.lat, location.lng, regionHint);

  if (csvDataLoaded) {
    try {
      const csvResult = await csvProvider.queryRadius(location, currentRadius, industryCode);
      apiData.competitorsCount = csvResult.competitorsCount;
      apiData.poiTotalCount = csvResult.poiTotalCount;
      apiData.diversityIndex = csvResult.diversityIndex;
      apiData._sources = {
        ...apiData._sources,
        competitorsCount: DataSource.PUBLIC_DATA,
        poiTotalCount: DataSource.PUBLIC_DATA,
        diversityIndex: DataSource.PUBLIC_DATA,
      };

      conditionalLog(
        `[CSV] Injected local metrics. hint="${regionHint}", competitors=${csvResult.competitorsCount}, poi=${csvResult.poiTotalCount}`
      );
    } catch (err) {
      console.warn("[CSV] Spatial query failed; using API fallback.", err);
    }
  }

  const pData = apiData;

  performance.mark(`${analysisId}: data_ready`);
  performance.measure("analysis:data_fetch_time", `${analysisId}: start`, `${analysisId}: data_ready`);
  const [dMeasure] = performance.getEntriesByName("analysis:data_fetch_time").slice(-1);
  conditionalLog(`[Perf] analysis: data_fetch_time = ${dMeasure?.duration.toFixed(0)} ms(API + CSV merge)`);

  if (pData) {
    if (elements.householdCount) elements.householdCount.value = pData.households.toString();
    if (elements.competitorCount) elements.competitorCount.value = pData.competitorsCount.toString();
    if (elements.officeBuildingCount) {
      elements.officeBuildingCount.value = Math.round(pData.poiTotalCount * 0.1).toString();
    }

    if (elements.marketActivity) {
      const vol = pData.volatilityProxy;
      if (vol > 0.4) elements.marketActivity.value = "booming";
      else if (vol > 0.2) elements.marketActivity.value = "high";
      else if (vol > 0.1) elements.marketActivity.value = "moderate";
      else elements.marketActivity.value = "low";
    }
  }

  const otherRadii = [300, 500, 1000].filter((r) => r !== currentRadius);
  const comparisonResults = await Promise.all(
    otherRadii.map(async (r) => {
      const rData = await publicDataFetcher.fetchByRadius(location, r, industryCode);
      const analysis = RiskEngine.analyze(
        { ...fDataMock, industryCode, industryCategory: profile.industry_category },
        mDataMock,
        cDataMock,
        sDataMock,
        rData
      );
      return { radius: r, score: analysis.cri };
    })
  );

  const fData: FinancialData = {
    industryCode,
    industryCategory: profile.industry_category,
    monthlyRevenue: Math.round((rent + maintenance + labor) / 0.6),
    rent,
    maintenanceFee: maintenance,
    deposit: getNum("deposit", 0),
    premium: getNum("premium", 0),
    area: getNum("area", 0),
    floor: getVal("floor", "1"),
    hasParking: getCheck("hasParking"),
    hasInsurance: false,
    insuranceFee: 0,
    debtService: 0,
    operatingExpenses: rent * 0.2,
    cashBufferMonths: 3,
    albiCount: getNum("albiCount", 0),
    managerCount: getNum("managerCount", 0),
    laborCost: labor,
    loanAmount: getNum("loanAmount", 0),
    interestRate: getNum("interestRate", 0),
    margin: getNum("margin") ? getNum("margin") / 100 : undefined,
    ticketPrice: getNum("ticketPrice") || undefined,
    sources: fieldSources,
  };

  const mData: MarketData = {
    householdCount: 3000,
    officeBuildingCount: 10,
    competitorCount: 5,
    competitorRadius: 0.5,
    marketActivity: "moderate",
    footTrafficScore: 50,
    demographicGrowthRate: 1.2,
    vacancyRate: 5,
  };

  const cData: CompetitionData = {
    competitorProximity: 1,
    marketSaturationIndex: 30,
    pricingPower: 60,
  };

  const sData: StabilityData = {
    leaseRemainingYears: 5,
    ownershipStructure: "Leased",
    regulatoryRiskIndex: 10,
  };

  const analysis: RiskAnalysis = RiskEngine.analyze(fData, mData, cData, sData, pData);
  currentCRI = analysis.cri;

  console.log("[PublicData Debug]", {
    poiTotalCount: pData.poiTotalCount,
    competitorsCount: pData.competitorsCount,
    households: pData.households,
    population: pData.population,
    districtPoiCount: pData.districtPoiCount,
    _sources: pData._sources,
    confidence: analysis.confidenceScore,
    csvLoadedRegionHint,
  });

  performance.mark(`${analysisId}: end`);
  performance.measure("analysis:total_time", `${analysisId}: start`, `${analysisId}: end`);
  const [tMeasure] = performance.getEntriesByName("analysis:total_time").slice(-1);
  conditionalLog(`[Perf] analysis: total_time = ${tMeasure?.duration.toFixed(0)} ms(click → engine done)`);

  if (elements.estimationBanner) {
    if (analysis.hasEstimatedMetric) {
      elements.estimationBanner.classList.remove("hidden");
    } else {
      elements.estimationBanner.classList.add("hidden");
    }
  }

  if (elements.metaRadius) elements.metaRadius.textContent = `${currentRadius} m`;
  if (elements.metaSource) {
    const sources = Object.values(pData?._sources || {});
    const hasApi = sources.includes(DataSource.PUBLIC_DATA);
    const hasCsv = csvDataLoaded;
    elements.metaSource.textContent = hasCsv
      ? hasApi
        ? "CSV + API 하이브리드"
        : "로컬 CSV 데이터"
      : hasApi
        ? "공공 API 데이터"
        : "기본 추정치";
  }

  if (elements.metaTime) {
    elements.metaTime.textContent = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const radiusComparison = [...comparisonResults, { radius: currentRadius, score: analysis.cri }]
    .sort((a, b) => a.radius - b.radius)
    .map((item) => ({
      ...item,
      delta: item.score - analysis.cri,
    }));

  if (elements.gaugePath) {
    const fullLength = 251.3;
    const offset = fullLength * (1 - analysis.cri / 100);
    (elements.gaugePath as unknown as SVGPathElement).style.strokeDashoffset = offset.toString();
  }

  if (elements.compositeScore) {
    const target = analysis.cri;
    const duration = 1500;
    const startAnimTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startAnimTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(easedProgress * target);
      if (elements.compositeScore) elements.compositeScore.textContent = current.toString();
      if (progress < 1) requestAnimationFrame(animate);
      else if (elements.compositeScore) elements.compositeScore.textContent = target.toString();
    };
    requestAnimationFrame(animate);
  }

  if (elements.stabilityDistance) {
    if (analysis.distanceToSafe > 0) {
      elements.stabilityDistance.innerHTML = `안정권(35점)까지 <span class="highlight">-${analysis.distanceToSafe}점</span> 개선이 필요합니다.`;
    } else {
      elements.stabilityDistance.innerHTML = `<span class="highlight" style="color: #10b981;">현재 안정권 지표를 보이고 있습니다.</span>`;
    }
  }

  if (elements.riskTier) elements.riskTier.textContent = analysis.riskTier;

  if (elements.scoreBox) {
    elements.scoreBox.classList.remove("status-stable", "status-moderate", "status-risk");
    let themeColor = "#10b981";
    let secondaryColor = "#34d399";

    if (analysis.cri < 35) {
      elements.scoreBox.classList.add("status-stable");
    } else if (analysis.cri < 55) {
      elements.scoreBox.classList.add("status-moderate");
      themeColor = "#f59e0b";
      secondaryColor = "#fbbf24";
    } else {
      elements.scoreBox.classList.add("status-risk");
      themeColor = "#ef4444";
      secondaryColor = "#f87171";
    }

    document.documentElement.style.setProperty("--accent-primary", themeColor);
    document.documentElement.style.setProperty("--accent-secondary", secondaryColor);
  }

  updateJudgmentUI(analysis);
  renderEvidenceCards(analysis.evidenceCards);
  renderRadiusComparison(radiusComparison, currentRadius);

  if (elements.radiusMap && pData) {
    RadiusMap.render(elements.radiusMap, currentRadius, pData.competitorsCount, pData.poiTotalCount);
  }

  if (elements.confidenceScore) {
    elements.confidenceScore.textContent = analysis.confidenceScore.toFixed(2);
  }

  if (elements.confidenceBar) {
    elements.confidenceBar.style.width = `${analysis.confidenceScore * 100}%`;
  }

  if (elements.confidenceLabel) {
    let text = "낮음 (추정 데이터 기반 판단)";
    let cls = "low";
    if (analysis.confidenceScore >= 0.8) {
      text = "높음 (신뢰할 수 있는 데이터)";
      cls = "high";
    } else if (analysis.confidenceScore >= 0.6) {
      text = "보통 (일부 추정 데이터 포함)";
      cls = "medium";
    }
    elements.confidenceLabel.className = `conf-label ${cls}`;
    elements.confidenceLabel.textContent = text;
  }

  if (elements.sourceSummary) {
    elements.sourceSummary.innerHTML = "";
    Object.entries(analysis.sourceSummary).forEach(([src, count]) => {
      if (count === 0) return;
      const item = document.createElement("div");
      item.className = "source-item";
      const dot = document.createElement("span");
      dot.className = `source-dot ${src}`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(`${src.replace("_", " ")}: ${count}`));
      elements.sourceSummary.appendChild(item);
    });
  }

  if (elements.fScore) elements.fScore.textContent = analysis.layerScores.financialPressure.score.toString();
  if (elements.fExp) elements.fExp.textContent = analysis.layerScores.financialPressure.explanation;
  if (elements.mScore) elements.mScore.textContent = analysis.layerScores.marketDemand.score.toString();
  if (elements.mExp) elements.mExp.textContent = analysis.layerScores.marketDemand.explanation;

  if (elements.actionGuidance) {
    elements.actionGuidance.innerHTML = "";
    analysis.recommendedActions.forEach((guide) => {
      const li = document.createElement("li");
      li.innerHTML = guide;
      li.style.borderLeft = `4px solid ${
        analysis.cri > 60 ? "#ef4444" : analysis.cri > 35 ? "#f59e0b" : "#10b981"
      }`;
      li.style.padding = "12px";
      li.style.marginBottom = "10px";
      li.style.listStyle = "none";
      li.style.background = "rgba(255,255,255,0.03)";
      li.style.borderRadius = "0 10px 10px 0";
      li.style.fontSize = "0.88rem";
      elements.actionGuidance.appendChild(li);
    });
  }

  if (elements.adjustmentContainer && elements.adjustmentContent) {
    const adjs = analysis.minimumAdjustments;
    if (adjs && adjs.length > 0 && analysis.riskTier !== RiskTier.STABLE) {
      elements.adjustmentContainer.style.display = "block";

      const ICONS: Record<string, string> = {
        rent: "🏢",
        laborCost: "👥",
        targetRevenue: "💰",
      };
      const fmtMan = (n: number) => `${Math.round(Math.abs(n) / 10_000).toLocaleString()}만원`;
      const fmtPct = (r: number) => `${Math.round(Math.abs(r) * 100)}%`;
      const deltaLabel = (item: (typeof adjs)[0]) =>
        item.delta < 0
          ? `▼ ${fmtMan(item.delta)} (${fmtPct(item.deltaRate)})`
          : `▲ ${fmtMan(item.delta)} (${fmtPct(item.deltaRate)})`;
      const deltaClass = (item: (typeof adjs)[0]) =>
        item.delta < 0 ? "adj-delta-reduce" : "adj-delta-increase";

      elements.adjustmentContent.innerHTML = `
        <div class="adj-header">
          <span class="adj-header-title">💡 1차 조정 가이드라인</span>
          <span class="adj-header-badge">참고용</span>
        </div>
        <p class="adj-disclaimer">현재 입력값과 추정 데이터 기준의 가이드라인입니다. 실제 상황에 맞게 직접 판단하세요.</p>
        <div class="adj-items">
          ${adjs
            .map(
              (item) => `
            <div class="adj-item">
              <div class="adj-item-top">
                <span class="adj-priority-num">${item.priority}</span>
                <span class="adj-icon">${ICONS[item.type] || "📌"}</span>
                <span class="adj-label">${item.label}${
                  item.isEstimated ? ' <span class="adj-estimated">(추정)</span>' : ""
                }</span>
              </div>
              <div class="adj-values">
                <span class="adj-current">${Math.round(item.current / 10_000).toLocaleString()}만원</span>
                <span class="adj-arrow">→</span>
                <span class="adj-target">${Math.round(item.target / 10_000).toLocaleString()}만원</span>
                <span class="${deltaClass(item)}">${deltaLabel(item)}</span>
              </div>
              <p class="adj-desc">${item.description}</p>
            </div>
          `
            )
            .join("")}
        </div>
        <p class="adj-footer">※ 3가지 중 1~2가지를 동시에 개선할 수 있다면 안정 구간 진입 가능성이 높아집니다.</p>
      `;
    } else {
      elements.adjustmentContainer.style.display = "none";
    }
  }

  if (persist) {
    if (elements.llmCard) {
      elements.llmCard.style.display = "block";
    }

    const aiResult = await renderAIInsights(analysis, pData);

    if (!aiResult) {
      throw new Error("AI 요약 생성에 실패했습니다.");
    }

    const industry = {
      code: industryCode,
      name: elements.selectedSectorLabel?.textContent || "선택 업종",
    };

    await saveToHistory(currentLocation, industry, currentRadius, analysis, aiResult);

    if (!userId) {
      throw new Error("사용자 정보가 없어 결과를 저장할 수 없습니다.");
    }

    await saveAnalysisResultToSupabase({
      userId,
      location: currentLocation,
      businessTypeCode: industryCode,
      businessTypeLabel: industry.name,
      analysis,
      aiResult,
    });

    await consumeCredit(userId);
  } else {
    if (elements.llmCard) {
      elements.llmCard.style.display = "none";
    }
  }

  lastAnalysisResult = analysis;
}

elements.startAnalysis?.addEventListener("click", () => {
  handleStartAnalysisClick();
});

elements.businessType?.addEventListener("change", () => {
  Object.keys(fieldSources).forEach((f) => (fieldSources[f] = "industry_default"));
  applyProfile();
  runAnalysis();
});

elements.scenarioToggle?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".scenario-btn");
  if (!btn) return;

  elements.scenarioToggle.querySelectorAll(".scenario-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  currentScenario = btn.getAttribute("data-scenario") as any;
  applyProfile();
  runAnalysis();
});

let activeQaScenario: string | undefined = undefined;

elements.qaToggleBtn?.addEventListener("click", () => {
  elements.qaPanel?.classList.toggle("hidden");
});
elements.qaCloseBtn?.addEventListener("click", () => {
  elements.qaPanel?.classList.add("hidden");
});

const qaScenarios = [
  { id: "QA01", name: "🏢 강남 오피스 (경쟁 극도)" },
  { id: "QA02", name: "🏡 신도시 주거 (가족 위주)" },
  { id: "QA03", name: "🎓 홍대 대학가 (청년 압도적)" },
  { id: "QA04", name: "🚉 구도심 역세권 (안정 유동)" },
  { id: "QA05", name: "🏢 지방 대단지 (세대수 극대)" },
  { id: "QA06", name: "🚗 외곽 국도변 (차량 유입)" },
  { id: "QA07", name: "🏦 여의도 금융가 (직장인)" },
  { id: "QA08", name: "🛒 전통시장 인근 (가족 밀집)" },
  { id: "QA09", name: "🎪 성수동 팝업거리 (변동성 극대)" },
  { id: "QA10", name: "🏗️ 신규 택지지구 (독점 가능)" },
];

if (isQaModeActive() && elements.qaScenarioContainer) {
  qaScenarios.forEach((sc) => {
    const btn = document.createElement("button");
    btn.className = "qa-case-btn";
    btn.textContent = sc.name;
    btn.addEventListener("click", () => {
      activeQaScenario = sc.id;

      if (elements.businessType) {
        const randomRec =
          RECOMMENDED_SECTORS[Math.floor(Math.random() * RECOMMENDED_SECTORS.length)];
        selectSector(randomRec.code, randomRec.name);
      }

      const getElVal = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.value = val;
      };
      getElVal("rent", (Math.floor(10 + Math.random() * 40) * 100000).toString());
      getElVal("albiCount", Math.floor(Math.random() * 4).toString());
      getElVal("managerCount", Math.floor(Math.random() * 2).toString());

      const originalFetch = PublicDataFetcher.prototype.fetchByRadius;
      PublicDataFetcher.prototype.fetchByRadius = function (loc, rad, ind) {
        return originalFetch.call(this, { ...loc, qaScenario: activeQaScenario }, rad, ind);
      };

      Object.keys(fieldSources).forEach((f) => (fieldSources[f] = "industry_default"));
      applyProfile();
      runAnalysis();

      setTimeout(() => {
        PublicDataFetcher.prototype.fetchByRadius = originalFetch;
      }, 1000);

      window.scrollTo({ top: 0, behavior: "smooth" });
      elements.qaPanel?.classList.add("hidden");
    });
    elements.qaScenarioContainer.appendChild(btn);
  });
}

elements.radiusToggle?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".radius-btn");
  if (!btn) return;

  elements.radiusToggle.querySelectorAll(".radius-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  currentRadius = Number(btn.getAttribute("data-radius"));
  resetAnalysisView();
});

["margin", "visitRate", "ticketPrice", "repeatFactor", "baseRiskLine", "laborIntensity"].forEach(
  (f) => {
    elements[f as keyof typeof elements]?.addEventListener("input", () => {
      fieldSources[f] = "user_override";
      updateSourceTag(f);
    });
  }
);

elements.themeToggle?.addEventListener("click", () => {
  const currentTheme = document.body.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", newTheme);
  if (elements.themeKnob) {
    elements.themeKnob.textContent = newTheme === "dark" ? "🌙" : "☀️";
  }
});

if (isTestRunnerActive()) {
  import("./engine/testCases/testCaseRunner").then(({ TestCaseRunner }) => {
    const runner = new TestCaseRunner();
    const runBtn = document.getElementById("runAllTestsBtn") as HTMLButtonElement | null;
    const statusEl = document.getElementById("testRunnerStatus");
    const resultsEl = document.getElementById("testRunnerResults");

    runBtn?.addEventListener("click", async () => {
      if (!runBtn || !resultsEl) return;
      runBtn.disabled = true;
      runBtn.textContent = "⏳ 실행 중...";
      if (statusEl) statusEl.textContent = "준비 중...";

      await runner
        .runAll((idx, total, result) => {
          if (statusEl)
            statusEl.textContent = `[${idx}/${total}] ${result.name} → ${
              result.pass ? "✅ Pass" : "❌ Fail"
            }`;
        })
        .then((results) => {
          if (resultsEl) TestCaseRunner.renderResultTable(results, resultsEl);
          const passed = results.filter((r: any) => r.pass).length;
          if (statusEl) statusEl.textContent = `완료: ${passed}/${results.length} passed`;
          if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = "↺ Re-run";
          }
        });
    });
  });
}

const mapManager = new KakaoMapManager();

function handleLocationSelect(params: {
  lat: number;
  lng: number;
  label: string;
  source?: LocationState["source"];
  address?: string;
  placeName?: string;
  sidoName?: string;
  sigunguName?: string;
  dongName?: string;
}): void {
  const {
    lat,
    lng,
    label,
    source = "map_click",
    address,
    placeName,
    sidoName,
    sigunguName,
    dongName,
  } = params;

  const admCd = resolveAdmCdFromAddress(sidoName, sigunguName, dongName);

  currentLocation = {
    lat,
    lng,
    address: address || label,
    placeName: placeName || label,
    source,
    sidoName,
    sigunguName,
    dongName,
    admCd,
  };

  mapManager.setMarker(lat, lng, currentRadius);

  const labelEl = document.getElementById("kakaoSelectedLabel");
  if (labelEl) labelEl.textContent = label;

  const locationSearchEl = document.getElementById("locationSearch") as HTMLInputElement | null;
  if (locationSearchEl) locationSearchEl.value = label;

  console.log("[KakaoMap] Location Selected", {
    lat,
    lng,
    label,
    source,
    placeName: currentLocation.placeName,
    address: currentLocation.address,
    sidoName: currentLocation.sidoName,
    sigunguName: currentLocation.sigunguName,
    dongName: currentLocation.dongName,
    admCd: currentLocation.admCd,
  });

  resetAnalysisView();
}

(window as any)._onHistorySelect = (loc: LocationState) => {
  currentLocation = loc;
  console.log("[HistorySelect] restored location", {
  lat: loc.lat,
  lng: loc.lng,
  address: loc.address,
  placeName: loc.placeName,
  sidoName: loc.sidoName,
  sigunguName: loc.sigunguName,
  dongName: loc.dongName,
  admCd: loc.admCd,
});
  mapManager.setMarker(loc.lat, loc.lng, currentRadius);

  const labelEl = document.getElementById("kakaoSelectedLabel");
  if (labelEl) labelEl.textContent = loc.placeName || loc.address;

  const searchInput = document.getElementById("kakaoSearchInput") as HTMLInputElement | null;
  if (searchInput) searchInput.value = loc.placeName || loc.address;

  resetAnalysisView();
};

console.log("[Main] App starting...");

loadKakaoMap()
  .then(() => {
    console.log("[Main] SDK Loaded. Initializing Map Manager...");
    mapManager.init("kakaoMapContainer", currentLocation.lat, currentLocation.lng);
    mapManager.setMarker(currentLocation.lat, currentLocation.lng, currentRadius);
   mapManager.onLocationSelect = (
  lat: number,
  lng: number,
  label: string,
  meta?: {
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
  }
) => {
  handleLocationSelect({
    lat,
    lng,
    label,
    source: "map_click",
    address: label,
    placeName: label,
    sidoName: meta?.sidoName,
    sigunguName: meta?.sigunguName,
    dongName: meta?.dongName,
  });
};

    console.log("[Main] Initializing secondary features...");
    initSectors();
    setupProductActions();
    renderHistory();

    if (!restoreStateFromUrl()) {
      console.log("[Main] No URL state found.");
    }

    resetAnalysisView();

    const searchInput = document.getElementById("kakaoSearchInput") as HTMLInputElement | null;
    const searchBtn = document.getElementById("kakaoSearchBtn") as HTMLButtonElement | null;
    const resultsListEl = document.getElementById("kakaoSearchResults");

    let searchResults: KakaoPlaceResult[] = [];

    async function doSearch() {
      const query = searchInput?.value.trim();
      if (!query || !resultsListEl) return;
      console.log(`[Search] Query: ${query}`);

      const keywordResults = await mapManager.searchKeyword(query);
      const addressResults = await mapManager.searchAddress(query);

      searchResults = [...keywordResults, ...addressResults].slice(0, 10);
      console.log(`[Search] Found ${searchResults.length} results.`);

      if (searchResults.length === 0) {
        resultsListEl.innerHTML = '<li class="kakao-no-result">검색 결과가 없습니다.</li>';
        resultsListEl.style.display = "block";
        return;
      }

      resultsListEl.innerHTML = searchResults
        .map(
          (r, i) => `
                <li class="kakao-result-item" data-idx="${i}">
                    <strong>${r.placeName}</strong>
                    <span>${r.roadAddressName || r.addressName}</span>
                </li>`
        )
        .join("");
      resultsListEl.style.display = "block";
    }

    searchBtn?.addEventListener("click", () => doSearch());
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });

    resultsListEl?.addEventListener("click", async (e) => {
  const item = (e.target as HTMLElement).closest(".kakao-result-item") as HTMLElement | null;
  if (!item) return;

  const idx = Number(item.dataset.idx);
  const r = searchResults[idx];
  if (!r) return;

  console.log("[Search Result Raw]", r);

  const meta = await mapManager.resolveAddressMeta(r.lat, r.lng);

  console.log("[Search Result Resolved Meta]", meta);

  console.log(`[Search] Result selected: ${r.placeName}`);
  handleLocationSelect({
    lat: r.lat,
    lng: r.lng,
    label: r.placeName,
    source: "keyword_search",
    address: meta.address || r.roadAddressName || r.addressName || r.placeName,
    placeName: r.placeName,
    sidoName: meta.sidoName,
    sigunguName: meta.sigunguName,
    dongName: meta.dongName,
  });

  resultsListEl.style.display = "none";
  if (searchInput) searchInput.value = r.placeName;
});
    renderHistory();

    document.addEventListener("click", (e) => {
      if (
        resultsListEl &&
        !resultsListEl.contains(e.target as Node) &&
        e.target !== searchInput &&
        e.target !== searchBtn
      ) {
        resultsListEl.style.display = "none";
      }
    });
  })
  .catch((err: Error) => {
    console.error("[Main] Map initialization stack failed:", err);
    KakaoMapManager.showError("kakaoMapContainer", `지도를 불러올 수 없습니다: ${err.message}`);
  });

const originalRadiusToggle = elements.radiusToggle;
if (originalRadiusToggle) {
  originalRadiusToggle.addEventListener("click", () => {
    setTimeout(() => mapManager.updateRadius(currentRadius), 0);
  });
}

function updateJudgmentUI(analysis: RiskAnalysis) {
  if (!elements.judgmentReport) return;

  const reportLocationHeader = document.getElementById("reportLocationHeader");
  if (reportLocationHeader) {
    const user = authService.getUser();
    const isPro = (user as any)?.user_metadata?.is_pro || false;
    if (isPro) {
      elements.proResultLabel?.classList.remove("hidden");
    } else {
      elements.proResultLabel?.classList.add("hidden");
    }

    const address = currentLocation.address || currentLocation.placeName || "알 수 없는 위치";
    const sectorLabel = elements.selectedSectorLabel?.innerText || "해당 업종";

    reportLocationHeader.innerHTML = `
            ${isPro ? '<span class="pro-result-label">💎 프리미엄 판단 결과</span>' : ""}
            <div class="report-lead-text">자리보고의 판단 결정입니다</div>
            <span class="context-icon">📍</span>
            <span class="report-location-text">${address} | ${sectorLabel}</span>
        `;
  }
  if (elements.reportCoordsText)
    elements.reportCoordsText.textContent = `(${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)})`;

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

  const decisionLevel = (100 - analysis.cri) / 100;
  if (elements.decisionHelperArea) {
    elements.decisionHelperArea.classList.remove("hidden");
    const badge = elements.mainDecisionBadge;
    if (badge) {
      badge.classList.remove("recommend", "moderate", "risk");
      if (decisionLevel >= 0.7) {
        badge.textContent = "진입 추천";
        badge.classList.add("recommend");
      } else if (decisionLevel >= 0.4) {
        badge.textContent = "조건부 진입";
        badge.classList.add("moderate");
      } else {
        badge.textContent = "진입 비추천";
        badge.classList.add("risk");
      }
    }
  }

  const sectorLabel = elements.selectedSectorLabel.innerText || "해당 업종";
  const reasons: string[] = [];
  const competitorsCount = (analysis as any).competitorsCount ?? rawPData?.competitorsCount;

  if (competitorsCount === 0 || competitorsCount === "0") {
    reasons.push(`현재 데이터상으로 경쟁점이 확인되지 않아 현장 검증이 반드시 필요합니다.`);
  } else if (cScore > 70) {
    reasons.push(`주변 경쟁 밀도가 높은 편이라 차별화된 매력이 없으면 고전할 수 있습니다.`);
  } else {
    reasons.push(`경쟁 환경은 비교적 안정적이라 초기 안착에 유리한 조건입니다.`);
  }

  if (mScore < 30) {
    reasons.push(`배후 수요가 기대에 못 미쳐 초기 매출 확보가 더딜 가능성이 큽니다.`);
  } else if (mScore > 70) {
    reasons.push(`유동 인구와 배후 수요가 풍부하여 기본적인 잠재력은 충분한 입지입니다.`);
  }

  if (analysis.layerScores.financialPressure.score > 60) {
    reasons.push(`임대료를 포함한 고정비 비중이 높아 수익성 확보에 대한 정밀한 검토가 필요합니다.`);
  }

  if (elements.decisionReasonList) {
    elements.decisionReasonList.innerHTML = reasons.slice(0, 3).map((r) => `<li>${r}</li>`).join("");
  }

  const actions: string[] = [];
  if (decisionLevel >= 0.7) {
    actions.push("오픈 초기에 공격적인 홍보를 통해 충성 고객을 빠르게 확보하세요.");
    actions.push("안정적인 운영을 위해 재방문 유도 프로그램을 조기에 도입하시길 추천합니다.");
  } else if (decisionLevel >= 0.4) {
    actions.push("주변 이동 동선을 고려하여 피크 타임에 마케팅 역량을 집중해 보세요.");
    actions.push("가격보다는 서비스 품질 중심의 차별화로 브랜드 가치를 키우는 것이 좋습니다.");
  } else {
    actions.push("투자비를 낮추기 위해 소형 매장이나 배달 중심의 모델 전환을 검토해 보세요.");
    actions.push("기존 점포들과는 확실히 구분되는 핵심 타겟용 특화 메뉴가 반드시 필요합니다.");
  }

  if (elements.decisionActionList) {
    elements.decisionActionList.innerHTML = actions.slice(0, 3).map((a) => `<li>${a}</li>`).join("");
  }

  if (elements.estimationBanner) {
    elements.estimationBanner.classList.toggle("hidden", !analysis.hasEstimatedMetric);
  }

  if (elements.reportReasons) {
    elements.reportReasons.innerHTML = reasons.map((r) => `<li>${r}</li>`).join("");
  }
  if (elements.reportActions) {
    elements.reportActions.innerHTML = actions.map((a) => `<li>${a}</li>`).join("");
  }

  elements.judgmentReport.classList.remove("hidden", "status-recommend", "status-caution", "status-risk");
  elements.judgmentReport.classList.add(
    analysis.cri < 35 ? "status-recommend" : analysis.cri < 55 ? "status-caution" : "status-risk"
  );
  syncUrlWithState();
}

document.querySelectorAll(".btn-start-app").forEach((btn) => {
  btn.addEventListener("click", () => {
    const landing = document.getElementById("landingPage");
    const app = document.getElementById("app");
    if (landing && app) {
      landing.style.display = "none";
      app.classList.remove("hidden");
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("resize"));
    }
  });
});

function updateAuthUI() {
  const user = authService.getUser();
  if (user) {
    elements.btnLogin?.classList.add("hidden");
    elements.userInfo?.classList.remove("hidden");
    if (elements.userEmail) {
      elements.userEmail.textContent = user.email || "사용자";
    }

    const isPro = (user as any)?.user_metadata?.is_pro || false;
    elements.proBadge?.classList.toggle("hidden", !isPro);
    elements.btnUpgrade?.classList.toggle("hidden", isPro);
  } else {
    elements.btnLogin?.classList.remove("hidden");
    elements.userInfo?.classList.add("hidden");
    elements.proBadge?.classList.add("hidden");
    elements.btnUpgrade?.classList.add("hidden");
  }
}

function login() {
  authService.login();
}

function logout() {
  authService.logout();
}

function upgradeToPro() {
  alert("MVP 1 단계에서는 아직 결정까지 확인 기능이 비활성화 되어 있습니다.");
}

elements.btnLogin?.addEventListener("click", login);
elements.btnLogout?.addEventListener("click", logout);
elements.btnUpgrade?.addEventListener("click", upgradeToPro);

document.getElementById("closeUpgradeModalBtn")?.addEventListener("click", () => {
  document.getElementById("upgradeModal")?.classList.add("hidden");
});

document.getElementById("goPricingBtn")?.addEventListener("click", () => {
  window.location.href = "/pricing.html";
});

authService.onAuthStateChange(() => {
  updateAuthUI();
  renderHistory();
});
elements.btnSaveSpot?.addEventListener("click", () => {
  const user = authService.getUser();
  if (!user) {
    if (confirm("내 자리를 저장하려면 로그인이 필요합니다. 로그인하시겠습니까?")) {
      login();
    }
    return;
  }

  if (!lastAnalysisResult) {
    alert("먼저 판단을 진행해주세요.");
    return;
  }

  const spotData = {
    id: `spot_${Date.now()}`,
    address: currentLocation.address || currentLocation.placeName || "알 수 없는 위치",
    sectorLabel: elements.selectedSectorLabel?.innerText || "업종 미정",
    cri: lastAnalysisResult.cri || 0,
    judgment: document.getElementById("mainDecisionBadge")?.innerText || "판단 대기",
    timestamp: new Date().toISOString(),
  };

  const storageKey = `saved_spots_${user?.id || "guest"}`;
  const savedSpots = JSON.parse(localStorage.getItem(storageKey) || "[]");

  const exists = savedSpots.some(
    (s: any) => s.address === spotData.address && s.sectorLabel === spotData.sectorLabel
  );
  if (exists) {
    alert("이미 저장된 자리입니다.");
    return;
  }

  savedSpots.push(spotData);
  localStorage.setItem(storageKey, JSON.stringify(savedSpots));

  elements.btnSaveSpot?.classList.add("saved");
  const label = elements.btnSaveSpot?.querySelector(".label");
  if (label) label.textContent = "저장됨";

  alert("내 자리에 저장되었습니다.");
});

function resetSaveButton() {
  elements.btnSaveSpot?.classList.remove("saved");
  const label = elements.btnSaveSpot?.querySelector(".label");
  if (label) label.textContent = "내 자리 저장";
}
