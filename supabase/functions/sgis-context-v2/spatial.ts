type Point = [number, number];
type Geometry = { type: string; coordinates: any };
export type CensusFeature = { geometry: Geometry; properties: { adm_cd?: string; [key: string]: unknown } };
export type CensusRow = { adm_cd?: string; tot_ppltn?: unknown; tot_family?: unknown };

const numeric = (value: unknown): number | null => {
  if (value == null || !/^\d+(\.\d+)?$/.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const cross = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function ringArea(ring: Point[]): number {
  // Translate to the first vertex before summing to avoid cancellation in UTM-K.
  if (ring.length < 3) return 0;
  const origin = ring[0];
  return Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]);
  }, 0)) / 2;
}

function clipRing(ring: Point[], clip: Point[]): Point[] {
  let result = ring;
  for (let i = 0; i < clip.length && result.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = result;
    result = [];
    let previous = input[input.length - 1], dp = cross(a, b, previous);
    for (const current of input) {
      const dc = cross(a, b, current);
      if ((dc >= 0) !== (dp >= 0)) {
        const t = dp / (dp - dc);
        result.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
      }
      if (dc >= 0) result.push(current);
      previous = current; dp = dc;
    }
  }
  return result;
}

export function geometryAreas(geometry: Geometry, circle: Point[]) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons)) throw new Error('지원하지 않는 집계구 경계');
  let total = 0, overlap = 0;
  for (const rings of polygons) {
    if (!Array.isArray(rings) || !rings.length) throw new Error('빈 집계구 경계');
    rings.forEach((ring: Point[], i: number) => {
      if (!Array.isArray(ring) || ring.length < 4 || ring.some(p => !Array.isArray(p) || !p.every(Number.isFinite))) throw new Error('잘못된 집계구 좌표');
      const sign = i === 0 ? 1 : -1;
      total += sign * ringArea(ring);
      overlap += sign * ringArea(clipRing(ring, circle));
    });
  }
  if (total <= 0 || overlap < -0.01) throw new Error('잘못된 집계구 면적');
  return { total, overlap: Math.max(0, Math.min(total, overlap)) };
}

export function estimateRadiusPopulation(features: CensusFeature[], rows: CensusRow[], x: number, y: number, radius: number) {
  const circle: Point[] = Array.from({ length: 144 }, (_, i) => [x + radius * Math.cos(i * Math.PI / 72), y + radius * Math.sin(i * Math.PI / 72)]);
  const stats = new Map(rows.map(row => [String(row.adm_cd), row]));
  const seen = new Set<string>();
  let cells = 0, knownCells = 0, knownHouseholdCells = 0, coveredArea = 0, knownArea = 0;
  let weightedPopulation = 0, weightedHouseholds = 0, minimumPopulation = 0, maximumPopulation = 0;
  for (const feature of features) {
    const code = String(feature.properties?.adm_cd || '');
    if (!/^\d{13,14}$/.test(code)) throw new Error('집계구 코드가 아닌 경계');
    if (seen.has(code)) continue;
    seen.add(code);
    const area = geometryAreas(feature.geometry, circle);
    if (area.overlap <= 0.01) continue;
    cells++; coveredArea += area.overlap;
    const weight = area.overlap / area.total;
    const population = numeric(stats.get(code)?.tot_ppltn), households = numeric(stats.get(code)?.tot_family);
    if (population !== null) {
      knownCells++; knownArea += area.overlap; weightedPopulation += population * weight; maximumPopulation += population;
      if (weight >= 1 - 1e-8) minimumPopulation += population;
    }
    if (households !== null) { knownHouseholdCells++; weightedHouseholds += households * weight; }
  }
  const boundaryCoverage = coveredArea / ringArea(circle);
  const complete = cells > 0 && cells === knownCells && boundaryCoverage >= 0.99 && boundaryCoverage <= 1.01;
  return {
    status: complete ? 'estimated' : cells > 0 ? 'partial' : 'unavailable',
    population: complete ? Math.round(weightedPopulation) : null,
    households: complete && cells === knownHouseholdCells ? Math.round(weightedHouseholds) : null,
    knownPopulationEstimate: knownCells ? Math.round(weightedPopulation) : null,
    knownHouseholdEstimate: knownHouseholdCells ? Math.round(weightedHouseholds) : null,
    spatialBounds: complete ? { minimum: minimumPopulation, maximum: maximumPopulation } : null,
    cellCount: cells, knownPopulationCells: knownCells, knownHouseholdCells,
    boundaryCoverage: Math.min(1, boundaryCoverage), populationAreaCoverage: coveredArea ? knownArea / coveredArea : 0,
    method: 'census_area_weighted',
  };
}
