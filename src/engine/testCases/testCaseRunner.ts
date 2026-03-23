/**
 * testCaseRunner.ts
 * ─────────────────────────────────────────────────────────────────────
 * Automated validation runner for RISK-X accuracy testing.
 * Activated only in /?mode=test context via isTestRunnerActive().
 *
 * Entry point: TestCaseRunner.runAll()
 */

import { RiskEngine } from '../RiskEngine';
import type { FinancialData, MarketData, CompetitionData, StabilityData } from '../types';
import { CsvDatasetProvider } from '../CsvDatasetProvider';
import { PublicDataFetcher } from '../PublicDataFetcher';
import { RealPublicDataProvider } from '../RealPublicDataProvider';
import {
    TEST_CASES,
    criToDirection,
    type ValidationTestCase,
    type RiskDirection,
} from './testCases';

// ──────────────────────────────────────────────────────────────
// Result type
// ──────────────────────────────────────────────────────────────
export interface TestCaseResult {
    id: string;
    name: string;
    // Actual measured values
    actualCri: number;
    actualRiskTier: string;
    actualRiskDirection: RiskDirection;
    actualHotspotRadius: number;
    overallConfidence: number;
    // Expected values
    expectedRiskDirection: RiskDirection;
    expectedHotspotRadius: number | null;
    expectedReasonTags: string[];
    // Comparison
    directionMatch: boolean;
    radiusMatch: boolean;
    pass: boolean;
    durationMs: number;
    manualReviewNote: string;
    error?: string;
}

// ──────────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────────
export class TestCaseRunner {
    private csvProvider: CsvDatasetProvider;
    private defaultRadius = 500;

    constructor() {
        this.csvProvider = new CsvDatasetProvider();
    }

    /** Run a single test case and return a result object. */
    async runCase(tc: ValidationTestCase): Promise<TestCaseResult> {
        const t0 = performance.now();

        try {
            // 1. Ensure regional CSV is loaded for this location
            await this.csvProvider.loadForLocation(tc.lat, tc.lng);

            // 2. Query CSV for competitor data
            const location = { lat: tc.lat, lng: tc.lng };
            const csvResult = await this.csvProvider.queryRadius(
                location,
                this.defaultRadius,
                tc.industryCode
            );

            // 3. Fetch public data
            const fetcher = new PublicDataFetcher(new RealPublicDataProvider());
            const publicData = await fetcher.fetchByRadius(location, this.defaultRadius, tc.industryCode);

            // 4. Merge CSV data into publicData (CSV wins for spatial metrics)
            publicData.competitorsCount = csvResult.competitorsCount;
            publicData.poiTotalCount = csvResult.poiTotalCount;
            publicData.diversityIndex = csvResult.diversityIndex;

            // 5. Build engine inputs from testCase defaultInputs
            const inp = tc.defaultInputs;
            const financial: FinancialData = {
                industryCode: tc.industryCode,
                monthlyRevenue: inp.expectedRevenue,
                rent: inp.monthlyRent,
                maintenanceFee: inp.monthlyFixedCost,
                deposit: inp.deposit,
                premium: 0,
                area: 30,
                floor: '1',
                hasParking: false,
                hasInsurance: false,
                insuranceFee: 0,
                debtService: 0,
                operatingExpenses: inp.monthlyFixedCost,
                cashBufferMonths: 3,
                albiCount: inp.albiCount,
                managerCount: inp.managerCount,
                laborCost: (inp.albiCount * 1_500_000) + (inp.managerCount * 2_800_000),
            };

            const market: MarketData = {
                householdCount: publicData.households,
                officeBuildingCount: 2,
                competitorCount: publicData.competitorsCount,
                competitorRadius: this.defaultRadius / 1000,
                marketActivity: '보통',
                footTrafficScore: 50,
                demographicGrowthRate: 0,
                vacancyRate: 0.05,
            };

            const competition: CompetitionData = {
                competitorProximity: publicData.competitorsCount > 5 ? 0.6 : 0.3,
                marketSaturationIndex: Math.min(1, publicData.competitorsCount / 20),
                pricingPower: 0.5,
            };

            const stability: StabilityData = {
                leaseRemainingYears: 2,
                ownershipStructure: 'Leased',
                regulatoryRiskIndex: 0.1,
            };

            // 6. Run RiskEngine
            const analysis = RiskEngine.analyze(financial, market, competition, stability, publicData);

            const actualDirection = criToDirection(analysis.cri);
            const directionMatch = actualDirection === tc.expectedRiskDirection;
            const radiusMatch = tc.expectedHotspotRadius === null ||
                tc.expectedHotspotRadius === this.defaultRadius;

            return {
                id: tc.id,
                name: tc.name,
                actualCri: analysis.cri,
                actualRiskTier: analysis.riskTier,
                actualRiskDirection: actualDirection,
                actualHotspotRadius: this.defaultRadius,
                overallConfidence: analysis.overallConfidence ?? 0,
                expectedRiskDirection: tc.expectedRiskDirection,
                expectedHotspotRadius: tc.expectedHotspotRadius,
                expectedReasonTags: tc.expectedReasonTags,
                directionMatch,
                radiusMatch,
                pass: directionMatch && radiusMatch,
                durationMs: Math.round(performance.now() - t0),
                manualReviewNote: tc.manualReviewNote,
            };

        } catch (err: any) {
            return {
                id: tc.id,
                name: tc.name,
                actualCri: -1,
                actualRiskTier: 'ERROR',
                actualRiskDirection: 'medium',
                actualHotspotRadius: this.defaultRadius,
                overallConfidence: 0,
                expectedRiskDirection: tc.expectedRiskDirection,
                expectedHotspotRadius: tc.expectedHotspotRadius,
                expectedReasonTags: tc.expectedReasonTags,
                directionMatch: false,
                radiusMatch: false,
                pass: false,
                durationMs: Math.round(performance.now() - t0),
                manualReviewNote: tc.manualReviewNote,
                error: err?.message ?? String(err),
            };
        }
    }

