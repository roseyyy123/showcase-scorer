# Showcase Scorer

**Score your Pokémon GO showcase entries from screenshots, right on your phone.**

Showcase Scorer is an unofficial, installable web app (PWA). Add a screenshot of a Pokémon's page. The app reads its stats on your device and estimates the showcase score. It also keeps a list of your best entries and tracks which ones count for Great Buddy showcases.

**Live app:** https://showcase-scorer.pages.dev
**Version:** 1.3.1

> Not affiliated with, endorsed by or sponsored by Niantic, Nintendo, The Pokémon Company or Game Freak. Pokémon and Pokémon GO are trademarks of their respective owners. Scores are estimates based on community research.

## Why I built it

I enter a lot of showcases, and picking the right entry meant flipping between screens and guessing. I wanted to add a screenshot and get a score in a few seconds. It also became my sandbox for taking a small AI feature all the way to real users: build it, measure it, put it in testers' hands and fix what they find. I built it with Claude Code.

---

## Features

- **On-device screenshot reading.** Tesseract.js reads the species, CP, height, weight, size tag (XXS–XXL), types and catch date. Your screenshots never leave the phone unless you turn on the optional online reader.
- **IV measurement.** Attack, Defense and HP are measured from the pixels of the appraisal bars.
- **Showcase scoring.** Each entry is scored for general, type and Great Buddy showcases. Type and buddy showcases are scored against the Pokémon's own species.
- **Batch upload.** Add several screenshots at once. Each Pokémon gets its own card in a review list. Appraisal and stats screenshots of the same Pokémon are merged.
- **Buddy levels.** Upload the results of a `buddy3-5` search (or `buddy5` for Best Buddies). The app matches buddies to your saved Pokémon by species and CP.
- **Careful flagging.** Readings that look wrong, like a missed size badge, a hidden height or an unclear form, are flagged for you to check rather than saved silently.
- **My Pokémon list.** Sort and filter your entries. Download a CSV, and back up or restore your list as JSON. Everything is saved on the device.
- **Works offline.** Add it to your Home Screen. After the first visit it opens and reads screenshots without a connection.
- **Report a problem.** Testers can send a description and up to four screenshots from inside the app.

## How scoring works

```
score = 800 × (height / avgHeight) / ratioMax
      + 150 × (weight / avgWeight) / (ratioMax + 0.5)
      +  50 × (atk + def + hp) / 45
      + 178 if the Pokémon is XXL
```

- `ratioMax` is the species' largest XXL height divided by its average height, usually about 1.55, 1.75 or 2.0.
- In-game height and weight are rounded, so the app scores a ±0.005 range.
- Size classes by height ratio: XXS ≤ 0.5, XS 0.5–0.75, average 0.75–1.25, XL 1.25–1.5, XXL > 1.5.
- **Pumpkaboo and Gourgeist** use the size tag to set the form: XS/XXS → Small, no tag → Average, XL → Large, XXL → Super. Only Super Size gets the XXL bonus.
- `species.js` holds 1,205 species and forms. The XXL limit of 70 newer species is an estimate (1.75), and it is raised automatically if a larger Pokémon is seen.

In my experience, scores differ only slightly from the in-game values, by 2 to 3 percent at most.

## Architecture

```
iPhone (Safari / Home Screen app)
 ├─ index.html, app.js, styles.css     UI, scoring, batch list, storage
 ├─ reader-ocr.js + vendor/tesseract   on-device reading (no upload)
 └─ sw.js                              offline cache
        │
        ▼  only for reports and the optional online reader
Cloudflare Pages  ── _worker.js
 ├─ GET  /api/health          what's turned on
 ├─ POST /api/read            optional online reader (Gemini or Workers AI)
 ├─ POST /api/report          problem reports → KV namespace (REPORTS)
 └─ GET  /api/reports         triage feed, needs the ADMIN_TOKEN secret
        │
        ▼
Daily Claude triage task → Notion triage database (bug IDs, priority, status)
```

A scheduled Claude task reads new reports each evening. It tries to reproduce each one, assigns a priority from P0 to P3, files it in a private Notion database, and sends a summary notification. It only reads and files reports. It never changes code, deploys or contacts testers.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `species.js` | Species sizes, types and XXL limits |
| `reader-ocr.js` | On-device screenshot reader |
| `scripts/fetch-vendor.sh` | Downloads Tesseract.js 7.0.0 and its English language data (Apache-2.0) into `vendor/`, self-hosted so the app works offline. `vendor/` isn't in the repo, so run this first. |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA and offline support |
| `_worker.js`, `wrangler.toml`, `.assetsignore` | Server for Cloudflare Pages (advanced mode) or Workers |
| `.dev.vars.example` | Template for local secrets. Copy it to `.dev.vars`, which git ignores. |
| `tests/` | Playwright tests, server tests and the latest `results.md`. The screenshot fixtures aren't included because they show game art. |
| `BUGS.md` | Bug log, priorities and known issues |

