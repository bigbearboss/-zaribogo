/**
 * testCases.ts
 * ───────────────────────────────────────────────────────────────
 * 10 real-location validation cases for RISK-X accuracy testing.
 * Used by testCaseRunner.ts in /?mode=test context.
 */

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
export type RiskDirection = 'low' | 'medium' | 'high';

export type ReasonTag =
    | 'high_rent'
    | 'low_rent'
    | 'dense_competition'
    | 'low_competition'
    | 'high_foottraffic'
    | 'low_foottraffic'
    | 'strong_demand'
    | 'weak_demand'
    | 'high_volatility'
    | 'low_volatility'
    | 'young_demographic'
    | 'elderly_demographic'
    | 'new_town'
    | 'old_town'
    | 'office_district'
    | 'residential_district'
    | 'academy_zone'
    | 'medical_zone';

export interface TestCaseDefaultInputs {
    /** 월 임대료 (원) */
    monthlyRent: number;
    /** 보증금 (원) */
    deposit: number;
    /** 알바 직원 수 */
    albiCount: number;
    /** 정규 직원 수 */
    managerCount: number;
    /** 월 고정비 (임대료 외: 관리비, 소모품 등, 원) */
    monthlyFixedCost: number;
    /** 목표/예상 월 매출 (원) */
    expectedRevenue: number;
}

export interface ValidationTestCase {
    id: string;
    name: string;
    industryCode: string;
    locationName: string;
    lat: number;
    lng: number;
    defaultInputs: TestCaseDefaultInputs;
    /** 예상 리스크 방향 (CRI_THRESHOLDS로 실제값과 비교) */
    expectedRiskDirection: RiskDirection;
    /** 예상 최적 반경 (m). null = 반경 검증 생략 */
    expectedHotspotRadius: 300 | 500 | 1000 | null;
    /** 리스크 방향 예측의 근거 태그 코드들 */
    expectedReasonTags: ReasonTag[];
    /** 수동 검수자 메모 */
    manualReviewNote: string;
}

// ──────────────────────────────────────────────────────────────
// CRI → RiskDirection 기준 (testCaseRunner.ts 에서도 import 사용)
// 하드코딩 방지: 기준 변경 시 이 상수만 수정하면 됨
// ──────────────────────────────────────────────────────────────
export const CRI_THRESHOLDS = {
    LOW_MAX: 44,   // 0 ~ 44  → 'low'
    MEDIUM_MAX: 69,   // 45 ~ 69 → 'medium'
    // 70+     → 'high'
} as const;

export function criToDirection(cri: number): RiskDirection {
    if (cri <= CRI_THRESHOLDS.LOW_MAX) return 'low';
    if (cri <= CRI_THRESHOLDS.MEDIUM_MAX) return 'medium';
    return 'high';
}

