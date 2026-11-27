import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'zaribogo-analysis-'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
try {
  for (const file of ['engine/unitEconomics', 'engine/consultingAnalysis', 'engine/analysisEvidence', 'engine/dataMergeRules', 'engine/poiQuery', 'engine/data/industryMatcher', 'ui/consultingReport']) {
    const dest = join(out, `${file}.js`); mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, ts.transpileModule(readFileSync(join(root, 'src', `${file}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  writeFileSync(join(out, 'ui/consultingReport.css'), '');
  const require = createRequire(join(out, 'test.cjs'));
  require.extensions['.css'] = () => {};
  const { calculateUnitEconomics: calc } = require('./engine/unitEconomics.js');
  const { censusNumber, emptyPublicData, populationEvidence } = require('./engine/analysisEvidence.js');
  const { queryPois, industryMatch, distanceMeters } = require('./engine/poiQuery.js');
  const { buildConsultingAnalysis } = require('./engine/consultingAnalysis.js');
  const { consultingReportHtml } = require('./ui/consultingReport.js');
  const base = { rent: 2000000, maintenance: 300000, labor: 3000000, otherFixed: 700000, insurance: 0,
    variableCostRate: 0.4, ownerPay: 3000000, loanAmount: 20000000, annualInterestRate: 6, loanPrincipal: 500000,
    operatingDays: 25, ticketPrice: 8000, expectedRevenue: 20000000, targetProfit: 1200000, availableCash: 1000000, premium: 12000000 };
  test('Operating and cash break-even correctly include variable costs, owner and debt', () => {
    const f = calc(base);
    assert.equal(f.fixedOperatingCosts, 6000000); assert.equal(f.monthlyInterest, 100000);
    assert.equal(f.operatingBreakEven, 10000000); assert.equal(f.cashBreakEven, 16000000);
    assert.equal(f.targetRevenue, 18000000); assert.equal(f.dailyTargetOrders, 90);
    assert.equal(f.scenarios[1].operatingProfit, 6000000); assert.equal(f.scenarios[1].cashAfterOwner, 2400000);
    assert.equal(f.premiumPaybackMonths, 5);
  });
  test('Missing sales do not become invented forecasts', () => {
    const f = calc({ ...base, expectedRevenue: null });
    assert.equal(f.input.expectedRevenue, null); assert.equal(f.revenueDown20Cash, null);
    assert.equal(f.premiumPaybackMonths, null); assert.match(f.scenarios[1].label, /손익분기/);
  });
  test('Zero sales are a real loss scenario, not an industry default', () => {
    const f = calc({ ...base, expectedRevenue: 0 });
    assert.equal(f.scenarios[1].cashAfterOwner, -9600000); assert.equal(f.premiumPaybackMonths, null);
  });
  test('Unknown and 100% variable costs cannot produce viable break-even', () => {
    for (const rate of [null, 1]) assert.equal(calc({ ...base, variableCostRate: rate }).cashBreakEven, null);
    assert.equal(calc({ ...base, variableCostRate: 0 }).cashBreakEven, 9600000);
    assert.throws(() => calc({ ...base, variableCostRate: 1.1 }));
  });
  test('Missing costs remain explicit rather than assumed zero facts', () => {
    const f = calc({ ...base, ownerPay: null, otherFixed: null, loanPrincipal: null, annualInterestRate: null });
    assert.equal(f.missing.length, 4); assert.equal(f.input.ownerPay, null);
    assert.equal(calc({ ...base, otherFixed: 0, ownerPay: 0, loanPrincipal: 0 }).missing.length, 0);
  });
  test('Revenue and variable-cost stress reveal cash risk and runway', () => {
    const f = calc({ ...base, expectedRevenue: 15000000 });
    assert.equal(f.revenueDown20Cash, -2400000);
    assert.equal(f.variableCostUp5Cash, -1350000);
    assert.ok(Math.abs(f.cashRunwayMonths - 1 / 2.4) < 1e-8);
  });
  test('Invalid numeric inputs are rejected', () => {
    for (const patch of [{ rent: -1 }, { labor: NaN }, { rent: Infinity }, { operatingDays: 0 }, { operatingDays: 32 }, { operatingDays: 1.5 }, { ticketPrice: 0 }]) assert.throws(() => calc({ ...base, ...patch }));
  });
  test('Census suppression, malformed and empty values remain unknown; true zero is preserved', () => {
    for (const v of [null, undefined, '', ' ', 'N/A', 'X', '-', '-1', Infinity]) assert.equal(censusNumber(v), null);
    assert.equal(censusNumber('0'), 0); assert.equal(censusNumber('2,400'), 2400);
  });
  test('Households use tot_family, never dwelling counts; geography/year are explicit', () => {
    const p = populationEvidence({ population: { tot_ppltn: '8000', tot_family: '3000', tot_house: '5000' } });
    assert.equal(p.households, 3000); assert.equal(p.geography, 'administrative_dong'); assert.equal(p.referenceYear, 2020);
    assert.equal(populationEvidence({ population: { tot_house: 5000 } }).households, null);
  });
  test('Unavailable feeds never manufacture people or zero-competition claims', () => {
    const data = emptyPublicData(500);
    assert.equal(data.populationEvidence.population, null); assert.equal(data.competitionEvidence.count, null);
    assert.equal(data._sources.population, 'unavailable'); assert.equal(data._sources.competitorsCount, 'unavailable');
  });
  test('Verified radius estimates keep the census year and never become administrative totals', () => {
    const p = populationEvidence({ schemaVersion: 2, population: { adm_cd: '11110690', tot_ppltn: '22000', year: 2024 },
      radiusPopulation: { status: 'estimated', radiusM: 500, population: 6200, households: 2400, cellCount: 20, knownPopulationCells: 20, boundaryCoverage: 1, boundaryYear: 2025 } }, 500);
    assert.equal(p.referenceYear, 2024); assert.equal(p.population, 22000); assert.equal(p.radius.population, 6200);
    assert.equal(p.radius.status, 'estimated'); assert.equal(p.radius.boundaryYear, 2025);
  });
  test('Partial and mismatched radius data cannot masquerade as complete population', () => {
    const value = { status: 'partial', radiusM: 500, population: 9000, knownPopulationEstimate: 8500, cellCount: 20, knownPopulationCells: 19, boundaryCoverage: 1 };
    const partial = populationEvidence({ radiusPopulation: value }, 500).radius;
    assert.equal(partial.population, null); assert.equal(partial.knownPopulationEstimate, 8500);
    const mismatch = populationEvidence({ radiusPopulation: { ...value, status: 'estimated', knownPopulationCells: 20 } }, 300).radius;
    assert.equal(mismatch.status, 'unavailable'); assert.equal(mismatch.population, null);
  });
  test('Radius census year survives an unavailable administrative total', () => {
    const p = populationEvidence({ schemaVersion: 2, referenceYear: 2024, population: null,
      radiusPopulation: { status: 'estimated', radiusM: 500, population: 6200, cellCount: 20, knownPopulationCells: 20, boundaryCoverage: 1 } }, 500);
    assert.equal(p.referenceYear, 2024); assert.equal(p.population, null); assert.equal(p.radius.population, 6200);
  });
  const shop = (overrides = {}) => ({ id: 'a', lat: 37, lng: 127, shopName: '커피', address: '가상주소', majorCode: 'I2', majorName: '음식', middleCode: 'I212', middleName: '카페', subCode: 'I21201', subName: '커피전문점', ...overrides });
  test('All matching categories and keyword candidates are considered without duplicates', () => {
    const shops = [shop(), shop(), shop({ id: 'b', subCode: 'I21001', shopName: '커피 베이커리', subName: '빵집' }), shop({ id: 'c', lat: 37.1 })];
    const q = queryPois(shops, 37, 127, 500, 'cafe_indie_small');
    assert.equal(q.competitorsCount, 2); assert.equal(q.poiTotalCount, 2);
    assert.equal(q.stores[1].match, 'keyword');
  });
  test('Multiple major categories are all searched', () => {
    const q = queryPois([shop({ id: 'a', majorCode: 'S2', subCode: 'S', shopName: '마사지' }), shop({ id: 'b', majorCode: 'Q1', subCode: 'Q', shopName: '마사지' })], 37, 127, 500, 'massage_spa');
    assert.equal(q.competitorsCount, 2);
  });
  test('Unsupported industries remain unsupported; actual zero matches remain valid zero', () => {
    assert.equal(queryPois([shop()], 37, 127, 500, 'unknown').supported, false);
    const zero = queryPois([], 37, 127, 500, 'cafe_indie_small'); assert.equal(zero.supported, true); assert.equal(zero.competitorsCount, 0);
  });
  test('Boundary distances and nearest ordering use real coordinates', () => {
    const d = distanceMeters(37, 127, 37.004, 127);
    assert.ok(d > 444 && d < 446);
    const q = queryPois([shop({ id: 'far', lat: 37.004 }), shop({ id: 'near', lat: 37.001 }), shop({ id: 'out', lat: 37.005 })], 37, 127, 500, 'cafe_indie_small');
    assert.deepEqual(q.stores.map(s => s.id), ['near', 'far']); assert.equal(q.competitorsCount, 2);
  });
  test('Precise beauty services do not count an entire beauty middle category', () => {
    assert.equal(industryMatch(shop({ majorCode: 'S2', middleCode: 'S207', subCode: 'S20702', shopName: '네일샵', subName: '네일' }), 'hair_salon'), null);
  });
  test('Store list is capped while total counts remain complete', () => {
    const q = queryPois(Array.from({ length: 45 }, (_, i) => shop({ id: String(i) })), 37, 127, 500, 'cafe_indie_small');
    assert.equal(q.stores.length, 30); assert.equal(q.competitorsCount, 45);
  });
  test('Consulting does not infer demand or safety from administrative population', () => {
    const data = emptyPublicData(500); data.populationEvidence = populationEvidence({ population: { tot_ppltn: 90000, tot_family: 30000 } });
    const r = buildConsultingAnalysis(base, data, '가상 주소', '카페');
    assert.equal(r.scoreWithheld, true); assert.ok(r.risks.some(s => s.includes('거주인구는 아직 확보되지')));
    assert.ok(r.actions.some(s => s.includes('하루 90건')));
  });
  test('Public strings are escaped in report HTML', () => {
    const r = buildConsultingAnalysis(base, emptyPublicData(500), '<img src=x onerror=alert(1)>', '카페');
    const html = consultingReportHtml(r);
    assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('거주인구: 미확인')); assert.ok(!html.includes('GRADE A'));
  });
  console.log(`${passed} analysis checks passed.`);
} finally { rmSync(out, { recursive: true, force: true }); }
