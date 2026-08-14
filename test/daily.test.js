'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('../src/js/daily.js');

test('hashStr is deterministic and spreads across dates', () => {
  assert.equal(Y.hashStr('2026-08-13'), Y.hashStr('2026-08-13'));
  assert.notEqual(Y.hashStr('2026-08-13'), Y.hashStr('2026-08-14'));
});

test('rngForDate: same date → identical sequence; different date → different', () => {
  const a1 = Y.rngForDate('2026-08-13');
  const a2 = Y.rngForDate('2026-08-13');
  const b = Y.rngForDate('2026-08-14');
  const seqA1 = [a1(), a1(), a1()];
  const seqA2 = [a2(), a2(), a2()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA1, seqA2);
  assert.notDeepEqual(seqA1, seqB);
  for (const v of seqA1.concat(seqB)) {
    assert.ok(v >= 0 && v < 1, `rng out of range: ${v}`);
  }
});

test('todayKey formats a local YYYY-MM-DD', () => {
  const key = Y.todayKey(new Date(2026, 7, 5)); // Aug 5 2026 local
  assert.equal(key, '2026-08-05');
});
