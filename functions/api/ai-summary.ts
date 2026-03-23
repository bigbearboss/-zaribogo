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

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const { request, env } = context;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for AI

    // 1. API Key Check
    if (!env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "Server Configuration Error: OPENAI_API_KEY is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // 2. Parse & Validate Input
        const input: AIInput = await request.json();
        if (!input || !input.industry) {
            return new Response(JSON.stringify({ error: "Invalid Input: Missing required fields." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 3. Build Prompt (Moved from Frontend)
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

        // 4. Call OpenAI API with Timeout Protection
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a professional real estate analyzer. You must output only a valid JSON object following the specified schema. No conversational text." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                max_tokens: 1000,
                temperature: 0.7
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.text();
            return new Response(JSON.stringify({ error: `OpenAI API Error: ${response.status}`, details: errorData }), {
                status: response.status,
                headers: { "Content-Type": "application/json" },
            });
        }

        const aiData: any = await response.json();
        const content = aiData.choices[0].message.content;

        // Return the JSON content directly as the response
        return new Response(content, {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
