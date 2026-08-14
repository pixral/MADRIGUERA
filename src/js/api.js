/* Madriguera — api.js
 * AniList GraphQL client. No key needed; CORS-open.
 * Serialized + throttled (AniList allows ~30 req/min in degraded mode),
 * memory-cached per session, one automatic retry on 429.
 * Every operation is *named* (Search / Recs / Pool / Vibe / Daily) so tests can
 * stub fetch by operation, and network tabs stay readable.
 */
(function (root) {
  'use strict';

  var ENDPOINT = 'https://graphql.anilist.co';

  var MEDIA_FIELDS = [
    'id', 'siteUrl', 'format', 'status', 'chapters', 'countryOfOrigin', 'isAdult',
    'averageScore', 'popularity', 'favourites', 'genres',
    'description(asHtml: false)',
    'title { romaji english native }',
    'coverImage { large color }',
    'tags { name rank isMediaSpoiler }'
  ].join(' ');

  var cache = new Map();
  var chain = Promise.resolve();
  var lastCall = 0;
  var gapMs = 1200; // stay well under 30/min with headroom

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function _setGap(ms) { gapMs = ms; } // tests set 0

  function rawFetch(query, variables) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: query, variables: variables || {} })
    });
  }

  function gql(query, variables) {
    var key = query + '|' + JSON.stringify(variables || {});
    if (cache.has(key)) return Promise.resolve(cache.get(key));

    var task = chain.then(function () {
      return (function attempt(retried) {
        var wait = Math.max(0, lastCall + gapMs - Date.now());
        return sleep(wait).then(function () {
          lastCall = Date.now();
          return rawFetch(query, variables);
        }).then(function (res) {
          if (res.status === 429 && !retried) {
            var after = parseInt(res.headers && res.headers.get && res.headers.get('Retry-After'), 10);
            return sleep((isNaN(after) ? 5 : after) * 1000).then(function () { return attempt(true); });
          }
          return res.json().then(function (json) {
            if (json.errors && json.errors.length) {
              throw new Error('AniList: ' + json.errors.map(function (e) { return e.message; }).join('; '));
            }
            if (!res.ok) throw new Error('AniList HTTP ' + res.status);
            cache.set(key, json.data);
            return json.data;
          });
        });
      })(false);
    });

    // Keep the chain alive even if this request fails.
    chain = task.catch(function () {});
    return task;
  }

  /** Title search (manga type covers manga/manhwa/manhua/novels on AniList). */
  function search(q, country) {
    var decls = ['$q: String'];
    var args = ['search: $q', 'type: MANGA', 'isAdult: false'];
    if (country) { decls.push('$country: CountryCode'); args.push('countryOfOrigin: $country'); }
    var query =
      'query Search(' + decls.join(', ') + ') {' +
      ' Page(page: 1, perPage: 8) {' +
      '  media(' + args.join(', ') + ') { ' + MEDIA_FIELDS + ' }' +
      ' } }';
    return gql(query, { q: q, country: country || undefined }).then(function (d) {
      return (d && d.Page && d.Page.media) || [];
    });
  }

  /** Community recommendations for a media id, rating-sorted, nulls dropped. */
  function recs(id) {
    var query =
      'query Recs($id: Int) {' +
      ' Media(id: $id) {' +
      '  id recommendations(perPage: 14, sort: RATING_DESC) {' +
      '   nodes { rating mediaRecommendation { ' + MEDIA_FIELDS + ' } }' +
      '  } } }';
    return gql(query, { id: id }).then(function (d) {
      var nodes = (d && d.Media && d.Media.recommendations && d.Media.recommendations.nodes) || [];
      return nodes
        .map(function (n) { return n && n.mediaRecommendation; })
        .filter(Boolean);
    });
  }

  /** Tag/genre neighbours under a popularity cap — the sideways vein. */
  function pool(opts) {
    var decls = ['$page: Int', '$cap: Int'];
    var parts = ['type: MANGA', 'isAdult: false', 'sort: SCORE_DESC',
      'popularity_greater: 200', 'popularity_lesser: $cap'];
    if (opts.tag) { decls.push('$tag: String'); parts.push('tag: $tag'); }
    else if (opts.genre) { decls.push('$genre: String'); parts.push('genre: $genre'); }
    if (opts.country) { decls.push('$country: CountryCode'); parts.push('countryOfOrigin: $country'); }

    var query =
      'query Pool(' + decls.join(', ') + ') {' +
      ' Page(page: $page, perPage: 20) {' +
      '  pageInfo { lastPage }' +
      '  media(' + parts.join(', ') + ') { ' + MEDIA_FIELDS + ' }' +
      ' } }';
    return gql(query, {
      page: opts.page || 1,
      cap: opts.cap,
      tag: opts.tag || undefined,
      genre: (!opts.tag && opts.genre) ? opts.genre : undefined,
      country: opts.country || undefined
    }).then(function (d) {
      return (d && d.Page && d.Page.media) || [];
    });
  }

  /**
   * A random high-quality obscure pick matching a vibe preset.
   * Fetches a pseudo-random page; if past the last page, retries within range.
   */
  function vibePick(vibe, rng) {
    rng = rng || Math.random;
    var decls = ['$page: Int', '$cap: Int', '$minScore: Int'];
    var parts = ['type: MANGA', 'isAdult: false', 'sort: SCORE_DESC',
      'popularity_greater: 300', 'popularity_lesser: $cap', 'averageScore_greater: $minScore'];
    if (vibe.genre) { decls.push('$genre: String'); parts.push('genre: $genre'); }
    if (vibe.tag) { decls.push('$tag: String'); parts.push('tag: $tag'); }
    if (vibe.format) { decls.push('$format: MediaFormat'); parts.push('format: $format'); }
    if (vibe.country) { decls.push('$country: CountryCode'); parts.push('countryOfOrigin: $country'); }

    var query =
      'query Vibe(' + decls.join(', ') + ') {' +
      ' Page(page: $page, perPage: 20) {' +
      '  pageInfo { lastPage }' +
      '  media(' + parts.join(', ') + ') { ' + MEDIA_FIELDS + ' }' +
      ' } }';

    var vars = {
      cap: vibe.capMax || 15000,
      minScore: vibe.minScore || 70,
      genre: vibe.genre || undefined,
      tag: vibe.tag || undefined,
      format: vibe.format || undefined,
      country: vibe.country || undefined
    };

    function fetchPage(page) {
      var v = Object.assign({}, vars, { page: page });
      return gql(query, v).then(function (d) {
        var media = (d && d.Page && d.Page.media) || [];
        var last = (d && d.Page && d.Page.pageInfo && d.Page.pageInfo.lastPage) || 1;
        return { media: media, last: last };
      });
    }

    var firstPage = 1 + Math.floor(rng() * 6);
    return fetchPage(firstPage).then(function (r) {
      if (r.media.length) return r.media;
      var retryPage = 1 + Math.floor(rng() * Math.max(1, Math.min(r.last, 6)));
      return fetchPage(retryPage).then(function (r2) { return r2.media; });
    }).then(function (media) {
      if (!media.length) return null;
      return media[Math.floor(rng() * media.length)];
    });
  }

  /** Deterministic daily pick: quality floor, mid-obscurity band. */
  function dailyPick(rng) {
    var query =
      'query Daily($page: Int) {' +
      ' Page(page: $page, perPage: 10) {' +
      '  pageInfo { lastPage }' +
      '  media(type: MANGA, isAdult: false, sort: SCORE_DESC,' +
      '        popularity_greater: 500, popularity_lesser: 15000, averageScore_greater: 72)' +
      '  { ' + MEDIA_FIELDS + ' }' +
      ' } }';

    function fetchPage(page) {
      return gql(query, { page: page }).then(function (d) {
        return {
          media: (d && d.Page && d.Page.media) || [],
          last: (d && d.Page && d.Page.pageInfo && d.Page.pageInfo.lastPage) || 1
        };
      });
    }

    var page = 1 + Math.floor(rng() * 50);
    return fetchPage(page).then(function (r) {
      if (r.media.length) return r;
      return fetchPage(1 + Math.floor(rng() * Math.max(1, Math.min(r.last, 50))));
    }).then(function (r) {
      if (!r.media.length) return null;
      return r.media[Math.floor(rng() * r.media.length)];
    });
  }

  var api = {
    search: search, recs: recs, pool: pool, vibePick: vibePick, dailyPick: dailyPick,
    _setGap: _setGap, _cache: cache
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Api = api;
})(typeof window !== 'undefined' ? window : globalThis);
