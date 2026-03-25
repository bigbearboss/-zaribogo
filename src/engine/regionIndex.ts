// regionIndex.ts
// Regional CSV resolver
// Priority:
// 1) resolve by explicit region name hint
// 2) fallback to bbox match
// 3) fallback to nearest bbox center

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

function normalizeText(value: string): string {
  return (value || "").replace(/\s+/g, "").trim();
}

function getBoxArea(entry: RegionEntry): number {
  return (entry.latMax - entry.latMin) * (entry.lngMax - entry.lngMin);
}

function getCenterDistance(lat: number, lng: number, entry: RegionEntry): number {
  const centerLat = (entry.latMin + entry.latMax) / 2;
  const centerLng = (entry.lngMin + entry.lngMax) / 2;

  return Math.sqrt(
    Math.pow(lat - centerLat, 2) +
    Math.pow(lng - centerLng, 2)
  );
}

/**
 * Loads the regional manifest (index) from the public/R2 directory.
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
 * Resolve by region name hint first.
 * Examples:
 * - "롯데리아 파주운정해오름점"
 * - "경기 파주시 ..."
 * - "파주운정"
 */
export async function resolveRegionEntryByName(regionNameHint: string): Promise<RegionEntry | null> {
  const entries = await getManifest();
  if (!entries.length || !regionNameHint) return null;

  const hint = normalizeText(regionNameHint);

  // stronger tokens first
  const candidates = entries.filter((entry) => {
    const fullName = normalizeText(entry.name); // ex 경기파주시
    const trimmedName = fullName
      .replace(/^서울/, "")
      .replace(/^경기/, "")
      .replace(/^인천/, "")
      .replace(/^부산/, "")
      .replace(/^대구/, "")
      .replace(/^대전/, "")
      .replace(/^광주/, "")
      .replace(/^울산/, "")
      .replace(/^세종/, "");

    return (
      hint.includes(fullName) ||
      hint.includes(trimmedName) ||
      fullName.includes(hint) ||
      trimmedName.includes(hint)
    );
  });

  if (!candidates.length) {
    console.warn("[regionIndex] No region name match for hint:", regionNameHint);
    return null;
  }

  // if multiple matches, prefer smaller bbox
  const sorted = [...candidates].sort((a, b) => getBoxArea(a) - getBoxArea(b));
  const best = sorted[0];
  const baseUrl = import.meta.env.VITE_CSV_BASE_URL || "";

  const resolved = {
    ...best,
    csvUrl: joinBaseUrl(baseUrl, best.csvUrl),
  };

  console.log("[regionIndex] Region selected by name hint", {
    regionNameHint,
    selected: resolved.name,
    csvUrl: resolved.csvUrl,
    candidateCount: candidates.length,
  });

  return resolved;
}

/**
 * Resolve by coordinate.
 * Priority:
 * 1) bbox matches → nearest center among matched
 * 2) no bbox matches → nearest center among all
 */
export async function resolveRegionEntry(lat: number, lng: number): Promise<RegionEntry | null> {
  const entries = await getManifest();
  if (!entries.length) return null;

  const matched = entries.filter((entry) => {
    return (
      lat >= entry.latMin &&
      lat <= entry.latMax &&
      lng >= entry.lngMin &&
      lng <= entry.lngMax
    );
  });

  if (matched.length > 0) {
    let best = matched[0];
    let minDist = Infinity;

    for (const entry of matched) {
      const dist = getCenterDistance(lat, lng, entry);
      if (dist < minDist) {
        minDist = dist;
        best = entry;
      }
    }

    const baseUrl = import.meta.env.VITE_CSV_BASE_URL || "";
    const resolved = {
      ...best,
      csvUrl: joinBaseUrl(baseUrl, best.csvUrl),
    };

    console.log("[regionIndex] Coordinate region selected (matched bbox)", {
      lat,
      lng,
      matchCount: matched.length,
      selected: resolved.name,
      csvUrl: resolved.csvUrl,
      minDist,
    });

    return resolved;
  }

  let bestEntry: RegionEntry | null = null;
  let minDist = Infinity;

  for (const entry of entries) {
    const dist = getCenterDistance(lat, lng, entry);
    if (dist < minDist) {
      minDist = dist;
      bestEntry = entry;
    }
  }

  if (!bestEntry) {
    console.warn(
      `[regionIndex] No region candidate for (${lat.toFixed(6)}, ${lng.toFixed(6)}).`
    );
    return null;
  }

  const baseUrl = import.meta.env.VITE_CSV_BASE_URL || "";
  const resolved = {
    ...bestEntry,
    csvUrl: joinBaseUrl(baseUrl, bestEntry.csvUrl),
  };

  console.log("[regionIndex] Coordinate region selected (nearest fallback)", {
    lat,
    lng,
    selected: resolved.name,
    csvUrl: resolved.csvUrl,
    minDist,
  });

  return resolved;
}

/**
 * Legacy support for callers that only need URL.
 */
export async function resolveRegionUrl(lat: number, lng: number): Promise<string | null> {
  const entry = await resolveRegionEntry(lat, lng);
  return entry ? entry.csvUrl : null;
}
