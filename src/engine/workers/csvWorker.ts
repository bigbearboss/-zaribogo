import Papa from 'papaparse';
import { INDUSTRY_KEYWORDS } from '../data/industry-keywords';

interface PoiRecord {
  lat: number;
  lng: number;
  code: string;       // sub-category code or fallback major code
  majorCode: string;  // major category code like I2, G2, S2
  name: string;       // sub-category name or fallback major category name
}

let dataset: PoiRecord[] = [];
let isLoaded = false;

// ── Industry code index ────────────────────────────────────────
// Maps CSV code (major + sub) → PoiRecord[]
const industryIndex: Map<string, PoiRecord[]> = new Map();
let indexReady = false;

/**
 * Internal service code → CSV 대분류코드
 * This is only for narrowing search scope, not final competitor exact-match.
 */
const INTERNAL_TO_CSV_CODE: Record<string, string> = {
  // FNB / 음식 → I2
  cafe: 'I2', bakery: 'I2', dessert: 'I2',
  restaurant: 'I2', bar: 'I2', pub: 'I2',
  chicken: 'I2', pizza: 'I2', burger: 'I2',
  snack: 'I2', noodle: 'I2', bbq: 'I2',
  korean: 'I2', japanese: 'I2', chinese: 'I2',
  western: 'I2', buffet: 'I2', brunch: 'I2',
  delivery: 'I2', fast_food: 'I2', qsr: 'I2',

  // RETAIL / 소매 → G2
  convenience: 'G2', supermarket: 'G2', clothing: 'G2',
  fashion: 'G2', accessories: 'G2', electronics: 'G2',
  cosmetics: 'G2', pharmacy: 'G2', bookstore: 'G2',
  flower: 'G2', gift: 'G2', toy: 'G2',
  sport: 'G2', outdoor: 'G2', apparel: 'G2',
  fruit: 'G2', veg: 'G2', butcher: 'G2', stationery: 'G2',
  pet: 'G2',

  // HEALTHCARE / 보건의료 → Q1
  clinic: 'Q1', dental: 'Q1', hospital: 'Q1',
  medical: 'Q1', beauty: 'Q1', skin: 'Q1',
  spa: 'Q1', healthcare: 'Q1', doctor: 'Q1',

  // BEAUTY / 수리·개인 → S2
  hair: 'S2', nail: 'S2', massage: 'S2',
  laundry: 'S2', repair: 'S2', salon: 'S2',
  studio: 'S2', beauty_service: 'S2',

  // EDUCATION / 교육 → P1
  edu: 'P1', academy: 'P1', tutoring: 'P1',
  language: 'P1', art_class: 'P1', music_class: 'P1',
  school: 'P1', library: 'P1',

  // FITNESS / 예술·스포츠 → R1
  gym: 'R1', pilates: 'R1', yoga: 'R1',
  fitness: 'R1', sport_club: 'R1', swimming: 'R1',
  golf: 'R1', tennis: 'R1',
};

function resolveIndexCode(industryCode: string): string | null {
  if (!industryCode) return null;

  // direct if already csv code
  if (industryIndex.has(industryCode)) return industryCode;

  for (const [prefix, csvCode] of Object.entries(INTERNAL_TO_CSV_CODE)) {
    if (industryCode.startsWith(prefix)) return csvCode;
  }

  return null;
}

