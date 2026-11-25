// Showcase Scorer test suite. Run from the app folder:  node tests/run-tests.js
// Needs: Playwright with Chromium, and the app served at BASE (default http://127.0.0.1:8765/).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = process.env.BASE || "http://127.0.0.1:8765/";
const FX = path.join(__dirname, "fixtures");
const results = []; // {area, test, field, expected, actual, pass}
const rec = (area, test, field, expected, actual) => {
  const pass = typeof expected === "number" && typeof actual === "number" ? Math.abs(expected - actual) < 1e-6 : JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ area, test, field, expected, actual, pass });
};
const b64 = (f) => "data:image/png;base64," + fs.readFileSync(path.join(FX, f)).toString("base64");

// True values read off each screenshot. "HIDDEN" = covered on screen, so the app must leave it blank or flag it.
// sp is the species|form key the score uses; a list means any of them scores the same.
const H_ = "HIDDEN";
const POKEMON_TRUTH = {
  "main.png":              { sp: "Pumpkaboo|Super Size", cp: 245, h: 0.7, w: 11.44, tag: "XXL", caught: "", ivs: null },
  "appraise.png":          { sp: "Pumpkaboo|Super Size", cp: 245, h: 0.7, w: 11.44, tag: "XXL", caught: "2026-10-30", ivs: [4, 5, 11] },
  "bramble.png":           { sp: "Brambleghast|", cp: 1023, h: 0.97, w: 5.15, tag: "", caught: "2026-10-17", ivs: [11, 15, 15] },
  "kingambit.png":         { sp: "Kingambit|", cp: 2816, h: 2.14, w: 150.1, tag: "", caught: "", ivs: null },
  "rillaboom.png":         { sp: "Rillaboom|", cp: 3005, h: 2.09, w: 86.86, tag: "", caught: "2025-05-31", ivs: [10, 12, 12] },
  "metagross.png":         { sp: "Metagross|", cp: 3267, h: 1.65, w: 693.94, tag: "", caught: "2025-01-20", ivs: [12, 11, 15] },
  "zacian.png":            { sp: ["Zacian|Hero of Many Battles", "Zacian|Crowned Sword"], cp: H_, h: 2.78, w: 114.99, tag: "", caught: "2025-06-29", ivs: [15, 15, 13] },
  "toucannon.png":         { sp: "Toucannon|", cp: 2372, h: 1.13, w: 22.05, tag: "", caught: "2025-11-30", ivs: [14, 10, 15] },
  "togekiss-lucky.png":    { sp: "Togekiss|", cp: 2494, h: H_, w: 54.28, tag: H_, caught: "2023-04-15", ivs: [15, 13, 12] },
  "mrmime-galar.png":      { sp: "Mr. Mime|Galarian Mr. Mime", cp: 1104, h: 1.27, w: 59.23, tag: "", caught: "2024-11-04", ivs: [14, 12, 14] },
  "snorlax-page.png":      { sp: "Snorlax|", cp: H_, h: 3.5, w: 753.5, tag: "XXL", caught: "", ivs: null },
  "gourgeist.png":         { sp: "Gourgeist|Average Size", cp: 2462, h: 0.99, w: 16.37, tag: "", caught: "2023-10-14", ivs: [14, 15, 14] },
  "pumpkaboo-xs.png":      { sp: "Pumpkaboo|Small Size", cp: 498, h: 0.34, w: 4.73, tag: "XS", caught: "2025-10-25", ivs: [13, 11, 14] },
  "drifloon-xxl.png":      { sp: "Drifloon|", cp: 520, h: 0.64, w: 2.02, tag: "XXL", caught: "2026-09-26", ivs: [0, 11, 4] },
  "mewtwo.png":            { sp: ["Mewtwo|", "Mewtwo|Armored Mewtwo"], cp: H_, h: 2.28, w: 148.37, tag: "", caught: "2026-08-12", ivs: [15, 15, 15] },
  "reshiram-lucky.png":    { sp: "Reshiram|", cp: 3582, h: H_, w: 594.48, tag: "XL", caught: "2021-12-08", ivs: [15, 12, 15] },
  "dialga-shadow.png":     { sp: "Dialga|", cp: 2266, h: 6.57, w: 1047.47, tag: "", caught: "2026-06-02", ivs: [15, 10, 12] },
  "samurott-hisui.png":    { sp: "Samurott|Hisuian Samurott", cp: 2484, h: 1.48, w: 52.9, tag: "", caught: "2023-12-03", ivs: [15, 15, 12] },
  "slaking-nick.png":      { sp: "Slaking|", nick: "Beef96", cp: 4643, h: 2.24, w: 192.39, tag: "", caught: "2017-12-23", ivs: [15, 15, 13] },
  "dialga-origin-xxs.png": { sp: "Dialga|Origin Forme", cp: 2286, h: 3.48, w: 188.76, tag: "XXS", caught: "2024-02-17", ivs: [12, 14, 11] },
  "victreebel-xl.png":     { sp: "Victreebel|", cp: 1728, h: 2.19, w: 23.22, tag: "XL", caught: "2026-09-30", ivs: [15, 15, 13] },
  "yanma-xs.png":          { sp: "Yanma|", cp: 131, h: 0.69, w: 9.91, tag: "XS", caught: "2026-11-01", ivs: [7, 0, 4] },
};
// which form field a flag points at, and whether a mistake there changes the score
const FIELD = { sp: ["f-species", true], h: ["f-h", true], w: ["f-w", true], tag: ["f-tag", true], ivs: ["f-atk", true], cp: ["f-cp", false], caught: [null, false], nick: [null, false] };
const SEARCH_TRUTH = {
  "search35.png": { search_text: "buddy3-5", count: 13, pokemon: [["Brambleghast", 1023], ["Hydrapple", 2954], ["Zeraora", 1431], ["Toxtricity", 1482], ["Frosmoth", 2018], ["Toxtricity", 2401], ["Kubfu", 747], ["Kingambit", 2816], ["Ceruledge", 2319], ["Annihilape", 3669], ["Volcarona", 2847], ["Pangoro", 2482]] },
  "search35-b.png": { search_text: "Buddy3-5", count: 13, pokemon: [["Kingambit", 2816], ["Conkeldurr", 2490], ["Pangoro", 2482], ["Toxtricity", 2401], ["Ceruledge", 2319], ["Frosmoth", 2018], ["Toxtricity", 1482], ["Zeraora", 1431], ["Brambleghast", 1023], ["Kubfu", 700]] },
  "search-buddy5.png": { search_text: "Buddy5", count: 4, pokemon: [["Volcarona", 2847], ["Kingambit", 2816], ["Conkeldurr", 2490], ["Kubfu", 700]] },
  "search25.png": { search_text: "buddy2-5", count: 56, pokemon: [["Brambleghast", 1023], ["Hydrapple", 2954], ["Zeraora", 1431], ["Orbeetle", 1495], ["Volcanion", 2495], ["Glimmora", 2909], ["Toxtricity", 1482], ["Ursaring", 570], ["Grafaiai", 1259], ["Keldeo", 2396], ["Frosmoth", 2018], ["Slurpuff", 1485]] },
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  let page2; const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => self.__test && self.OCR);

  const section = async (name, fn) => { try { await fn(); } catch (e) { rec("Crash", name, "error", "none", String(e.message).split("\n")[0]); } };
  await section("accuracy", async () => {
  // ---- 1. accuracy on real screenshots (on-device reader) ----
  for (const [f, truth] of Object.entries(POKEMON_TRUTH)) {
    const t0 = Date.now();
    const got = await page.evaluate(async (src) => {
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const c = self.__test.toCanvas(img, 1400);
      const v = await self.OCR.readPokemon(c), ivs = self.__test.measureIVs(c);
      const { rec, flags } = self.__test.resolveReading(v, ivs);
      return { rec, flags: flags.map((x) => x.f) };
    }, b64(f));
    const r = got.rec;
    const actual = { sp: r.sp, nick: r.nick, cp: r.cp, h: r.h, w: r.w, tag: r.tag, caught: r.caught, ivs: r.atk == null ? null : [r.atk, r.def, r.hp] };
    for (const [k, exp] of Object.entries(truth)) {
      const [flagId, scoring] = FIELD[k];
      const flagged = !!flagId && got.flags.includes(flagId);
      const ok = Array.isArray(exp) && k === "sp" ? exp.includes(actual[k]) : JSON.stringify(exp) === JSON.stringify(actual[k]);
      const verdict = exp === H_ ? (flagged || actual[k] == null && flagged ? "FLAGGED" : "SILENT-WRONG") : ok ? "CORRECT" : flagged ? "FLAGGED" : (actual[k] == null || actual[k] === "") && exp ? "MISSING-UNFLAGGED" : "SILENT-WRONG";
      results.push({ area: "Reading (on phone)", test: f, field: k + (scoring ? "" : " (doesn't affect score)"), expected: exp, actual: actual[k], verdict: verdict === "CORRECT" && flagged && exp !== null ? "CORRECT (flagged anyway)" : verdict, pass: verdict === "CORRECT" || verdict === "FLAGGED" });
    }
    rec("Speed", f, "seconds", "info", ((Date.now() - t0) / 1000).toFixed(1));
  }
  for (const [f, truth] of Object.entries(SEARCH_TRUTH)) {
    const got = await page.evaluate(async (src) => {
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      return self.OCR.readBuddySearch(self.__test.toCanvas(img, 1400));
    }, b64(f));
    const area = f === "search25.png" ? "Extra reading sample (not a flow)" : "Buddy search (on phone)";
    rec(area, f, "search_text", truth.search_text, got.search_text);
    rec(area, f, "count", truth.count, got.count);
    const gotPairs = got.pokemon.map((p) => [p.name, p.cp]);
    for (const [name, cp] of truth.pokemon) {
      const m = gotPairs.find(([n]) => n === name && gotPairs.filter(([n2]) => n2 === name).length === 1) || gotPairs.find(([n, c]) => n === name && c === cp);
      rec(area, f, name, cp, m ? m[1] : null);
    }
    const extra = gotPairs.filter(([n, c]) => !truth.pokemon.some(([tn, tc]) => tn === n && tc === c));
    rec(area, f, "unexpected tiles", [], extra);
  }

  });
  await section("scoring", async () => {
  // IV bars must also read from JPEG copies (some phones and messaging apps re-encode screenshots,
  // and problem reports carry 1000 px JPEGs). Generated in the browser from each PNG fixture.
  for (const [f, truth] of Object.entries(POKEMON_TRUTH)) {
    const got = await page.evaluate(async (src) => {
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const out = [];
      for (const [w, q] of [[img.naturalWidth, 0.9], [1000, 0.8]]) {
        const jpg = self.__test.toCanvas(img, w).toDataURL("image/jpeg", q);
        const j = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = jpg; });
        const m = self.__test.measureIVs(self.__test.toCanvas(j, 1400));
        out.push(m && [m.atk, m.def, m.hp]);
      }
      return out;
    }, b64(f));
    rec("IVs from JPEG copies", f, "full-size JPEG q0.9 / 1000px JPEG q0.8", [truth.ivs, truth.ivs], got);
  }
  // ---- 2. scoring ----
  const sc = await page.evaluate(() => {
    const T = self.__test;
    return {
      pump: T.scoreRecord({ sp: "Pumpkaboo|Super Size", h: 0.7, w: 11.44, tag: "XXL", atk: 4, def: 5, hp: 11 }),
      pumpAvg: T.scoreRecord({ sp: "Pumpkaboo|Average Size", h: 0.4, w: 5, tag: "XXL", atk: 0, def: 0, hp: 0 }),
      formXXL: T.pickSpecies("Pumpkaboo", "", "XXL")[1], formXS: T.pickSpecies("Gourgeist", "", "XS")[1], formNone: T.pickSpecies("Pumpkaboo", "", "")[1],
      bgEst: T.scoreRecord({ sp: "Brambleghast|", h: 2.4, w: 9, tag: "XXL", atk: 0, def: 0, hp: 0 }),
      bgReal: T.scoreRecord({ sp: "Brambleghast|", h: 0.97, w: 5.15, tag: "", atk: 11, def: 15, hp: 15 }),
      hundo: T.scoreRecord({ sp: "Raticate|", h: 0.7, w: 18.5, tag: "", atk: 15, def: 15, hp: 15 }),
      alolan: T.pickSpecies("Raticate", "Alolan", "")[1], chien: T.pickSpecies("Chien Pao", "", "")[0], flab: T.pickSpecies("Flabebe", "", "")[0],
    };
  });
  rec("Scoring", "Pumpkaboo Super XXL 0.7m/11.44kg 4/5/11", "points", 976, sc.pump.mid);
  rec("Scoring", "Pumpkaboo Super XXL 0.7m/11.44kg 4/5/11", "range", [971, 982], [sc.pump.lo, sc.pump.hi]);
  rec("Scoring", "Average-size Pumpkaboo never gets XXL bonus", "xxl", false, sc.pumpAvg.xxl);
  rec("Scoring", "Size form from tag", "XXL / XS / none", ["Super Size", "Small Size", "Average Size"], [sc.formXXL, sc.formXS, sc.formNone]);
  rec("Scoring", "Estimated species raises limit (2.4m Brambleghast)", "points 800+90+0+178", 1068, sc.bgEst.mid);
  rec("Scoring", "Brambleghast 0.97m/5.15kg 11/15/15 (hand calc 369.5+50+46.7)", "points", Math.round(800 * (0.97 / 1.2) / 1.75 + 150 * (5.15 / 6) / 2.25 + 50 * 41 / 45), sc.bgReal.mid);
  rec("Scoring", "Average Raticate hundo", "points 800/1.75+150/2.25+50", Math.round(800 / 1.75 + 150 / 2.25 + 50), sc.hundo.mid);
  const kub = await page.evaluate(() => { const T = self.__test; T.setRoster([{ name: "Kubfu", species: "Kubfu", cp: 700, lo: 5, hi: 5 }]); const a = T.rosterLevel({ sp: "Kubfu|", cp: 747 }); T.setRoster([]); return a && a.level; });
  rec("Scoring", "Buddy list matches a boosted Best Buddy CP (747 vs 700)", "level", "best", kub);
  rec("Scoring", "Name matching", "Alolan / Chien Pao / Flabebe", ["Alolan Raticate", "Chien-Pao", "Flabébé"], [sc.alolan, sc.chien, sc.flab]);

  });
  await section("flows", async () => {
  // ---- 3. user flows ----
  await page.setInputFiles("#file-in", path.join(FX, "appraise.png"));
  await page.waitForFunction(() => /Done|Couldn|Check/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
  const form = await page.evaluate(() => ({ sp: f("f-species"), cp: f("f-cp"), h: f("f-h"), w: f("f-w"), tag: f("f-tag"), iv: [f("f-atk"), f("f-def"), f("f-hp")].join("/"), caught: f("f-caught"), score: document.getElementById("score-big").textContent }) , null).catch(() => null)
    || await page.evaluate(() => { const f = (id) => document.getElementById(id).value; return { sp: f("f-species"), cp: f("f-cp"), h: f("f-h"), w: f("f-w"), tag: f("f-tag"), iv: [f("f-atk"), f("f-def"), f("f-hp")].join("/"), caught: f("f-caught"), score: document.getElementById("score-big").textContent }; });
  rec("Flow", "Upload appraisal screenshot", "form", { sp: "Pumpkaboo (Super Size)", cp: "245", h: "0.7", w: "11.44", tag: "XXL", iv: "4/5/11", caught: "2026-10-30", score: "976" }, form);
  rec("Flow", "Pumpkaboo with its XXL tag read: no needless size-tag warning", "warning shown", false, /size tag/.test(await page.textContent("#status")));
  await page.click("#save-btn");
  await page.reload(); await page.waitForFunction(() => self.__test);
  const listAfterReload = await page.evaluate(() => [...document.querySelectorAll("#list .item")].map((b) => b.querySelector(".name").textContent.trim() + " " + b.querySelector(".pts").childNodes[0].textContent));
  rec("Flow", "Saved Pokémon survives reload", "list", ["Pumpkaboo (Super Size) 976"], listAfterReload);

  await page.setInputFiles("#buddy-in", path.join(FX, "search35.png"));
  await page.waitForFunction(() => !document.getElementById("buddy-status").dataset.busy, null, { timeout: 90000 });
  const buddyStatus = await page.textContent("#buddy-status");
  rec("Flow", "Buddy search screenshot", "status mentions 12 added + scroll hint", true, /Added 12/.test(buddyStatus) && /found 13/.test(buddyStatus));
  await page.click("#manual-btn"); await page.fill("#f-species", "Brambleghast"); await page.fill("#f-cp", "1023"); await page.press("#f-cp", "Tab");
  rec("Flow", "Buddy level auto-fills from list", "buddy", "great", await page.inputValue("#f-buddy"));
  await page.fill("#f-h", "0.97"); await page.fill("#f-w", "5.15"); await page.fill("#f-atk", "11"); await page.fill("#f-def", "15"); await page.fill("#f-hp", "15");
  await page.click("#save-btn");
  const filters = await page.evaluate(() => [...document.querySelectorAll("#filters button")].map((b) => b.textContent));
  rec("Flow", "Filters built from saved types", "filters", ["All", "Ghost", "Grass", "Great Buddy+"], filters);
  await page.click('#filters button[data-f="buddy"]');
  rec("Flow", "Great Buddy+ filter", "count shown", 1, await page.locator("#list .item").count());
  await page.click('#filters button[data-f="all"]');
  await page.selectOption("#sort", "recent");
  const recentFirst = await page.evaluate(() => document.querySelector("#list .item .name").textContent.trim());
  rec("Flow", "Sort by recently caught", "first", "Pumpkaboo (Super Size)", recentFirst);

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#csv-dl")]);
  const csvText = fs.readFileSync(await dl.path(), "utf8");
  rec("Flow", "CSV download", "rows + header", 3, csvText.trim().split("\n").length);
  rec("Flow", "CSV download", "has Great Buddy row", true, /Brambleghast,,Grass\/Ghost,1023,0\.97,5\.15,,no,11,15,15,Great Buddy/.test(csvText));
  const [bk] = await Promise.all([page.waitForEvent("download"), page.click("#backup-btn")]);
  const backupPath = path.join(__dirname, "tmp-backup.json"); fs.copyFileSync(await bk.path(), backupPath);
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForFunction(() => self.__test);
  rec("Flow", "Cleared storage shows example", "items", 1, await page.locator("#list .item.example").count());
  await page.setInputFiles("#restore-in", backupPath);
  await page.waitForFunction(() => /Restored/.test(document.getElementById("list-status").textContent));
  rec("Flow", "Restore backup", "items", 2, await page.locator("#list .item:not(.example)").count());
  rec("Flow", "Restore backup", "buddy list restored", true, /buddy list has 12/.test(await page.textContent("#buddy-status")));
  fs.unlinkSync(backupPath);

  // delete
  await page.locator("#list .item", { hasText: "Brambleghast" }).click();
  await page.click("#delete-btn"); await page.click("#delete-btn");
  rec("Flow", "Delete (two taps)", "items left", 1, await page.locator("#list .item:not(.example)").count());

  });
  await section("offline", async () => {
  // ---- 4. offline ----
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready) && !!navigator.serviceWorker.controller || (location.reload(), false), null, { timeout: 15000 }).catch(() => {});
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForFunction(() => self.__test && self.OCR, null, { timeout: 15000 });
  rec("Offline", "App opens with no connection", "title", "Showcase Scorer", await page.textContent("h1"));
  await page.setInputFiles("#file-in", path.join(FX, "bramble.png"));
  await page.waitForFunction(() => /Done|Couldn|Check|went wrong|isn't/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
  rec("Offline", "Reads a screenshot with no connection", "species field", "Brambleghast", await page.inputValue("#f-species"));
  await ctx.setOffline(false);

  });
  await section("online", async () => {
  // ---- 5. online reader, against a stand-in server ----
  page2 = await ctx.newPage(); page2.on("pageerror", (e) => errors.push(e.message));
  let mode = "ok";
  await page2.route("**/api/health", (r) => r.fulfill({ json: { online: true, provider: "Test AI", notice: "" } }));
  await page2.route("**/api/read", (r) => {
    if (mode === "429") return r.fulfill({ status: 429, json: { error: "limit" } });
    if (mode === "500") return r.fulfill({ status: 502, json: { error: "bad" } });
    return r.fulfill({ json: { species: "Kingambit", nickname: "", form: "", cp: 2816, height_m: 2.14, weight_kg: 150.1, height_tag: "", buddy_level: "best", ivs: null, caught_date: "" } });
  });
  await page2.goto(BASE); await page2.waitForFunction(() => self.__test);
  await page2.waitForSelector("#reader-online:not(.hidden)");
  await page2.check("#rd-online");
  rec("Online reader", "Consent shown before first use", "visible", true, await page2.isVisible("#consent"));
  await page2.click("#consent-yes");
  await page2.setInputFiles("#file-in", path.join(FX, "kingambit.png"));
  await page2.waitForFunction(() => /Done|Couldn|Check|instead/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
  rec("Online reader", "Successful answer", "species + buddy", ["Kingambit", "best"], [await page2.inputValue("#f-species"), await page2.inputValue("#f-buddy")]);
  for (const m of ["429", "500"]) {
    mode = m;
    await page2.setInputFiles("#file-in", path.join(FX, "kingambit.png"));
    await page2.waitForFunction(() => /instead/.test(document.getElementById("status").textContent), null, { timeout: 60000 }).catch(() => {});
    rec("Online reader", `Server answers ${m}`, "falls back to phone + says so", true, /on this phone instead/.test(await page2.textContent("#status")) && (await page2.inputValue("#f-species")) === "Kingambit");
  }
  await page2.screenshot({ path: path.join(__dirname, "screen-online.png"), fullPage: true });
  });
  await page.screenshot({ path: path.join(__dirname, "screen-main.png"), fullPage: true });
  await section("batch", async () => {
  // ---- 6. several screenshots at once (the iPhone bug: different Pokémon were combined) ----
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage(); p3.on("pageerror", (e) => errors.push(e.message));
  await p3.goto(BASE); await p3.waitForFunction(() => self.__test && self.OCR);
  const waitRead = () => p3.waitForFunction(() => /Read \d+ screenshot|Done/.test(document.getElementById("status").textContent), null, { timeout: 240000 });
  const cards = () => p3.evaluate(() => self.__test.getBatch().map((c) => ({ sp: c.rec.sp, ivs: c.rec.atk == null ? null : [c.rec.atk, c.rec.def, c.rec.hp], shots: c.thumbs.length, tag: c.rec.tag, check: c.flags.filter((x) => x.f !== "f-cp").length })));
  await p3.setInputFiles("#file-in", ["mewtwo.png", "reshiram-lucky.png", "kingambit.png"].map((f) => path.join(FX, f)));
  await waitRead();
  let c = await cards();
  rec("Batch", "3 different Pokémon at once (the iPhone bug)", "one card each, nothing combined", [["Mewtwo|", [15, 15, 15], 1], ["Reshiram|", [15, 12, 15], 1], ["Kingambit|", null, 1]], c.map((x) => [x.sp, x.ivs, x.shots]));
  await p3.click("#batch-clear"); await p3.click("#batch-clear");
  await p3.setInputFiles("#file-in", ["main.png", "bramble.png", "appraise.png"].map((f) => path.join(FX, f)));
  await waitRead();
  c = await cards();
  rec("Batch", "Pumpkaboo page + Brambleghast + Pumpkaboo appraisal", "page and appraisal paired, Brambleghast separate", [["Pumpkaboo|Super Size", [4, 5, 11], 2, "XXL"], ["Brambleghast|", [11, 15, 15], 1, ""]], c.map((x) => [x.sp, x.ivs, x.shots, x.tag]));
  const readyBefore = c.filter((x) => x.check === 0).length;
  await p3.click("#batch-save");
  const saved = await p3.locator("#list .item:not(.example)").count();
  rec("Batch", "Save ready", "saved = cards with nothing to check", readyBefore, saved);
  rec("Batch", "Save ready", "batch empties when everything is saved", true, await p3.isHidden("#batch"));
  await p3.setInputFiles("#file-in", ["togekiss-lucky.png", "yanma-xs.png"].map((f) => path.join(FX, f)));
  await waitRead();
  await p3.locator("#batch-list .item", { hasText: "Togekiss" }).click();
  rec("Batch", "Tap a card to fix it", "form shows that Pokémon, with its warnings", ["Togekiss", true], [await p3.inputValue("#f-species"), await p3.locator("#f-h.check").count() === 1]);
  await p3.fill("#f-h", "1.7"); await p3.click("#save-btn");
  rec("Batch", "Saving a fixed card removes it from the batch", "cards left", 1, (await cards()).length);
  // ---- buddy searches, several at once ----
  await p3.setInputFiles("#buddy-in", ["search35.png", "search35-b.png", "search-buddy5.png"].map((f) => path.join(FX, f)));
  await p3.waitForFunction(() => !document.getElementById("buddy-status").dataset.busy, null, { timeout: 300000 });
  const kub = await p3.evaluate(() => { const r = JSON.parse(localStorage.getItem("showcase-scorer-buddies-v1")); const T = self.__test;
    return { entries: r.filter((e) => /kubfu/i.test(e.name)).length, size: r.length, a: (T.rosterLevel({ sp: "Kubfu|", cp: 747 }) || {}).level, b: (T.rosterLevel({ sp: "Kubfu|", cp: 700 }) || {}).level,
      volc: (T.rosterLevel({ sp: "Volcarona|", cp: 2847 }) || {}).level, pang: (T.rosterLevel({ sp: "Pangoro|", cp: 2482 }) || {}).level }; });
  rec("Batch", "3 buddy searches at once", "Kubfu once, Best Buddy at either CP; Volcarona best; Pangoro Great+", [1, "best", "best", "best", "great"], [kub.entries, kub.a, kub.b, kub.volc, kub.pang]);
  rec("Batch", "3 buddy searches at once", "buddy list size (13 distinct Pokémon)", 13, kub.size);
  await ctx3.close();
  });
  await section("report", async () => {
  // ---- 7. Report a problem ----
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p4 = await ctx4.newPage(); p4.on("pageerror", (e) => errors.push(e.message));
  let sent = null, reply = { status: 200, json: { id: "abc" } };
  await p4.route("**/api/report", async (r) => { sent = JSON.parse(r.request().postData()); await r.fulfill(reply); });
  await p4.goto(BASE); await p4.waitForFunction(() => self.__test && self.OCR);
  rec("Report", "Version shown in the footer", "text", "Version 1.3.1", await p4.textContent("#version"));
  await p4.setInputFiles("#file-in", path.join(FX, "togekiss-lucky.png"));
  await p4.waitForFunction(() => /Done/.test(document.getElementById("status").textContent), null, { timeout: 90000 });
  await p4.click("#report-reading");
  rec("Report", "Report from a reading", "dialog open with its screenshot", [true, 1], [await p4.isVisible("#report"), await p4.locator("#r-thumbs img").count()]);
  await p4.click("#r-send");
  rec("Report", "Empty report", "asks what went wrong, sends nothing", [true, null], [/Say what went wrong/.test(await p4.textContent("#r-status")), sent]);
  await p4.fill("#r-what", "Height hidden behind the leader"); await p4.fill("#r-contact", "tester@example.com");
  await p4.setInputFiles("#r-files", path.join(FX, "main.png"));
  await p4.click("#r-send");
  await p4.waitForFunction(() => /Thanks|couldn't|didn't/.test(document.getElementById("r-status").textContent), null, { timeout: 30000 });
  rec("Report", "Send report", "what is sent", ["Height hidden behind the leader", "tester@example.com", "1.3.1", 2, "Togekiss|", true],
    [sent && sent.what, sent && sent.contact, sent && sent.version, sent && sent.images.length, sent && sent.context && sent.context.rec.sp, !!(sent && sent.device.screen)]);
  rec("Report", "Send report", "thank-you shown", true, /Thanks/.test(await p4.textContent("#r-status")));
  reply = { status: 503, json: { error: "Reporting isn't set up on this site yet." } };
  await p4.click("#report-btn");
  const footerShots = await p4.locator("#r-thumbs img").count(), footerShotsBox = await p4.isVisible("#r-shots");
  await p4.fill("#r-what", "Second report"); await p4.click("#r-send");
  await p4.waitForFunction(() => /copy it instead/.test(document.getElementById("r-status").textContent), null, { timeout: 30000 });
  rec("Report", "Server can't take reports", "says why and offers Copy report", [true, true], [/isn't set up/.test(await p4.textContent("#r-status")), await p4.isVisible("#r-copy")]);
  rec("Report", "Footer report (not from a reading)", "no reading screenshots attached or offered", [0, false], [footerShots, footerShotsBox]);
  rec("Report", "Footer report (not from a reading)", "no reading data sent", null, sent.context);
  await ctx4.close();
  });
  rec("General", "No script errors", "errors", [], errors);

  // ---- report ----
  const fmt = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  let md = "# Test results\n\n" + `Run: ${new Date().toISOString()}\n\n| Area | Test | Field | Expected | Actual | Result |\n|---|---|---|---|---|---|\n`;
  for (const r of results) md += `| ${r.area} | ${r.test} | ${r.field} | ${fmt(r.expected)} | ${fmt(r.actual)} | ${r.expected === "info" ? "info" : r.verdict ? (r.pass ? r.verdict : "**" + r.verdict + "**") : r.pass ? "PASS" : "**FAIL**"} |\n`;
  const fails = results.filter((r) => !r.pass && r.expected !== "info");
  const graded = results.filter((r) => r.verdict);
  const count = (v) => graded.filter((r) => r.verdict === v).length;
  md += `\n**${results.filter((r) => r.expected !== "info").length - fails.length} passed, ${fails.length} failed.**\n`;
  md += `\nScreenshot fields: ${count("CORRECT") + count("CORRECT (flagged anyway)")} correct (${count("CORRECT (flagged anyway)")} of them flagged anyway, a false alarm), ${count("FLAGGED")} flagged for you to check, ${count("SILENT-WRONG")} silently wrong, ${count("MISSING-UNFLAGGED")} missing without a flag.\n`;
  fs.writeFileSync(path.join(__dirname, "results.md"), md);
  console.log(md.split("\n").filter((l) => /FAIL|SILENT|MISSING-UN|passed|Screenshot fields/.test(l)).join("\n"));
  await browser.close();
})().catch((e) => { console.error("TEST RUN CRASHED:", e); process.exit(1); });
