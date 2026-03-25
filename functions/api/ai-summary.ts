export const onRequestPost: PagesFunction = async (context) => {
  try {
    const body = await context.request.json();
    const apiKey = context.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY in Cloudflare environment variables",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const prompt = `
너는 상권 분석 서비스 '자리보고'의 AI 해석 엔진이다.
반드시 아래 JSON 형식으로만 응답하라.

{
  "oneLineSummary": "한 줄 요약",
  "keyRisks": ["리스크1", "리스크2", "리스크3"],
  "recommendedActions": ["액션1", "액션2", "액션3"],
  "precautions": "주의사항"
}

입력 데이터:
${JSON.stringify(body, null, 2)}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "너는 상권 분석 결과를 초보 창업자도 이해할 수 있게 요약해주는 전문가다.",
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

    let parsedOpenAI: any;
    try {
      parsedOpenAI = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse OpenAI raw response",
          details: text,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const content = parsedOpenAI?.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({
          error: "OpenAI response missing message content",
          details: parsedOpenAI,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let result: any;
    try {
      result = JSON.parse(content);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse JSON content from model response",
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
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
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
};
