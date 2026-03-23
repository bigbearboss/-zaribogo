import { supabase } from './supabase';
import { authService } from './AuthService';
import { AnalysisHistoryItem } from '../engine/types';

const LOCAL_HISTORY_KEY = 'riskx_analysis_history';

class HistoryService {
    async saveResult(item: AnalysisHistoryItem) {
        // 1. Always save to LocalStorage (as fallback/cache)
        this.saveToLocalStorage(item);

        // 2. If logged in, save to Supabase
        if (authService.isLoggedIn()) {
            const user = authService.getUser();
            if (!user) return;

            const { error } = await supabase.from('analysis_history').insert({
                user_id: user.id,
                address: item.location.address,
                lat: item.location.lat,
                lng: item.location.lng,
                industry: item.industry,
                radius: item.radius,
                cri: item.analysis.cri,
                judgment: {
                    tier: item.analysis.riskTier,
                    score: item.analysis.cri
                },
                summary: item.aiResult?.oneLineSummary || '',
            });

            if (error) {
                console.error('[HistoryService] Supabase save error:', error);
            }
        }
    }

    async getHistory(): Promise<AnalysisHistoryItem[]> {
        if (authService.isLoggedIn()) {
            const { data, error } = await supabase
                .from('analysis_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.error('[HistoryService] Supabase fetch error:', error);
                return this.getFromLocalStorage();
            }

            // Map Supabase schema back to AnalysisHistoryItem
            return (data || []).map(row => ({
                location: {
                    lat: row.lat,
                    lng: row.lng,
                    address: row.address,
                    placeName: row.address, // Placeholder as Supabase MVP doesn't store placeName separately
                },
                industry: row.industry,
                radius: row.radius,
                analysis: {
                    cri: row.cri,
                    riskTier: row.judgment?.tier,
                    // Other fields are reconstructed or left empty for history cards
                } as any,
                aiResult: { oneLineSummary: row.summary } as any,
                timestamp: new Date(row.created_at).getTime(),
                id: row.id
            }));
        }

        return this.getFromLocalStorage();
    }

    private saveToLocalStorage(item: AnalysisHistoryItem) {
        try {
            let history: AnalysisHistoryItem[] = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');

            // De-duplicate
            history = history.filter(h =>
                !(h.location.lat === item.location.lat &&
                    h.location.lng === item.location.lng &&
                    h.industry.code === item.industry.code &&
                    h.radius === item.radius)
            );

            history.unshift(item);
            if (history.length > 20) history.pop();
            localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));
        } catch (err) {
            console.error('[HistoryService] LocalStorage save error:', err);
        }
    }

    private getFromLocalStorage(): AnalysisHistoryItem[] {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
        } catch (err) {
            console.error('[HistoryService] LocalStorage load error:', err);
            return [];
        }
    }
}

export const historyService = new HistoryService();
