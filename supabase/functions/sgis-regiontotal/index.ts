import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

const SGIS_BASE_URL =
  Deno.env.get("VITE_SGIS_API_BASE_URL") || "https://sgisapi.kostat.go.kr/OpenAPI3";

async function fetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

async function getSgisAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get("VITE_SGIS_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VITE_SGIS_CONSUMER_SECRET");

  if (!consumerKey) throw new Error("Missing VITE_SGIS_CONSUMER_KEY");
  if (!consumerSecret) throw new Error("Missing VITE_SGIS_CONSUMER_SECRET");

  const params = new URLSearchParams({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  const url = `${SGIS_BASE_URL}/auth/authentication.json?${params.toString()}`;
  const json = await fetchJson(url);

  if (json.errCd !== 0 || !json.result?.accessToken) {
    throw new Error(`SGIS auth error: ${JSON.stringify(json)}`);
  }

  return json.result.accessToken;
}

async function transformTo5179(
  lng: number,
  lat: number,
  accessToken: string
): Promise<{ x: number; y: number }> {
  const params = new URLSearchParams({
    src: "4326",
    dst: "5179",
    posX: String(lng),
    posY: String(lat),
    accessToken,
  });

  const url = `${SGIS_BASE_URL}/transformation/transcoord.json?${params.toString()}`;
  const json = await fetchJson(url);

  if (json.errCd !== 0 || !json.result?.posX || !json.result?.posY) {
    throw new Error(`SGIS transcoord error: ${JSON.stringify(json)}`);
  }

  return {
    x: Number(json.result.posX),
    y: Number(json.result.posY),
  };
}

async function findSmallAreaCode(
  x: number,
  y: number,
  accessToken: string
): Promise<{
  sido_cd: string;
  sgg_cd: string;
  emdong_cd: string;
  sido_nm: string;
  sgg_nm: string;
  emdong_nm: string;
  tot_reg_cd: string;
}> {
  const params = new URLSearchParams({
    x_coor: String(x),
    y_coor: String(y),
    accessToken,
  });

  const url = `${SGIS_BASE_URL}/personal/findcodeinsmallarea.json?${params.toString()}`;
  const json = await fetchJson(url);

  if (json.errCd !== 0 || !json.result?.sido_cd || !json.result?.sgg_cd || !json.result?.emdong_cd) {
    throw new Error(`SGIS findcodeinsmallarea error: ${JSON.stringify(json)}`);
  }

  return json.result;
}

async function fetchPopulation(
  admCd7: string,
  accessToken: string
): Promise<any> {
  const params = new URLSearchParams({
    year: "2020",
    adm_cd: admCd7,
    low_search: "0",
    accessToken,
  });

  const url = `${SGIS_BASE_URL}/stats/population.json?${params.toString()}`;
  const json = await fetchJson(url);

  if (json.errCd !== 0) {
    throw new Error(`SGIS population error: ${JSON.stringify(json)}`);
  }

  return json;
}

async function fetchRegionTotal(
  admCd7: string,
  accessToken: string
): Promise<any> {
  const params = new URLSearchParams({
    adm_cd: admCd7,
    accessToken,
  });

  const url = `${SGIS_BASE_URL}/startupbiz/regiontotal.json?${params.toString()}`;
  const json = await fetchJson(url);

  if (json.errCd !== 0) {
    throw new Error(`SGIS regiontotal error: ${JSON.stringify(json)}`);
  }

  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = await getSgisAccessToken();

    const transformed = await transformTo5179(lng, lat, accessToken);
    const area = await findSmallAreaCode(transformed.x, transformed.y, accessToken);

    // SGIS 문서 기준 regiontotal/population은 7자리 읍면동 코드 사용 가능
    const admCd7 = `${area.sido_cd}${area.sgg_cd}${area.emdong_cd}`;

    const [populationRaw, regionTotalRaw] = await Promise.all([
      fetchPopulation(admCd7, accessToken),
      fetchRegionTotal(admCd7, accessToken),
    ]);

    const populationRow = populationRaw?.result?.[0] ?? null;
    const regionTotalRow =
  regionTotalRaw?.result?.find((row: any) => row.adm_cd === admCd7) ??
  regionTotalRaw?.result?.[0] ??
  null;
  
    return new Response(
      JSON.stringify({
        input: { lat, lng },
        transformed5179: transformed,
        regionMeta: {
          sido_cd: area.sido_cd,
          sgg_cd: area.sgg_cd,
          emdong_cd: area.emdong_cd,
          adm_cd_7: admCd7,
          sido_nm: area.sido_nm,
          sgg_nm: area.sgg_nm,
          emdong_nm: area.emdong_nm,
          tot_reg_cd: area.tot_reg_cd,
        },
        population: populationRow
          ? {
              adm_cd: populationRow.adm_cd,
              adm_nm: populationRow.adm_nm,
              tot_ppltn: populationRow.tot_ppltn,
              tot_family: populationRow.tot_family,
              tot_house: populationRow.tot_house,
              avg_age: populationRow.avg_age,
              ppltn_dnsty: populationRow.ppltn_dnsty,
            }
          : null,
        regiontotal: regionTotalRow
          ? {
              adm_cd: regionTotalRow.adm_cd,
              adm_nm: regionTotalRow.adm_nm,
              apart_per: regionTotalRow.apart_per,
              resid_ppltn_per: regionTotalRow.resid_ppltn_per,
              job_ppltn_per: regionTotalRow.job_ppltn_per,
              one_person_family_per: regionTotalRow.one_person_family_per,
              sixty_five_more_ppltn_per: regionTotalRow.sixty_five_more_ppltn_per,
              twenty_ppltn_per: regionTotalRow.twenty_ppltn_per,
            }
          : null,
        raw: {
          population: populationRaw,
          regiontotal: regionTotalRaw,
        },
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[sgis-regiontotal] error:", err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});