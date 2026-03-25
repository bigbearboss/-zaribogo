import Papa from 'papaparse';
import { INDUSTRY_RULES } from '../data/industryMatcher';

interface PoiRecord {
  lat: number;
  lng: number;
  shopName: string;

  majorCode: string;
  majorName: string;

  middleCode: string;
  middleName: string;

  subCode: string;
  subName: string;
}

let dataset: PoiRecord[] = [];
let isLoaded = false;

// 인덱스는 대분류/중분류/소분류 모두 잡아둔다
const industryIndex: Map<string, PoiRecord[]> = new Map();
let indexReady = false;

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

function pushToIndex(key: string, row: PoiRecord) {
  if (!key) return;
  if (!industryIndex.has(key)) {
    industryIndex.set(key, []);
  }
  industryIndex.get(key)!.push(row);
}

function buildIndustryIndex() {
  performance.mark('csv:index:build:start');
  industryIndex.clear();

  const uniqueSectors: Map<string, string> = new Map();

  for (const row of dataset) {
    pushToIndex(row.majorCode, row);
    pushToIndex(row.middleCode, row);
    pushToIndex(row.subCode, row);

    if (row.subCode && row.subName && !uniqueSectors.has(row.subCode)) {
      uniqueSectors.set(row.subCode, row.subName);
    }
  }

  indexReady = true;

  performance.mark('csv:index:build:end');
  performance.measure('csv:index_build_time', 'csv:index:build:start', 'csv:index:build:end');
  const [m] = performance.getEntriesByName('csv:index_build_time').slice(-1);
  console.log(
    `[CSV Worker] Index built: ${industryIndex.size} code entries (Major + Middle + Sub) | Time: ${m?.duration.toFixed(1)}ms`
  );

  return Array.from(uniqueSectors.entries()).map(([code, name]) => ({ code, name }));
}

function normalizeText(text: string): string {
  return (text || '').replace(/\s+/g, '').trim();
}

function matchesIndustry(row: PoiRecord, industryCode: string): boolean {
  const rule = INDUSTRY_RULES[industryCode];
  if (!rule) return false;

  // 1순위: 소분류코드 exact
  if (rule.subCodes?.includes(row.subCode)) return true;

  // 2순위: 중분류코드
  if (rule.middleCodes?.includes(row.middleCode)) return true;

  // 3순위: 대분류코드
  if (rule.majorCodes?.includes(row.majorCode)) {
    // 대분류만 같으면 너무 넓으니 키워드 있으면 같이 확인
    if (rule.keywords && rule.keywords.length > 0) {
      const haystack = normalizeText(
        `${row.shopName} ${row.majorName} ${row.middleName} ${row.subName}`
      );
      return rule.keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
    }
    return true;
  }

  // 4순위: 키워드 fallback
  if (rule.keywords && rule.keywords.length > 0) {
    const haystack = normalizeText(
      `${row.shopName} ${row.majorName} ${row.middleName} ${row.subName}`
    );
    return rule.keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
  }

  return false;
}

function getCandidateSet(industryCode: string): PoiRecord[] {
  const rule = INDUSTRY_RULES[industryCode];
  if (!rule || !indexReady) return dataset;

  // 가장 좁은 인덱스부터 사용
  for (const subCode of rule.subCodes ?? []) {
    const hit = industryIndex.get(subCode);
    if (hit) return hit;
  }

  for (const middleCode of rule.middleCodes ?? []) {
    const hit = industryIndex.get(middleCode);
    if (hit) return hit;
  }

  for (const majorCode of rule.majorCodes ?? []) {
    const hit = industryIndex.get(majorCode);
    if (hit) return hit;
  }

  return dataset;
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
          .map((row: any) => ({
            lat: parseFloat(row['위도']),
            lng: parseFloat(row['경도']),
            shopName: row['상호명'] || '',

            majorCode: row['상권업종대분류코드'] || '',
            majorName: row['상권업종대분류명'] || '',

            middleCode: row['상권업종중분류코드'] || '',
            middleName: row['상권업종중분류명'] || '',

            subCode: row['상권업종소분류코드'] || '',
            subName: row['상권업종소분류명'] || '',
          }))
          .filter((r: PoiRecord) => !isNaN(r.lat) && !isNaN(r.lng));

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
  }

  if (type === 'QUERY_RADIUS') {
    if (!isLoaded) {
      self.postMessage({ type: 'ERROR', payload: 'Dataset not loaded yet.' });
      return;
    }

    const { id, lat, lng, radiusM, industryCode } = payload;
    performance.mark(`csv:query:start:${id}`);

    const candidateSet = getCandidateSet(industryCode);

    const latDegreeDist = 111000;
    const lngDegreeDist = 111000 * Math.cos(lat * Math.PI / 180);
    const latRadiusDeg = radiusM / latDegreeDist;
    const lngRadiusDeg = radiusM / lngDegreeDist;

    let poiTotalCount = 0;
    let competitorsCount = 0;
    const codeCounts: Record<string, number> = {};

    // 1) 전체 POI 수는 전체 dataset 기준
    for (let i = 0; i < dataset.length; i++) {
      const row = dataset[i];

      if (Math.abs(row.lat - lat) > latRadiusDeg) continue;
      if (Math.abs(row.lng - lng) > lngRadiusDeg) continue;

      const dist = getDistance(lat, lng, row.lat, row.lng);
      if (dist <= radiusM) {
        poiTotalCount++;
        codeCounts[row.subCode || row.middleCode || row.majorCode] =
          (codeCounts[row.subCode || row.middleCode || row.majorCode] || 0) + 1;
      }
    }

    // 2) 경쟁점포 수는 후보군 기준
    for (let i = 0; i < candidateSet.length; i++) {
      const row = candidateSet[i];

      if (Math.abs(row.lat - lat) > latRadiusDeg) continue;
      if (Math.abs(row.lng - lng) > lngRadiusDeg) continue;

      const dist = getDistance(lat, lng, row.lat, row.lng);
      if (dist <= radiusM && matchesIndustry(row, industryCode)) {
        competitorsCount++;
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

    console.log('[Industry Matching Debug]', {
      industryCode,
      candidateSetSize: candidateSet.length,
      poiTotalCount,
      competitorsCount,
      rule: INDUSTRY_RULES[industryCode] ?? null,
    });

    console.log(
      `[Perf] csv:query_time(r=${radiusM}m, code=${industryCode}, via=${candidateSet === dataset ? 'fullscan' : 'indexed'}, subset=${candidateSet.length.toLocaleString()}) = ${queryMs.toFixed(1)}ms` +
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
