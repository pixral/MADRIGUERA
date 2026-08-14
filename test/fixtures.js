'use strict';

let nextId = 1000;

function mkMedia(overrides) {
  const id = (overrides && overrides.id) || nextId++;
  return Object.assign({
    id,
    siteUrl: 'https://anilist.co/manga/' + id,
    format: 'MANGA',
    status: 'FINISHED',
    chapters: 42,
    countryOfOrigin: 'KR',
    isAdult: false,
    averageScore: 76,
    popularity: 3200,
    favourites: 210,
    genres: ['Romance', 'Drama'],
    description: 'A quiet story about <i>two people</i> finding each other.<br><br>Slow burn.',
    title: { romaji: 'Test Title ' + id, english: 'Test Title ' + id, native: '테스트 ' + id },
    coverImage: { large: 'https://img.anili.st/' + id + '.jpg', color: '#e4a15d' },
    tags: [
      { name: 'Slow Burn', rank: 88, isMediaSpoiler: false },
      { name: 'Female Protagonist', rank: 92, isMediaSpoiler: false },
      { name: 'Age Gap', rank: 70, isMediaSpoiler: false }
    ]
  }, overrides || {});
}

/**
 * A fetch stub that answers by GraphQL operation name (Search/Recs/Pool/Vibe/Daily).
 * `handlers` maps op name -> data object OR (variables) => data object.
 * Records every call in `calls`.
 */
function makeFetchStub(handlers) {
  const calls = [];
  const stub = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const m = /query\s+(\w+)/.exec(body.query);
    const op = m ? m[1] : 'Unknown';
    calls.push({ op, variables: body.variables });
    const h = handlers[op];
    if (!h) {
      return {
        ok: false, status: 404,
        headers: { get: () => null },
        json: async () => ({ errors: [{ message: 'No stub for operation ' + op }] })
      };
    }
    const data = (typeof h === 'function') ? h(body.variables) : h;
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ data })
    };
  };
  stub.calls = calls;
  return stub;
}

function pageData(mediaList, lastPage) {
  return { Page: { pageInfo: { lastPage: lastPage || 3 }, media: mediaList } };
}

function recsData(id, mediaList) {
  return {
    Media: {
      id,
      recommendations: { nodes: mediaList.map((mm, i) => ({ rating: 100 - i, mediaRecommendation: mm })) }
    }
  };
}

module.exports = { mkMedia, makeFetchStub, pageData, recsData };
