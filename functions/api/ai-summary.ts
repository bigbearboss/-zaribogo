interface AIInput {
  industry: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  radiusM: number;
  cri: number;
  riskTier: string;
  metrics: {
    competitionStrength: number;
    demandIndex: number;
    financialPressure: number;
    structuralStability: number;
  };
  publicData: {
    competitorsCount: number;
    poiTotalCount: number;
    districtPoiCount: number;
    population: number;
    households: number;
  };
}

interface Env {
  OPENAI_API_KEY: string;
}

// Minimal local type for Cloudflare PagesFunction to resolve linting
type PagesFunction<E = any> = (context: {
  request: Request;
  env: E;
  params: Record<string, string | string[]>;
  data: Record<string, unknown>;
  next: () => Promise<Response>;
}) => Response | Promise<Response>;

type AIOutput = {
  oneLineSummary: string;
  keyRisks: string[];
  recommendedActions: string[];
  precautions: string;
};

function buildFallbackSummary(input: AIInput): AIOutput {
  const {
    industry,
    cri,
    riskTier,
    metrics,
    publicData,
    radiusM,
  } = input;

  const keyRisks: string[] = [];
  const recommendedActions: string[] = [];

  if (metrics.competitionStrength >= 70 || publicData.competitorsCount >= 15) {
    keyRisks.push("반경 내 경쟁 강도가 높아 동일 업종 내 차별화가 어려울 수 있습니다.");
    recommendedActions.push("가격 경쟁보다 상품 구성, 서비스 경험, 타깃 고객층 차별화 전략을 먼저 설계하세요.");
  }

  if (metrics.demandIndex >= 70 || publicData.poiTotalCount < 20) {
    keyRisks.push("주변 수요 기반이 약하거나 유입 규모를 보수적으로 봐야 할 가능성이 있습니다.");
    recommendedActions.push("입지 확정 전 시간대별 유동과 실제 체류 수요를 추가 확인하세요.");
  }

  if (metrics.financialPressure >= 70) {
    keyRisks.push("고정비 부담 대비 예상 매출 방어력이 낮을 수 있습니다.");
    recommendedActions.push("임대료, 인건비, 초기 투자비를 다시 산정하고 손익분기점 기준으로 의사결정하세요.");
  }

  if (metrics.structuralStability >= 70) {
    keyRisks.push("입지의 구조적 안정성이 낮아 장기 운영 관점에서 변동성이 있을 수 있습니다.");
    recommendedActions.push("건물 접근성, 가시성, 동선, 업종 적합성을 현장 점검으로 보완하세요.");
  }

  if (keyRisks.length === 0) {
    keyRisks.push("핵심 지표상 치명적 리스크는 크지 않지만 실제 운영 조건에 따라 결과는 달라질 수 있습니다.");
  }

  while (keyRisks.length < 3) {
    keyRisks.push("상권 데이터만으로는 확인되지 않는 현장 변수와 임대 조건을 함께 검토해야 합니다.");
  }

  while (recommendedActions.length < 3) {
    recommendedActions.push("주변 경쟁점, 주요 유입 동선, 시간대별 수요를 현장에서 직접 점검하세요.");
  }

  let oneLineSummary = "";
  if (cri >= 70) {
    oneLineSummary = `${industry} 창업 관점에서 전반적인 리스크가 높은 입지로, 보수적인 검토가 필요한 상권입니다.`;
  } else if (cri >= 40) {
    oneLineSummary = `${industry} 운영에 기회와 리스크가 혼재된 입지로, 비용 구조와 수요 적합성 검토가 필요합니다.`;
  } else {
    oneLineSummary = `${industry} 기준으로 상대적으로 안정적인 입지로 보이지만, 실제 현장 변수 확인은 여전히 필요합니다.`;
  }

  const precautions =
    `현재 분석은 반경 ${radiusM}m 기준 데이터와 보조 지표를 바탕으로 작성되었습니다. ` +
    `최종 진입 전에는 실제 유동인구, 동선, 임대 조건, 가시성, 동일 업종 영업 현황을 반드시 현장 확인하세요. ` +
    `위험등급은 ${riskTier}이며, 행정구역 전체 업소 수(${publicData.districtPoiCount})는 참고 지표일 뿐 반경 내 경쟁 강도와 동일하지 않습니다.`;

  return {
    oneLineSummary,
    keyRisks: keyRisks.slice(0, 3),
    recommendedActions: recommendedActions.slice(0, 3),
    precautions,
  };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const input: AIInput = await request.json();

    if (!input || !input.industry) {
      return new Response(
        JSON.stringify({ error: "Invalid Input: Missing required fields." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 1) 키가 없으면 바로 fallback 반환
    if (!env.OPENAI_API_KEY) {
      console.warn("[AI Proxy] OPENAI_API_KEY missing. Returning fallback summary.");
      return new Response(JSON.stringify(buildFallbackSummary(input)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prompt = `
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
2. 'keyRisks'는 데이터에 기반한 핵심 리스크 3가지를 도출하세요.
3. 'recommendedActions'는 리스크를 완화하기 위한 구체적이고 실천 가능한 조언 3가지를 제시하세요.
4. 'precautions'는 최종 진입 전 반드시 확인해야 할 주의사항이나 추가 조사 항목을 작성하세요.
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional real estate analyzer. You must output only a valid JSON object following the specified schema. No conversational text.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.warn("[AI Proxy] OpenAI error. Returning fallback summary.", {
        status: response.status,
        details: errorData,
      });

      // 2) OpenAI 호출 실패해도 200 + fallback 반환
      return new Response(JSON.stringify(buildFallbackSummary(input)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const aiData: any = await response.json();
    const content = aiData?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("[AI Proxy] Empty content from OpenAI. Returning fallback summary.");
      return new Response(JSON.stringify(buildFallbackSummary(input)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (parseErr) {
      console.error("[AI Proxy] JSON Parse Error:", parseErr, "Content:", content);

      return new Response(JSON.stringify(buildFallbackSummary(input)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";

    console.warn("[AI Proxy] Unexpected error. Returning fallback summary.", err);

    // request.json() 전에 터진 경우 input을 못 얻을 수 있으니 보호
    let fallbackInput: AIInput | null = null;
    try {
      fallbackInput = await request.clone().json();
    } catch {
      fallbackInput = null;
    }

    if (fallbackInput && fallbackInput.industry) {
      return new Response(JSON.stringify(buildFallbackSummary(fallbackInput)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        error: isAbort ? "TimeoutError" : "InternalServerError",
        message: err?.message ?? "Unknown error",
      }),
      {
        status: isAbort ? 504 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }
};
