import { AIInput, AIAnalysisResult } from "./types";

export class AIService {
  private static readonly PROXY_URL =
    import.meta.env.VITE_AI_PROXY_URL || "/api/ai-summary";

  private static readonly TIMEOUT_MS = 10000; // 10s timeout

  static async generateSummary(input: AIInput): Promise<AIAnalysisResult | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      if (!this.PROXY_URL) {
        console.error("[AI] Missing VITE_AI_PROXY_URL.");
        return null;
      }

      console.log("[AI] Sending request to proxy:", this.PROXY_URL);

      const response = await fetch(this.PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        console.error("[AI] Request timed out after 10s.", {
          proxyUrl: this.PROXY_URL,
        });
      } else {
        console.error("[AI] Error generating summary:", error);
      }

      return null;
    }
  }
}
