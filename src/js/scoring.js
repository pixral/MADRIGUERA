/* Madriguera — scoring.js
 * Pure math for "how much of a hidden gem is this?".
 * UMD-ish: works as a classic browser script and as a CommonJS module for tests.
 */
(function (root) {
  'use strict';

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /**
   * Obscurity in [0, 1]. 1 = almost nobody has this on a list.
   * AniList popularity is roughly log-distributed: ~100 for the truly buried,
   * ~500k for global hits. We map log10(popularity) linearly.
   *   pop <= ~100    -> 1.0
   *   pop >= ~316000 -> 0.0
   */
  function obscurity(pop) {
    if (!pop || pop <= 0) return 1;
    return clamp((5.5 - Math.log10(pop)) / 3.5, 0, 1);
  }

  /**
   * Gem score 0–100: quality-weighted obscurity.
   * A 78-score work with 2k readers should beat an 82-score work with 400k.
   */
  function gemScore(media) {
    const quality = (media && media.averageScore) ? media.averageScore : 60;
    return Math.round(quality * 0.65 + obscurity(media && media.popularity) * 100 * 0.35);
  }

  /**
   * Popularity ceiling for branch candidates at a given depth.
   * Shrinks geometrically each step so runs drift toward the obscure,
   * floored so the pool never empties entirely.
   */
  function depthCap(seedPop, depth) {
    const base = Math.max(seedPop || 20000, 2000);
    return Math.max(300, Math.round(base * Math.pow(0.55, depth)));
  }

  var TIERS = [
    { min: 100000, label: 'Mainstream' },
    { min: 30000,  label: 'Well-known' },
    { min: 8000,   label: 'Under the radar' },
    { min: 2000,   label: 'Deep cut' },
    { min: 500,    label: 'Buried treasure' },
    { min: 0,      label: 'Bottom of the burrow' }
  ];

  function obscurityTier(pop) {
    var p = pop || 0;
    for (var i = 0; i < TIERS.length; i++) {
      if (p >= TIERS[i].min) return TIERS[i].label;
    }
    return TIERS[TIERS.length - 1].label;
  }

  var api = { clamp: clamp, obscurity: obscurity, gemScore: gemScore, depthCap: depthCap, obscurityTier: obscurityTier };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
