# Showcase Scorer

An installable mobile web app that scores Pokémon GO showcase entries from screenshots, so you know which Pokémon to enter before you walk up to the stop. Try it at https://showcase-scorer.pages.dev.

Unofficial fan tool. Not affiliated with, endorsed or sponsored by Niantic, Nintendo, Creatures, GAME FREAK or The Pokémon Company. Pokémon and Pokémon GO are trademarks of their respective owners.

## Why I built it

I enter a lot of showcases, and picking the right entry meant flipping between screens and guessing. I wanted to add a screenshot and get a score in a few seconds. It also became my sandbox for taking a small AI feature all the way to real users: build it, measure it, put it in testers' hands and fix what they find. [How you built it, for example with Claude Code, if you want to say.]

## How it works

1. Add screenshots of each Pokémon's page and/or appraisal screen, several at once if you like. A page and an appraisal of the same Pokémon are paired automatically; different Pokémon are never merged.
2. The screenshots are read on the phone with Tesseract.js: species, CP, height, weight, size tag, type labels and catch date. IVs are measured from the appraisal bars' pixels. Nothing is uploaded.
3. Every reading is checked against what the species can be. A height outside the species' range is dropped, a size tag that doesn't fit the height is flagged, and regional forms are told apart by their type labels.
4. Anything doubtful is left blank and flagged for you to confirm, rather than guessed.
5. The app scores the entry with the formula players worked out (the game doesn't publish one) and shows the range that the game's on-screen rounding allows.
6. Screenshots of a `buddy3-5` storage search fill in buddy levels for Great Buddy showcases.
7. Your list stays in the browser, with filters by showcase, CSV export and backup.

An optional online reader sends screenshots to a vision model through the server instead, which helps with nicknames, size badges and Best Buddy medals. It asks for consent first and falls back to on-device reading if the service fails. [Is it switched on in your deployment, and with Gemini or Workers AI?]

## How it fits together

```
Phone browser (installable, works offline)
   │  screenshots
   ▼
On-device reader (Tesseract.js) ── or, with consent ──▶ /api/read ──▶ Gemini or Workers AI
   │                                                     (the API key stays on the server)
   ▼
Plausibility checks: species size limits, size tag vs height, form by type
   ▼
Score with flagged fields to confirm ──▶ list saved in this browser (CSV, backup)

Report a problem ──▶ /api/report ──▶ Cloudflare KV ──▶ /api/reports ──▶ daily Claude triage into Notion
```

## How I checked it

The release rule: every number that feeds the score is either correct or left blank and flagged. A wrong score with no warning is a P0.

- **Reading screenshots:** 155 graded fields across 22 Pokémon screens: 145 correct, 10 left blank and flagged, 0 silently wrong. 3 correct values were flagged anyway.
- **Test suite:** 273 app checks (accuracy, scoring, user flows, offline, online-reader fallback, batch reading, problem reports) and 15 server checks, all passing. See [`tests/results.md`](tests/results.md).
- **JPEG copies:** IV bars read correctly from 78 of 78 PNG, full-size JPEG and 1000 px JPEG versions, since some phones and messaging apps re-encode screenshots.
- **The score itself:** in my experience, scores differ only slightly from the in-game values, by 2 to 3 percent at most.
- **What broke and what I changed** (full log in [`BUGS.md`](BUGS.md)):
  - The phone's battery level, 82, was read as the CP. The CP search now skips the status bar.
  - Gold size badges were missed, so an XXL lost its 178 points with no warning. The badge finder now accepts teal or gold, and a height that doesn't fit its tag is flagged.
  - On a real iPhone, adding several Pokémon at once merged them into one record. Each screenshot is now read separately and only clear matches are paired.

## Testing on real phones

So far my son and I are the only testers, using it on our own phones, and between us we've found and fixed four bugs. Every reading has a button to report a problem. Reports land in Cloudflare KV, and a daily Claude task reads them through `/api/reports`, files them in a Notion tracker and marks them triaged. The first triage run found that IV bars weren't read from JPEG screenshots, which led to the JPEG checks above.

## What's not in this repo

- **API keys and admin keys.** They live in Cloudflare secrets, or in a local `.dev.vars` (see `.dev.vars.example`), which git ignores.
- **Test screenshots.** They show game art, so `tests/fixtures/` stays local.
- **Tesseract.js.** It's third-party code (Apache-2.0). `scripts/fetch-vendor.sh` downloads the exact tested version into `vendor/`.
- **Tester data.** Problem reports stay in Cloudflare KV.

## Run it yourself

```
git clone <this repo> && cd showcase-scorer
bash scripts/fetch-vendor.sh
python3 -m http.server 8765
```
Open http://localhost:8765. This runs on-device reading only, with no server for online reading or problem reports.

### Deploy to Cloudflare Workers

1. Create a free Cloudflare account and install Node.js.
2. Run `bash scripts/fetch-vendor.sh`, then `npx wrangler login` and `npx wrangler deploy`. You get a link like `https://showcase-scorer.<you>.workers.dev`.
3. On an iPhone, open the link in Safari, tap Share, then **Add to Home Screen**.

Before you share the link publicly, turn on the `[[ratelimits]]` block in `wrangler.toml`, so strangers can't use up your free quota.

### Optional: the online reader

Pick one:
- **Google Gemini (more accurate):** make an API key in Google AI Studio, then run `npx wrangler secret put GEMINI_API_KEY` and `npx wrangler deploy`. Check which models are currently free and set `GEMINI_MODEL` in `wrangler.toml`. Google's free tier may use what you send to improve its products, and the app tells users this before they turn it on.
- **Cloudflare Workers AI (no key, more private):** uncomment the `[ai]` block in `wrangler.toml` and deploy. Check that the model in `WORKERS_AI_MODEL` accepts images on your account.

### Optional: problem reports

The "Report a problem" button posts to `/api/report`, which stores reports in a KV namespace bound as `REPORTS`. The triage feed, `/api/reports`, needs an `ADMIN_TOKEN` secret.

- **Workers:** create the namespace with `npx wrangler kv namespace create showcase-reports`, add its id to the commented `[[kv_namespaces]]` block in `wrangler.toml`, run `npx wrangler secret put ADMIN_TOKEN`, then deploy.
- **Pages:** in the dashboard, create a KV namespace and bind it to the project as `REPORTS`. Add a secret named `ADMIN_TOKEN`. Bindings and secrets only apply to deployments made after you add them.

Use a long random string for the admin key, at least 24 characters (for example `openssl rand -hex 32`). Then `https://<your-link>/api/health` should show `"reports": true`. Limits: 15 reports per phone per day, up to 4 screenshots each.

### First-deploy checklist

- [ ] `https://<your-link>/api/health` shows `"online": true`, or `false` if you skipped the online reader
- [ ] Settings shows "Online AI", and choosing it asks for consent
- [ ] A screenshot read with Online AI on matches the values you know
- [ ] On iPhone, Add to Home Screen opens full screen, the photo picker works, and Download CSV and Back up my list save a file
- [ ] In Airplane Mode, the app reopens from the Home Screen and still reads a screenshot (after one earlier use online)

## Run the tests

```
node tests/server-test.mjs   # server: reports, admin key, rate limit (no setup needed)

npm install playwright && npx playwright install chromium
python3 -m http.server 8765 &
node tests/run-tests.js      # the app, in a headless browser
```

`tests/run-tests.js` needs your own screenshots in `tests/fixtures/`. Name each one in `POKEMON_TRUTH` or `SEARCH_TRUTH` at the top of the file, with the true values read off the screen. Results go to `tests/results.md`.

## Data and credits

- Species sizes come from [PokémonDB](https://pokemondb.net)'s Pokémon GO data, plus 70 newer species from the game's own data, whose XXL limit is an estimate. [PokémonDB permission to reuse its data: status.]
- The scoring formula is community-derived, so scores are estimates and the app labels them that way.
- The app uses no Pokémon artwork.
- On-device reading uses [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).

## License

[Your pick, for example MIT.]
