'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// In-memory localStorage shim, installed before the module loads.
function freshLocalStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  };
}
global.localStorage = freshLocalStorage();

const Store = require('../src/js/store.js');
const { mkMedia } = require('./fixtures.js');

test.beforeEach(() => { global.localStorage.clear(); });

test('haul: add, dedupe, query, remove', () => {
  const m = mkMedia({ id: 7 });
  assert.equal(Store.addToHaul(m, { depth: 3 }), true);
  assert.equal(Store.addToHaul(m, { depth: 5 }), false, 'duplicate add should be rejected');
  assert.equal(Store.getHaul().length, 1);
  assert.equal(Store.inHaul(7), true);
  assert.equal(Store.getHaul()[0].depth, 3);
  assert.equal(Store.getHaul()[0].media.title, 'Test Title 7');
  Store.removeFromHaul(7);
  assert.equal(Store.inHaul(7), false);
});

test('snapshot keeps only safe, small fields', () => {
  const s = Store.snapshot(mkMedia({ id: 9 }));
  assert.equal(s.id, 9);
  assert.ok(s.url.includes('anilist.co'));
  assert.ok(Array.isArray(s.tags) && typeof s.tags[0] === 'string');
  assert.equal(s.description, undefined, 'descriptions should not be persisted');
});

test('seen set persists and resets', () => {
  Store.markSeen(1); Store.markSeen(2); Store.markSeen(1);
  assert.deepEqual([...Store.seenSet()].sort(), [1, 2]);
  Store.resetSeen();
  assert.equal(Store.seenSet().size, 0);
});

test('atlas counts tags and genres', () => {
  Store.bumpAtlas(mkMedia({ genres: ['Romance'], tags: [{ name: 'Slow Burn', rank: 80 }] }));
  Store.bumpAtlas(mkMedia({ genres: ['Romance', 'Drama'], tags: [{ name: 'Slow Burn', rank: 70 }] }));
  assert.equal(Store.atlasTags()['Slow Burn'], 2);
  assert.equal(Store.atlasGenres()['Romance'], 2);
  assert.equal(Store.atlasGenres()['Drama'], 1);
});

test('stats: runs, deepest, visited', () => {
  Store.recordVisit(); Store.recordVisit();
  Store.recordRun(4); Store.recordRun(2);
  const s = Store.getStats();
  assert.equal(s.runs, 2);
  assert.equal(s.deepest, 4);
  assert.equal(s.visited, 2);
});

test('settings patch-merge', () => {
  Store.setSettings({ country: 'KR' });
  assert.equal(Store.getSettings().country, 'KR');
  Store.setSettings({ other: 1 });
  assert.equal(Store.getSettings().country, 'KR');
});

test('daily cache is keyed by date', () => {
  const m = mkMedia({ id: 11 });
  Store.setDaily('2026-08-13', m);
  assert.equal(Store.getDaily('2026-08-13').id, 11);
  assert.equal(Store.getDaily('2026-08-14'), null);
});

test('store survives corrupted localStorage payloads', () => {
  global.localStorage.setItem('madriguera:haul', '{not json');
  assert.deepEqual(Store.getHaul(), []);
});
