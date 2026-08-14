# Madriguera

*A descent engine for the overlooked.*

Madriguera is a desktop app for people who enjoy **finding** things more than having found them. You pick a manga/manhwa you love (or enter through a "vein" like *hidden-gem romance manhwa*), and the app walks AniList's recommendation and tag graph like a roguelike run: every step offers up to three passages, and the deeper you go, the harder it biases toward **high-quality works almost nobody has read**.

- **Descend** — each node offers: **Go deeper** (best hidden gem under a shrinking popularity cap), **Stay level** (the community's strongest recommendation), **Wildcard** (a random find in the same tag vein). Works you've visited never resurface.
- **Daily gem** — one deterministic overlooked pick per day (same date → same gem, everywhere).
- **Haul** — everything you save, exportable as Markdown or JSON, each item usable as the seed of a new descent.
- **Atlas** — how many descents you've made, your deepest point, the tag veins you've mined, and the genres you've never entered.

The "gem score" is quality × obscurity: a 78%-scored work with 2k readers outranks an 82% work with 400k.

## Run it

```bash
npm install
npm start        # Electron window
npm test         # 47 tests: unit + full jsdom UI walkthrough
```

No API key needed — AniList's GraphQL API is open and CORS-enabled. `src/index.html` also opens directly in a browser if you ever want it without Electron.

## Controls

| Key | Action |
| --- | --- |
| `1` `2` `3` | Choose a passage |
| `S` | Save / unsave the current work |
| `Esc` | Surface (end the run) |

The **Origin** selector in the header restricts vein pools and vibe seeds to manhwa (KR), manga (JP), or manhua (CN).

## Architecture

Plain, dependency-free renderer (classic scripts, no framework, no build step) inside a locked-down Electron shell (`contextIsolation`, `sandbox`, no node integration; external links open in your system browser).

```
main.js               Electron bootstrap
src/js/scoring.js     obscurity math, gem score, depth caps        (pure)
src/js/descent.js     branch generation, tag-vein picking          (pure)
src/js/daily.js       deterministic per-date PRNG                  (pure)
src/js/store.js       localStorage persistence (haul/seen/atlas)
src/js/api.js         AniList client: throttled, cached, 429 retry
src/js/app.js         views + state machine + wiring
test/                 node:test units + jsdom integration walkthrough
```

Everything stays on your machine except AniList queries. Adult-flagged entries are excluded at both the query and branch-generation layers.

## Ideas for the next shaft

- A **games shaft**: same descent mechanics over RAWG or IGDB (needs an API key; `api.js`'s pattern transplants directly).
- **Vein bookmarks**: pin a tag from the Atlas as a custom vibe entrance.
- **Seasonal expeditions**: weekly themed veins ("KR one-shots of the 2010s").