    /** Run all 10 test cases sequentially. Reports progress via callback. */
    async runAll(
        onProgress?: (idx: number, total: number, result: TestCaseResult) => void
    ): Promise<TestCaseResult[]> {
        const results: TestCaseResult[] = [];
        for (let i = 0; i < TEST_CASES.length; i++) {
            const result = await this.runCase(TEST_CASES[i]);
            results.push(result);
            onProgress?.(i + 1, TEST_CASES.length, result);
        }
        return results;
    }

    // ──────────────────────────────────────────────────────────
    // UI rendering
    // ──────────────────────────────────────────────────────────

    /** Render results into a DOM element as an HTML table. */
    static renderResultTable(results: TestCaseResult[], container: HTMLElement): void {
        const passed = results.filter(r => r.pass).length;
        const avgConf = results.reduce((s, r) => s + r.overallConfidence, 0) / results.length;
        const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;

        const passBg = (r: TestCaseResult) => r.pass ? '#1a3a1a' : (r.error ? '#3a1a1a' : '#3a2a1a');

        container.innerHTML = `
            <div class="test-runner-summary">
                <span class="test-pass-count">${passed} / ${results.length} PASSED</span>
                <span class="test-meta">avg confidence: ${(avgConf * 100).toFixed(0)}%  ·  avg duration: ${avgMs.toFixed(0)}ms</span>
            </div>
            <table class="test-runner-table">
                <thead>
                    <tr>
                        <th>ID</th><th>케이스명</th><th>CRI</th>
                        <th>실제방향</th><th>예상방향</th>
                        <th>방향일치</th><th>반경</th>
                        <th>신뢰도</th><th>시간</th><th>Pass</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(r => `
                    <tr style="background:${passBg(r)}">
                        <td><code>${r.id}</code></td>
                        <td>${r.name}</td>
                        <td><strong>${r.actualCri < 0 ? 'ERR' : r.actualCri}</strong></td>
                        <td class="dir-${r.actualRiskDirection}">${r.actualRiskDirection}</td>
                        <td class="dir-${r.expectedRiskDirection}">${r.expectedRiskDirection}</td>
                        <td>${r.directionMatch ? '✅' : '❌'}</td>
                        <td>${r.actualHotspotRadius}m</td>
                        <td>${r.error ? '—' : (r.overallConfidence * 100).toFixed(0) + '%'}</td>
                        <td>${r.durationMs}ms</td>
                        <td>${r.pass ? '✅' : (r.error ? '🔴' : '⚠️')}</td>
                    </tr>
                    <tr style="background:${passBg(r)}">
                        <td colspan="10" class="test-note">
                            <em>${r.error ? '❌ Error: ' + r.error : r.manualReviewNote}</em>
                            ${r.expectedReasonTags.map(t => `<span class="reason-tag">${t}</span>`).join('')}
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Also log to console for test_runner mode
        console.group('[TestRunner] Validation Results');
        results.forEach(r => {
            const icon = r.pass ? '✅' : (r.error ? '🔴' : '⚠️');
            console.log(`${icon} [${r.id}] CRI=${r.actualCri} dir=${r.actualRiskDirection}→${r.expectedRiskDirection} conf=${(r.overallConfidence * 100).toFixed(0)}% ${r.durationMs}ms`);
        });
        console.log(`TOTAL: ${passed}/${results.length} passed | avg ${avgMs.toFixed(0)}ms | avg confidence ${(avgConf * 100).toFixed(0)}%`);
        console.groupEnd();
    }
}
