import { PublicDataProvider, LocationPayload, MockPublicDataProvider } from "./PublicDataFetcher";
import type { PublicDataResult } from "./types";
import { DataSource } from "./dataMergeRules";

type DistrictMetadataResponse = {
  cityName: string;
  districtName: string;
  districtPoiCount: number;
};

export class RealPublicDataProvider implements PublicDataProvider {
  private fallbackProvider = new MockPublicDataProvider();
  private cache: Map<string, Promise<PublicDataResult>> = new Map();
  private sgisTokenCache: { token: string; expiresAt: number } | null = null;

  private getCacheKey(location: LocationPayload, radius: number, industryCode: string): string {
    const geohash = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    return `${geohash}:${radius}:${industryCode}`;
  }

  async fetchByRadius(
    location: LocationPayload,
    radius: number,
    industryCode: string
  ): Promise<PublicDataResult> {
    if (location.qaScenario && location.qaScenario.startsWith("QA")) {
      return Promise.resolve(this.getQAScenarioMock(location.qaScenario, radius, industryCode));
    }

    const cacheKey = this.getCacheKey(location, radius, industryCode);

    if (this.cache.has(cacheKey)) {
      console.log(`[Perf] api: cache hit for key=${cacheKey}`);
      return this.cache.get(cacheKey)!;
    }

    const startMark = `api:start:${cacheKey}`;
    const endMark = `api:end:${cacheKey}`;
    const measureName = `api:fetch_time:${cacheKey}`;

    performance.mark(startMark);

    const fetchPromise = this.doFetch(location, radius, industryCode)
      .then((result) => {
        performance.mark(endMark);
        performance.measure(measureName, startMark, endMark);
        const [m] = performance.getEntriesByName(measureName).slice(-1);
        console.log(`[Perf] api:fetch_time(r=${radius}m) = ${m?.duration.toFixed(0)}ms`);
        return result;
      })
      .catch((err) => {
        this.cache.delete(cacheKey);
        throw err;
      });

    this.cache.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

private async getSgisAccessToken(): Promise<string> {
  const now = Date.now();

  // 1) 캐시된 토큰이 아직 유효하면 재사용
  if (this.sgisTokenCache && this.sgisTokenCache.expiresAt > now) {
    console.log("[SGIS] Using cached access token");
    return this.sgisTokenCache.token;
  }

  // 2) 환경변수 읽기
  const consumerKey = import.meta.env.VITE_SGIS_CONSUMER_KEY;
  const consumerSecret = import.meta.env.VITE_SGIS_CONSUMER_SECRET;
  const baseUrl =
    import.meta.env.VITE_SGIS_API_BASE_URL || "https://sgisapi.mods.go.kr/OpenAPI3";

  if (!consumerKey || !consumerKey.trim()) {
    throw new Error("VITE_SGIS_CONSUMER_KEY is missing");
  }

  if (!consumerSecret || !consumerSecret.trim()) {
    throw new Error("VITE_SGIS_CONSUMER_SECRET is missing");
  }

  // 3) 요청 파라미터 구성
  const params = new URLSearchParams({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  const url = `${baseUrl}/auth/authentication.json?${params.toString()}`;

  console.log("[SGIS] Requesting new access token");

  // 4) 인증 API 호출
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`[SGIS] Auth request failed: ${response.status} ${text}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`[SGIS] Failed to parse auth response: ${text}`);
  }

  // 5) SGIS 응답 검증
  if (
    json.errCd !== 0 ||
    !json.result ||
    !json.result.accessToken
  ) {
    throw new Error(
      `[SGIS] Auth failed: errCd=${json.errCd}, errMsg=${json.errMsg || "unknown"}`
    );
  }

  const accessToken = json.result.accessToken;

  // 6) 4시간보다 조금 짧게 캐시
  const expiresAt = now + 1000 * 60 * 60 * 3.5;

  this.sgisTokenCache = {
    token: accessToken,
    expiresAt,
  };

  console.log("[SGIS] New access token cached");

  return accessToken;
}

private async resolveAdmCd(lat: number, lng: number): Promise<string | null> {
  try {
    const token = await this.getSgisAccessToken();
    const baseUrl =
      import.meta.env.VITE_SGIS_API_BASE_URL || "https://sgisapi.mods.go.kr/OpenAPI3";

    const url =
      `${baseUrl}/boundary/hadmarea.geojson?` +
      `x_coor=${lng}&y_coor=${lat}&accessToken=${token}`;

    const res = await fetch(url);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[SGIS] resolveAdmCd failed:", res.status, errorText);
      return null;
    }

    const data = await res.json();
    const admCd = data?.features?.[0]?.properties?.adm_cd ?? null;

    console.log("[SGIS] resolved admCd:", admCd);
    return admCd;
  } catch (err) {
    console.error("[SGIS] resolveAdmCd error:", err);
    return null;
  }
}

    private async fetchFloatingPopulation(admCd: string): Promise<number | null> {
  try {
    const token = await this.getSgisAccessToken();
    const baseUrl =
      import.meta.env.VITE_SGIS_API_BASE_URL || "https://sgisapi.mods.go.kr/OpenAPI3";

    const url =
      `${baseUrl}/stats/regiontotal.json?` +
      `adm_cd=${admCd}&year=2022&accessToken=${token}`;

    const res = await fetch(url);
    const data = await res.json();

    const population = data?.result?.[0]?.tot_ppltn ?? null;

    console.log("[SGIS] floating population:", population);

    return population;
  } catch (err) {
    console.error("[SGIS] population fetch error:", err);
    return null;
  }
}
  
  
  private async doFetch(
    location: LocationPayload,
    radius: number,
    industryCode: string
  ): Promise<PublicDataResult> {
    let fallbackData: PublicDataResult;
    
    try {
      fallbackData = await this.fallbackProvider.fetchByRadius(location, radius, industryCode);
    } catch {
      throw new Error("Critical Failure: Mock provider failed.");
    }

let admCd = (location as any).admCd ?? null;

// A 방식: 앞단에서 확정된 admCd를 받아서 사용
console.log("[SGIS] incoming location:", location);
console.log("[SGIS] incoming admCd:", admCd);

// 아직 앞단 작업이 안 끝났으면 경고만 띄우고 넘어감
if (!admCd) {
  console.warn("[SGIS] admCd is missing on location payload");
}

   if (admCd) {
  const population = await this.fetchFloatingPopulation(admCd);

  if (population) {
    console.log("[SGIS] applying real population:", population);

    fallbackData.population = population;

    fallbackData._sources = {
      competitorsCount: fallbackData._sources?.competitorsCount ?? DataSource.INDUSTRY_DEFAULT,
      poiTotalCount: fallbackData._sources?.poiTotalCount ?? DataSource.INDUSTRY_DEFAULT,
      households: fallbackData._sources?.households ?? DataSource.INDUSTRY_DEFAULT,
      population: DataSource.PUBLIC_DATA,
      diversityIndex: fallbackData._sources?.diversityIndex ?? DataSource.INDUSTRY_DEFAULT,
      ageShare20_39: fallbackData._sources?.ageShare20_39 ?? DataSource.INDUSTRY_DEFAULT,
      volatilityProxy: fallbackData._sources?.volatilityProxy ?? DataSource.INDUSTRY_DEFAULT,
      districtPoiCount: fallbackData._sources?.districtPoiCount ?? DataSource.INDUSTRY_DEFAULT,
    };
  }
}
    
    const result: PublicDataResult = {
      ...fallbackData,
      _sources: {
        competitorsCount: fallbackData._sources?.competitorsCount ?? DataSource.INDUSTRY_DEFAULT,
        poiTotalCount: fallbackData._sources?.poiTotalCount ?? DataSource.INDUSTRY_DEFAULT,
        households: fallbackData._sources?.households ?? DataSource.INDUSTRY_DEFAULT,
        population: fallbackData._sources?.population ?? DataSource.INDUSTRY_DEFAULT,
        diversityIndex: fallbackData._sources?.diversityIndex ?? DataSource.INDUSTRY_DEFAULT,
        ageShare20_39: fallbackData._sources?.ageShare20_39 ?? DataSource.INDUSTRY_DEFAULT,
        volatilityProxy: fallbackData._sources?.volatilityProxy ?? DataSource.INDUSTRY_DEFAULT,
        districtPoiCount: fallbackData._sources?.districtPoiCount ?? DataSource.INDUSTRY_DEFAULT,
      },
    };

    let distResult: DistrictMetadataResponse | null = null;

    try {
      distResult = await this.fetchDistrictMetadataEndpoint(location, 2000);
    } catch (err) {
      console.warn("[PublicData] District metadata failed, using fallback.", err);
    }

    if (distResult) {
      const { cityName, districtName, districtPoiCount } = distResult;

      if (districtPoiCount > 0) {
        result.cityName = cityName;
        result.districtName = districtName;
        result.districtPoiCount = districtPoiCount;
        result._sources!.districtPoiCount = DataSource.PUBLIC_DATA;
      } else {
        console.warn("[PublicData] District metadata returned 0, keeping fallback value.");
      }
    }

    return result;
  }

  /**
   * 현재는 위치 기반 필터 없이 dataset 첫 row를 사용하는 임시 보조 메타데이터 endpoint.
   * 추후 실제 좌표/행정동 매핑 로직으로 교체 필요.
   */
  private async fetchDistrictMetadataEndpoint(
    location: LocationPayload,
    timeoutMs: number
  ): Promise<DistrictMetadataResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const baseUrl = import.meta.env.VITE_ODCLOUD_BASE_URL || "https://api.odcloud.kr/api";
      const apiKey = import.meta.env.VITE_ODCLOUD_API_KEY;

      if (!apiKey || !apiKey.trim()) {
        throw new Error("VITE_ODCLOUD_API_KEY is missing");
      }

      const encodedKey = encodeURIComponent(apiKey);
      const apiUrl =
        `${baseUrl}/15083033/v1/uddi:c7049f5a-d95e-4143-be96-b4d3c16130ee` +
        `?page=1&perPage=1&serviceKey=${encodedKey}`;

      console.log("[ODCLOUD] District metadata request", {
        apiUrl,
        location,
      });

      const response = await fetch(apiUrl, {
        signal: controller.signal,
      });

      const text = await response.text();
      clearTimeout(timeoutId);

      console.log("[API RAW] District Metadata:", text);

      if (!response.ok) {
        throw new Error(`District Metadata API responded with status ${response.status}: ${text}`);
      }

      const data = JSON.parse(text);
      const targetRow = data?.data?.[0];

      return {
        cityName: targetRow?.["시도"] || "",
        districtName: targetRow?.["읍면동"] || "",
        districtPoiCount: targetRow?.["업소수"] ? Number(targetRow["업소수"]) : 0,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private getQAScenarioMock(qaId: string, radius: number, ind: string): PublicDataResult {
    const base = {
      radiusM: radius,
      competitorsCount: 10,
      poiTotalCount: 150,
      diversityIndex: 0.5,
      households: 2000,
      population: 5000,
      ageShare20_39: 0.3,
      volatilityProxy: 0.2,
      _sources: {
        competitorsCount: "public_data",
        poiTotalCount: "public_data",
        households: "public_data",
        population: "public_data",
        diversityIndex: "industry_default",
        ageShare20_39: "industry_default",
        volatilityProxy: "industry_default",
        districtPoiCount: "industry_default",
      } as any,
    };

    const mult = radius / 500;
    const gen = (c: number, p: number, h: number, pop: number, age: number, act: number) => ({
      ...base,
      competitorsCount: Math.round(c * mult),
      poiTotalCount: Math.round(p * mult),
      households: Math.round(h * mult),
      population: Math.round(pop * mult),
      ageShare20_39: age,
      volatilityProxy: act,
    });

    switch (qaId) {
      case "QA01":
        return gen(45, 1200, 1500, 3000, 0.65, 0.4);
      case "QA02":
        return gen(5, 80, 5000, 15000, 0.25, 0.1);
      case "QA03":
        return gen(30, 400, 3000, 10000, 0.8, 0.5);
      case "QA04":
        return gen(20, 200, 4000, 12000, 0.45, 0.2);
      default:
        return gen(10, 150, 2000, 5000, 0.3, 0.2);
    }
  }
}
