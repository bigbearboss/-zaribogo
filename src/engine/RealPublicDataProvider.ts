import { PublicDataProvider, LocationPayload, MockPublicDataProvider } from "./PublicDataFetcher";
import type { PublicDataResult } from "./types";
import { DataSource } from "./dataMergeRules";

export class RealPublicDataProvider implements PublicDataProvider {
    private fallbackProvider = new MockPublicDataProvider();
    private cache: Map<string, Promise<PublicDataResult>> = new Map();

    private getCacheKey(location: LocationPayload, radius: number, industryCode: string): string {
        const geohash = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
        return `${geohash}:${radius}:${industryCode}`;
    }

    async fetchByRadius(location: LocationPayload, radius: number, industryCode: string): Promise<PublicDataResult> {
        if (location.qaScenario && location.qaScenario.startsWith('QA')) {
            return Promise.resolve(this.getQAScenarioMock(location.qaScenario, radius, industryCode));
        }

        const cacheKey = this.getCacheKey(location, radius, industryCode);
        if (this.cache.has(cacheKey)) {
            console.log(`[Perf] api: cache hit for key=${cacheKey}`);
            return this.cache.get(cacheKey)!;
        }

        performance.mark('api:start');
        const fetchPromise = this.doFetch(location, radius, industryCode).then(result => {
            performance.mark('api:end');
            performance.measure('api:fetch_time', 'api:start', 'api:end');
            const [m] = performance.getEntriesByName('api:fetch_time').slice(-1);
            console.log(`[Perf] api:fetch_time(r=${radius}m) = ${m?.duration.toFixed(0)}ms`);
            return result;
        });
        this.cache.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    private async doFetch(location: LocationPayload, radius: number, industryCode: string): Promise<PublicDataResult> {

        // 1. Fetch fallback data to fill gaps unconditionally
        let fallbackData: PublicDataResult;
        try {
            fallbackData = await this.fallbackProvider.fetchByRadius(location, radius, industryCode);
        } catch (e) {
            throw new Error("Critical Failure: Mock provider failed.");
        }

        // 2. Prepare base result struct
        const result: PublicDataResult = {
            ...fallbackData,
            _sources: {
                competitorsCount: DataSource.INDUSTRY_DEFAULT,
                poiTotalCount: DataSource.INDUSTRY_DEFAULT,
                households: DataSource.INDUSTRY_DEFAULT,
                population: DataSource.INDUSTRY_DEFAULT,
                diversityIndex: DataSource.INDUSTRY_DEFAULT,
                ageShare20_39: DataSource.INDUSTRY_DEFAULT,
                volatilityProxy: DataSource.INDUSTRY_DEFAULT,
                districtPoiCount: DataSource.INDUSTRY_DEFAULT
            }
        };

        // 3. Parallel fetch specific endpoints
        const [compResult, distResult] = await Promise.allSettled([
            this.fetchCompetitorEndpoint(location, radius, industryCode, 2000),
            this.fetchDistrictMetadataEndpoint(location, 2000)
        ]);

        // 4. Merge partial responses
        if (compResult.status === 'fulfilled' && compResult.value.poiTotalCount > 0) {
            // Repurposed: matchCount/totalCount without industry filter represents total district POIs
            result.poiTotalCount = compResult.value.poiTotalCount;
            result._sources!.poiTotalCount = DataSource.PUBLIC_DATA;
        } else {
            if (compResult.status === 'fulfilled') {
                console.warn("Competitor endpoint returned 0, skipping public_data tag.");
            } else {
                console.warn("Competitor endpoint failed, falling back.", compResult.reason);
            }
        }

        if (distResult.status === 'fulfilled' && distResult.value.districtPoiCount > 0) {
            result.cityName = distResult.value.cityName;
            result.districtName = distResult.value.districtName;
            result.districtPoiCount = distResult.value.districtPoiCount;
            result._sources!.districtPoiCount = DataSource.PUBLIC_DATA;
        } else {
            console.warn("District Metadata endpoint returned 0 or failed, falling back.", distResult.status === 'fulfilled' ? 'Value is zero' : distResult.reason);
        }

        return result;
    }

    private async fetchCompetitorEndpoint(location: LocationPayload, radius: number, industryCode: string, timeoutMs: number): Promise<{ competitorsCount: number, poiTotalCount: number }> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // Use ODCloud standard variables
            const baseUrl = import.meta.env.VITE_ODCLOUD_BASE_URL || "https://api.odcloud.kr/api";
            const apiKey = import.meta.env.VITE_ODCLOUD_API_KEY;

            // Trigger graceful fallback if API key is missing or empty
            const encodedKey = encodeURIComponent(apiKey);
            // Target ODCloud Endpoint: 소상공인시장진흥공단_상가(상권)정보
            // Removed cond[indsLclsCd::EQ] to use as a supplemental "Total POIs in district" indicator
            const apiUrl = `${baseUrl}/15012005/v1/uddi:a38be9dc-51a8-422c-a2b1-6b04313f8087?page=1&perPage=1&serviceKey=${encodedKey}`;

            const response = await fetch(apiUrl, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Competitor API responded with status ${response.status}`);
            }

            const data = await response.json();
            console.log('[API JSON] Competitor/Store:', data);

            // Map the official ODCloud response schema
            // Expected struct: { currentCount: 1, data: [...], matchCount: 85, page: 1, perPage: 1, totalCount: 85 }
            const matchCount = data?.matchCount;
            const totalCount = data?.totalCount;
            const itemsList = data?.data;

            return {
                competitorsCount: 0, // No longer used for industry-specific count via this API
                poiTotalCount: matchCount ?? totalCount ?? (Array.isArray(itemsList) ? itemsList.length : 0)
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            throw error; // Let Promise.allSettled catch it and trigger fallback
        }
    }

    /** 
     * fetchDistrictMetadataEndpoint
     * Consolidated endpoint for regional metadata (City, District, total POIs).
     * Uses ODCloud 15083033.
     */
    private async fetchDistrictMetadataEndpoint(location: LocationPayload, timeoutMs: number): Promise<{ cityName: string, districtName: string, districtPoiCount: number }> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const baseUrl = import.meta.env.VITE_ODCLOUD_BASE_URL || "https://api.odcloud.kr/api";
            const apiKey = import.meta.env.VITE_ODCLOUD_API_KEY;

            const encodedKey = encodeURIComponent(apiKey);
            const apiUrl = `${baseUrl}/15083033/v1/uddi:c7049f5a-d95e-4143-be96-b4d3c16130ee?page=1&perPage=1&serviceKey=${encodedKey}`;
            const response = await fetch(apiUrl, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const text = await response.text();
            console.log('[API RAW] District Metadata:', text);

            if (!response.ok) {
                throw new Error(`District Metadata API responded with status ${response.status}`);
            }

            const data = JSON.parse(text);

            // Expected struct: { data: [ { "시도": "서울", "읍면동": "...", "업소수": "100" } ], ... }
            const targetRow = data?.data?.[0];

            return {
                cityName: targetRow?.['시도'] || '',
                districtName: targetRow?.['읍면동'] || '',
                districtPoiCount: targetRow?.['업소수'] ? Number(targetRow['업소수']) : 0
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
                volatilityProxy: "industry_default"
            } as any
        };

        const mult = radius / 500;
        const gen = (c: number, p: number, h: number, pop: number, age: number, act: number) => ({
            ...base,
            competitorsCount: Math.round(c * mult),
            poiTotalCount: Math.round(p * mult),
            households: Math.round(h * mult),
            population: Math.round(pop * mult),
            ageShare20_39: age,
            volatilityProxy: act
        });

        switch (qaId) {
            case 'QA01': return gen(45, 1200, 1500, 3000, 0.65, 0.4); // 강남 오피스 카페 (경쟁 극도, 청년층 다수)
            case 'QA02': return gen(5, 80, 5000, 15000, 0.25, 0.1); // 신도시 주거지 (가족 위주, 경쟁 낮음)
            case 'QA03': return gen(30, 400, 3000, 10000, 0.80, 0.5); // 홍대 대학가 (청년층 압도적, 변동성 높음)
            case 'QA04': return gen(20, 200, 4000, 12000, 0.40, 0.2); // 구도심 역세권 (안정적, 유동인구 많음)
            case 'QA05': return gen(8, 50, 8000, 25000, 0.20, 0.15); // 지방 대단지 아파트 (세대수 극대화)
            case 'QA06': return gen(2, 30, 1000, 2500, 0.15, 0.05); // 외곽 국도변 (차량 유입 위주, 배후세대 적음)
            case 'QA07': return gen(15, 600, 2000, 6000, 0.45, 0.35); // 여의도 금융가 (직장인 위주)
            case 'QA08': return gen(12, 100, 6000, 18000, 0.35, 0.2); // 전통시장 인근 (가족 단위, 밀집 높음)
            case 'QA09': return gen(50, 800, 2500, 8000, 0.50, 0.45); // 성수동 팝업거리 (경쟁 포화, 변동성 매우 높음)
            case 'QA10': return gen(0, 10, 15000, 45000, 0.40, 0.1); // 신규 택지지구 (독점 가능성, 인구 유입 중)
            default: return gen(10, 150, 2000, 5000, 0.3, 0.2);
        }
    }
}
