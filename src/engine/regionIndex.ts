// regionIndex.ts — Bounding box lookup for per-gu CSV loading
// Bounding boxes extracted from actual processed CSV data.
// resolveRegionUrl() returns the smallest available CSV URL for a given coordinate.

export interface RegionEntry {
    id: string;
    csvUrl: string;
    name: string;
    fileSize: number;
    latMin: number;
    latMax: number;
    lngMin: number;
    lngMax: number;
}

let regionManifest: RegionEntry[] | null = null;
let manifestPromise: Promise<RegionEntry[]> | null = null;

/**
 * Loads the regional manifest (index) from the public directory.
 */
export async function getManifest(): Promise<RegionEntry[]> {
    if (regionManifest) return regionManifest;
    if (manifestPromise) return manifestPromise;

    const baseUrl = import.meta.env.VITE_CSV_BASE_URL || '';
    manifestPromise = fetch(`${baseUrl}/processed/regionManifest.json`)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to load region manifest: ${res.status}`);
            return res.json();
        })
        .then(data => {
            regionManifest = data.regions;
            return regionManifest!;
        })
        .catch(err => {
            console.error('[regionIndex] Error loading manifest:', err);
            manifestPromise = null;
            return [];
        });

    return manifestPromise;
}

/**
 * Returns the best-match regional CSV entry for a given lat/lng coordinate.
 * If no region matches, returns null (triggering API-only fallback).
 */
export async function resolveRegionEntry(lat: number, lng: number): Promise<RegionEntry | null> {
    const entries = await getManifest();

    for (const entry of entries) {
        if (lat >= entry.latMin && lat <= entry.latMax &&
            lng >= entry.lngMin && lng <= entry.lngMax) {
            const baseUrl = import.meta.env.VITE_CSV_BASE_URL || '';
            return {
                ...entry,
                csvUrl: `${baseUrl}${entry.csvUrl}`
            };
        }
    }

    console.warn(`[regionIndex] No region match for (${lat.toFixed(4)}, ${lng.toFixed(4)}). Falling back to API-only mode.`);
    return null;
}

/** 
 * Legacy support for main thread calls to only get the URL.
 * Note: Now async because manifest is fetched externally.
 */
export async function resolveRegionUrl(lat: number, lng: number): Promise<string | null> {
    const entry = await resolveRegionEntry(lat, lng);
    return entry ? entry.csvUrl : null;
}