## Run it locally

```bash
bash scripts/fetch-vendor.sh
python3 -m http.server 8765
# open http://localhost:8765
```

This runs the app with on-device reading only. The `/api` routes need Cloudflare (see below).

## Deploy

Run `bash scripts/fetch-vendor.sh` first, so `vendor/` is in the folder you deploy.

### Cloudflare Pages (drag and drop)

1. Create a Pages project named `showcase-scorer` and upload the folder, or a zip with the files at its root. Leave out `tests/`, `scripts/` and the docs.
2. **Problem reports (optional):**
   - Create a KV namespace (e.g. `showcase-reports`).
   - Bind it to the project as `REPORTS`.
   - Add a **Secret** named `ADMIN_TOKEN` with a long random value, at least 24 characters (for example `openssl rand -hex 32`).
   - Redeploy, since bindings only apply to new deployments.
3. Check `https://<project>.pages.dev/api/health`. It should show `"reports": true`.

### Cloudflare Workers (wrangler)

```bash
npx wrangler login
npx wrangler deploy
```

For problem reports on Workers, follow the commented `[[kv_namespaces]]` block in `wrangler.toml`, which has the commands to create the namespace and set `ADMIN_TOKEN`.

### Optional online reader

The online reader is off by default, and it's off in the live app, which reads screenshots on the phone only. Turn it on with either of these:

- **Google Gemini:** `npx wrangler secret put GEMINI_API_KEY`, then set `GEMINI_MODEL` in `wrangler.toml`. Google's free tier may use what you send to improve its products, and the app tells users this before they turn it on.
- **Cloudflare Workers AI:** uncomment the `[ai]` block in `wrangler.toml`.

Before you share the link widely, turn on the `[[ratelimits]]` block.

> Never commit `ADMIN_TOKEN`, `GEMINI_API_KEY` or other secrets. Set them as Cloudflare secrets, or in a local `.dev.vars` for development.

## Tests

```bash
node tests/server-test.mjs   # server: reports, admin key, rate limits (no setup needed)

npm install playwright && npx playwright install chromium
python3 -m http.server 8765 &
node tests/run-tests.js      # app: OCR fields, IVs, scoring, batch, buddy list, UI
```

Latest run: **273 app checks and 15 server checks pass.** Across 155 screenshot fields, 145 are read correctly and 10 are flagged for review. None are silently wrong. Results are written to `tests/results.md`.

The 27 screenshot fixtures aren't in this repo, so `tests/run-tests.js` needs your own. Put each screenshot in `tests/fixtures/` and its true values in `POKEMON_TRUTH` or `SEARCH_TRUTH` in `tests/run-tests.js`.

So far my son and I are the only testers, using it on our own phones, and between us we've found and fixed four bugs.

### What broke and what I changed

The full log is in [`BUGS.md`](BUGS.md). Three examples:

- The phone's battery level, 82, was read as the CP. The CP search now skips the status bar.
- Gold size badges were missed, so an XXL lost its 178 points with no warning. The badge finder now accepts teal or gold, and a height that doesn't fit its tag is flagged.
- On a real iPhone, adding several Pokémon at once merged them into one record. Each screenshot is now read separately and only clear matches are paired.

## Known limitations

See `BUGS.md` for the full list.

- All test screenshots come from one iPhone screen size, in English. Other devices or languages may misread, but plausibility checks catch most errors that would change the score.
- Nicknamed Pokémon need the species picked by hand, unless you use the online reader.
- Catch dates are read as US M/D/YYYY. This only affects sorting.
- Some forms with the same types and no size tag, such as regular and Origin Dialga, are flagged for you to choose.
- Best Buddy status comes from search screenshots (`buddy5`), not from the medal on the Pokémon's page.

## Privacy

- On-device reading never uploads anything. Your list is stored in the browser's local storage.
- Problem reports and their screenshots are stored only in the owner's Cloudflare account and triage database. Reports are limited to 15 per IP address per day.
- The online reader is opt-in and asks for consent first.

## Credits

- Species size data: [PokémonDB](https://pokemondb.net/go) Pokémon GO data. Newer species come from the game master published by PokeMiners.
- OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).
- The scoring formula comes from community research on showcase scoring.
- Built with Claude Code.

## License

My own code is released under the [MIT License](LICENSE). It doesn't cover the PokémonDB size data in `species.js` or Tesseract.js, which keep their own terms.
