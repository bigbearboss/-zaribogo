import { AIInput, AIAnalysisResult } from "./types";

type AIExtendedResult = AIAnalysisResult & {
  strategicAdvice?: string[];
  fieldChecklist?: string[];
  realtorChecklist?: string[];
  decisionRationale?: string[];
  growthStrategies?: string[];
  defensiveStrategies?: string[];
};

export class AIService {
  private static readonly PROXY_URL =
    import.meta.env.VITE_AI_PROXY_URL || "/api/ai-summary";

  private static readonly SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  private static readonly SUPABASE_LEGACY_ANON_KEY =
    import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY || "";

  private static readonly TIMEOUT_MS = 10000;

  private static normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  static async generateSummary(input: AIInput): Promise<AIExtendedResult | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      console.log("[AI DEBUG] PROXY_URL =", this.PROXY_URL);
      console.log(
        "[AI DEBUG] SUPABASE_PUBLISHABLE_KEY exists =",
        !!this.SUPABASE_PUBLISHABLE_KEY
      );
      console.log(
        "[AI DEBUG] SUPABASE_LEGACY_ANON_KEY exists =",
        !!this.SUPABASE_LEGACY_ANON_KEY
      );

      if (!this.PROXY_URL) {
        console.error("[AI] Missing VITE_AI_PROXY_URL.");
        return null;
      }

      if (!this.SUPABASE_PUBLISHABLE_KEY) {
        console.error("[AI] Missing VITE_SUPABASE_ANON_KEY.");
        return null;
      }

      if (!this.SUPABASE_LEGACY_ANON_KEY) {
        console.error("[AI] Missing VITE_SUPABASE_LEGACY_ANON_KEY.");
        return null;
      }

      const response = await fetch(this.PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${this.SUPABASE_LEGACY_ANON_KEY}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[AI] Proxy request failed", {
          status: response.status,
          proxyUrl: this.PROXY_URL,
          body: errorBody,
        });

        throw new Error(
          `AI Proxy responded with status ${response.status}: ${errorBody}`
        );
      }

      const data = await response.json();

      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format from AI Proxy");
      }

      const normalized: AIExtendedResult = {
        oneLineSummary:
          typeof data.oneLineSummary === "string" && data.oneLineSummary.trim()
            ? data.oneLineSummary.trim()
            : "상권 요약을 불러올 수 없습니다.",
        keyRisks: this.normalizeStringArray(data.keyRisks),
        recommendedActions: this.normalizeStringArray(
          data.recommendedActions ?? data.executionActions
        ),
        precautions:
          typeof data.precautions === "string" && data.precautions.trim()
            ? data.precautions.trim()
            : "현장 실사와 부동산 조건 확인이 필요합니다.",
        strategicAdvice: this.normalizeStringArray(
          data.strategicAdvice ??
            data.strategySuggestions ??
            data.strategyAdvice
        ),
        fieldChecklist: this.normalizeStringArray(
          data.fieldChecklist ?? data.onSiteChecklist ?? data.fieldChecks
        ),
        realtorChecklist: this.normalizeStringArray(
          data.realtorChecklist ?? data.realtorQuestions ?? data.propertyChecks
        ),
        decisionRationale: this.normalizeStringArray(
          data.decisionRationale ?? data.whyThisDecision ?? data.rationale
        ),
        growthStrategies: this.normalizeStringArray(data.growthStrategies),
        defensiveStrategies: this.normalizeStringArray(data.defensiveStrategies),
      };

      return normalized;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        console.error("[AI] Request timed out after 10s.");
      } else {
        console.error("[AI] Error generating summary:", error);
      }

      return null;
    }
  }
}
