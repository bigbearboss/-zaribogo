import { DataSource } from './dataMergeRules';
import type { PublicDataResult } from './types';

export interface RadiusPopulationEvidence {
  status: 'estimated' | 'partial' | 'unavailable';
  population: number | null;
  households: number | null;
  knownPopulationEstimate: number | null;
  knownHouseholdEstimate: number | null;
  cellCount: number;
  knownPopulationCells: number;
  boundaryCoverage: number | null;
  populationAreaCoverage: number | null;
  boundaryYear: number | null;
  spatialBounds: { minimum: number; maximum: number } | null;
  note: string;
}

export interface PopulationEvidence {
  status: 'available' | 'unavailable';
  population: number | null;
  households: number | null;
  areaName: string;
  areaCode: string;
  geography: 'administrative_dong';
  referenceYear: number | null;
  source: string;
  note: string;
  radius?: RadiusPopulationEvidence;
}

export interface CompetitorStore {
  id: string;
  name: string;
  category: string;
  address: string;
  distanceM: number;
  match: 'category' | 'keyword';
}

export interface CompetitionEvidence {
  status: 'available' | 'unavailable' | 'unsupported';
  count: number | null;
  totalStores: number | null;
  stores: CompetitorStore[];
  radiusM: number;
  datasets: string[];
  referenceDate: string | null;
  limitations: string[];
}

/** Suppressed, empty and malformed census values are unknown, never zero. */
export function censusNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function populationEvidence(response: any, expectedRadiusM?: number): PopulationEvidence {
  const row = response?.population;
  const population = censusNumber(row?.tot_ppltn);
  // SGIS tot_family = households; tot_house = dwellings, not households.
  const households = censusNumber(row?.tot_family);
  const suppliedYear = censusNumber(row?.year ?? response?.referenceYear);
  return {
    status: population !== null || households !== null ? 'available' : 'unavailable',
    population, households,
    areaName: row?.adm_nm || [response?.regionMeta?.sgg_nm, response?.regionMeta?.emdong_nm].filter(Boolean).join(' ') || '행정동 미확인',
    areaCode: row?.adm_cd || response?.regionMeta?.adm_cd || response?.regionMeta?.adm_cd_7 || '',
    geography: 'administrative_dong',
    // The deployed legacy sgis-regiontotal endpoint explicitly requests 2020.
    referenceYear: suppliedYear ?? (row && response?.schemaVersion !== 2 ? 2020 : null),
    source: 'SGIS 인구주택총조사',
    note: '행정동 전체 통계입니다. 선택 반경의 거주인구·가구 수가 아니며, 이후 입주한 아파트와 현재 유동·소비 수요를 보여주지 않습니다.',
    radius: radiusPopulationEvidence(response?.radiusPopulation, expectedRadiusM),
  };
}

function radiusPopulationEvidence(value: any, expectedRadiusM?: number): RadiusPopulationEvidence {
  const validScope = value && (expectedRadiusM === undefined || value.radiusM === expectedRadiusM);
  const cellCount = censusNumber(value?.cellCount) ?? 0, known = censusNumber(value?.knownPopulationCells) ?? 0;
  const boundaryCoverage = censusNumber(value?.boundaryCoverage);
  const complete = validScope && value?.status === 'estimated' && cellCount > 0 && known === cellCount && boundaryCoverage !== null && boundaryCoverage >= 0.99;
  const population = complete ? censusNumber(value?.population) : null;
  const status = population !== null ? 'estimated' : validScope && value?.status === 'partial' ? 'partial' : 'unavailable';
  const minimum = censusNumber(value?.spatialBounds?.minimum), maximum = censusNumber(value?.spatialBounds?.maximum);
  return {
    status, population, households: complete ? censusNumber(value?.households) : null,
    knownPopulationEstimate: validScope ? censusNumber(value?.knownPopulationEstimate) : null,
    knownHouseholdEstimate: validScope ? censusNumber(value?.knownHouseholdEstimate) : null,
    cellCount: validScope ? cellCount : 0, knownPopulationCells: validScope ? known : 0,
    boundaryCoverage: validScope ? boundaryCoverage : null, populationAreaCoverage: validScope ? censusNumber(value?.populationAreaCoverage) : null,
    boundaryYear: validScope ? censusNumber(value?.boundaryYear) : null,
    spatialBounds: complete && minimum !== null && maximum !== null ? { minimum, maximum } : null,
    note: validScope && value.note ? String(value.note) : '선택 반경과 일치하는 집계구 인구 자료를 확보하지 못했습니다.',
  };
}

export function emptyPublicData(radiusM: number): PublicDataResult {
  return {
    radiusM, competitorsCount: 0, poiTotalCount: 0, diversityIndex: 0,
    households: 0, population: 0, ageShare20_39: 0, volatilityProxy: 0,
    _sources: Object.fromEntries(['competitorsCount', 'poiTotalCount', 'diversityIndex', 'households', 'population', 'ageShare20_39', 'volatilityProxy', 'districtPoiCount'].map(key => [key, DataSource.UNAVAILABLE])),
    populationEvidence: populationEvidence(null),
    competitionEvidence: {
      status: 'unavailable', count: null, totalStores: null, stores: [], radiusM,
      datasets: [], referenceDate: null,
      limitations: ['경쟁점 자료를 불러오지 못했습니다. 미확인은 경쟁점 0개를 뜻하지 않습니다.'],
    },
  };
}
