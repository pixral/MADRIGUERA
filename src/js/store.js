/* Madriguera — store.js
 * All persistence, namespaced in localStorage. Small snapshot objects only —
 * we never store full API payloads.
 */
(function (root) {
  'use strict';

  var NS = 'madriguera:';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  /** Minimal snapshot of a media object, safe to persist.
   *  Idempotent: accepts either a raw AniList media object or a prior snapshot. */
  function snapshot(m) {
    var title = (typeof m.title === 'string')
      ? m.title
      : ((m.title && (m.title.english || m.title.romaji)) || 'Untitled');
    return {
      id: m.id,
      title: title,
      native: (m.title && m.title.native) || m.native || null,
      cover: (m.coverImage && m.coverImage.large) || m.cover || null,
      color: (m.coverImage && m.coverImage.color) || m.color || null,
      url: m.siteUrl || m.url || ('https://anilist.co/manga/' + m.id),
      score: m.averageScore || m.score || null,
      popularity: m.popularity || 0,
      country: m.countryOfOrigin || m.country || null,
      format: m.format || null,
      genres: m.genres || [],
      tags: (m.tags || []).slice(0, 5).map(function (t) { return (t && t.name) || t; })
    };
  }

  // ---- Haul (saved discoveries) ----
  function getHaul() { return read('haul', []); }
  function inHaul(id) {
    return getHaul().some(function (e) { return e.media.id === id; });
  }
  function addToHaul(media, meta) {
    var haul = getHaul();
    if (haul.some(function (e) { return e.media.id === media.id; })) return false;
    haul.unshift({
      media: snapshot(media),
      depth: (meta && meta.depth) || 0,
      via: (meta && meta.via) || 'descent',
      foundAt: new Date().toISOString()
    });
    write('haul', haul);
    return true;
  }
  function removeFromHaul(id) {
    write('haul', getHaul().filter(function (e) { return e.media.id !== id; }));
  }

  // ---- Seen set (never resurface across runs) ----
  function seenSet() { return new Set(read('seen', [])); }
  function markSeen(id) {
    var s = read('seen', []);
    if (s.indexOf(id) === -1) { s.push(id); write('seen', s); }
  }
  function resetSeen() { write('seen', []); }

  // ---- Atlas: how often each tag/genre has been walked through ----
  function bumpAtlas(media) {
    var tags = read('atlasTags', {});
    var genres = read('atlasGenres', {});
    ((media.tags || []).slice(0, 6)).forEach(function (t) {
      var name = t.name || t;
      if (!name) return;
      tags[name] = (tags[name] || 0) + 1;
    });
    (media.genres || []).forEach(function (g) {
      genres[g] = (genres[g] || 0) + 1;
    });
    write('atlasTags', tags);
    write('atlasGenres', genres);
  }
  function atlasTags() { return read('atlasTags', {}); }
  function atlasGenres() { return read('atlasGenres', {}); }

  // ---- Run stats ----
  function getStats() { return read('stats', { runs: 0, deepest: 0, visited: 0 }); }
  function recordRun(depth) {
    var s = getStats();
    s.runs += 1;
    s.deepest = Math.max(s.deepest, depth);
    write('stats', s);
  }
  function recordVisit() {
    var s = getStats();
    s.visited += 1;
    write('stats', s);
  }

  // ---- Settings ----
  function getSettings() { return read('settings', { country: null }); }
  function setSettings(patch) {
    var s = getSettings();
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    write('settings', s);
  }

  // ---- Daily gem cache (one per date key) ----
  function getDaily(dateKey) {
    var d = read('daily', null);
    return (d && d.dateKey === dateKey) ? d.media : null;
  }
  function setDaily(dateKey, media) {
    write('daily', { dateKey: dateKey, media: snapshot(media) });
  }

  var api = {
    snapshot: snapshot,
    getHaul: getHaul, inHaul: inHaul, addToHaul: addToHaul, removeFromHaul: removeFromHaul,
    seenSet: seenSet, markSeen: markSeen, resetSeen: resetSeen,
    bumpAtlas: bumpAtlas, atlasTags: atlasTags, atlasGenres: atlasGenres,
    getStats: getStats, recordRun: recordRun, recordVisit: recordVisit,
    getSettings: getSettings, setSettings: setSettings,
    getDaily: getDaily, setDaily: setDaily
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Store = api;
})(typeof window !== 'undefined' ? window : globalThis);