// ──────────────────────────────────────────────────────────────
// 10개 테스트 케이스 정의
// ──────────────────────────────────────────────────────────────
export const TEST_CASES: ValidationTestCase[] = [

    // ── 카페 2개 ─────────────────────────────────────────────
    {
        id: 'cafe_gangnam',
        name: '강남 카페 (초고경쟁)',
        industryCode: 'cafe_indie_small',
        locationName: '강남역 3번 출구 인근',
        lat: 37.4979,
        lng: 127.0276,
        defaultInputs: {
            monthlyRent: 5_500_000,
            deposit: 50_000_000,
            albiCount: 2,
            managerCount: 1,
            monthlyFixedCost: 800_000,
            expectedRevenue: 9_000_000,
        },
        expectedRiskDirection: 'high',
        expectedHotspotRadius: 500,
        expectedReasonTags: ['high_rent', 'dense_competition', 'high_foottraffic', 'office_district'],
        manualReviewNote: '강남역 상권은 카페 포화도가 극도로 높고 임대료가 최상위권. CRI 70+ 예상.',
    },
    {
        id: 'cafe_mapo',
        name: '마포 카페 (주거+상권 혼합)',
        industryCode: 'cafe_indie_small',
        locationName: '마포역 인근',
        lat: 37.5494,
        lng: 126.9090,
        defaultInputs: {
            monthlyRent: 3_200_000,
            deposit: 30_000_000,
            albiCount: 1,
            managerCount: 1,
            monthlyFixedCost: 500_000,
            expectedRevenue: 7_500_000,
        },
        expectedRiskDirection: 'medium',
        expectedHotspotRadius: 500,
        expectedReasonTags: ['residential_district', 'young_demographic', 'high_foottraffic'],
        manualReviewNote: '직장인+거주 혼합 상권. 경쟁 있으나 수요도 안정적. CRI 45~65 예상.',
    },

    // ── 치킨/BBQ 2개 ─────────────────────────────────────────
    {
        id: 'bbq_nowon',
        name: '노원 치킨 (가족 배후 안정)',
        industryCode: 'chicken_bbq',
        locationName: '노원역 인근',
        lat: 37.6550,
        lng: 127.0570,
        defaultInputs: {
            monthlyRent: 2_200_000,
            deposit: 20_000_000,
            albiCount: 1,
            managerCount: 1,
            monthlyFixedCost: 400_000,
            expectedRevenue: 7_000_000,
        },
        expectedRiskDirection: 'medium',
        expectedHotspotRadius: 300,
        expectedReasonTags: ['residential_district', 'strong_demand', 'low_rent', 'elderly_demographic'],
        manualReviewNote: '노원구 가족 세대 배후 안정. 경쟁은 있으나 임대료 낮음. CRI 40~60 예상.',
    },
    {
        id: 'bbq_hongdae',
        name: '홍대 치킨 (유흥가 고변동)',
        industryCode: 'chicken_bbq',
        locationName: '홍대입구역 인근',
        lat: 37.5571,
        lng: 126.9240,
        defaultInputs: {
            monthlyRent: 4_500_000,
            deposit: 40_000_000,
            albiCount: 2,
            managerCount: 1,
            monthlyFixedCost: 700_000,
            expectedRevenue: 9_500_000,
        },
        expectedRiskDirection: 'high',
        expectedHotspotRadius: 300,
        expectedReasonTags: ['high_rent', 'high_volatility', 'young_demographic', 'dense_competition'],
        manualReviewNote: '홍대 유흥 상권은 외식 변동성 최상위. 높은 임대료 대비 수익 불안정. CRI 65+ 예상.',
    },

    // ── 의원 2개 ─────────────────────────────────────────────
    {
        id: 'clinic_seocho',
        name: '서초 의원 (고소득 배후)',
        industryCode: 'clinic_general',
        locationName: '서초역 인근',
        lat: 37.4929,
        lng: 127.0133,
        defaultInputs: {
            monthlyRent: 4_800_000,
            deposit: 60_000_000,
            albiCount: 0,
            managerCount: 2,
            monthlyFixedCost: 600_000,
            expectedRevenue: 12_000_000,
        },
        expectedRiskDirection: 'low',
        expectedHotspotRadius: 1000,
        expectedReasonTags: ['medical_zone', 'strong_demand', 'office_district', 'low_volatility'],
        manualReviewNote: '서초구 고소득층 배후+오피스. 의원 수요 안정성 높음. 임대료 높지만 매출도 높아 CRI 35 이하 예상.',
    },
    {
        id: 'clinic_dobong',
        name: '도봉 의원 (구도심 중간)',
        industryCode: 'clinic_general',
        locationName: '도봉산역 인근',
        lat: 37.6888,
        lng: 127.0462,
        defaultInputs: {
            monthlyRent: 2_000_000,
            deposit: 20_000_000,
            albiCount: 0,
            managerCount: 1,
            monthlyFixedCost: 350_000,
            expectedRevenue: 7_500_000,
        },
        expectedRiskDirection: 'medium',
        expectedHotspotRadius: 500,
        expectedReasonTags: ['elderly_demographic', 'old_town', 'weak_demand', 'low_rent'],
        manualReviewNote: '노령 인구 多 → 의료 수요 있으나 구도심 인구 감소 추세. CRI 45~60 예상.',
    },

    // ── 무인매장 2개 ─────────────────────────────────────────
    {
        id: 'unmanned_jamsil',
        name: '잠실 무인매장 (고트래픽)',
        industryCode: 'convenience_unmanned',
        locationName: '잠실역 인근',
        lat: 37.5129,
        lng: 127.1001,
        defaultInputs: {
            monthlyRent: 3_500_000,
            deposit: 30_000_000,
            albiCount: 0,
            managerCount: 0,
            monthlyFixedCost: 300_000,
            expectedRevenue: 6_500_000,
        },
        expectedRiskDirection: 'medium',
        expectedHotspotRadius: 300,
        expectedReasonTags: ['high_foottraffic', 'dense_competition', 'residential_district'],
        manualReviewNote: '잠실역 유동인구 많으나 소매 경쟁도 높음. 무인 특성상 인건비 절감 → CRI 45~60 예상.',
    },
    {
        id: 'unmanned_ilsan',
        name: '일산 무인매장 (신도시 여유)',
        industryCode: 'convenience_unmanned',
        locationName: '정발산역 인근',
        lat: 37.6683,
        lng: 126.7745,
        defaultInputs: {
            monthlyRent: 1_800_000,
            deposit: 15_000_000,
            albiCount: 0,
            managerCount: 0,
            monthlyFixedCost: 200_000,
            expectedRevenue: 5_000_000,
        },
        expectedRiskDirection: 'low',
        expectedHotspotRadius: 500,
        expectedReasonTags: ['new_town', 'low_rent', 'strong_demand', 'low_competition'],
        manualReviewNote: '일산 신도시 세대수 多, 경쟁 적음, 임대료 낮음. CRI 30~45 예상.',
    },

    // ── 학원 2개 ─────────────────────────────────────────────
    {
        id: 'academy_daechi',
        name: '대치 학원 (포화 최상위)',
        industryCode: 'academy_general',
        locationName: '대치역 은마아파트 상권',
        lat: 37.4948,
        lng: 127.0605,
        defaultInputs: {
            monthlyRent: 6_000_000,
            deposit: 80_000_000,
            albiCount: 0,
            managerCount: 2,
            monthlyFixedCost: 500_000,
            expectedRevenue: 13_000_000,
        },
        expectedRiskDirection: 'high',
        expectedHotspotRadius: 300,
        expectedReasonTags: ['academy_zone', 'high_rent', 'dense_competition', 'strong_demand'],
        manualReviewNote: '대치동 학원가는 전국 최고 경쟁도. 임대료 최상위지만 수요도 강함. 진입 리스크 높음. CRI 68+ 예상.',
    },
    {
        id: 'academy_suwon',
        name: '수원 학원 (중간)',
        industryCode: 'academy_general',
        locationName: '수원역 인근',
        lat: 37.2636,
        lng: 127.0031,
        defaultInputs: {
            monthlyRent: 2_500_000,
            deposit: 25_000_000,
            albiCount: 0,
            managerCount: 1,
            monthlyFixedCost: 350_000,
            expectedRevenue: 8_000_000,
        },
        expectedRiskDirection: 'medium',
        expectedHotspotRadius: 500,
        expectedReasonTags: ['residential_district', 'strong_demand', 'young_demographic'],
        manualReviewNote: '배후 세대 충분하고 임대료 합리적. 경쟁 중간 수준. CRI 45~65 예상.',
    },
];
