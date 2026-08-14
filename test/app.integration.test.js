'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { mkMedia, makeFetchStub, pageData, recsData } = require('./fixtures.js');

// --- boot a real DOM from the shipped index.html ---
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.KeyboardEvent = dom.window.KeyboardEvent;

// --- stub AniList before the app loads ---
const seed = mkMedia({ id: 100, popularity: 9000, averageScore: 80, title: { romaji: 'Seed Vein', english: 'Seed Vein', native: '씨앗' } });
const fetchStub = makeFetchStub({
  Search: v => pageData([mkMedia({ id: 900, title: { romaji: 'Found ' + v.q, english: 'Found ' + v.q, native: null } })]),
  Vibe: () => pageData([seed], 2),
  Recs: () => recsData(0, [
    mkMedia({ popularity: 20000, averageScore: 85 }), // over-cap: adjacent material
    mkMedia({ popularity: 1200, averageScore: 74 })
  ]),
  Pool: () => pageData([
    mkMedia({ popularity: 900, averageScore: 79 }),
    mkMedia({ popularity: 700, averageScore: 71 })
  ]),
  Daily: () => pageData([mkMedia({ id: 500, title: { romaji: 'Daily Gem', english: 'Daily Gem', native: null } })], 3)
});
global.fetch = fetchStub;

const Api = require('../src/js/api.js');
Api._setGap(0);
const Store = require('../src/js/store.js');
const App = require('../src/js/app.js');

function waitFor(pred, ms) {
  ms = ms || 2000;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      try { if (pred()) return resolve(); } catch (e) { /* keep polling */ }
      if (Date.now() - t0 > ms) return reject(new Error('waitFor timed out'));
      setTimeout(poll, 10);
    })();
  });
}
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function click(el) { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }

test('boots into the home view with search + all vibes', () => {
  App.init();
  assert.ok($('#seed-input'), 'seed search input missing');
  assert.equal($$('.vibe').length, App.VIBES.length);
});

test('title search renders pickable seed results', async () => {
  $('#seed-input').value = 'nube';
  click($('[data-act="search"]'));
  await waitFor(() => $$('.seed-result').length === 1);
  assert.ok($('.seed-result').textContent.includes('Found nube'));
});

test('a vibe click starts a run: card + branches + depth 0', async () => {
  click($$('.vibe')[0]); // hidden-gem romance manhwa
  await waitFor(() => App.state.view === 'run' && !App.state.busy);
  assert.ok($('.card-title').textContent.includes('Seed Vein'));
  const branches = $$('.branch');
  assert.ok(branches.length >= 1 && branches.length <= 3, 'expected 1-3 branches, got ' + branches.length);
  assert.ok($('.run-depth').textContent.includes('0 m'));
  // deeper branch must exist and be under the cap for this seed/depth
  const deeper = $('.branch-deeper');
  assert.ok(deeper, 'no deeper branch offered');
});

test('choosing a branch descends to 137 m and grows the breadcrumb', async () => {
  click($('.branch'));
  await waitFor(() => App.state.run && App.state.run.depth === 1 && !App.state.busy);
  assert.ok($('.run-depth').textContent.includes('137 m'));
  assert.equal($$('.crumb').length, 2);
});

test('saving the current work lands it in the haul and flips the button', async () => {
  const id = App.state.run.current.id;
  click($('[data-act="save"]'));
  await waitFor(() => Store.inHaul(id));
  assert.ok($('.btn-saved'), 'save button did not flip to saved state');
  assert.equal(App.state.run.savedCount, 1);
});

test('keyboard: S toggles save, digits choose branches', async () => {
  const id = App.state.run.current.id;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
  await waitFor(() => !Store.inHaul(id));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
  await waitFor(() => Store.inHaul(id));

  const depthBefore = App.state.run.depth;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  await waitFor(() => App.state.run.depth === depthBefore + 1 && !App.state.busy);
});

test('Escape surfaces into a summary that records the run', async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitFor(() => App.state.view === 'summary');
  assert.ok($('.summary-line').textContent.includes('274 m'));
  assert.equal(Store.getStats().runs, 1);
  assert.equal(Store.getStats().deepest, 2);
  assert.ok($$('.sum-chain li').length === 3, 'summary chain should list seed + 2 steps');
});

test('haul view lists the saved discovery; remove works', async () => {
  const navHaul = $$('[data-act="tab"]').find(b => b.getAttribute('data-view') === 'haul');
  click(navHaul);
  await waitFor(() => App.state.view === 'haul');
  assert.equal($$('.haul-item').length, 1);
  click($('[data-act="unhaul"]'));
  await waitFor(() => $$('.haul-item').length === 0);
  assert.ok($('.empty'), 'empty state missing after removing last haul item');
});

test('daily gem fetches once, renders, and is cached for the day', async () => {
  const navDaily = $$('[data-act="tab"]').find(b => b.getAttribute('data-view') === 'daily');
  click(navDaily);
  await waitFor(() => App.state.view === 'daily' && !App.state.busy && $('.card-title'));
  assert.ok($('.card-title').textContent.includes('Daily Gem'));
  const dailyCalls = fetchStub.calls.filter(c => c.op === 'Daily').length;

  // leave and come back: must serve from cache, not refetch
  const navHome = $$('[data-act="tab"]').find(b => b.getAttribute('data-view') === 'home');
  click(navHome);
  await waitFor(() => App.state.view === 'home');
  click(navDaily);
  await waitFor(() => App.state.view === 'daily' && $('.card-title'));
  assert.equal(fetchStub.calls.filter(c => c.op === 'Daily').length, dailyCalls, 'daily gem refetched despite cache');
  assert.ok($('.card-title').textContent.includes('Daily Gem'), 'cached daily snapshot lost its title');
});

test('saving the cached daily snapshot keeps its real title (regression)', async () => {
  click($('[data-act="save"]'));
  await waitFor(() => Store.inHaul(500));
  const entry = Store.getHaul().find(e => e.media.id === 500);
  assert.equal(entry.media.title, 'Daily Gem');
  assert.equal(entry.via, 'daily');
});

test('atlas shows stats, mined veins, and dark territory', async () => {
  const navAtlas = $$('[data-act="tab"]').find(b => b.getAttribute('data-view') === 'atlas');
  click(navAtlas);
  await waitFor(() => App.state.view === 'atlas');
  assert.ok($$('.atlas-bar-row').length > 0, 'no mined veins shown');
  assert.ok($$('.tag-dark').length > 0, 'no dark territory shown');
  assert.ok($('.stat-n').textContent.trim() === '1', 'descent count wrong');
});

test('no work ever repeats: everything visited is in the seen set', () => {
  const seen = Store.seenSet();
  assert.ok(seen.size >= 3, 'seen set too small: ' + seen.size);
  assert.ok(seen.has(100), 'seed not marked seen');
});

test('re-dive: a haul snapshot can seed a brand-new descent', async () => {
  // daily gem (id 500) is in the haul from the earlier test
  const navHaul = $$('[data-act="tab"]').find(b => b.getAttribute('data-view') === 'haul');
  click(navHaul);
  await waitFor(() => App.state.view === 'haul' && $('[data-act="redive"]'));
  click($('[data-act="redive"]'));
  await waitFor(() => App.state.view === 'run' && !App.state.busy);
  assert.equal(App.state.run.seed.id, 500);
  assert.ok($('.card-title').textContent.includes('Daily Gem'), 'snapshot seed lost its title in the run card');
  assert.ok($$('.branch').length >= 1, 'no branches generated from a snapshot seed');
});
