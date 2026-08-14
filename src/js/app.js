/* Madriguera — app.js
 * Renderer: state, views, and wiring. Classic script (no modules) so the app
 * runs identically from Electron's loadFile and a plain file:// browser tab.
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Scoring = isNode ? require('./scoring.js') : root.Scoring;
  var Descent = isNode ? require('./descent.js') : root.Descent;
  var Daily = isNode ? require('./daily.js') : root.Daily;
  var Store = isNode ? require('./store.js') : root.Store;
  var Api = isNode ? require('./api.js') : root.Api;

  var GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
    'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance',
    'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

  var VIBES = [
    { id: 'romKR',  label: 'Hidden-gem romance manhwa', desc: 'Korean romance nobody talks about', genre: 'Romance', country: 'KR', capMax: 15000, minScore: 72 },
    { id: 'josei',  label: 'Grown-up romance', desc: 'Josei — romance written for adults', tag: 'Josei', genre: 'Romance', capMax: 15000, minScore: 71 },
    { id: 'psych',  label: 'Psychological deep cuts', desc: 'Quiet, unsettling, overlooked', genre: 'Psychological', capMax: 9000, minScore: 72 },
    { id: 'slice',  label: 'Quiet slice of life', desc: 'Small stories, big feelings', genre: 'Slice of Life', capMax: 8000, minScore: 72 },
    { id: 'oneshot',label: 'Beautiful one-shots', desc: 'Complete in a single sitting', format: 'ONE_SHOT', capMax: 25000, minScore: 70 },
    { id: 'weird',  label: 'Weird & surreal', desc: 'The strange stuff that stays with you', tag: 'Surreal Comedy', capMax: 12000, minScore: 68 }
  ];

  var BRANCH_META = {
    deeper:   { icon: '\u2193', name: 'Go deeper',   hint: 'best hidden gem below this depth' },
    adjacent: { icon: '\u2192', name: 'Stay level',  hint: 'the community\u2019s strongest link' },
    wildcard: { icon: '\u2736', name: 'Wildcard',    hint: 'a random find in the same vein' }
  };

  var state = {
    view: 'home',
    busy: false,
    busyText: '',
    error: null,
    searchQ: '',
    searchResults: [],
    run: null,          // { seed, seedPop, current, depth, path[], branches[], savedCount, deadEnd }
    summary: null,      // { path[], depth, savedCount }
    dailyMedia: null
  };

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtPop(n) {
    if (n == null) return '?';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function titleOf(m) {
    if (!m) return 'Untitled';
    if (typeof m.title === 'string') return m.title;
    if (m.title) return m.title.english || m.title.romaji || m.title.native || 'Untitled';
    return m.name || 'Untitled';
  }

  function typeLabel(m) {
    var c = m.countryOfOrigin || m.country;
    if (c === 'KR') return 'Manhwa';
    if (c === 'CN' || c === 'TW') return 'Manhua';
    if (m.format === 'NOVEL') return 'Novel';
    if (m.format === 'ONE_SHOT') return 'One-shot';
    return 'Manga';
  }

  function cleanDesc(html) {
    if (!html) return 'No description on AniList yet \u2014 a truly deep cut.';
    var s = String(html)
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (s.length > 460) s = s.slice(0, 460).replace(/\s+\S*$/, '') + '\u2026';
    return s;
  }

  function depthMeters(depth) { return depth * 137; } // playful fiction: each step is 137 m

  // ---------- card rendering ----------
  function statChips(m) {
    var score = m.averageScore || m.score;
    var pop = m.popularity;
    var gem = Scoring.gemScore({ averageScore: score, popularity: pop });
    return '' +
      '<span class="chip chip-score" title="AniList average score">' + (score ? score + '%' : '\u2014') + '</span>' +
      '<span class="chip" title="Readers with this on a list">' + fmtPop(pop) + ' readers</span>' +
      '<span class="chip chip-gem" title="Quality \u00d7 obscurity">gem ' + gem + '</span>' +
      '<span class="chip chip-tier">' + esc(Scoring.obscurityTier(pop)) + '</span>';
  }

  function mediaCard(m, opts) {
    opts = opts || {};
    var cover = (m.coverImage && m.coverImage.large) || m.cover || '';
    var tint = (m.coverImage && m.coverImage.color) || m.color || '#3a2e21';
    var tags = (m.tags || []).filter(function (t) { return !t.isMediaSpoiler; }).slice(0, 6);
    var saved = Store.inHaul(m.id);
    var native = (m.title && m.title.native) ? '<div class="card-native">' + esc(m.title.native) + '</div>' : '';
    var chapters = m.chapters ? ' \u00b7 ' + m.chapters + ' ch.' : '';
    var status = m.status ? String(m.status).toLowerCase().replace(/_/g, ' ') : '';

    return '' +
      '<article class="card" style="--tint:' + esc(tint) + '">' +
      '  <div class="card-cover">' + (cover ? '<img src="' + esc(cover) + '" alt="Cover of ' + esc(titleOf(m)) + '">' : '<div class="cover-blank"></div>') + '</div>' +
      '  <div class="card-body">' +
      '    <div class="card-kind">' + esc(typeLabel(m)) + (status ? ' \u00b7 ' + esc(status) : '') + chapters + '</div>' +
      '    <h2 class="card-title">' + esc(titleOf(m)) + '</h2>' + native +
      '    <div class="card-stats">' + statChips(m) + '</div>' +
      '    <div class="card-tags">' +
      (m.genres || []).slice(0, 3).map(function (g) { return '<span class="tag tag-genre">' + esc(g) + '</span>'; }).join('') +
      tags.map(function (t) { return '<span class="tag">' + esc(t.name || t) + '</span>'; }).join('') +
      '    </div>' +
      '    <p class="card-desc">' + esc(cleanDesc(m.description)) + '</p>' +
      '    <div class="card-actions">' +
      '      <button class="btn ' + (saved ? 'btn-saved' : 'btn-save') + '" data-act="save" data-id="' + m.id + '">' +
               (saved ? '\u2665 In your haul' : '\u2661 Save to haul') + '</button>' +
      '      <a class="btn btn-ghost" href="' + esc(m.siteUrl || m.url || ('https://anilist.co/manga/' + m.id)) + '" target="_blank" rel="noreferrer">Open on AniList \u2197</a>' +
      '    </div>' +
      '  </div>' +
      '</article>';
  }

  // ---------- views ----------
  function viewHome() {
    var results = state.searchResults.map(function (m) {
      return '<button class="seed-result" data-act="seed" data-id="' + m.id + '">' +
        '<span class="seed-title">' + esc(titleOf(m)) + '</span>' +
        '<span class="seed-meta">' + esc(typeLabel(m)) + ' \u00b7 ' + fmtPop(m.popularity) + ' readers \u00b7 ' + (m.averageScore || '\u2014') + '%</span>' +
        '</button>';
    }).join('');

    var vibes = VIBES.map(function (v) {
      return '<button class="vibe" data-act="vibe" data-id="' + v.id + '">' +
        '<span class="vibe-label">' + esc(v.label) + '</span>' +
        '<span class="vibe-desc">' + esc(v.desc) + '</span>' +
        '</button>';
    }).join('');

    return '' +
      '<section class="home">' +
      '  <p class="home-lede">Pick a work you love and follow it down, or let a vein choose your entrance. Every run drifts toward things almost nobody has read.</p>' +
      '  <div class="home-search">' +
      '    <input id="seed-input" type="text" placeholder="Start from a title you love\u2026" value="' + esc(state.searchQ) + '" autocomplete="off">' +
      '    <button class="btn btn-primary" data-act="search">Find seed</button>' +
      '  </div>' +
      (results ? '<div class="seed-results">' + results + '</div>' : '') +
      '  <div class="home-or">or enter through a vein</div>' +
      '  <div class="vibes">' + vibes + '</div>' +
      '</section>';
  }

  function depthRail(depth) {
    var ticks = '';
    for (var i = 0; i <= Math.max(depth + 2, 5); i++) {
      var cur = i === depth ? ' rail-tick-current' : (i < depth ? ' rail-tick-past' : '');
      ticks += '<div class="rail-tick' + cur + '"><span class="rail-num">' + depthMeters(i) + 'm</span></div>';
    }
    return '<aside class="rail" aria-hidden="true"><div class="rail-line"></div>' + ticks + '</aside>';
  }

  function viewRun() {
    var run = state.run;
    var crumbs = run.path.concat([run.current]).map(function (m, i) {
      return '<span class="crumb' + (i === run.path.length ? ' crumb-current' : '') + '">' + esc(titleOf(m)) + '</span>';
    }).join('<span class="crumb-sep">\u203a</span>');

    var branches;
    if (run.deadEnd) {
      branches =
        '<div class="deadend">' +
        '  <div class="deadend-title">The tunnel narrows.</div>' +
        '  <p>No unexplored passages from here \u2014 you\u2019ve gone somewhere genuinely remote.</p>' +
        '  <div class="deadend-actions">' +
        '    <button class="btn btn-primary" data-act="sideways">Blast sideways</button>' +
        '    <button class="btn btn-ghost" data-act="surface">Surface with your haul</button>' +
        '  </div>' +
        '</div>';
    } else {
      branches = '<div class="branches">' +
        run.branches.map(function (b, i) {
          var meta = BRANCH_META[b.kind];
          var m = b.media;
          return '<button class="branch branch-' + b.kind + '" data-act="branch" data-i="' + i + '">' +
            '<span class="branch-kind"><kbd>' + (i + 1) + '</kbd> ' + meta.icon + ' ' + meta.name + '</span>' +
            '<span class="branch-title">' + esc(titleOf(m)) + '</span>' +
            '<span class="branch-meta">' + esc(typeLabel(m)) + ' \u00b7 ' + fmtPop(m.popularity) + ' readers \u00b7 gem ' + Scoring.gemScore(m) + '</span>' +
            '<span class="branch-hint">' + meta.hint + '</span>' +
            '</button>';
        }).join('') +
        '</div>';
    }

    return '' +
      '<section class="run">' +
      depthRail(run.depth) +
      '  <div class="run-main">' +
      '    <div class="run-top">' +
      '      <div class="run-depth">Depth <strong>' + depthMeters(run.depth) + ' m</strong></div>' +
      '      <button class="btn btn-ghost btn-small" data-act="surface">Surface <kbd>Esc</kbd></button>' +
      '    </div>' +
      '    <div class="crumbs">' + crumbs + '</div>' +
      mediaCard(run.current) +
      '    <div class="run-choose">' + (run.deadEnd ? '' : 'Choose a passage \u2014 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>, save with <kbd>S</kbd>') + '</div>' +
      branches +
      '  </div>' +
      '</section>';
  }

  function viewSummary() {
    var s = state.summary;
    var chain = s.path.map(function (m, i) {
      return '<li><span class="sum-depth">' + depthMeters(i) + 'm</span> ' + esc(titleOf(m)) +
        ' <span class="sum-tier">' + esc(Scoring.obscurityTier(m.popularity)) + '</span></li>';
    }).join('');
    return '' +
      '<section class="summary">' +
      '  <h2 class="view-title">Back at the surface</h2>' +
      '  <p class="summary-line">You reached <strong>' + depthMeters(s.depth) + ' m</strong> and saved <strong>' + s.savedCount + '</strong> ' + (s.savedCount === 1 ? 'discovery' : 'discoveries') + ' to your haul.</p>' +
      '  <ol class="sum-chain">' + chain + '</ol>' +
      '  <div class="summary-actions">' +
      '    <button class="btn btn-primary" data-act="tab" data-view="home">Descend again</button>' +
      '    <button class="btn btn-ghost" data-act="tab" data-view="haul">Review your haul</button>' +
      '  </div>' +
      '</section>';
  }

  function viewDaily() {
    var m = state.dailyMedia;
    return '' +
      '<section class="daily">' +
      '  <h2 class="view-title">Today\u2019s gem</h2>' +
      '  <p class="daily-sub">One overlooked work per day, the same for everyone running Madriguera on ' + Daily.todayKey() + '.</p>' +
      (m ? mediaCard(m) : '<div class="empty">Couldn\u2019t unearth today\u2019s gem. Check your connection and reopen this tab.</div>') +
      '</section>';
  }

  function viewHaul() {
    var haul = Store.getHaul();
    if (!haul.length) {
      return '<section class="haul"><h2 class="view-title">Your haul</h2>' +
        '<div class="empty">Nothing yet. Start a descent and save what you find \u2014 it all ends up here.</div></section>';
    }
    var items = haul.map(function (e) {
      var m = e.media;
      return '<div class="haul-item">' +
        (m.cover ? '<img class="haul-cover" src="' + esc(m.cover) + '" alt="">' : '<div class="haul-cover cover-blank"></div>') +
        '<div class="haul-info">' +
        '  <a class="haul-title" href="' + esc(m.url) + '" target="_blank" rel="noreferrer">' + esc(m.title) + '</a>' +
        '  <div class="haul-meta">' + esc(typeLabel(m)) + ' \u00b7 ' + fmtPop(m.popularity) + ' readers \u00b7 ' + (m.score ? m.score + '%' : '\u2014') +
        '   \u00b7 found at ' + depthMeters(e.depth) + 'm \u00b7 ' + esc((e.foundAt || '').slice(0, 10)) + '</div>' +
        '  <div class="haul-tags">' + (m.tags || []).slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '</div>' +
        '<div class="haul-side">' +
        '  <button class="btn btn-ghost btn-small" data-act="redive" data-id="' + m.id + '" title="Start a new descent from this work">\u21ca Dive from here</button>' +
        '  <button class="btn btn-ghost btn-small" data-act="unhaul" data-id="' + m.id + '" title="Remove">\u2715</button>' +
        '</div>' +
        '</div>';
    }).join('');
    return '' +
      '<section class="haul">' +
      '  <div class="haul-head"><h2 class="view-title">Your haul \u00b7 ' + haul.length + '</h2>' +
      '    <div class="haul-export">' +
      '      <button class="btn btn-ghost btn-small" data-act="export-md">Copy as Markdown</button>' +
      '      <button class="btn btn-ghost btn-small" data-act="export-json">Download JSON</button>' +
      '    </div></div>' +
      '  <div class="haul-list">' + items + '</div>' +
      '</section>';
  }

  function viewAtlas() {
    var stats = Store.getStats();
    var tagCounts = Store.atlasTags();
    var genreCounts = Store.atlasGenres();
    var haulN = Store.getHaul().length;

    var tags = Object.keys(tagCounts)
      .map(function (k) { return { name: k, n: tagCounts[k] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 12);
    var maxN = tags.length ? tags[0].n : 1;
    var bars = tags.map(function (t) {
      return '<div class="atlas-bar-row">' +
        '<span class="atlas-bar-label">' + esc(t.name) + '</span>' +
        '<span class="atlas-bar"><span class="atlas-bar-fill" style="width:' + Math.round(100 * t.n / maxN) + '%"></span></span>' +
        '<span class="atlas-bar-n">' + t.n + '</span></div>';
    }).join('');

    var touched = Object.keys(genreCounts);
    var dark = GENRES.filter(function (g) { return touched.indexOf(g) === -1; });

    return '' +
      '<section class="atlas">' +
      '  <h2 class="view-title">Atlas of the burrow</h2>' +
      '  <div class="atlas-stats">' +
      '    <div class="stat"><span class="stat-n">' + stats.runs + '</span><span class="stat-l">descents</span></div>' +
      '    <div class="stat"><span class="stat-n">' + depthMeters(stats.deepest) + 'm</span><span class="stat-l">deepest point</span></div>' +
      '    <div class="stat"><span class="stat-n">' + stats.visited + '</span><span class="stat-l">works visited</span></div>' +
      '    <div class="stat"><span class="stat-n">' + haulN + '</span><span class="stat-l">in your haul</span></div>' +
      '  </div>' +
      (bars ? '<h3 class="atlas-h">Veins you\u2019ve mined</h3><div class="atlas-bars">' + bars + '</div>' : '<div class="empty">Descend a few times and your explored veins will map themselves here.</div>') +
      (dark.length ? '<h3 class="atlas-h">Dark territory \u2014 genres you\u2019ve never entered</h3><div class="atlas-dark">' +
        dark.map(function (g) { return '<span class="tag tag-dark">' + esc(g) + '</span>'; }).join('') + '</div>' : '') +
      '  <div class="atlas-danger">' +
      '    <button class="btn btn-ghost btn-small" data-act="reset-seen" title="Visited works never reappear in runs. Reset to allow them again.">Forget visited works (' + Store.seenSet().size + ')</button>' +
      '  </div>' +
      '</section>';
  }

  // ---------- render ----------
  function render() {
    var app = $('#app');
    if (!app) return;

    var body = '';
    if (state.view === 'home') body = viewHome();
    else if (state.view === 'run') body = viewRun();
    else if (state.view === 'summary') body = viewSummary();
    else if (state.view === 'daily') body = viewDaily();
    else if (state.view === 'haul') body = viewHaul();
    else if (state.view === 'atlas') body = viewAtlas();

    var err = state.error
      ? '<div class="banner-error">' + esc(state.error) + ' <button class="btn btn-ghost btn-small" data-act="dismiss-error">Dismiss</button></div>'
      : '';
    var busy = state.busy
      ? '<div class="busy"><div class="busy-lamp"></div><div class="busy-text">' + esc(state.busyText || 'Descending\u2026') + '</div></div>'
      : '';

    app.innerHTML = err + busy + body;

    // nav active state
    var tabs = document.querySelectorAll('[data-act="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var v = tabs[i].getAttribute('data-view');
      var active = (v === state.view) || (v === 'home' && (state.view === 'run' || state.view === 'summary'));
      tabs[i].classList.toggle('nav-active', !!active);
    }
  }

  function setBusy(on, text) { state.busy = on; state.busyText = text || ''; render(); }
  function fail(e) {
    state.error = (e && e.message) ? e.message : String(e);
    setBusy(false);
  }

  // ---------- actions ----------
  function currentCountry() { return Store.getSettings().country || null; }

  function doSearch() {
    var input = $('#seed-input');
    var q = input ? input.value.trim() : state.searchQ;
    if (!q) return;
    state.searchQ = q;
    state.error = null;
    setBusy(true, 'Searching for a seed\u2026');
    Api.search(q, currentCountry()).then(function (list) {
      state.searchResults = list;
      if (!list.length) state.error = 'No results for \u201c' + q + '\u201d. Try the romaji title.';
      setBusy(false);
    }).catch(fail);
  }

  function expand(run) {
    var cap = Scoring.depthCap(run.seedPop, run.depth + 1);
    var tag = Descent.pickTopTag(run.current);
    var genre = (run.current.genres && run.current.genres[0]) || null;
    return Api.recs(run.current.id).then(function (recs) {
      var poolOpts = { cap: cap, country: currentCountry(), page: 1 };
      if (tag) poolOpts.tag = tag; else if (genre) poolOpts.genre = genre;
      var poolP = (tag || genre) ? Api.pool(poolOpts) : Promise.resolve([]);
      return poolP.then(function (pool) {
        run.branches = Descent.buildBranches({
          current: run.current, recs: recs, pool: pool,
          seenIds: Store.seenSet(), cap: cap
        });
        run.deadEnd = run.branches.length === 0;
      });
    });
  }

  function startRun(media) {
    state.error = null;
    var run = {
      seed: media,
      seedPop: media.popularity || 20000,
      current: media,
      depth: 0,
      path: [],
      branches: [],
      savedCount: 0,
      deadEnd: false
    };
    Store.markSeen(media.id);
    Store.bumpAtlas(media);
    Store.recordVisit();
    setBusy(true, 'Lighting the lantern\u2026');
    expand(run).then(function () {
      state.run = run;
      state.view = 'run';
      state.searchResults = [];
      setBusy(false);
    }).catch(fail);
  }

  function chooseBranch(i) {
    var run = state.run;
    if (!run || !run.branches[i]) return;
    var next = run.branches[i].media;
    run.path.push(run.current);
    run.current = next;
    run.depth += 1;
    Store.markSeen(next.id);
    Store.bumpAtlas(next);
    Store.recordVisit();
    setBusy(true, 'Descending to ' + depthMeters(run.depth) + ' m\u2026');
    expand(run).then(function () { setBusy(false); }).catch(fail);
  }

  function blastSideways() {
    var run = state.run;
    if (!run) return;
    var genre = (run.current.genres && run.current.genres[0]) || 'Romance';
    setBusy(true, 'Blasting sideways\u2026');
    Api.pool({ genre: genre, cap: 50000, country: currentCountry(), page: 1 + Math.floor(Math.random() * 4) })
      .then(function (pool) {
        var seen = Store.seenSet();
        var cands = pool.filter(function (m) { return m && !m.isAdult && !seen.has(m.id); });
        if (!cands.length) {
          state.error = 'Even sideways is solid rock. Surface and start a fresh descent.';
          setBusy(false);
          return;
        }
        var pick = cands[Math.floor(Math.random() * cands.length)];
        run.branches = [{ kind: 'wildcard', media: pick }];
        run.deadEnd = false;
        chooseBranch(0);
      }).catch(fail);
  }

  function surface() {
    var run = state.run;
    if (!run) { state.view = 'home'; render(); return; }
    Store.recordRun(run.depth);
    state.summary = {
      path: run.path.concat([run.current]),
      depth: run.depth,
      savedCount: run.savedCount
    };
    state.run = null;
    state.view = 'summary';
    render();
  }

  function toggleSave(id) {
    // Find the media object with this id in whatever is on screen.
    var m = null;
    if (state.run) {
      if (state.run.current.id === id) m = state.run.current;
      state.run.branches.forEach(function (b) { if (b.media.id === id) m = b.media; });
    }
    if (!m && state.dailyMedia && state.dailyMedia.id === id) m = state.dailyMedia;
    if (!m) {
      state.searchResults.forEach(function (r) { if (r.id === id) m = r; });
    }
    if (!m) return;

    if (Store.inHaul(id)) {
      Store.removeFromHaul(id);
      if (state.run) state.run.savedCount = Math.max(0, state.run.savedCount - 1);
    } else {
      Store.addToHaul(m, {
        depth: state.run ? state.run.depth : 0,
        via: state.view === 'daily' ? 'daily' : 'descent'
      });
      if (state.run) state.run.savedCount += 1;
    }
    render();
  }

  function openDaily() {
    state.view = 'daily';
    var key = Daily.todayKey();
    var cached = Store.getDaily(key);
    if (cached) { state.dailyMedia = cached; render(); return; }
    setBusy(true, 'Unearthing today\u2019s gem\u2026');
    Api.dailyPick(Daily.rngForDate(key)).then(function (m) {
      if (m) Store.setDaily(key, m);
      state.dailyMedia = m;
      setBusy(false);
    }).catch(fail);
  }

  function exportMarkdown() {
    var haul = Store.getHaul();
    var lines = ['# Madriguera haul \u2014 ' + Daily.todayKey(), ''];
    haul.forEach(function (e) {
      var m = e.media;
      lines.push('- [' + m.title + '](' + m.url + ') \u2014 ' + typeLabel(m) +
        (m.score ? ', ' + m.score + '%' : '') + ', ' + fmtPop(m.popularity) + ' readers');
    });
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        state.error = null; flashNote('Copied ' + haul.length + ' entries as Markdown.');
      }).catch(function () { fallbackDownload(text, 'madriguera-haul.md', 'text/markdown'); });
    } else {
      fallbackDownload(text, 'madriguera-haul.md', 'text/markdown');
    }
  }

  function exportJson() {
    fallbackDownload(JSON.stringify(Store.getHaul(), null, 2), 'madriguera-haul.json', 'application/json');
  }

  function fallbackDownload(text, filename, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  var noteTimer = null;
  function flashNote(text) {
    var el = $('#note');
    if (!el) return;
    el.textContent = text;
    el.classList.add('note-show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.classList.remove('note-show'); }, 2600);
  }

  // ---------- event wiring ----------
  function onClick(ev) {
    var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'tab') {
      var v = el.getAttribute('data-view');
      if (v === 'daily') { openDaily(); return; }
      if (v === 'home' && state.run) { surface(); state.view = 'home'; render(); return; }
      state.view = v; render(); return;
    }
    if (act === 'search') { doSearch(); return; }
    if (act === 'seed') {
      var id = Number(el.getAttribute('data-id'));
      var m = state.searchResults.filter(function (r) { return r.id === id; })[0];
      if (m) startRun(m);
      return;
    }
    if (act === 'vibe') {
      var vibe = VIBES.filter(function (v2) { return v2.id === el.getAttribute('data-id'); })[0];
      if (!vibe) return;
      setBusy(true, 'Following the ' + vibe.label.toLowerCase() + ' vein\u2026');
      Api.vibePick(vibe).then(function (m2) {
        if (!m2) { state.error = 'That vein came up empty \u2014 try another.'; setBusy(false); return; }
        startRun(m2);
      }).catch(fail);
      return;
    }
    if (act === 'branch') { chooseBranch(Number(el.getAttribute('data-i'))); return; }
    if (act === 'surface') { surface(); return; }
    if (act === 'sideways') { blastSideways(); return; }
    if (act === 'save') { toggleSave(Number(el.getAttribute('data-id'))); return; }
    if (act === 'unhaul') { Store.removeFromHaul(Number(el.getAttribute('data-id'))); render(); return; }
    if (act === 'redive') {
      var hid = Number(el.getAttribute('data-id'));
      var entry = Store.getHaul().filter(function (e2) { return e2.media.id === hid; })[0];
      if (entry) startRun(entry.media);
      return;
    }
    if (act === 'export-md') { exportMarkdown(); return; }
    if (act === 'export-json') { exportJson(); return; }
    if (act === 'reset-seen') { Store.resetSeen(); flashNote('Visited works forgotten \u2014 they can reappear in new runs.'); render(); return; }
    if (act === 'dismiss-error') { state.error = null; render(); return; }
  }

  function onKey(ev) {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) {
      if (ev.key === 'Enter' && ev.target.id === 'seed-input') doSearch();
      return;
    }
    if (state.busy) return;
    if (state.view === 'run' && state.run) {
      if (ev.key >= '1' && ev.key <= '3') chooseBranch(Number(ev.key) - 1);
      else if (ev.key === 's' || ev.key === 'S') toggleSave(state.run.current.id);
      else if (ev.key === 'Escape') surface();
    }
  }

  function onCountryChange(ev) {
    var v = ev.target.value || null;
    Store.setSettings({ country: v === 'ALL' ? null : v });
  }

  var initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    var sel = $('#country-select');
    if (sel) {
      var c = Store.getSettings().country;
      sel.value = c || 'ALL';
      sel.addEventListener('change', onCountryChange);
    }
    render();
  }

  var App = {
    init: init, render: render, state: state,
    VIBES: VIBES, GENRES: GENRES,
    _actions: { doSearch: doSearch, startRun: startRun, chooseBranch: chooseBranch, surface: surface, toggleSave: toggleSave, openDaily: openDaily }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = App;
  root.App = App;

  if (typeof document !== 'undefined' && !isNode) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
