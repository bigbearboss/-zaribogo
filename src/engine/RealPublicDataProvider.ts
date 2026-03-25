import { PublicDataProvider, LocationPayload, MockPublicDataProvider } from "./PublicDataFetcher";
import type { PublicDataResult } from "./types";
import { DataSource } from "./dataMergeRules";

type DistrictMetadataResponse = {
  cityName: string;
  districtName: string;
  districtPoiCount: number;
};

type PoiSupplementResponse = {
  competitorsCount: number;
  poiTotalCount: number;
};

export class RealPublicDataProvider implements PublicDataProvider {
  private fallbackProvider = new MockPublicDataProvider();
  private cache: Map<string, Promise<PublicDataResult>> = new Map();

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
        // 실패 Promise가 캐시에 남지 않게 제거
        this.cache.delete(cacheKey);
        throw err;
      });

    this.cache.set(cacheKey, fetchPromise);
    return fetchPromise;
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

    const [poiSupplementResult, distResult] = await Promise.allSettled([
      this.fetchPoiSupplementEndpoint(location, radius, industryCode, 2000),
      this.fetchDistrictMetadataEndpoint(location, 2000),
    ]);

    if (poiSupplementResult.status === "fulfilled") {
      const { poiTotalCount } = poiSupplementResult.value;

      if (typeof poiTotalCount === "number" && poiTotalCount > 0) {
        result.poiTotalCount = poiTotalCount;
        result._sources!.poiTotalCount = DataSource.PUBLIC_DATA;
      } else {
        console.warn("[PublicData] POI supplement returned 0, keeping fallback value.");
      }
    } else {
      console.warn("[PublicData] POI supplement failed, using fallback.", poiSupplementResult.reason);
    }

    if (distResult.status === "fulfilled") {
      const { cityName, districtName, districtPoiCount } = distResult.value;

      if (districtPoiCount > 0) {
        result.cityName = cityName;
        result.districtName = districtName;
        result.districtPoiCount = districtPoiCount;
        result._sources!.districtPoiCount = DataSource.PUBLIC_DATA;
      } else {
        console.warn("[PublicData] District metadata returned 0, keeping fallback value.");
      }
    } else {
      console.warn("[PublicData] District metadata failed, using fallback.", distResult.reason);
    }

    return result;
  }

  /**
   * 현재 이 endpoint는 실제 "반경 내 경쟁 업종 수" 계산이 아니라,
   * ODCloud dataset의 총량성 지표를 보조적으로 읽어오는 용도다.
   * 이름을 바꿔서 오해를 줄인다.
   */
  private async fetchPoiSupplementEndpoint(
    location: LocationPayload,
    radius: number,
    industryCode: string,
    timeoutMs: number
  ): Promise<PoiSupplementResponse> {
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
        `${baseUrl}/15012005/v1/uddi:a38be9dc-51a8-422c-a2b1-6b04313f8087` +
        `?page=1&perPage=1&serviceKey=${encodedKey}`;

      console.log("[ODCLOUD] POI supplement request", {
        apiUrl,
        location,
        radius,
        industryCode,
      });

      const response = await fetch(apiUrl, {
        signal: controller.signal,
      });

      const rawText = await response.text();
      clearTimeout(timeoutId);

      console.log("[API RAW] POI Supplement:", rawText);

      if (!response.ok) {
        throw new Error(
          `POI supplement API responded with status ${response.status}: ${rawText}`
        );
      }

      const data = JSON.parse(rawText);

      const matchCount = data?.matchCount;
      const totalCount = data?.totalCount;
      const itemsList = data?.data;

      return {
        competitorsCount: 0,
        poiTotalCount:
          typeof matchCount === "number"
            ? matchCount
            : typeof totalCount === "number"
              ? totalCount
              : Array.isArray(itemsList)
                ? itemsList.length
                : 0,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
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
    } catch (error: any) {
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
