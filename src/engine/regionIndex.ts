// regionIndex.ts — Bounding box lookup for per-region CSV loading
// Picks the smallest matching bounding box for a given coordinate.

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

type RawRegionEntry = Partial<RegionEntry> & {
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
};

let regionManifest: RegionEntry[] | null = null;
let manifestPromise: Promise<RegionEntry[]> | null = null;

function joinBaseUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizeEntry(raw: RawRegionEntry): RegionEntry | null {
  const latMin = Number(raw.latMin ?? raw.minLat);
  const latMax = Number(raw.latMax ?? raw.maxLat);
  const lngMin = Number(raw.lngMin ?? raw.minLng);
  const lngMax = Number(raw.lngMax ?? raw.maxLng);

  if (
    !raw.id ||
    !raw.csvUrl ||
    !raw.name ||
    Number.isNaN(latMin) ||
    Number.isNaN(latMax) ||
    Number.isNaN(lngMin) ||
    Number.isNaN(lngMax)
  ) {
    console.warn("[regionIndex] Invalid manifest row skipped:", raw);
    return null;
  }

  return {
    id: String(raw.id),
    csvUrl: String(raw.csvUrl),
    name: String(raw.name),
    fileSize: Number(raw.fileSize ?? 0),
    latMin,
    latMax,
    lngMin,
    lngMax,
  };
}

function getBoxArea(entry: RegionEntry): number {
  return (entry.latMax - entry.latMin) * (entry.lngMax - entry.lngMin);
}

/**
 * Loads the regional manifest (index) from the public directory.
 */
export async function getManifest(): Promise<RegionEntry[]> {
  if (regionManifest) return regionManifest;
  if (manifestPromise) return manifestPromise;

  const baseUrl = import.meta.env.VITE_CSV_BASE_URL || "";

  manifestPromise = fetch(joinBaseUrl(baseUrl, "/processed/regionManifest.json"))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load region manifest: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const rawRegions: RawRegionEntry[] = Array.isArray(data?.regions) ? data.regions : [];
      const normalized = rawRegions
        .map(normalizeEntry)
        .filter((entry): entry is RegionEntry => entry !== null);

      regionManifest = normalized;

      console.log("[regionIndex] Manifest loaded", {
        count: regionManifest.length,
        sample: regionManifest.slice(0, 3).map((r) => ({
          name: r.name,
          csvUrl: r.csvUrl,
          latMin: r.latMin,
          latMax: r.latMax,
          lngMin: r.lngMin,
          lngMax: r.lngMax,
        })),
      });

      return regionManifest;
    })
    .catch((err) => {
      console.error("[regionIndex] Error loading manifest:", err);
      manifestPromise = null;
      return [];
    });

  return manifestPromise;
}

/**
 * Returns the best-match regional CSV entry for a given lat/lng coordinate.
 * If multiple regions match, chooses the smallest bounding box.
 * If no region matches, returns null.
 */
export async function resolveRegionEntry(lat: number, lng: number): Promise<RegionEntry | null> {
  const entries = await getManifest();

  const matched = entries.filter((entry) => {
    return (
      lat >= entry.latMin &&
      lat <= entry.latMax &&
      lng >= entry.lngMin &&
      lng <= entry.lngMax
    );
  });

  if (matched.length === 0) {
    console.warn(
      `[regionIndex] No region match for (${lat.toFixed(6)}, ${lng.toFixed(6)}). Falling back to API-only mode.`
    );
    return null;
  }

  const sorted = [...matched].sort((a, b) => getBoxArea(a) - getBoxArea(b));
  const best = sorted[0];

  const baseUrl = import.meta.env.VITE_CSV_BASE_URL || "";
  const resolved = {
    ...best,
    csvUrl: joinBaseUrl(baseUrl, best.csvUrl),
  };

  console.log("[regionIndex] Match candidates", {
    lat,
    lng,
    matchCount: matched.length,
    candidates: sorted.slice(0, 5).map((entry) => ({
      name: entry.name,
      csvUrl: entry.csvUrl,
      area: getBoxArea(entry),
      latMin: entry.latMin,
      latMax: entry.latMax,
      lngMin: entry.lngMin,
      lngMax: entry.lngMax,
    })),
    selected: {
      name: resolved.name,
      csvUrl: resolved.csvUrl,
      area: getBoxArea(best),
    },
  });

  return resolved;
}

/**
 * Legacy support for main thread calls to only get the URL.
 */
export async function resolveRegionUrl(lat: number, lng: number): Promise<string | null> {
  const entry = await resolveRegionEntry(lat, lng);
  return entry ? entry.csvUrl : null;
}
