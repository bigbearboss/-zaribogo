import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'zaribogo-population-'));
let passed = 0;
const test = async (name, run) => { await run(); console.log(`PASS ${name}`); passed++; };
try {
  for (const name of ['handler', 'spatial']) {
    const source = readFileSync(join(root, 'supabase/functions/sgis-context-v2', `${name}.ts`), 'utf8');
    writeFileSync(join(out, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('./spatial.ts', './spatial.js'));
  }
  const require = createRequire(join(out, 'test.cjs'));
  const { estimateRadiusPopulation: estimate } = require('./spatial.js');
  const { createPopulationHandler } = require('./handler.js');
  const code = '11110690010024';
  const square = (id, x1, y1, x2, y2) => ({ properties: { adm_cd: id }, geometry: { type: 'Polygon', coordinates: [[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]] } });
  const feature = square(code, -1000, -1000, 1000, 1000);
  await test('Circle intersections estimate area-weighted census totals with honest spatial bounds', () => {
    const result = estimate([feature], [{ adm_cd: code, tot_ppltn: '1000', tot_family: '400' }], 0, 0, 500);
    assert.equal(result.status, 'estimated'); assert.equal(result.population, 196); assert.equal(result.households, 79);
    assert.deepEqual(result.spatialBounds, { minimum: 0, maximum: 1000 }); assert.ok(result.boundaryCoverage > 0.999);
  });
  await test('Suppressed cells and uncovered areas withhold the radius total', () => {
    const hidden = estimate([feature], [{ adm_cd: code, tot_ppltn: 'N/A', tot_family: '3' }], 0, 0, 500);
    assert.equal(hidden.status, 'partial'); assert.equal(hidden.population, null); assert.equal(hidden.households, null);
    assert.equal(hidden.knownPopulationEstimate, null); assert.equal(hidden.knownHouseholdEstimate, 1);
    const uncovered = estimate([square(code, -20, -20, 20, 20)], [{ adm_cd: code, tot_ppltn: '100' }], 0, 0, 500);
    assert.equal(uncovered.population, null); assert.ok(uncovered.boundaryCoverage < 0.01);
  });
  await test('Duplicate boundaries are not counted twice; a real zero is kept', () => {
    const result = estimate([feature, feature], [{ adm_cd: code, tot_ppltn: '0', tot_family: '0' }], 0, 0, 500);
    assert.equal(result.cellCount, 1); assert.equal(result.population, 0); assert.equal(result.status, 'estimated');
  });
  await test('Holes and multipolygons subtract unoccupied geometry without phantom area', () => {
    const outer = feature.geometry.coordinates[0], hole = square('unused', -100,-100,100,100).geometry.coordinates[0];
    const ring = { properties: { adm_cd: code }, geometry: { type: 'MultiPolygon', coordinates: [[outer, hole]] } };
    const result = estimate([ring], [{ adm_cd: code, tot_ppltn: '1000' }], 0, 0, 500);
    assert.equal(result.status, 'partial'); assert.ok(result.boundaryCoverage < 0.96);
    assert.throws(() => estimate([{ ...feature, properties: { adm_cd: '11110690' } }], [], 0, 0, 500));
  });
  const calls = [];
  const mockFetch = async url => {
    const u = new URL(url); calls.push(u);
    let result;
    if (u.pathname.endsWith('authentication.json')) result = { accessToken: 'private-server-token' };
    else if (u.pathname.endsWith('data.json')) result = { lin_yr: '2024', loa_yr: '2025' };
    else if (u.pathname.endsWith('transcoord.json')) result = { posX: 0, posY: 0 };
    else if (u.pathname.endsWith('findcodeinsmallarea.json')) result = { sido_cd: '11', sgg_cd: '110', emdong_cd: '690', emdong_nm: '상계5동' };
    else if (u.pathname.endsWith('population.json')) result = [{ adm_cd: u.searchParams.get('low_search') === '1' ? code : '11110690', tot_ppltn: '1000', tot_family: '400', tot_house: '999' }];
    else if (u.pathname.endsWith('userarea.geojson')) return Response.json({ errCd: 0, features: [feature] });
    else throw new Error(`Unexpected endpoint: ${u.pathname}`);
    return Response.json({ errCd: 0, result });
  };
  const handler = createPopulationHandler({ env: name => name.includes('CONSUMER') ? 'private-test-secret' : undefined, fetch: mockFetch });
  const url = 'https://example.test?lat=37.66&lng=127.07&radius=500';
  await test('Latest available census year and full administrative code flow through every request', async () => {
    const response = await handler(new Request(url)); const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.population.year, 2024); assert.equal(body.regionMeta.adm_cd, '11110690');
    assert.equal(body.radiusPopulation.population, 196); assert.equal(body.boundaryYear, 2025);
    assert.ok(calls.filter(c => c.pathname.endsWith('population.json')).every(c => c.searchParams.get('year') === '2024'));
    assert.ok(!JSON.stringify(body).includes('private-'));
    await handler(new Request(url)); assert.equal(calls.filter(c => c.pathname.endsWith('authentication.json')).length, 1);
  });
  await test('Missing, out-of-country and invalid input is rejected before any upstream request', async () => {
    const count = calls.length;
    for (const query of ['', '?lat=&lng=127', '?lat=0&lng=127', '?lat=37&lng=127&radius=50000']) assert.equal((await handler(new Request('https://example.test'+query))).status, 400);
    assert.equal((await handler(new Request(url, { method: 'POST' }))).status, 405);
    assert.equal(calls.length, count);
  });
  await test('A missing district match cannot silently select the first census row', async () => {
    const h = createPopulationHandler({ env: name => name.includes('CONSUMER') ? 'test' : undefined, fetch: async (url, options) => {
      const u = new URL(url);
      if (u.pathname.endsWith('population.json') && u.searchParams.get('low_search') === '0') return Response.json({ errCd: 0, result: [{ adm_cd: 'wrong-area', tot_ppltn: '999999' }] });
      return mockFetch(url, options);
    } });
    const body = await (await h(new Request(url))).json(); assert.equal(body.population, null); assert.ok(body.warnings.includes('SGIS_AREA_MISMATCH'));
  });
  await test('Unknown latest year fails explicitly and upstream secrets are never echoed', async () => {
    const h = createPopulationHandler({ env: name => name.includes('CONSUMER') ? 'test' : undefined, fetch: async url => {
      if (new URL(url).pathname.endsWith('data.json')) return Response.json({ errCd: 0, result: { lin_yr: 'N/A' } });
      return mockFetch(url);
    } });
    const response = await h(new Request(url)); assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'SGIS_YEAR_UNAVAILABLE');
  });
  console.log(`${passed} population checks passed.`);
} finally { rmSync(out, { recursive: true, force: true }); }
