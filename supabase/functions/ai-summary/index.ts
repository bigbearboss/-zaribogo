// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method Not Allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const prompt = `
너는 상권 분석 서비스 '자리보고'의 AI 해석 엔진이다.
사용자가 입력한 상권 데이터와 재무 데이터(월세, 보증금, 권리금 등)를 바탕으로, 초보 창업자가 리스크를 입체적으로 이해할 수 있도록 전략적 조언을 제공하라.

[핵심 지침]
1. **재무 데이터(financialPressure)를 최우선으로 반영하라**:
   - 특히 '안정권 진입 필요 월매출'과 '월세 부담률'을 분석 결과와 대조하여, 이 매출이 해당 상권에서 현실적으로 가능한 수준인지 비판적으로 검토하라.
   - Financial Pressure 지표(stable/adequate/caution/risk)와 상충하는 말을 절대 하지 마라. (예: 지표는 risk인데 AI는 "부담이 적다"고 하면 안 됨)
2. **구체적인 리스크를 지적하라**:
   - "리스크가 있습니다" 같은 모호한 표현 대신, "월세가 매출 대비 25%를 상회하여 순이익 확보가 매우 어렵습니다"와 같이 수치와 논리를 결합하라.
3. **매 분석마다 고유한 통찰을 제공하라**:
   - 상권의 특성(인구, 경쟁, 안정성)과 재무 구조의 조합에 따라 매번 다른 문장 구조와 분석 각도를 사용하라.
4. **전략적 대안을 제시하라**:
   - 단순히 안 좋다는 평가에 그치지 말고, "이 정도 월세를 감당하려면 테이블 회전율을 X회 이상으로 높이는 전략이 필수적입니다"와 같은 대안을 포함하라.

반드시 아래 JSON 형식으로만 응답하라:
{
  "oneLineSummary": "전체 상황을 관통하는 통찰력 있는 한 줄 요약",
  "keyRisks": ["구체적인 리스크 1", "구체적인 리스크 2", "구체적인 리스크 3"],
  "recommendedActions": ["지금 즉시 실행해야 할 전략적 액션 1", "액션 2", "액션 3"],
  "precautions": "창업자가 놓치기 쉬운 결정적 주의사항"
}

입력 데이터:
${JSON.stringify(body, null, 2)}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7, // 다양성을 위해 온도를 약간 높임
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "너는 상권 분석 결과를 데이터와 수치 기반으로 냉철하게 분석하여 성공 전략을 제안하는 대한민국 최고의 상권 분석 전문가다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `OpenAI API Error: ${response.status}`,
          details: text,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const parsed = JSON.parse(text);
    const content = parsed?.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({
          error: "Missing message content from OpenAI",
          details: parsed,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse model JSON output",
          details: content,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        oneLineSummary: result.oneLineSummary || "AI 요약 결과가 없습니다.",
        keyRisks: Array.isArray(result.keyRisks) ? result.keyRisks : [],
        recommendedActions: Array.isArray(result.recommendedActions)
          ? result.recommendedActions
          : [],
        precautions: result.precautions || "현장 실사가 필요합니다.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Function crashed",
        details: error?.message || String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});