/* Madriguera — descent.js
 * The run engine's brain: given the current work, its recommendations, and a
 * pool of tag-neighbours, produce up to three labelled branches:
 *   deeper   — the best hidden gem under the depth's popularity cap
 *   adjacent — the community's strongest recommendation, obscurity be damned
 *   wildcard — a random tag-neighbour, for productive accidents
 * Pure and deterministic (rng injectable) so it is fully testable.
 */
(function (root) {
  'use strict';

  var Scoring = (typeof module !== 'undefined' && module.exports)
    ? require('./scoring.js')
    : root.Scoring;

  // Tags too generic to define a "vein" worth following.
  var GENERIC_TAGS = {
    'Male Protagonist': 1, 'Female Protagonist': 1, 'Primarily Female Cast': 1,
    'Primarily Male Cast': 1, 'Primarily Adult Cast': 1, 'Primarily Teen Cast': 1,
    'Ensemble Cast': 1, 'Heterosexual': 1, 'Full Color': 1, '4-koma': 1,
    'Episodic': 1, 'Web Comic': 1, 'Time Skip': 1, 'Adaptation': 1, 'Anthology': 1
  };

  /** Highest-ranked non-generic, non-spoiler tag; the "vein" we mine sideways. */
  function pickTopTag(media) {
    var tags = (media && media.tags) || [];
    var best = null;
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      if (!t || !t.name || t.isMediaSpoiler || GENERIC_TAGS[t.name]) continue;
      if (!best || (t.rank || 0) > (best.rank || 0)) best = t;
    }
    return best ? best.name : null;
  }

  /**
   * @param {object} opts
   *   current  — media node we are standing on
   *   recs     — media[] from AniList recommendations, sorted by rec rating desc
   *   pool     — media[] tag/genre neighbours under the popularity cap
   *   seenIds  — Set of media ids already visited in any run
   *   cap      — popularity ceiling for the "deeper" branch
   *   rng      — optional () => [0,1) for testability
   * @returns {Array<{kind:string, media:object}>} up to 3 branches, no duplicates
   */
  function buildBranches(opts) {
    var current = opts.current;
    var recs = opts.recs || [];
    var pool = opts.pool || [];
    var seen = opts.seenIds || new Set();
    var cap = opts.cap;
    var rng = opts.rng || Math.random;

    var used = new Set([current && current.id]);
    function ok(m) {
      return m && m.id != null && !m.isAdult && !seen.has(m.id) && !used.has(m.id);
    }

    var recList = recs.filter(ok);
    var poolList = pool.filter(ok);
    var branches = [];

    // deeper: best gem score among all candidates under the cap
    var deepCands = recList.concat(poolList).filter(function (m) {
      return (m.popularity || 0) <= cap;
    });
    deepCands.sort(function (a, b) { return Scoring.gemScore(b) - Scoring.gemScore(a); });
    if (deepCands.length) {
      branches.push({ kind: 'deeper', media: deepCands[0] });
      used.add(deepCands[0].id);
    }

    // adjacent: strongest remaining recommendation (recs arrive rating-sorted)
    var adj = null;
    for (var i = 0; i < recList.length; i++) {
      if (!used.has(recList[i].id)) { adj = recList[i]; break; }
    }
    if (adj) {
      branches.push({ kind: 'adjacent', media: adj });
      used.add(adj.id);
    }

    // wildcard: random tag-neighbour
    var wilds = poolList.filter(function (m) { return !used.has(m.id); });
    if (wilds.length) {
      var w = wilds[Math.floor(rng() * wilds.length)];
      branches.push({ kind: 'wildcard', media: w });
      used.add(w.id);
    }

    return branches;
  }

  var api = { buildBranches: buildBranches, pickTopTag: pickTopTag, GENERIC_TAGS: GENERIC_TAGS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Descent = api;
})(typeof window !== 'undefined' ? window : globalThis);