function matchesIndustryName(rowName: string, industryCode: string): boolean {
  const keywords = INDUSTRY_KEYWORDS[industryCode] ?? [];
  if (!rowName || keywords.length === 0) return false;

  return keywords.some((keyword) => rowName.includes(keyword));
}

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) *
    Math.sin(dl / 2) * Math.sin(dl / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildIndustryIndex() {
  performance.mark('csv:index:build:start');
  industryIndex.clear();
  const uniqueSectors: Map<string, string> = new Map();

  for (const row of dataset) {
    if (!row.code) continue;

    // 1) sub-category code index
    const subCode = row.code;
    if (!industryIndex.has(subCode)) {
      industryIndex.set(subCode, []);
    }
    industryIndex.get(subCode)!.push(row);

    // 2) major category code index
    const majorCode = row.majorCode || subCode.substring(0, 2);
    if (majorCode && majorCode !== subCode) {
      if (!industryIndex.has(majorCode)) {
        industryIndex.set(majorCode, []);
      }
      industryIndex.get(majorCode)!.push(row);
    }

    if (row.name && !uniqueSectors.has(subCode) && subCode.length > 2) {
      uniqueSectors.set(subCode, row.name);
    }
  }

  indexReady = true;

  performance.mark('csv:index:build:end');
  performance.measure('csv:index_build_time', 'csv:index:build:start', 'csv:index:build:end');
  const [m] = performance.getEntriesByName('csv:index_build_time').slice(-1);
  const entries = industryIndex.size;

  console.log(
    `[CSV Worker] Index built: ${entries} code entries (Major + Sub) | Time: ${m?.duration.toFixed(1)}ms`
  );

  return Array.from(uniqueSectors.entries()).map(([code, name]) => ({ code, name }));
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'LOAD_CSV') {
    const { url } = payload;

    dataset = [];
    industryIndex.clear();
    isLoaded = false;
    indexReady = false;

    console.log(`[CSV Worker] Starting background load for ${url}`);
    performance.mark('csv:load:start');

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        const chunkData = (results.data as any[])
          .map((row: any) => {
            const subCode = row['상권업종소분류코드'] || '';
            const majorCode =
              row['상권업종대분류코드'] || (subCode ? subCode.substring(0, 2) : '');

            return {
              lat: parseFloat(row['위도']),
              lng: parseFloat(row['경도']),
              code: subCode || majorCode || '',
              majorCode,
              name: row['상권업종소분류명'] || row['상권업종대분류명'] || '',
            };
          })
          .filter((r: any) => !isNaN(r.lat) && !isNaN(r.lng));

        dataset.push(...chunkData);
        self.postMessage({ type: 'PROGRESS', payload: { count: dataset.length } });
      },
      complete: () => {
        isLoaded = true;

        performance.mark('csv:load:end');
        performance.measure('csv:load_time', 'csv:load:start', 'csv:load:end');
        const [loadMeasure] = performance.getEntriesByName('csv:load_time').slice(-1);
        const loadMs = loadMeasure?.duration ?? 0;

        const sectors = buildIndustryIndex();
        const [indexMeasure] = performance.getEntriesByName('csv:index_build_time').slice(-1);
        const indexMs = indexMeasure?.duration ?? 0;

        console.log(
          `[Perf] CSV Worker: Total ${loadMs.toFixed(0)}ms (Load+Parse) | Indexing ${indexMs.toFixed(0)}ms | Rows: ${dataset.length.toLocaleString()}`
        );

        self.postMessage({
          type: 'LOAD_COMPLETE',
          payload: {
            count: dataset.length,
            loadTimeMs: loadMs,
            indexTimeMs: indexMs,
            indexedCodes: industryIndex.size,
            sectors,
          },
        });
      },
      error: (err) => {
        console.error('[CSV Worker] Parse error:', err);
        self.postMessage({ type: 'ERROR', payload: err.message });
      },
    });
  } else if (type === 'QUERY_RADIUS') {
    if (!isLoaded) {
      self.postMessage({ type: 'ERROR', payload: 'Dataset not loaded yet.' });
      return;
    }

    const { id, lat, lng, radiusM, industryCode } = payload;
    performance.mark(`csv:query:start:${id}`);

    const csvCode = indexReady ? resolveIndexCode(industryCode) : null;
    const hitIndex = csvCode ? industryIndex.get(csvCode) : null;
    const searchTarget: PoiRecord[] = hitIndex ?? dataset;

    if (!hitIndex) {
      console.warn(
        `[CSV Worker] Index miss for code="${industryCode}" (resolved: "${csvCode ?? 'null'}"). Falling back to full scan (${dataset.length} records).`
      );
    }

    let competitorsCount = 0;
    let poiTotalCount = 0;
    const codeCounts: Record<string, number> = {};

    const latDegreeDist = 111000;
    const lngDegreeDist = 111000 * Math.cos(lat * Math.PI / 180);
    const latRadiusDeg = radiusM / latDegreeDist;
    const lngRadiusDeg = radiusM / lngDegreeDist;

    for (let i = 0; i < searchTarget.length; i++) {
      const row = searchTarget[i];

      if (Math.abs(row.lat - lat) > latRadiusDeg) continue;
      if (Math.abs(row.lng - lng) > lngRadiusDeg) continue;

      const dist = getDistance(lat, lng, row.lat, row.lng);
      if (dist <= radiusM) {
        // 반경 내 전체 POI 수
        poiTotalCount++;

        // 다양성 지표용 카운트
        codeCounts[row.code] = (codeCounts[row.code] || 0) + 1;

        // 경쟁 업종 수는 내부 코드 ↔ CSV 이름 키워드 매칭으로 판단
        if (matchesIndustryName(row.name, industryCode)) {
          competitorsCount++;
        }
      }
    }

    let simpsonSum = 0;
    if (poiTotalCount > 1) {
      for (const count of Object.values(codeCounts)) {
        simpsonSum += count * (count - 1);
      }
      simpsonSum = 1 - (simpsonSum / (poiTotalCount * (poiTotalCount - 1)));
    }

    performance.mark(`csv:query:end:${id}`);
    performance.measure('csv:query_time', `csv:query:start:${id}`, `csv:query:end:${id}`);
    const [qMeasure] = performance.getEntriesByName('csv:query_time').slice(-1);
    const queryMs = qMeasure?.duration ?? 0;

    console.log('[Industry Mapping Debug]', {
      industryCode,
      resolvedCsvCode: csvCode,
      keywords: INDUSTRY_KEYWORDS[industryCode] ?? [],
      via: searchTarget === dataset ? 'fullscan' : 'index',
      subsetCount: searchTarget.length,
      competitorsCount,
      poiTotalCount,
    });

    console.log(
      `[Perf] csv:query_time(r=${radiusM}m, code=${industryCode}, via=${searchTarget === dataset ? 'fullscan' : 'index'}, subset=${searchTarget.length.toLocaleString()}) = ${queryMs.toFixed(1)}ms` +
      ` → ${competitorsCount} comps / ${poiTotalCount} POIs`
    );

    self.postMessage({
      type: 'QUERY_RESULT',
      payload: {
        id,
        competitorsCount,
        poiTotalCount,
        diversityIndex: Math.max(0, simpsonSum),
        queryTimeMs: queryMs,
      },
    });
  }
};
