import { AIInput, AIAnalysisResult } from "./types";

export class AIService {
  private static readonly PROXY_URL =
    import.meta.env.VITE_AI_PROXY_URL || "/api/ai-summary";

  private static readonly SUPABASE_ANON_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  private static readonly TIMEOUT_MS = 10000;

  static async generateSummary(input: AIInput): Promise<AIAnalysisResult | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      console.log("[AI DEBUG] PROXY_URL =", this.PROXY_URL);
      console.log("[AI DEBUG] SUPABASE_ANON_KEY exists =", !!this.SUPABASE_ANON_KEY);
      console.log("[AI DEBUG] Header preview =", {
        apikey: this.SUPABASE_ANON_KEY,
        authorization: `Bearer ${this.SUPABASE_ANON_KEY}`,
      });

      if (!this.PROXY_URL) {
        console.error("[AI] Missing VITE_AI_PROXY_URL.");
        return null;
      }

      if (!this.SUPABASE_ANON_KEY) {
        console.error("[AI] Missing VITE_SUPABASE_ANON_KEY.");
        return null;
      }

      const response = await fetch(this.PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.SUPABASE_ANON_KEY}`,
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

      return {
        oneLineSummary: data.oneLineSummary || "상권 요약을 불러올 수 없습니다.",
        keyRisks: Array.isArray(data.keyRisks) ? data.keyRisks : [],
        recommendedActions: Array.isArray(data.recommendedActions)
          ? data.recommendedActions
          : [],
        precautions: data.precautions || "현장 실사가 필요합니다.",
      };
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
