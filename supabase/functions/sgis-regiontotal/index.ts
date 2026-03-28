import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const SGIS_BASE_URL =
  Deno.env.get("SGIS_API_BASE_URL") ||
  Deno.env.get("VITE_SGIS_API_BASE_URL") ||
  "https://sgisapi.kostat.go.kr/OpenAPI3";

let sgisTokenCache: { token: string; expiresAt: number } | null = null;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function errorResponse(message: string, status = 500, extra?: unknown) {
  return jsonResponse(
    {
      error: message,
      ...(extra ? { detail: extra } : {}),
    },
    status
  );
}

async function fetchJson(url: string, label: string) {
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status} ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`[${label}] JSON parse failed: ${text}`);
  }
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('"errCd":-401') ||
    msg.includes("인증 정보가 존재하지 않습니다") ||
    msg.includes("SGIS auth error")
  );
}

async function getSgisAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();

  if (!forceRefresh && sgisTokenCache && sgisTokenCache.expiresAt > now) {
    return sgisTokenCache.token;
  }

  const consumerKey =
    Deno.env.get("SGIS_CONSUMER_KEY") || Deno.env.get("VITE_SGIS_CONSUMER_KEY");
  const consumerSecret =
    Deno.env.get("SGIS_CONSUMER_SECRET") || Deno.env.get("VITE_SGIS_CONSUMER_SECRET");

  if (!consumerKey) {
    throw new Error("Missing SGIS_CONSUMER_KEY / VITE_SGIS_CONSUMER_KEY");
  }
  if (!consumerSecret) {
    throw new Error("Missing SGIS_CONSUMER_SECRET / VITE_SGIS_CONSUMER_SECRET");
  }

  const params = new URLSearchParams({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  const url = `${SGIS_BASE_URL}/auth/authentication.json?${params.toString()}`;
  const json = await fetchJson(url, "auth/authentication.json");

  if (json?.errCd !== 0 || !json?.result?.accessToken) {
    throw new Error(`[auth/authentication.json] SGIS auth error: ${JSON.stringify(json)}`);
  }

  const token = json.result.accessToken as string;

  sgisTokenCache = {
    token,
    expiresAt: now + 1000 * 60 * 60 * 3.5,
  };

  return token;
}

async function withFreshTokenRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  try {
    const token = await getSgisAccessToken(false);
    return await fn(token);
  } catch (err) {
    if (!isAuthError(err)) throw err;

    console.warn("[SGIS] auth-related error detected. Retrying with fresh token...");
    const freshToken = await getSgisAccessToken(true);
    return await fn(freshToken);
  }
}

async function transformTo5179(
  lng: number,
  lat: number
): Promise<{ x: number; y: number; raw: any }> {
  return withFreshTokenRetry(async (accessToken) => {
    const params = new URLSearchParams({
      accessToken,
      src: "4326",
      dst: "5179",
      posX: String(lng),
      posY: String(lat),
    });

    const url = `${SGIS_BASE_URL}/transformation/transcoord.json?${params.toString()}`;
    const json = await fetchJson(url, "transformation/transcoord.json");

    if (json?.errCd !== 0 || !json?.result) {
      throw new Error(`[transformation/transcoord.json] SGIS transcoord error: ${JSON.stringify(json)}`);
    }

    const x = Number(
      json?.result?.posX ??
      json?.result?.x ??
      json?.result?.[0]?.posX ??
      json?.result?.[0]?.x
    );

    const y = Number(
      json?.result?.posY ??
      json?.result?.y ??
      json?.result?.[0]?.posY ??
      json?.result?.[0]?.y
    );

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`[transformation/transcoord.json] Invalid transformed coordinates: ${JSON.stringify(json)}`);
    }

    return { x, y, raw: json };
  });
}

async function findSmallAreaCode(
  x: number,
  y: number
): Promise<{
  sido_cd: string;
  sgg_cd: string;
  emdong_cd: string;
  sido_nm: string;
  sgg_nm: string;
  emdong_nm: string;
  tot_reg_cd: string;
  raw: any;
}> {
  return withFreshTokenRetry(async (accessToken) => {
    const params = new URLSearchParams({
      accessToken,
      x_coor: String(x),
      y_coor: String(y),
    });

    const url = `${SGIS_BASE_URL}/personal/findcodeinsmallarea.json?${params.toString()}`;
    const json = await fetchJson(url, "personal/findcodeinsmallarea.json");

    if (
      json?.errCd !== 0 ||
      !json?.result?.sido_cd ||
      !json?.result?.sgg_cd ||
      !json?.result?.emdong_cd
    ) {
      throw new Error(
        `[personal/findcodeinsmallarea.json] SGIS findcodeinsmallarea error: ${JSON.stringify(json)}`
      );
    }

    return {
      ...json.result,
      raw: json,
    };
  });
}

