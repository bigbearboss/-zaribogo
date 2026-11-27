import type { PublicDataProvider, LocationPayload } from "./PublicDataFetcher";
import type { PublicDataResult } from "./types";
import { supabase } from '../services/supabase';
import { emptyPublicData, populationEvidence } from './analysisEvidence';

/** Live analysis never falls back to demo population, shops or activity. */
export class RealPublicDataProvider implements PublicDataProvider {
  async fetchByRadius(location: LocationPayload, radius: number, _industryCode: string): Promise<PublicDataResult> {
    const result = emptyPublicData(radius);
    try {
      const path = `sgis-context-v2?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius=${encodeURIComponent(radius)}`;
      const { data, error } = await supabase.functions.invoke(path, { method: "GET", signal: AbortSignal.timeout(45000) });
      if (error) throw error;
      result.populationEvidence = populationEvidence(data, radius);
      // The legacy radius-scoped numeric fields deliberately remain unavailable.
      // Administrative totals belong only in the separately labelled context card.
    } catch {
      console.warn('[SGIS] Population unavailable; no synthetic replacement used.');
    }
    return result;
  }
}
