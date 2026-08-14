'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Api = require('../src/js/api.js');
const { mkMedia, makeFetchStub, pageData, recsData } = require('./fixtures.js');

Api._setGap(0); // no throttling in tests

function install(handlers) {
  const stub = makeFetchStub(handlers);
  global.fetch = stub;
  Api._cache.clear();
  return stub;
}

test('search returns media and passes country only when set', async () => {
  const stub = install({ Search: pageData([mkMedia({ id: 1 })]) });
  const list = await Api.search('nube', 'KR');
  assert.equal(list.length, 1);
  assert.equal(stub.calls[0].op, 'Search');
  assert.equal(stub.calls[0].variables.country, 'KR');
  assert.ok(stub.calls[0].variables.q === 'nube');

  install({ Search: pageData([]) });
  await Api.search('nube', null);
  assert.equal(global.fetch.calls[0].variables.country, undefined);
});

test('recs unwraps nodes and drops null mediaRecommendation', async () => {
  const data = recsData(5, [mkMedia({ id: 6 }), mkMedia({ id: 7 })]);
  data.Media.recommendations.nodes.push({ rating: 1, mediaRecommendation: null });
  install({ Recs: data });
  const list = await Api.recs(5);
  assert.deepEqual(list.map(m => m.id), [6, 7]);
});

test('identical queries hit the cache (single fetch)', async () => {
  const stub = install({ Recs: recsData(5, [mkMedia({ id: 6 })]) });
  await Api.recs(5);
  await Api.recs(5);
  assert.equal(stub.calls.length, 1);
});

test('GraphQL errors surface as thrown Errors', async () => {
  global.fetch = async () => ({
    ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ errors: [{ message: 'Validation: boom' }] })
  });
  Api._cache.clear();
  await assert.rejects(() => Api.recs(1), /Validation: boom/);
});

test('429 is retried once after Retry-After', async () => {
  let n = 0;
  global.fetch = async () => {
    n++;
    if (n === 1) {
      return { ok: false, status: 429, headers: { get: () => '0' }, json: async () => ({}) };
    }
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: recsData(5, [mkMedia({ id: 6 })]) })
    };
  };
  Api._cache.clear();
  const list = await Api.recs(5);
  assert.equal(list.length, 1);
  assert.equal(n, 2);
});

test('pool builds tag OR genre filters, never both', async () => {
  const stub = install({ Pool: pageData([mkMedia({ id: 8 })]) });
  await Api.pool({ tag: 'Slow Burn', genre: 'Romance', cap: 2000 });
  const q = 'tag: $tag';
  assert.ok(stub.calls.length === 1);
  // We can't see the query directly through variables, so re-derive from call body via op record:
  // fixtures records only op+variables; assert variables shape instead.
  assert.equal(stub.calls[0].variables.tag, 'Slow Burn');
  assert.equal(stub.calls[0].variables.genre, undefined);
});

test('vibePick retries an empty page and returns one media', async () => {
  let call = 0;
  install({
    Vibe: () => {
      call++;
      return call === 1 ? pageData([], 2) : pageData([mkMedia({ id: 21 }), mkMedia({ id: 22 })], 2);
    }
  });
  const m = await Api.vibePick({ genre: 'Romance', capMax: 15000 }, () => 0.99);
  assert.ok(m && (m.id === 21 || m.id === 22));
});

test('dailyPick is deterministic for a fixed rng and survives empty pages', async () => {
  let call = 0;
  install({
    Daily: () => {
      call++;
      return call === 1 ? pageData([], 4) : pageData([mkMedia({ id: 31 }), mkMedia({ id: 32 })], 4);
    }
  });
  const rngValues = [0.9, 0.1, 0.0]; // page pick, retry page pick, item pick
  let i = 0;
  const m = await Api.dailyPick(() => rngValues[i++ % rngValues.length]);
  assert.equal(m.id, 31);
});

// --- regression: AniList rejects declared-but-unused variables ---
function capturingFetch() {
  const calls = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.query);
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { Page: { pageInfo: { lastPage: 1 }, media: [] }, Media: { id: 0, recommendations: { nodes: [] } } } })
    };
  };
  Api._cache.clear();
  return calls;
}

function assertNoUnusedVars(query) {
  const m = query.match(/^query \w+\(([^)]*)\)/);
  if (!m) return; // no variables declared at all
  const body = query.slice(m[0].length);
  for (const decl of m[1].split(',')) {
    const name = decl.trim().split(':')[0].trim();
    assert.ok(body.includes(name), `declared ${name} is never used in: ${query}`);
  }
}

test('no operation ever declares an unused variable (AniList strict mode)', async () => {
  const calls = capturingFetch();
  await Api.search('x', null);
  await Api.search('x', 'KR');
  await Api.pool({ cap: 1000, tag: 'Slow Burn', country: 'KR' });
  await Api.pool({ cap: 1000, genre: 'Romance' });
  await Api.pool({ cap: 1000 });
  await Api.vibePick({ capMax: 9000, minScore: 70, genre: 'Romance', tag: 'Slow Burn', format: 'ONE_SHOT', country: 'KR' }, () => 0);
  await Api.vibePick({ capMax: 9000 }, () => 0);
  await Api.dailyPick(() => 0);
  await Api.recs(7);
  assert.ok(calls.length >= 9);
  for (const q of calls) assertNoUnusedVars(q);
});