async function fetchPopulation(admCd7: string): Promise<any | null> {
  return withFreshTokenRetry(async (accessToken) => {
    const params = new URLSearchParams({
      year: "2020",
      adm_cd: admCd7,
      low_search: "0",
      accessToken,
    });

    const url = `${SGIS_BASE_URL}/stats/population.json?${params.toString()}`;
    const json = await fetchJson(url, "stats/population.json");

    if (json?.errCd !== 0) {
      throw new Error(`[stats/population.json] SGIS population error: ${JSON.stringify(json)}`);
    }

    const row = json?.result?.[0] ?? null;
    if (!row) return null;

    return {
      adm_cd: row?.adm_cd ?? null,
      adm_nm: row?.adm_nm ?? null,
      tot_ppltn: row?.tot_ppltn ?? null,
      tot_family: row?.tot_family ?? null,
      tot_house: row?.tot_house ?? null,
      avg_age: row?.avg_age ?? null,
      ppltn_dnsty: row?.ppltn_dnsty ?? null,
      raw: json,
    };
  });
}

async function fetchRegionTotal(admCd7: string): Promise<any | null> {
  return withFreshTokenRetry(async (accessToken) => {
    const params = new URLSearchParams({
      adm_cd: admCd7,
      accessToken,
    });

    const url = `${SGIS_BASE_URL}/startupbiz/regiontotal.json?${params.toString()}`;
    const json = await fetchJson(url, "startupbiz/regiontotal.json");

    if (json?.errCd !== 0) {
      throw new Error(`[startupbiz/regiontotal.json] SGIS regiontotal error: ${JSON.stringify(json)}`);
    }

    const row =
      json?.result?.find?.((item: any) => String(item?.adm_cd) === String(admCd7)) ??
      json?.result?.[0] ??
      null;

    if (!row) return null;

    return {
      adm_cd: row?.adm_cd ?? null,
      adm_nm: row?.adm_nm ?? null,
      apart_per: row?.apart_per ?? null,
      resid_ppltn_per: row?.resid_ppltn_per ?? null,
      job_ppltn_per: row?.job_ppltn_per ?? null,
      one_person_family_per: row?.one_person_family_per ?? null,
      sixty_five_more_ppltn_per: row?.sixty_five_more_ppltn_per ?? null,
      twenty_ppltn_per: row?.twenty_ppltn_per ?? null,
      raw: json,
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const latRaw = url.searchParams.get("lat");
    const lngRaw = url.searchParams.get("lng");

    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return errorResponse("lat and lng are required", 400);
    }

    const transformed5179 = await transformTo5179(lng, lat);
    const area = await findSmallAreaCode(transformed5179.x, transformed5179.y);
    const admCd7 = `${area.sido_cd}${area.sgg_cd}${area.emdong_cd}`;

    const [populationSettled, regiontotalSettled] = await Promise.allSettled([
      fetchPopulation(admCd7),
      fetchRegionTotal(admCd7),
    ]);

    const population =
      populationSettled.status === "fulfilled" ? populationSettled.value : null;
    const regiontotal =
      regiontotalSettled.status === "fulfilled" ? regiontotalSettled.value : null;

    return jsonResponse({
      input: { lat, lng },
      transformed5179: {
        x: transformed5179.x,
        y: transformed5179.y,
      },
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
      population: population
        ? {
            adm_cd: population.adm_cd,
            adm_nm: population.adm_nm,
            tot_ppltn: population.tot_ppltn,
            tot_family: population.tot_family,
            tot_house: population.tot_house,
            avg_age: population.avg_age,
            ppltn_dnsty: population.ppltn_dnsty,
          }
        : null,
      regiontotal: regiontotal
        ? {
            adm_cd: regiontotal.adm_cd,
            adm_nm: regiontotal.adm_nm,
            apart_per: regiontotal.apart_per,
            resid_ppltn_per: regiontotal.resid_ppltn_per,
            job_ppltn_per: regiontotal.job_ppltn_per,
            one_person_family_per: regiontotal.one_person_family_per,
            sixty_five_more_ppltn_per: regiontotal.sixty_five_more_ppltn_per,
            twenty_ppltn_per: regiontotal.twenty_ppltn_per,
          }
        : null,
      warnings: {
        population:
          populationSettled.status === "rejected"
            ? String(populationSettled.reason)
            : null,
        regiontotal:
          regiontotalSettled.status === "rejected"
            ? String(regiontotalSettled.reason)
            : null,
      },
    });
  } catch (err) {
    console.error("[sgis-regiontotal] error:", err);

    return errorResponse(
      err instanceof Error ? err.message : "Unknown error",
      500
    );
  }
});