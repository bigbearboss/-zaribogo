import { INDUSTRY_RULES } from './data/industryMatcher';
import type { CompetitorStore } from './analysisEvidence';

export interface PoiRecord {
  id: string; lat: number; lng: number; shopName: string; address: string;
  majorCode: string; majorName: string; middleCode: string; middleName: string; subCode: string; subName: string;
}
const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase();
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lng2 - lng1) * radians / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function industryMatch(row: PoiRecord, code: string): CompetitorStore['match'] | null {
  if (row.subCode === code && /^[A-Z]\d{5}$/.test(code)) return 'category';
  const rule = INDUSTRY_RULES[code];
  if (!rule) return null;
  if (rule.subCodes?.includes(row.subCode)) return 'category';
  // A broad middle category (e.g. beauty) must not override a precise service.
  if (!rule.subCodes?.length && rule.middleCodes?.includes(row.middleCode) && code.startsWith('restaurant_')) return 'category';
  if (rule.majorCodes?.length && !rule.majorCodes.includes(row.majorCode)) return null;
  const text = normalize(`${row.shopName} ${row.subName}`);
  if (rule.keywords?.some(word => normalize(word).length > 1 && text.includes(normalize(word)))) return 'keyword';
  return null;
}
export function queryPois(dataset: PoiRecord[], lat: number, lng: number, radiusM: number, industryCode: string) {
  if (![lat, lng, radiusM].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || radiusM <= 0) throw new Error('Invalid spatial query');
  const supported = !!INDUSTRY_RULES[industryCode] || /^[A-Z]\d{5}$/.test(industryCode);
  let poiTotalCount = 0;
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const competitors: CompetitorStore[] = [];
  for (const row of dataset) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
    if (Math.abs(row.lat - lat) > radiusM / 110000) continue;
    const distance = distanceMeters(lat, lng, row.lat, row.lng);
    if (distance > radiusM) continue;
    const id = row.id || `${row.shopName}|${row.lat}|${row.lng}|${row.subCode}`;
    if (seen.has(id)) continue;
    seen.add(id);
    poiTotalCount++;
    const code = row.subCode || row.middleCode || row.majorCode;
    counts.set(code, (counts.get(code) ?? 0) + 1);
    const match = industryMatch(row, industryCode);
    if (match) competitors.push({ id, name: row.shopName || '상호 미제공', address: row.address, category: row.subName || row.middleName, distanceM: Math.round(distance), match });
  }
  competitors.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  const diversityIndex = poiTotalCount > 1 ? 1 - [...counts.values()].reduce((sum, n) => sum + n * (n - 1), 0) / (poiTotalCount * (poiTotalCount - 1)) : 0;
  return { competitorsCount: competitors.length, poiTotalCount, diversityIndex, stores: competitors.slice(0, 30), supported };
}
