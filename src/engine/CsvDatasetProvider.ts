import { LocationPayload } from "./PublicDataFetcher";
import { resolveRegionUrl } from "./regionIndex";

export interface CsvQueryResult {
    competitorsCount: number;
    poiTotalCount: number;
    diversityIndex: number;
}

export class CsvDatasetProvider {
    private worker: Worker;
    private initPromise: Promise<number> | null = null;
    private loadedUrl: string | null = null;
    private resolves: Map<string, (res: CsvQueryResult) => void> = new Map();
    private rejects: Map<string, (err: any) => void> = new Map();
    private queryIdCounter = 0;
    public sectors: { code: string; name: string }[] = [];

    constructor() {
        this.worker = new Worker(new URL('./workers/csvWorker.ts', import.meta.url), { type: 'module' });

        this.worker.onmessage = (e: MessageEvent) => {
            const { type, payload } = e.data;
            if (type === 'QUERY_RESULT') {
                const { id, ...data } = payload;
                if (this.resolves.has(id)) {
                    this.resolves.get(id)!(data as CsvQueryResult);
                    this.resolves.delete(id);
                    this.rejects.delete(id);
                }
            } else if (type === 'ERROR') {
                console.error("[CSV Worker] Global Error:", payload);
            }
        };
    }

    public async loadDataset(url: string, onProgress?: (count: number) => void): Promise<number> {
        if (this.initPromise && this.loadedUrl === url) return this.initPromise;

        // Reset if loading a different region
        if (this.loadedUrl && this.loadedUrl !== url) {
            console.log(`[CSV] Region switch: ${this.loadedUrl} → ${url}`);
            this.initPromise = null;
        }

        this.loadedUrl = url;
        performance.mark('provider:csv_load:start');

        this.initPromise = new Promise((resolve, reject) => {
            const messageHandler = (e: MessageEvent) => {
                const { type, payload } = e.data;
                if (type === 'LOAD_COMPLETE') {
                    this.worker.removeEventListener('message', messageHandler);
                    this.sectors = payload.sectors || [];
                    performance.mark('provider:csv_load:end');
                    performance.measure('provider:csv_load_time', 'provider:csv_load:start', 'provider:csv_load:end');
                    const [m] = performance.getEntriesByName('provider:csv_load_time');
                    console.log(`[Perf] provider:csv_load_time = ${m?.duration.toFixed(0)}ms (${payload.count.toLocaleString()} rows)`);
                    resolve(payload.count);
                } else if (type === 'PROGRESS' && onProgress) {
                    onProgress(payload.count);
                } else if (type === 'ERROR') {
                    this.worker.removeEventListener('message', messageHandler);
                    this.initPromise = null;
                    reject(new Error(payload));
                }
            };
            this.worker.addEventListener('message', messageHandler);
            this.worker.postMessage({ type: 'LOAD_CSV', payload: { url } });
        });

        return this.initPromise;
    }

    /**
     * Resolves the best regional CSV for the given coordinate and loads it.
     * On repeated calls with the same resolved URL, returns immediately (cached).
     */
    public async loadForLocation(lat: number, lng: number, onProgress?: (count: number) => void): Promise<number> {
        const url = resolveRegionUrl(lat, lng);
        console.log(`[CSV] Resolved region URL: ${url} for (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        return this.loadDataset(url, onProgress);
    }

    public async queryRadius(location: LocationPayload, radiusM: number, industryCode: string): Promise<CsvQueryResult> {
        if (!this.initPromise) {
            throw new Error("Dataset not loaded. Call loadDataset first.");
        }
        await this.initPromise;

        return new Promise((resolve, reject) => {
            const id = `query_${this.queryIdCounter++}`;
            performance.mark(`provider:csv_query:start:${id}`);

            this.resolves.set(id, (result) => {
                performance.mark(`provider:csv_query:end:${id}`);
                performance.measure('provider:csv_query_time', `provider:csv_query:start:${id}`, `provider:csv_query:end:${id}`);
                const [m] = performance.getEntriesByName('provider:csv_query_time').slice(-1);
                console.log(`[Perf] provider:csv_query_time(r=${radiusM}m) = ${m?.duration.toFixed(1)}ms`);
                resolve(result);
            });
            this.rejects.set(id, reject);

            this.worker.postMessage({
                type: 'QUERY_RADIUS',
                payload: {
                    id,
                    lat: location.lat,
                    lng: location.lng,
                    radiusM,
                    industryCode
                }
            });

            // Timeout in case worker hangs
            setTimeout(() => {
                if (this.rejects.has(id)) {
                    this.rejects.get(id)!(new Error("CSV Worker query timeout (5s)"));
                    this.resolves.delete(id);
                    this.rejects.delete(id);
                }
            }, 5000);
        });
    }
}
