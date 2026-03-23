/**
 * dataMergeRules.ts
 * ──────────────────────────────────────────────────────────────
 * Single source of truth for:
 *  - Data source type definitions   (DataSource enum)
 *  - Merge priority ordering        (SOURCE_PRIORITY_ORDER)
 *  - Confidence weight per source   (SOURCE_CONFIDENCE_WEIGHTS)
 *  - Per-metric merge rules         (METRIC_MERGE_RULES)
 *  - Overall quality label bands    (QUALITY_THRESHOLDS)
 *  - Helper functions               (calcCardConfidence, computeFallbackState)
 */

import type { PublicDataResult } from "./types";

// ──────────────────────────────────────────────────────────────
// 1. DataSource enum — source type identifiers only
//    (Priority and weights are defined separately below)
// ──────────────────────────────────────────────────────────────
export enum DataSource {
    USER_INPUT = "user_input",
    PUBLIC_DATA = "public_data",

    // Derived subtypes — extensible for specific provenance tracking
    DERIVED = "derived",               // generic derived
    DERIVED_FROM_CSV = "derived_from_csv",      // computed from local CSV dataset
    DERIVED_FROM_PUBLIC = "derived_from_public",   // computed from a real API response

    INDUSTRY_DEFAULT = "industry_default",
    ESTIMATED = "estimated",
}

// ──────────────────────────────────────────────────────────────
// 2. Source merge priority (higher index = lower priority)
//    Used when multiple sources provide the same metric.
// ──────────────────────────────────────────────────────────────
export const SOURCE_PRIORITY_ORDER: DataSource[] = [
    DataSource.USER_INPUT,
    DataSource.PUBLIC_DATA,
    DataSource.DERIVED_FROM_PUBLIC,
    DataSource.DERIVED_FROM_CSV,
    DataSource.DERIVED,
    DataSource.INDUSTRY_DEFAULT,
    DataSource.ESTIMATED,
];

// ──────────────────────────────────────────────────────────────
// 3. Confidence weight per source (0.0 – 1.0)
//    Used to compute card-level and overall confidence scores.
// ──────────────────────────────────────────────────────────────
export const SOURCE_CONFIDENCE_WEIGHTS: Record<DataSource, number> = {
    [DataSource.USER_INPUT]: 1.0,
    [DataSource.PUBLIC_DATA]: 1.0,
    [DataSource.DERIVED_FROM_PUBLIC]: 0.8,
    [DataSource.DERIVED_FROM_CSV]: 0.75,
    [DataSource.DERIVED]: 0.65,
    [DataSource.INDUSTRY_DEFAULT]: 0.45,
    [DataSource.ESTIMATED]: 0.25,
};

// ──────────────────────────────────────────────────────────────
// 4. Per-metric merge rules
// ──────────────────────────────────────────────────────────────
export type Criticality = "high" | "medium" | "low";

export interface MetricMergeRule {
    /** The PublicDataResult field this rule governs */
    metric: keyof PublicDataResult;
    /** Preferred source in ideal data supply scenario */
    preferredSource: DataSource;
    /** Ordered fallback sources to try when preferred source is unavailable */
    fallbackSources: DataSource[];
    /** Weight contribution to card confidence score (sum across all rules = 1.0) */
    confidenceWeight: number;
    /**
     * Importance of this metric in risk analysis.
     * high   → missing value significantly impacts analysis accuracy
     * medium → moderately impacts result quality
     * low    → supplementary; absence tolerable
     */
    criticality: Criticality;
    /** When the active source matches any of these, the UI shows an "estimated" badge */
    isEstimatedWhen: DataSource[];
}

