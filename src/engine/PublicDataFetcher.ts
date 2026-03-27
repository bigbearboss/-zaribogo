import type { PublicDataResult } from "./types";

export interface LocationPayload {
    lat: number;
    lng: number;
    address?: string;
    placeName?: string;
    source?: "map_click" | "keyword_search" | "address_search" | "history" | "default" | "url_params";
    sidoName?: string;
    sigunguName?: string;
    dongName?: string;
    admCd?: string;
    qaScenario?: string; // e.g. "QA01", "QA02"...
}

export interface PublicDataProvider {
    fetchByRadius(location: LocationPayload, radius: number, industryCode: string): Promise<PublicDataResult>;
}

export class MockPublicDataProvider implements PublicDataProvider {
    private cache: Map<string, PublicDataResult> = new Map();

    async fetchByRadius(location: LocationPayload, radius: number, industryCode: string): Promise<PublicDataResult> {
        const geohash = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
        const cacheKey = `${geohash}:${radius}:${industryCode}:mock`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        // Simulate API latency
        await new Promise(resolve => setTimeout(resolve, 300));

        const multiplier = radius / 500;
        const result: PublicDataResult = {
            radiusM: radius,
            competitorsCount: Math.round(5 * multiplier * (1 + Math.random() * 0.5)),
            poiTotalCount: Math.round(150 * multiplier),
            diversityIndex: 0.4 + Math.random() * 0.3,
            households: Math.round(2000 * multiplier),
            population: Math.round(5000 * multiplier),
            ageShare20_39: 0.25 + Math.random() * 0.1,
            volatilityProxy: 0.1 + Math.random() * 0.2
        };

        this.cache.set(cacheKey, result);
        return result;
    }
}

export class PublicDataFetcher {
    private provider: PublicDataProvider;

    constructor(provider?: PublicDataProvider) {
        this.provider = provider || new MockPublicDataProvider();
    }

    async fetchByRadius(location: LocationPayload, radius: number, industryCode: string): Promise<PublicDataResult> {
        return this.provider.fetchByRadius(location, radius, industryCode);
    }
}
