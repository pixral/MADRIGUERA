/* Madriguera — daily.js
 * Deterministic randomness for the daily gem: same date, same gem, everywhere.
 */
(function (root) {
  'use strict';

  /** FNV-1a 32-bit hash of a string. */
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /** mulberry32 PRNG seeded with a 32-bit int; returns () => [0,1). */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Local-date key like "2026-08-13" (local, so the gem flips at your midnight). */
  function todayKey(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function rngForDate(dateKey) {
    return mulberry32(hashStr('madriguera:' + dateKey));
  }

  var api = { hashStr: hashStr, mulberry32: mulberry32, todayKey: todayKey, rngForDate: rngForDate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Daily = api;
})(typeof window !== 'undefined' ? window : globalThis);