export const METRIC_MERGE_RULES: MetricMergeRule[] = [
    {
        metric: 'competitorsCount',
        preferredSource: DataSource.PUBLIC_DATA,
        fallbackSources: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
        confidenceWeight: 0.30,
        criticality: "high",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'poiTotalCount',
        preferredSource: DataSource.PUBLIC_DATA,
        fallbackSources: [DataSource.DERIVED_FROM_CSV, DataSource.INDUSTRY_DEFAULT],
        confidenceWeight: 0.20,
        criticality: "high",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'diversityIndex',
        preferredSource: DataSource.DERIVED_FROM_CSV,
        fallbackSources: [DataSource.DERIVED, DataSource.INDUSTRY_DEFAULT],
        confidenceWeight: 0.15,
        criticality: "medium",
        isEstimatedWhen: [DataSource.DERIVED, DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'households',
        preferredSource: DataSource.PUBLIC_DATA,
        fallbackSources: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
        confidenceWeight: 0.10,
        criticality: "high",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'population',
        preferredSource: DataSource.PUBLIC_DATA,
        fallbackSources: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
        confidenceWeight: 0.10,
        criticality: "medium",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'districtPoiCount',
        preferredSource: DataSource.PUBLIC_DATA,
        fallbackSources: [DataSource.ESTIMATED],
        confidenceWeight: 0.05,
        criticality: "low",
        isEstimatedWhen: [DataSource.ESTIMATED],
    },
    {
        metric: 'ageShare20_39',
        preferredSource: DataSource.INDUSTRY_DEFAULT,
        fallbackSources: [DataSource.ESTIMATED],
        confidenceWeight: 0.05,
        criticality: "low",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
    {
        metric: 'volatilityProxy',
        preferredSource: DataSource.INDUSTRY_DEFAULT,
        fallbackSources: [DataSource.ESTIMATED],
        confidenceWeight: 0.05,
        criticality: "medium",
        isEstimatedWhen: [DataSource.INDUSTRY_DEFAULT, DataSource.ESTIMATED],
    },
];

// ──────────────────────────────────────────────────────────────
// 5. Overall data quality label thresholds
//    Applied to the weighted-average confidence score (0.0–1.0).
// ──────────────────────────────────────────────────────────────
export const QUALITY_THRESHOLDS = {
    /** Minimum confidence score for "high" quality label */
    HIGH: 0.80,
    /** Minimum confidence score for "medium" quality label */
    MEDIUM: 0.55,
    /** Below MEDIUM → "low" quality label */
} as const;

export type DataQualityLabel = "high" | "medium" | "low";

export function getQualityLabel(confidenceScore: number): DataQualityLabel {
    if (confidenceScore >= QUALITY_THRESHOLDS.HIGH) return "high";
    if (confidenceScore >= QUALITY_THRESHOLDS.MEDIUM) return "medium";
    return "low";
}

// ──────────────────────────────────────────────────────────────
// 6. Card-level confidence calculation
// ──────────────────────────────────────────────────────────────
/**
 * Computes the weighted confidence score for a set of metrics.
 * @param sourcesMap  - current source for each metric key
 * @param cardMetrics - which metrics belong to this evidence card
 * @returns confidence score in [0, 1]
 */
export function calcCardConfidence(
    sourcesMap: Partial<Record<string, string>>,
    cardMetrics: Array<keyof PublicDataResult>
): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const rule of METRIC_MERGE_RULES) {
        if (!cardMetrics.includes(rule.metric)) continue;
        const src = (sourcesMap[rule.metric] ?? DataSource.ESTIMATED) as DataSource;
        const weight = SOURCE_CONFIDENCE_WEIGHTS[src] ?? SOURCE_CONFIDENCE_WEIGHTS[DataSource.ESTIMATED];
        weightedSum += weight * rule.confidenceWeight;
        totalWeight += rule.confidenceWeight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ──────────────────────────────────────────────────────────────
// 7. Fallback state computation
// ──────────────────────────────────────────────────────────────
export interface FallbackState {
    /** Whether any metric is using estimated/default data → show estimation banner */
    hasEstimatedMetric: boolean;
    /** Which metrics are in estimated state (for debugging / UI tooltip) */
    estimatedMetrics: string[];
    /** Which metrics are high-criticality AND estimated (for strong warnings) */
    criticalFallbackMetrics: string[];
    /** Overall data quality label for the analysis */
    dataQualityLabel: DataQualityLabel;
    /** Overall weighted confidence score [0, 1] */
    overallConfidence: number;
}

/**
 * Computes fallback state from current metric source map.
 * @param sourcesMap - Partial record of metric → DataSource string
 */
export function computeFallbackState(
    sourcesMap: Partial<Record<string, string>>
): FallbackState {
    const estimatedMetrics: string[] = [];
    const criticalFallbackMetrics: string[] = [];

    for (const rule of METRIC_MERGE_RULES) {
        const src = (sourcesMap[rule.metric] ?? DataSource.ESTIMATED) as DataSource;
        const isEstimated = rule.isEstimatedWhen.includes(src);
        if (isEstimated) {
            estimatedMetrics.push(rule.metric as string);
            if (rule.criticality === "high") {
                criticalFallbackMetrics.push(rule.metric as string);
            }
        }
    }

    const allMetrics = METRIC_MERGE_RULES.map(r => r.metric);
    const overallConfidence = calcCardConfidence(sourcesMap, allMetrics);
    const dataQualityLabel = getQualityLabel(overallConfidence);

    return {
        hasEstimatedMetric: estimatedMetrics.length > 0,
        estimatedMetrics,
        criticalFallbackMetrics,
        dataQualityLabel,
        overallConfidence,
    };
}
