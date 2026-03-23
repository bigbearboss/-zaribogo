import { AIInput, AIAnalysisResult } from "./types";

export class AIService {
    // SECURITY: API Key is now strictly server-side.
    // Proxy through an internal endpoint to keep the client clean.
    private static readonly PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || "/api/ai-summary";
    private static readonly TIMEOUT_MS = 10000; // 10s timeout

    static async generateSummary(input: AIInput): Promise<AIAnalysisResult | null> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        try {
            const response = await fetch(this.PROXY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(input),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`AI Proxy responded with status ${response.status}: ${errorBody}`);
            }

            const data = await response.json();

            // The proxy should return the structured AIAnalysisResult
            // Adding extra validation for robustness
            if (!data || typeof data !== 'object') {
                throw new Error("Invalid response format from AI Proxy");
            }

            // Handle potential variations in response structure
            const result: AIAnalysisResult = {
                oneLineSummary: data.oneLineSummary || "상권 요약을 불러올 수 없습니다.",
                keyRisks: Array.isArray(data.keyRisks) ? data.keyRisks : [],
                recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : [],
                precautions: data.precautions || "현장 실사가 필요합니다."
            };

            return result;
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.error("[AI] Request timed out after 10s.");
            } else {
                console.error("[AI] Error generating summary:", error);
            }
            return null;
        }
    }

    private static buildPrompt(input: AIInput): string {
        return `
다음 상권 분석 데이터를 바탕으로 상권 리포트를 작성해주세요.
모든 응답은 반드시 한국어로 작성해야 하며, 아래 JSON 형식을 엄격히 지켜주세요.

JSON 형식:
{
  "oneLineSummary": "...",
  "keyRisks": ["리스크1", "리스크2", "리스크3"],
  "recommendedActions": ["액션1", "액션2", "액션3"],
  "precautions": "..."
}

분석 데이터:
- 업종: ${input.industry}
- 분석 반경: ${input.radiusM}m
- 복합 위험 지수 (CRI): ${input.cri} (높을수록 위험)
- 위험 등급 (Risk Tier): ${input.riskTier}
- 주요 지표 점수 (0~100, 낮을수록 안정):
  - 재무 압박: ${input.metrics.financialPressure}
  - 시장 수요: ${input.metrics.demandIndex}
  - 경쟁 강도: ${input.metrics.competitionStrength}
  - 구조적 안정성: ${input.metrics.structuralStability}
- 공공데이터 지표:
  - 지역 내 전체 업소 수: ${input.publicData.districtPoiCount}
  - 반경 내 전체 POI 수: ${input.publicData.poiTotalCount}
  - 반경 내 동종 경쟁업체 수: ${input.publicData.competitorsCount}
  - 반경 내 인구수: ${input.publicData.population}
  - 반경 내 가구수: ${input.publicData.households}

지시사항:
1. 'oneLineSummary'는 상권의 상태를 가장 잘 나타내는 한 줄 문장으로 작성하세요.
2. 'keyRisks'는 데이터에 기반한 핵심 리스크 3가지를 도출하세요. (예: 임대료 대비 낮은 인구 밀도, 경쟁 과포화 등)
3. 'recommendedActions'는 리스크를 완화하기 위한 구체적이고 실천 가능한 조언 3가지를 제시하세요.
4. 'precautions'는 최종 진입 전 반드시 확인해야 할 주의사항이나 추가 조사 항목을 작성하세요.
`;
    }
}
