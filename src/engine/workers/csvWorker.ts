import Papa from 'papaparse';
import { queryPois, type PoiRecord } from '../poiQuery';

let dataset: PoiRecord[] = [];
let loaded = false;
function loadCsv(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let validHeader = false;
    Papa.parse(url, {
      download: true, header: true, skipEmptyLines: true,
      chunk: (results, parser) => {
        const fields = results.meta.fields || [];
        if (!fields.includes('위도') || !fields.includes('경도') || !fields.includes('상호명')) {
          parser.abort(); reject(new Error('CSV 형식 불일치')); return;
        }
        validHeader = true;
        for (const row of results.data as Record<string, string>[]) {
          const lat = Number.parseFloat(row['위도']);
          const lng = Number.parseFloat(row['경도']);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;
          dataset.push({ id: row['상가업소번호'] || '', lat, lng,
            shopName: [row['상호명'], row['지점명']].filter(Boolean).join(' '),
            address: row['도로명주소'] || row['지번주소'] || '',
            majorCode: row['상권업종대분류코드'] || '', majorName: row['상권업종대분류명'] || '',
            middleCode: row['상권업종중분류코드'] || '', middleName: row['상권업종중분류명'] || '',
            subCode: row['상권업종소분류코드'] || '', subName: row['상권업종소분류명'] || '' });
        }
        self.postMessage({ type: 'PROGRESS', payload: { count: dataset.length } });
      },
      complete: () => validHeader ? resolve() : reject(new Error('빈 CSV 또는 형식 불일치')),
      error: reject,
    });
  });
}
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;
  try {
    if (type === 'LOAD_CSV') {
      dataset = []; loaded = false;
      for (const url of payload.urls || [payload.url]) await loadCsv(url);
      loaded = true;
      const sectors = [...new Map(dataset.filter(r => r.subCode).map(r => [r.subCode, r.subName])).entries()].map(([code, name]) => ({ code, name }));
      self.postMessage({ type: 'LOAD_COMPLETE', payload: { count: dataset.length, sectors } });
    }
    if (type === 'QUERY_RADIUS') {
      if (!loaded) throw new Error('Dataset not loaded');
      self.postMessage({ type: 'QUERY_RESULT', payload: { id: payload.id, ...queryPois(dataset, payload.lat, payload.lng, payload.radiusM, payload.industryCode) } });
    }
  } catch (error) {
    loaded = false;
    self.postMessage({ type: 'ERROR', payload: { id: payload.id, message: error instanceof Error ? error.message : 'CSV processing failed' } });
  }
};
