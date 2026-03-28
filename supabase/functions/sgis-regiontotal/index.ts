import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function getSgisAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get("VITE_SGIS_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VITE_SGIS_CONSUMER_SECRET");
  const baseUrl =
    Deno.env.get("VITE_SGIS_API_BASE_URL") || "https://sgisapi.mods.go.kr/OpenAPI3";

  if (!consumerKey) throw new Error("Missing VITE_SGIS_CONSUMER_KEY");
  if (!consumerSecret) throw new Error("Missing VITE_SGIS_CONSUMER_SECRET");

  const params = new URLSearchParams({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  const url = `${baseUrl}/auth/authentication.json?${params.toString()}`;
  const res = await fetch(url);

  const text = await res.text();
  console.log("[SGIS AUTH] raw response =", text);

  if (!res.ok) {
    throw new Error(`SGIS auth failed: ${res.status} ${text}`);
  }

  const json = JSON.parse(text);

  if (json.errCd !== 0 || !json.result?.accessToken) {
    throw new Error(`SGIS auth error: ${JSON.stringify(json)}`);
  }

  console.log(
    "[SGIS AUTH] token prefix =",
    String(json.result.accessToken).slice(0, 12)
  );

  return json.result.accessToken;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const admCd = url.searchParams.get("admCd");

    if (!admCd) {
      return new Response(
        JSON.stringify({ error: "admCd is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = await getSgisAccessToken();

    const baseUrl =
      Deno.env.get("VITE_SGIS_API_BASE_URL") || "https://sgisapi.mods.go.kr/OpenAPI3";

    const sgisUrl =
      `${baseUrl}/startupbiz/regiontotal.json?` +
      `adm_cd=${encodeURIComponent(admCd)}` +
      `&accessToken=${encodeURIComponent(token)}`;

    console.log("[SGIS REGIONTOTAL] request url =", sgisUrl);

    const sgisRes = await fetch(sgisUrl);
    const sgisText = await sgisRes.text();

    console.log("[SGIS REGIONTOTAL] status =", sgisRes.status);
    console.log("[SGIS REGIONTOTAL] raw text =", sgisText);

    if (!sgisRes.ok) {
      return new Response(
        JSON.stringify({
          error: "SGIS regiontotal request failed",
          status: sgisRes.status,
          detail: sgisText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = JSON.parse(sgisText);

    const population = data?.result?.[0]?.tot_ppltn ?? null;

    return new Response(
      JSON.stringify({
        admCd,
        population,
        raw: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[ERROR]", err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});