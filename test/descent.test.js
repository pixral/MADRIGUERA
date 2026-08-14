'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/js/descent.js');
const { mkMedia } = require('./fixtures.js');

const rng0 = () => 0; // deterministic wildcard: always first candidate

test('buildBranches returns at most 3 branches with unique media', () => {
  const current = mkMedia({ id: 1 });
  const recs = [mkMedia({ id: 2, popularity: 9000 }), mkMedia({ id: 3, popularity: 800 })];
  const pool = [mkMedia({ id: 4, popularity: 600 }), mkMedia({ id: 5, popularity: 700 })];
  const branches = D.buildBranches({ current, recs, pool, cap: 2000, rng: rng0 });
  assert.ok(branches.length <= 3);
  const ids = branches.map(b => b.media.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate media across branches');
  assert.ok(!ids.includes(1), 'current node offered as a branch');
});

test('deeper branch respects the popularity cap and picks the best gem', () => {
  const current = mkMedia({ id: 1 });
  const recs = [
    mkMedia({ id: 2, popularity: 50000, averageScore: 85 }), // over cap
    mkMedia({ id: 3, popularity: 1500, averageScore: 74 })
  ];
  const pool = [mkMedia({ id: 4, popularity: 900, averageScore: 79 })];
  const branches = D.buildBranches({ current, recs, pool, cap: 2000, rng: rng0 });
  const deeper = branches.find(b => b.kind === 'deeper');
  assert.ok(deeper, 'no deeper branch');
  assert.ok(deeper.media.popularity <= 2000);
  assert.equal(deeper.media.id, 4, 'expected the highest gem score under the cap');
});

test('adjacent branch is the strongest remaining recommendation', () => {
  const current = mkMedia({ id: 1 });
  const recs = [
    mkMedia({ id: 2, popularity: 50000 }),  // top-rated rec, over cap → adjacent
    mkMedia({ id: 3, popularity: 1000 })    // becomes deeper
  ];
  const branches = D.buildBranches({ current, recs, pool: [], cap: 2000, rng: rng0 });
  const adjacent = branches.find(b => b.kind === 'adjacent');
  assert.ok(adjacent);
  assert.equal(adjacent.media.id, 2);
});

test('seen media, adult media, and null entries are excluded', () => {
  const current = mkMedia({ id: 1 });
  const recs = [
    mkMedia({ id: 2, isAdult: true }),
    mkMedia({ id: 3 }),
    null
  ].filter(() => true);
  const pool = [mkMedia({ id: 4 })];
  const seenIds = new Set([3, 4]);
  const branches = D.buildBranches({ current, recs, pool, seenIds, cap: 100000, rng: rng0 });
  const ids = branches.map(b => b.media.id);
  assert.ok(!ids.includes(2), 'adult media leaked into branches');
  assert.ok(!ids.includes(3) && !ids.includes(4), 'seen media leaked into branches');
});

test('empty inputs produce zero branches (dead end)', () => {
  const branches = D.buildBranches({ current: mkMedia({ id: 1 }), recs: [], pool: [], cap: 2000 });
  assert.equal(branches.length, 0);
});

test('pickTopTag skips generic and spoiler tags, prefers highest rank', () => {
  const m = mkMedia({
    tags: [
      { name: 'Female Protagonist', rank: 95, isMediaSpoiler: false }, // generic
      { name: 'Time Loop', rank: 80, isMediaSpoiler: true },           // spoiler
      { name: 'Slow Burn', rank: 75, isMediaSpoiler: false },
      { name: 'Office Romance', rank: 82, isMediaSpoiler: false }
    ]
  });
  assert.equal(D.pickTopTag(m), 'Office Romance');
});

test('pickTopTag returns null when nothing usable remains', () => {
  assert.equal(D.pickTopTag(mkMedia({ tags: [] })), null);
  assert.equal(D.pickTopTag(mkMedia({ tags: [{ name: '4-koma', rank: 90 }] })), null);
  assert.equal(D.pickTopTag(null), null);
});
