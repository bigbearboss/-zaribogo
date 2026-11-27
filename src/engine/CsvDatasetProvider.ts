import type { LocationPayload } from './PublicDataFetcher';
import { getManifest, type RegionEntry } from './regionIndex';
import type { CompetitorStore } from './analysisEvidence';

export interface CsvQueryResult { competitorsCount: number; poiTotalCount: number; diversityIndex: number; stores: CompetitorStore[]; supported: boolean; }
export class CsvDatasetProvider {
  private worker: Worker | null = null;
  private loadPromise: Promise<number> | null = null;
  private loadedKey = '';
  private pending = new Map<string, { resolve: (result: CsvQueryResult) => void; reject: (error: Error) => void }>();
  private counter = 0;
  sectors: { code: string; name: string }[] = [];
  datasetNames: string[] = [];
  private async loadEntries(entries: RegionEntry[], onProgress?: (count: number) => void): Promise<number> {
    const key = entries.map(e => e.csvUrl).sort().join('|');
    if (this.loadPromise && key === this.loadedKey) return this.loadPromise;
    for (const request of this.pending.values()) request.reject(new Error('분석 위치가 바뀌었습니다. 다시 분석해 주세요.'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = new Worker(new URL('./workers/csvWorker.ts', import.meta.url), { type: 'module' });
    this.loadedKey = key; this.datasetNames = entries.map(e => e.name);
    this.loadPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.loadPromise = null; this.worker?.terminate(); reject(new Error('상권 데이터 다운로드 시간 초과')); }, 45000);
      this.worker!.onerror = () => { clearTimeout(timer); this.loadPromise = null; reject(new Error('상권 데이터 처리 실패')); };
      this.worker!.onmessage = ({ data }) => {
        const { type, payload } = data;
        if (type === 'PROGRESS') onProgress?.(payload.count);
        if (type === 'LOAD_COMPLETE') { clearTimeout(timer); this.sectors = payload.sectors; resolve(payload.count); }
        if (type === 'QUERY_RESULT') { const request = this.pending.get(payload.id); request?.resolve(payload); this.pending.delete(payload.id); }
        if (type === 'ERROR') {
          clearTimeout(timer); const error = new Error(payload.message || String(payload));
          if (payload.id) { this.pending.get(payload.id)?.reject(error); this.pending.delete(payload.id); }
          else { this.loadPromise = null; reject(error); }
        }
      };
      this.worker!.postMessage({ type: 'LOAD_CSV', payload: { urls: entries.map(e => e.csvUrl) } });
    });
    return this.loadPromise;
  }
  async loadDataset(entry: RegionEntry, onProgress?: (count: number) => void) { return this.loadEntries([entry], onProgress); }
  async loadForLocation(lat: number, lng: number, hintOrProgress?: string | ((count: number) => void), onProgress?: (count: number) => void, radiusM = 1000) {
    const manifest = await getManifest();
    const dy = radiusM / 110000;
    const dx = radiusM / (110000 * Math.cos(lat * Math.PI / 180));
    const base = (import.meta.env.VITE_CSV_BASE_URL || '').replace(/\/$/, '');
    // All intersecting districts are needed at an administrative boundary.
    const entries = manifest.filter(e => e.latMax >= lat - dy && e.latMin <= lat + dy && e.lngMax >= lng - dx && e.lngMin <= lng + dx)
      .map(e => ({ ...e, csvUrl: /^https?:/.test(e.csvUrl) ? e.csvUrl : `${base}${e.csvUrl}` }));
    if (!entries.length) { this.loadPromise = null; this.datasetNames = []; throw new Error('선택 반경을 포함하는 상권 자료가 없습니다.'); }
    return this.loadEntries(entries, typeof hintOrProgress === 'function' ? hintOrProgress : onProgress);
  }
  async queryRadius(location: LocationPayload, radiusM: number, industryCode: string): Promise<CsvQueryResult> {
    if (!this.loadPromise) throw new Error('Dataset not loaded');
    await this.loadPromise;
    return new Promise((resolve, reject) => {
      const id = `query_${this.counter++}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('상권 반경 집계 시간 초과')); }, 10000);
      this.pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.worker!.postMessage({ type: 'QUERY_RADIUS', payload: { id, lat: location.lat, lng: location.lng, radiusM, industryCode } });
    });
  }
}
