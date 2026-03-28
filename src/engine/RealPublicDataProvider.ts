import { PublicDataProvider, LocationPayload, MockPublicDataProvider } from "./PublicDataFetcher";
import type { PublicDataResult } from "./types";
import { DataSource } from "./dataMergeRules";

type DistrictMetadataResponse = {
  cityName: string;
  districtName: string;
  districtPoiCount: number;
};

type SgisRegionProxyResponse = {
  input?: {
    lat: number;
    lng: number;
  };
  transformed5179?: {
    x: number;
    y: number;
  };
  regionMeta?: {
    sido_cd?: string;
    sgg_cd?: string;
    emdong_cd?: string;
    adm_cd_7?: string;
    sido_nm?: string;
    sgg_nm?: string;
    emdong_nm?: string;
    tot_reg_cd?: string;
  };
  population?: {
    adm_cd?: string;
    adm_nm?: string;
    tot_ppltn?: string | number;
    tot_family?: string | number;
    tot_house?: string | number;
    avg_age?: string | number;
    ppltn_dnsty?: string | number;
  } | null;
  regiontotal?: {
    adm_cd?: string;
    adm_nm?: string;
    apart_per?: string | number;
    resid_ppltn_per?: string | number;
    job_ppltn_per?: string | number;
    one_person_family_per?: string | number;
    sixty_five_more_ppltn_per?: string | number;
    twenty_ppltn_per?: string | number;
  } | null;
  warnings?: {
    population?: string | null;
    regiontotal?: string | null;
  };
};

export class RealPublicDataProvider implements PublicDataProvider {
  private fallbackProvider = new MockPublicDataProvider();
  private cache: Map<string, Promise<PublicDataResult>> = new Map();

  /**
   * SGIS는 반경과 무관하게 "위치 기준" 데이터이므로 위치 단위 캐시
   * 같은 위치에서 300m / 500m / 1000m 분석 시 Edge Function 중복 호출 방지
   */
  private sgisRegionCache: Map<string, Promise<SgisRegionProxyResponse | null>> = new Map();

  private getCacheKey(location: LocationPayload, radius: number, industryCode: string): string {
    const geohash = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
    return `${geohash}:${radius}:${industryCode}`;
  }

  private getLocationCacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
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

  /**
   * SGIS는 프론트에서 직접 호출하지 않고, 무조건 Supabase Edge Function 경유
   */
  private async fetchSgisRegionData(lat: number, lng: number): Promise<SgisRegionProxyResponse | null> {
    const locationKey = this.getLocationCacheKey(lat, lng);

    if (this.sgisRegionCache.has(locationKey)) {
      console.log(`[SGIS proxy] cache hit for location=${locationKey}`);
      return this.sgisRegionCache.get(locationKey)!;
    }

    const promise = (async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const legacyAnonKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY;

        if (!supabaseUrl || !supabaseUrl.trim()) {
          throw new Error("VITE_SUPABASE_URL is missing");
        }
        if (!publishableKey || !publishableKey.trim()) {
          throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is missing");
        }
        if (!legacyAnonKey || !legacyAnonKey.trim()) {
          throw new Error("VITE_SUPABASE_LEGACY_ANON_KEY is missing");
        }

        const url =
          `${supabaseUrl}/functions/v1/sgis-regiontotal?` +
          `lat=${encodeURIComponent(String(lat))}` +
          `&lng=${encodeURIComponent(String(lng))}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${legacyAnonKey}`,
            "Content-Type": "application/json",
          },
        });

        const text = await res.text();

        if (!res.ok) {
          throw new Error(`[SGIS proxy] ${res.status} ${text}`);
        }

        const data = JSON.parse(text) as SgisRegionProxyResponse;

        console.log("[SGIS proxy] region data =", data);

        if (data?.warnings?.population) {
          console.warn("[SGIS proxy] population warning:", data.warnings.population);
        }
        if (data?.warnings?.regiontotal) {
          console.warn("[SGIS proxy] regiontotal warning:", data.warnings.regiontotal);
        }

        return data;
      } catch (err) {
        console.error("[SGIS proxy] region data fetch error:", err);
        return null;
      }
    })();

    this.sgisRegionCache.set(locationKey, promise);

    try {
      return await promise;
    } catch (err) {
      this.sgisRegionCache.delete(locationKey);
      throw err;
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

    console.log("[SGIS] incoming location:", location);

    const sgisData = await this.fetchSgisRegionData(location.lat, location.lng);

    /**
     * SGIS 성공 시 fallbackData 일부 필드 덮어쓰기
     * 실패하면 fallback 유지
     */
    if (sgisData?.population?.tot_ppltn !== undefined && sgisData.population.tot_ppltn !== null) {
      const population = Number(sgisData.population.tot_ppltn);
      if (Number.isFinite(population) && population > 0) {
        fallbackData.population = population;
      }
    }

    if (sgisData?.population?.tot_house !== undefined && sgisData.population.tot_house !== null) {
      const households = Number(sgisData.population.tot_house);
      if (Number.isFinite(households) && households > 0) {
        fallbackData.households = households;
      }
    }

    if (
      sgisData?.regiontotal?.twenty_ppltn_per !== undefined &&
      sgisData.regiontotal.twenty_ppltn_per !== null
    ) {
      const age20 = Number(sgisData.regiontotal.twenty_ppltn_per);
      if (Number.isFinite(age20) && age20 >= 0) {
        fallbackData.ageShare20_39 = age20 / 100;
      }
    }

    fallbackData._sources = {
      competitorsCount: fallbackData._sources?.competitorsCount ?? DataSource.INDUSTRY_DEFAULT,
      poiTotalCount: fallbackData._sources?.poiTotalCount ?? DataSource.INDUSTRY_DEFAULT,
      households:
        sgisData?.population?.tot_house !== undefined && sgisData.population.tot_house !== null
          ? DataSource.PUBLIC_DATA
          : fallbackData._sources?.households ?? DataSource.INDUSTRY_DEFAULT,
      population:
        sgisData?.population?.tot_ppltn !== undefined && sgisData.population.tot_ppltn !== null
          ? DataSource.PUBLIC_DATA
          : fallbackData._sources?.population ?? DataSource.INDUSTRY_DEFAULT,
      diversityIndex: fallbackData._sources?.diversityIndex ?? DataSource.INDUSTRY_DEFAULT,
      ageShare20_39:
        sgisData?.regiontotal?.twenty_ppltn_per !== undefined &&
        sgisData.regiontotal.twenty_ppltn_per !== null
          ? DataSource.PUBLIC_DATA
          : fallbackData._sources?.ageShare20_39 ?? DataSource.INDUSTRY_DEFAULT,
      volatilityProxy: fallbackData._sources?.volatilityProxy ?? DataSource.INDUSTRY_DEFAULT,
      districtPoiCount: fallbackData._sources?.districtPoiCount ?? DataSource.INDUSTRY_DEFAULT,
    };

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
