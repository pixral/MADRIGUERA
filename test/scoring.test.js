'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/js/scoring.js');

test('obscurity is 1 for missing/zero popularity', () => {
  assert.equal(S.obscurity(0), 1);
  assert.equal(S.obscurity(null), 1);
  assert.equal(S.obscurity(undefined), 1);
});

test('obscurity decreases monotonically with popularity and stays in [0,1]', () => {
  const pops = [50, 100, 500, 2000, 8000, 30000, 100000, 500000, 5000000];
  let prev = Infinity;
  for (const p of pops) {
    const o = S.obscurity(p);
    assert.ok(o >= 0 && o <= 1, `obscurity(${p})=${o} out of range`);
    assert.ok(o <= prev, `obscurity not monotonic at ${p}`);
    prev = o;
  }
  assert.equal(S.obscurity(50), 1);       // fully obscure
  assert.equal(S.obscurity(5000000), 0);  // fully mainstream
});

test('gemScore favors the obscure work at equal quality', () => {
  const obscure = { averageScore: 78, popularity: 1500 };
  const popular = { averageScore: 78, popularity: 400000 };
  assert.ok(S.gemScore(obscure) > S.gemScore(popular));
});

test('gemScore can rank a good obscure work above a slightly better hit', () => {
  const gem = { averageScore: 78, popularity: 2000 };
  const hit = { averageScore: 84, popularity: 450000 };
  assert.ok(S.gemScore(gem) > S.gemScore(hit));
});

test('gemScore handles missing score with a neutral default', () => {
  const g = S.gemScore({ popularity: 1000 });
  assert.ok(g > 0 && g <= 100);
});

test('depthCap shrinks with depth and never drops below the floor', () => {
  const seed = 40000;
  let prev = Infinity;
  for (let d = 0; d <= 12; d++) {
    const cap = S.depthCap(seed, d);
    assert.ok(cap <= prev, `cap grew at depth ${d}`);
    assert.ok(cap >= 300, `cap below floor at depth ${d}`);
    prev = cap;
  }
  assert.equal(S.depthCap(seed, 30), 300);
});

test('depthCap tolerates tiny/missing seed popularity', () => {
  assert.ok(S.depthCap(0, 0) >= 2000);
  assert.ok(S.depthCap(50, 0) >= 2000);
});

test('obscurityTier gives sensible labels', () => {
  assert.equal(S.obscurityTier(500000), 'Mainstream');
  assert.equal(S.obscurityTier(50000), 'Well-known');
  assert.equal(S.obscurityTier(10000), 'Under the radar');
  assert.equal(S.obscurityTier(3000), 'Deep cut');
  assert.equal(S.obscurityTier(800), 'Buried treasure');
  assert.equal(S.obscurityTier(120), 'Bottom of the burrow');
  assert.equal(S.obscurityTier(0), 'Bottom of the burrow');
});
