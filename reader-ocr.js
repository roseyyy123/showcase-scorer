// On-device screenshot reading with Tesseract.js. Nothing leaves the phone.
// Exposes self.OCR = { readPokemon(canvas), readBuddySearch(canvas), warm() }.
(function () {
  "use strict";
  let workerPromise = null;

  function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker("eng", 1, {
        workerPath: "vendor/tesseract/worker.min.js",
        corePath: "vendor/tesseract/",
        langPath: "vendor/lang",
        gzip: true,
      }).catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  async function recognize(canvas, psm) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: String(psm || 6) }); // 6 = one block of text, works best on game screens
    const r = await w.recognize(canvas, {}, { text: true, blocks: true });
    const lines = [], words = [];
    for (const b of r.data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
      lines.push({ text: l.text.trim(), bbox: l.bbox, conf: l.confidence, words: l.words });
      for (const x of l.words) words.push({ text: x.text.trim(), bbox: x.bbox, conf: x.confidence });
    }
    return { text: r.data.text || "", lines, words };
  }

  function crop(src, x0, y0, x1, y1, scale) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(src.width, Math.round(x1)); y1 = Math.min(src.height, Math.round(y1));
    const s = scale || 1, c = document.createElement("canvas");
    c.width = Math.max(1, (x1 - x0) * s); c.height = Math.max(1, (y1 - y0) * s);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    return c;
  }

  // keep only white / near-white pixels as black text on white (for the white CP on bright backgrounds)
  function whiteText(c) {
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const white = Math.min(r, g, b) >= 232 && Math.max(r, g, b) - Math.min(r, g, b) <= 18;
      p[i] = p[i + 1] = p[i + 2] = white ? 0 : 255;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }
  // dark text on a light or pink strip: keep pixels clearly darker than the strip's background,
  // and cut the strip where a big dark shape (the team leader's hair) starts
  function darkText(c) {
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, lum = new Float32Array(c.width * c.height);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) lum[j] = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const bg = Array.from(lum).sort((a, b) => a - b)[Math.floor(lum.length * 0.6)];
    for (let j = 0; j < lum.length; j++) { const k = lum[j] < bg - 30 ? 0 : 255; p[j * 4] = p[j * 4 + 1] = p[j * 4 + 2] = k; }
    let cut = c.width;
    for (let x = 0; x < c.width; x++) { let n = 0; for (let y = 0; y < c.height; y++) if (p[(y * c.width + x) * 4] === 0) n++; if (n > c.height * 0.45) { cut = Math.max(0, x - 6); break; } }
    for (let y = 0; y < c.height; y++) for (let x = cut; x < c.width; x++) { const i = (y * c.width + x) * 4; p[i] = p[i + 1] = p[i + 2] = 255; }
    ctx.putImageData(d, 0, 0);
    return c;
  }
  const TYPE_WORDS = ["NORMAL", "FIRE", "WATER", "ELECTRIC", "GRASS", "ICE", "FIGHTING", "POISON", "GROUND", "FLYING", "PSYCHIC", "BUG", "ROCK", "GHOST", "DRAGON", "DARK", "STEEL", "FAIRY"];
  const num = (s) => parseFloat(String(s).replace(",", "."));

  // ---------- size tag badge (XXS / XS / XL / XXL) above the height value ----------
  async function readSizeTag(canvas, hw) {
    const W = canvas.width, h = hw.bbox.y1 - hw.bbox.y0;
    const rx0 = Math.max(0, hw.bbox.x0 - h), rx1 = Math.min(W, hw.bbox.x1 + 2 * h);
    const ry0 = Math.max(0, hw.bbox.y0 - 2 * h), ry1 = Math.min(canvas.height, hw.bbox.y0 + Math.round(h * 0.2));
    const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(rx0, ry0, rx1 - rx0, ry1 - ry0);
    const cw = d.width, ch = d.height, px = d.data;
    // badges are teal on ordinary screens and gold when the label says TALLEST / SHORTEST etc.
    const isTeal = (i) => { const R = px[i], G = px[i + 1], B = px[i + 2]; return G - R > 15 && B - R > 15 && Math.abs(G - B) < 30; };
    const isGold = (i) => { const R = px[i], G = px[i + 1], B = px[i + 2]; return R > 150 && G > 90 && B < 110 && R - B > 80 && G - B > 40; };
    let nT = 0, nG = 0;
    for (let i = 0; i < px.length; i += 4) { if (isTeal(i)) nT++; else if (isGold(i)) nG++; }
    const badgeColor = nG > nT ? isGold : isTeal;
    const teal = (x, y) => badgeColor((y * cw + x) * 4);
    let minx = cw, maxx = -1, miny = ch, maxy = -1, n = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (teal(x, y)) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    if (n < 50 || maxy - miny < h * 0.6) return ""; // no badge
    // text = non-badge pixels enclosed left and right by badge pixels
    const mask = [];
    for (let y = miny; y <= maxy; y++) {
      const row = [];
      for (let x = minx; x <= maxx; x++) {
        let hole = false;
        if (!teal(x, y)) {
          let l = false, r = false;
          for (let k = x - 1; k >= minx; k--) if (teal(k, y)) { l = true; break; }
          if (l) for (let k = x + 1; k <= maxx; k++) if (teal(k, y)) { r = true; break; }
          hole = l && r;
        }
        row.push(hole);
      }
      mask.push(row);
    }
    // keep only the tallest band of text rows (drops stray shapes under the letters)
    const bands = []; let cur = null;
    mask.forEach((row, i) => {
      const any = row.some(Boolean);
      if (any) { if (!cur) { cur = { a: i, b: i }; bands.push(cur); } else cur.b = i; } else cur = null;
    });
    if (!bands.length) return "?";
    const band = bands.reduce((m, b) => (b.b - b.a > m.b - m.a ? b : m));
    const S = 3, bw = maxx - minx + 1, bh = band.b - band.a + 1;
    const o = document.createElement("canvas"); o.width = (bw + 20) * S; o.height = (bh + 20) * S;
    const octx = o.getContext("2d");
    octx.fillStyle = "#fff"; octx.fillRect(0, 0, o.width, o.height); octx.fillStyle = "#000";
    for (let y = band.a; y <= band.b; y++) for (let x = 0; x < bw; x++) if (mask[y][x]) octx.fillRect((x + 10) * S, (y - band.a + 10) * S, S, S);
    const t = await recognize(o, 7);
    const s = t.text.toUpperCase().replace(/[^XLS]/g, "");
    const m = s.match(/X{1,2}[LS]/);
    return m && ["XXS", "XS", "XL", "XXL"].includes(m[0]) ? m[0] : "?"; // "?" = a badge is there but unreadable
  }

  // ---------- a Pokémon's page or appraisal screen ----------
  async function readPokemon(canvas) {
    const W = canvas.width, H = canvas.height;
    const r = await recognize(canvas, 6);
    const out = { species: "", nickname: "", form: "", cp: null, height_m: null, weight_kg: null, height_tag: "", buddy_level: "none", ivs: null, caught_date: "" };

    // CP: "CP245" near the top, else the tallest 2-5 digit number in the top 15%
    const top = r.lines.filter((l) => l.bbox.y1 < H * 0.15 && l.bbox.y0 > H * 0.05); // below the phone's status bar
    let cpPrefixed = false;
    for (const l of top) { const m = l.text.replace(/\s+/g, "").match(/cp(\d{2,5})/i); if (m) { out.cp = parseInt(m[1], 10); cpPrefixed = true; break; } }
    if (out.cp == null) {
      const cands = r.words.filter((w) => w.bbox.y1 < H * 0.15 && w.bbox.y0 > H * 0.05 && !/:/.test(w.text) && /\d{2,5}/.test(w.text))
        .sort((a, b) => (b.bbox.y1 - b.bbox.y0) - (a.bbox.y1 - a.bbox.y0));
      if (cands.length) out.cp = parseInt(cands[0].text.match(/\d{2,5}/)[0], 10);
    }

    // weight / height: "11.44kg ... 0.7m"
    let hWord = null;
    for (const w of r.words) {
      const t = w.text.replace(/[^\d.,a-zA-Z]/g, "");
      let m;
      if (out.weight_kg == null && (m = t.match(/^(\d+(?:[.,]\d+)?)kg$/i))) out.weight_kg = num(m[1]);
      else if (out.height_m == null && (m = t.match(/^(\d+(?:[.,]\d+)?)m$/i)) && w.bbox.y0 > H * 0.3) { out.height_m = num(m[1]); hWord = w; }
    }
    // second looks at fixed parts of the screen. They also give alternatives the app checks
    // against the species' size, so a value half hidden behind the leader isn't trusted blindly.
    out.alts = { cp: [], height_m: [], weight_kg: [] };
    for (const prep of [(c) => whiteText(c), (c) => c]) {
      const t = await recognize(prep(crop(canvas, 0, W * 0.09, W, W * 0.23, 1)), 7);
      const m = t.text.replace(/[oO]/g, "0").replace(/\s+/g, "").match(/\d{2,5}/g);
      if (m) out.alts.cp.push(parseInt(m.sort((a, b) => b.length - a.length)[0], 10));
    }
    const longest = out.alts.cp.slice().sort((a, b) => String(b).length - String(a).length)[0];
    if (out.cp == null || (longest != null && String(longest).length > String(out.cp).length)) out.cp = longest ?? out.cp; // a digit was dropped
    // a CP that wasn't clearly labelled "CP", disagrees between reads, or is under 100 may be partly hidden
    out.cp_unsure = out.cp == null || out.cp < 100 || out.alts.cp.some((x) => String(x).length !== String(out.cp).length);

    const anchor = r.lines.find((l) => l.bbox.y0 > H * 0.35 && l.bbox.y1 < H * 0.5 && l.conf > 60 && /\p{L}{3,}/u.test(l.text) && !/lucky|shadow|purified/i.test(l.text));
    const ay = anchor ? anchor.bbox.y0 : H * 0.41;
    const y0 = ay + W * 0.2, y1 = ay + W * 0.36;
    const tStats = await recognize(crop(canvas, 0, y0, W, y1, 1), 11);
    for (const w of tStats.words) {
      const tt = w.text.replace(/[^\d.,a-zA-Z]/g, ""); let m;
      if ((m = tt.match(/^(\d+(?:[.,]\d+)?)kg$/i))) out.alts.weight_kg.push(num(m[1]));
      else if ((m = tt.match(/^(\d+(?:[.,]\d+)?)m$/i))) {
        out.alts.height_m.push(num(m[1]));
        if (!hWord) hWord = { bbox: { x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0 + y0, y1: w.bbox.y1 + y0 } };
      }
    }
    // the height column alone (right third), in case a badge or the leader split the number
    const tH = await recognize(crop(canvas, W * 0.6, y0, W * 0.98, y1, 2), 11);
    for (const w of tH.words) { const m = w.text.replace(/[^\d.,a-zA-Z]/g, "").match(/^(\d+(?:[.,]\d+)?)m$/i); if (m) out.alts.height_m.push(num(m[1])); }
    if (out.weight_kg == null) out.weight_kg = out.alts.weight_kg[0] ?? null;
    if (out.height_m == null) out.height_m = out.alts.height_m[0] ?? null;

    // type labels under the type icons (they tell regional forms apart)
    try {
      const tt = (await recognize(darkText(crop(canvas, W * 0.3, ay + W * 0.31, W * 0.72, ay + W * 0.375, 2)), 7)).text.toUpperCase();
      out.types = TYPE_WORDS.filter((t) => new RegExp("\\b" + t + "\\b").test(tt));
      const partial = (tt.match(/\b[A-Z]{3,}\b/g) || []).filter((w) => !TYPE_WORDS.includes(w)).map((w) => TYPE_WORDS.find((t) => t.startsWith(w))).filter(Boolean);
      out.types.push(...partial.filter((t) => !out.types.includes(t)));
      out.type_dual = /\//.test(tt);
    } catch (e) { out.types = []; }

    if (hWord) { try { out.height_tag = await readSizeTag(canvas, hWord); } catch (e) { out.height_tag = "?"; } }
    else out.height_tag = "?"; // couldn't even find the height, so the tag is unknown

    // caught date (US format as shown in the game)
    const joined = r.lines.map((l) => l.text).join(" ");
    const dm = joined.match(/caught on\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    let dmm = dm;
    if (!dm && /caught on/i.test(joined)) { // the date line was missed: read the bottom message box on its own
      const t = await recognize(crop(canvas, 0, H - W * 0.24, W, H - W * 0.02, 1), 6);
      dmm = t.text.replace(/\s+/g, " ").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    }
    if (dmm) out.caught_date = `${dmm[3]}-${dmm[1].padStart(2, "0")}-${dmm[2].padStart(2, "0")}`; // shown as M/D/YYYY

    // species: any species name appearing on screen, preferring the big name line
    const names = self.SPECIES_NAMES || [];
    let best = null;
    for (const l of r.lines) {
      const ws = l.text.split(/\s+/).filter(Boolean);
      for (let i = 0; i < ws.length; i++) for (let k = 1; k <= 3 && i + k <= ws.length; k++) {
        const key = self.normName(ws.slice(i, i + k).join(" "));
        if (key.length >= 3 && names.has(key)) {
          const size = l.bbox.y1 - l.bbox.y0;
          if (!best || size > best.size) best = { key, size, text: ws.slice(i, i + k).join(" ") };
        }
      }
    }
    if (best) out.species = names.get(best.key);
    const cm = joined.match(/This (.{2,30}?) was caught/i); // names the species even when the Pokémon has a nickname
    if (cm && names.has(self.normName(cm[1]))) out.species = names.get(self.normName(cm[1]));
    // nickname: the big name line in the middle of the screen, when it isn't a species name
    const nameLine = r.lines.filter((l) => l.bbox.y0 > H * 0.35 && l.bbox.y1 < H * 0.5 && /^[\p{L}\d .'’♀♂-]{2,}$/u.test(l.text) && l.conf > 25 && !/lucky|pok[eé]mon|shadow|purified|\bhp\b/i.test(l.text))
      .sort((a, b) => (b.bbox.y1 - b.bbox.y0) - (a.bbox.y1 - a.bbox.y0))[0];
    if (nameLine && self.normName(nameLine.text) !== self.normName(out.species)) out.nickname = nameLine.text.trim();
    return out;
  }

  // ---------- a storage search result grid (e.g. "buddy3-5") ----------
  const UI_WORDS = new Set(["show", "evolutionary", "line", "tags", "pokemon", "pokémon", "eggs", "cp"]);
  async function readBuddySearch(canvas) {
    const W = canvas.width, H = canvas.height;
    const r = await recognize(canvas, 6);
    const sl = r.lines.find((l) => /buddy/i.test(l.text));
    const search_text = sl ? (sl.text.match(/buddy[\d\s,&-]*/i) || [""])[0].replace(/\s+/g, "") : "";
    const countM = r.lines.filter((l) => l.bbox.y1 < H * 0.15).map((l) => l.text).join(" ").match(/\(\s*(\d{1,4})\s*\)|[Q@©]\s*\(?\s*(\d{1,4})\s*\)/);
    const yMin = sl ? sl.bbox.y1 + H * 0.05 : H * 0.2;

    // name words, grouped into tiles by row and by column (3 columns)
    const words = r.words.filter((w) => w.bbox.y0 > yMin && w.conf > 60 && /^[\p{L}'’.♀♂-]{2,}$/u.test(w.text) && !UI_WORDS.has(w.text.toLowerCase()));
    const tiles = [];
    for (const w of words) {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2, col = Math.min(2, Math.floor(cx / (W / 3)));
      const t = tiles.find((t) => t.col === col && Math.abs(t.y0 - w.bbox.y0) < (w.bbox.y1 - w.bbox.y0) * 0.6);
      if (t) { t.words.push(w); t.x0 = Math.min(t.x0, w.bbox.x0); t.x1 = Math.max(t.x1, w.bbox.x1); }
      else tiles.push({ col, y0: w.bbox.y0, x0: w.bbox.x0, x1: w.bbox.x1, words: [w] });
    }
    // keep rows that look like name rows (a row with names across columns or a consistent spacing)
    const rowYs = [...new Set(tiles.map((t) => Math.round(t.y0 / 20)))].map((k) => k * 20).sort((a, b) => a - b);
    const gaps = rowYs.slice(1).map((y, i) => y - rowYs[i]).filter((g) => g > W * 0.2);
    gaps.sort((a, b) => a - b);
    const tileH = gaps.length ? gaps[Math.floor(gaps.length / 2)] : W * 0.36;

    const pokemon = [], skipped = [];
    for (const t of tiles.sort((a, b) => a.y0 - b.y0 || a.col - b.col)) {
      const name = t.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(" ");
      const cx = (t.x0 + t.x1) / 2;
      // the CP row sits about 0.4 to 0.65 tiles above the name: try the usual spot, then a little lower
      let digits = null, lastRead = "", cy0 = 0, cy1 = 0;
      for (const [a, b] of [[0.78, 0.5], [0.6, 0.33]]) {
        cy0 = t.y0 - tileH * a; cy1 = t.y0 - tileH * b;
        if (cy0 < yMin - H * 0.05) continue; // cut off above
        const c = crop(canvas, cx - W * 0.16, cy0, cx + W * 0.16, cy1, 2);
        const cr = await recognize(c, 7);
        lastRead = cr.text.trim();
        digits = (cr.text.replace(/[oO]/g, "0").match(/\d{2,5}/g) || []).sort((x, y) => y.length - x.length)[0];
        if (digits) break;
      }
      if (!digits) { skipped.push({ name, read: lastRead }); continue; }
      if (digits.length === 5) digits = digits.slice(1); // CP never reaches 10000: a sparkle or medal was read as a digit
      pokemon.push({ name, species: "", cp: parseInt(digits, 10), best_buddy: false });
    }
    return { search_text, pokemon, skipped, count: countM ? parseInt(countM[1] || countM[2], 10) : null };
  }

  self.OCR = { readPokemon, readBuddySearch, warm: () => getWorker().then(() => true, () => false), _recognize: recognize, _crop: crop };
})();
