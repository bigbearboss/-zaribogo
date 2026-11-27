import { estimateRadiusPopulation, type CensusFeature } from './spatial.ts';

type Dependencies = { env: (name: string) => string | undefined; fetch: typeof fetch; now?: () => number };
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

/** Public census only. Does not access users, saved reports, credits or payments. */
export function createPopulationHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const base = (deps.env('SGIS_API_BASE_URL') || deps.env('VITE_SGIS_API_BASE_URL') || 'https://sgisapi.mods.go.kr/OpenAPI3').replace(/\/$/, '');
  let token: { value: string; expires: number } | null = null;
  let tokenRequest: Promise<string> | null = null;
  let years: { value: any; expires: number } | null = null;

  async function request(path: string, params: Record<string, string>) {
    let response: Response;
    try { response = await deps.fetch(`${base}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(7000) }); }
    catch { throw new Error(`SGIS_${path.split('/')[0]}_UNREACHABLE`); }
    if (!response.ok) throw new Error(`SGIS_HTTP_${response.status}`);
    try { return await response.json(); } catch { throw new Error('SGIS_INVALID_JSON'); }
  }
  async function accessToken() {
    if (token && token.expires > now()) return token.value;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      const key = deps.env('SGIS_CONSUMER_KEY') || deps.env('VITE_SGIS_CONSUMER_KEY');
      const secret = deps.env('SGIS_CONSUMER_SECRET') || deps.env('VITE_SGIS_CONSUMER_SECRET');
      if (!key || !secret) throw new Error('SGIS_NOT_CONFIGURED');
      const data = await request('auth/authentication.json', { consumer_key: key, consumer_secret: secret });
      if (data.errCd !== 0 || !data.result?.accessToken) throw new Error('SGIS_AUTH_FAILED');
      token = { value: data.result.accessToken, expires: now() + 3 * 60 * 60 * 1000 };
      return token.value;
    })();
    try { return await tokenRequest; } finally { tokenRequest = null; }
  }
  async function api(path: string, params: Record<string, string> = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await request(path, { ...params, accessToken: await accessToken() });
      if (Number(data.errCd) === -401 && attempt === 0) { token = null; continue; }
      if (data.errCd !== 0) throw new Error(`SGIS_${path.split('/')[0]}_${Number(data.errCd) || 'ERROR'}`);
      return data;
    }
    throw new Error('SGIS_AUTH_FAILED');
  }
  async function latestYears() {
    if (years && years.expires > now()) return years.value;
    const data = (await api('year/data.json')).result;
    const populationYear = Number(data?.lin_yr), boundaryYear = Number(data?.loa_yr ?? data?.lboudary_yr);
    if (!Number.isInteger(populationYear) || populationYear < 2015 || populationYear > new Date(now()).getUTCFullYear()) throw new Error('SGIS_YEAR_UNAVAILABLE');
    const value = { populationYear, boundaryYear: Number.isInteger(boundaryYear) && boundaryYear >= 2015 ? boundaryYear : null };
    years = { value, expires: now() + 24 * 60 * 60 * 1000 };
    return value;
  }

  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const params = new URL(req.url).searchParams;
    const latRaw = params.get('lat'), lngRaw = params.get('lng'), radiusRaw = params.get('radius');
    const lat = Number(latRaw), lng = Number(lngRaw), radius = radiusRaw === null ? 500 : Number(radiusRaw);
    if (!latRaw?.trim() || !lngRaw?.trim() || ![lat, lng, radius].every(Number.isFinite) || lat < 33 || lat > 39 || lng < 124 || lng > 132 || radius < 100 || radius > 1000) return json({ error: 'INVALID_LOCATION_OR_RADIUS' }, 400);
    try {
      const [transformed, currentYears] = await Promise.all([
        api('transformation/transcoord.json', { src: '4326', dst: '5179', posX: String(lng), posY: String(lat) }), latestYears(),
      ]);
      const coords = Array.isArray(transformed.result) ? transformed.result[0] : transformed.result;
      const x = Number(coords?.posX ?? coords?.x), y = Number(coords?.posY ?? coords?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('SGIS_COORDINATES_UNAVAILABLE');
      const area = (await api('personal/findcodeinsmallarea.json', { x_coor: String(x), y_coor: String(y) })).result;
      const admCode = `${area?.sido_cd ?? ''}${area?.sgg_cd ?? ''}${area?.emdong_cd ?? ''}`;
      if (!/^\d{7,8}$/.test(admCode)) throw new Error('SGIS_AREA_UNAVAILABLE');
      const warnings: string[] = [];
      const populationJob = api('stats/population.json', { adm_cd: admCode, year: String(currentYears.populationYear), low_search: '0' })
        .then(data => {
          const row = data.result?.find((r: any) => String(r.adm_cd) === admCode);
          if (!row) throw new Error('SGIS_AREA_MISMATCH');
          return { adm_cd: row.adm_cd, adm_nm: row.adm_nm, tot_ppltn: row.tot_ppltn ?? null, tot_family: row.tot_family ?? null, tot_house: row.tot_house ?? null, year: currentYears.populationYear };
        }).catch(error => { warnings.push(error.message); return null; });
      const radiusJob = (async () => {
        const boundaries = await api('boundary/userarea.geojson', { minx: String(x - radius), miny: String(y - radius), maxx: String(x + radius), maxy: String(y + radius), cd: '4' });
        const features: CensusFeature[] = boundaries.features;
        if (!Array.isArray(features) || !features.length || features.length > 600) throw new Error('SGIS_BOUNDARY_COVERAGE_UNAVAILABLE');
        const parentCodes = [...new Set(features.map(f => {
          const code = String(f.properties?.adm_cd || '');
          if (!/^\d{13,14}$/.test(code)) throw new Error('SGIS_CENSUS_CODE_UNAVAILABLE');
          return code.slice(0, code.length - 6);
        }))];
        if (parentCodes.length > 8) throw new Error('SGIS_TOO_MANY_DISTRICTS');
        const rows: any[] = [];
        // Bounded fan-out; one request per intersecting administrative dong.
        for (let i = 0; i < parentCodes.length; i += 3) {
          const results = await Promise.all(parentCodes.slice(i, i + 3).map(adm_cd => api('stats/population.json', { adm_cd, year: String(currentYears.populationYear), low_search: '1' }).catch(() => null)));
          for (const result of results) if (Array.isArray(result?.result)) rows.push(...result.result);
        }
        return { ...estimateRadiusPopulation(features, rows, x, y, radius), radiusM: radius, referenceYear: currentYears.populationYear, boundaryYear: currentYears.boundaryYear,
          note: '집계구 안에 인구가 고르게 분포한다고 가정한 면적 비례 추정입니다. 공간 범위의 최소·최대는 신뢰구간이 아니며, 신규 입주·도보 단절·실제 소비 수요는 반영하지 못합니다.' };
      })().catch(error => {
        warnings.push(error.message);
        return { status: 'unavailable', population: null, households: null, radiusM: radius, referenceYear: currentYears.populationYear, boundaryYear: currentYears.boundaryYear, note: '선택 반경과 일치하는 집계구 인구 자료를 확보하지 못했습니다.' };
      });
      const [population, radiusPopulation] = await Promise.all([populationJob, radiusJob]);
      return json({ schemaVersion: 2, input: { lat, lng, radius }, referenceYear: currentYears.populationYear, boundaryYear: currentYears.boundaryYear,
        regionMeta: { adm_cd: admCode, sido_nm: area.sido_nm, sgg_nm: area.sgg_nm, emdong_nm: area.emdong_nm }, population, radiusPopulation,
        source: 'SGIS 인구주택총조사', retrievedAt: new Date(now()).toISOString(), warnings });
    } catch (error) {
      // No upstream response, URLs, access tokens or secrets are exposed.
      const message = error instanceof Error && /^SGIS_[A-Z0-9_]+$/.test(error.message) ? error.message : 'SGIS_REQUEST_FAILED';
      return json({ error: message, population: null, radiusPopulation: { status: 'unavailable', population: null, households: null } }, 502);
    }
  };
}
