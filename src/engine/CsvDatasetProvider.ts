import { LocationPayload } from "./PublicDataFetcher";
import {
  resolveRegionEntry,
  resolveRegionEntryByName,
  RegionEntry,
} from "./regionIndex";

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
    this.worker = new Worker(new URL("./workers/csvWorker.ts", import.meta.url), {
      type: "module",
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const { type, payload } = e.data;

      if (type === "QUERY_RESULT") {
        const { id, ...data } = payload;
        if (this.resolves.has(id)) {
          this.resolves.get(id)!(data as CsvQueryResult);
          this.resolves.delete(id);
          this.rejects.delete(id);
        }
      } else if (type === "ERROR") {
        console.error("[CSV Worker] Global Error:", payload);
      }
    };
  }

  public async loadDataset(
    entry: RegionEntry,
    onProgress?: (count: number) => void
  ): Promise<number> {
    const url = entry.csvUrl;

    if (this.initPromise && this.loadedUrl === url) {
      console.log("[CSV] Reusing already loaded dataset:", {
        region: entry.name,
        url,
      });
      return this.initPromise;
    }

    if (this.loadedUrl && this.loadedUrl !== url) {
      console.log(`[CSV] Region switch: ${this.loadedUrl} → ${url}`);
      this.initPromise = null;
    }

    this.loadedUrl = url;
    const sizeMb = (entry.fileSize / (1024 * 1024)).toFixed(2);

    console.log("[CSV] Loading dataset", {
      region: entry.name,
      url,
      sizeMb,
      bounds: {
        latMin: entry.latMin,
        latMax: entry.latMax,
        lngMin: entry.lngMin,
        lngMax: entry.lngMax,
      },
    });

    performance.mark("provider:csv_load:start");

    this.initPromise = new Promise((resolve, reject) => {
      const messageHandler = (e: MessageEvent) => {
        const { type, payload } = e.data;

        if (type === "LOAD_COMPLETE") {
          this.worker.removeEventListener("message", messageHandler);
          this.sectors = payload.sectors || [];

          performance.mark("provider:csv_load:end");
          performance.measure(
            "provider:csv_load_time",
            "provider:csv_load:start",
            "provider:csv_load:end"
          );

          const [m] = performance.getEntriesByName("provider:csv_load_time").slice(-1);

          console.log(
            `[Perf] provider:csv_load_time = ${m?.duration.toFixed(0)}ms | Region: ${entry.name} | Size: ${sizeMb}MB | Rows: ${payload.count.toLocaleString()}`
          );

          resolve(payload.count);
        } else if (type === "PROGRESS" && onProgress) {
          onProgress(payload.count);
        } else if (type === "ERROR") {
          this.worker.removeEventListener("message", messageHandler);
          this.initPromise = null;
          reject(new Error(payload));
        }
      };

      this.worker.addEventListener("message", messageHandler);
      this.worker.postMessage({ type: "LOAD_CSV", payload: { url } });
    });

    return this.initPromise;
  }

  /**
   * Backward-compatible signatures:
   * 1) loadForLocation(lat, lng, onProgress)
   * 2) loadForLocation(lat, lng, regionNameHint, onProgress)
   */
  public async loadForLocation(
    lat: number,
    lng: number,
    regionNameHintOrProgress?: string | ((count: number) => void),
    onProgress?: (count: number) => void
  ): Promise<number> {
    let regionNameHint: string | undefined;
    let progressHandler: ((count: number) => void) | undefined;

    if (typeof regionNameHintOrProgress === "function") {
      // old signature: loadForLocation(lat, lng, onProgress)
      progressHandler = regionNameHintOrProgress;
      regionNameHint = undefined;
    } else {
      // new signature: loadForLocation(lat, lng, regionNameHint, onProgress)
      regionNameHint = regionNameHintOrProgress;
      progressHandler = onProgress;
    }

    let entry: RegionEntry | null = null;

    if (regionNameHint && regionNameHint.trim()) {
      entry = await resolveRegionEntryByName(regionNameHint);
    }

    if (!entry) {
      entry = await resolveRegionEntry(lat, lng);
    }

    console.log("[Region Resolve Debug]", {
      requestedLat: lat,
      requestedLng: lng,
      regionNameHint: regionNameHint ?? null,
      resolvedRegion: entry?.name ?? null,
      resolvedCsvUrl: entry?.csvUrl ?? null,
      resolvedFileSize: entry?.fileSize ?? null,
      resolvedBounds: entry
        ? {
            latMin: entry.latMin,
            latMax: entry.latMax,
            lngMin: entry.lngMin,
            lngMax: entry.lngMax,
          }
        : null,
    });

    if (!entry) {
      console.warn("[CSV] No region entry resolved for location.", {
        lat,
        lng,
        regionNameHint,
      });
      return 0;
    }

    return this.loadDataset(entry, progressHandler);
  }

  public async queryRadius(
    location: LocationPayload,
    radiusM: number,
    industryCode: string
  ): Promise<CsvQueryResult> {
    if (!this.initPromise) {
      throw new Error("Dataset not loaded. Call loadDataset first.");
    }

    await this.initPromise;

    return new Promise((resolve, reject) => {
      const id = `query_${this.queryIdCounter++}`;
      performance.mark(`provider:csv_query:start:${id}`);

      this.resolves.set(id, (result) => {
        performance.mark(`provider:csv_query:end:${id}`);
        performance.measure(
          "provider:csv_query_time",
          `provider:csv_query:start:${id}`,
          `provider:csv_query:end:${id}`
        );

        const [m] = performance.getEntriesByName("provider:csv_query_time").slice(-1);
        console.log(
          `[Perf] provider:csv_query_time(r=${radiusM}m) = ${m?.duration.toFixed(1)}ms`
        );
        resolve(result);
      });

      this.rejects.set(id, reject);

      console.log("[CSV Query Debug]", {
        id,
        lat: location.lat,
        lng: location.lng,
        radiusM,
        industryCode,
        loadedUrl: this.loadedUrl,
      });

      this.worker.postMessage({
        type: "QUERY_RADIUS",
        payload: {
          id,
          lat: location.lat,
          lng: location.lng,
          radiusM,
          industryCode,
        },
      });

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
