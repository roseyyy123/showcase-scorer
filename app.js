"use strict";
// Showcase Scorer: standalone web app. Data stays in this browser unless the
// optional online reader is switched on (see /api/read in _worker.js).

const APP_VERSION = "1.3.1";
const SPECIES = self.SPECIES; // [name, form, dex, type1, type2, avgHeight, avgWeight, maxXXLHeight, estimated]
const TYPES = ["", "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];
const TYPE_COLORS = ["", "#8d8f77","#e2702e","#4f86d8","#d9b21c","#4f9e3f","#4fb3b8","#b33a32","#8d4a9e","#c99a45","#7e8fd6","#e5547b","#8d9b25","#a8913c","#4e5fa8","#5a3fd0","#5a4a40","#6f8394","#d77fc0"];
const BUDDY_LABEL = { none: "", good: "Good Buddy", great: "Great Buddy", ultra: "Ultra Buddy", best: "Best Buddy" };
const BUDDY_RANK = { none: 0, good: 1, great: 2, ultra: 3, best: 4 };
const SIZE_FORMS = { pumpkaboo: 1, gourgeist: 1 };
const TAG_TO_SIZE_FORM = { XXS: "Small Size", XS: "Small Size", "": "Average Size", XL: "Large Size", XXL: "Super Size" };

const $ = (id) => document.getElementById(id);
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const spLabel = (s) => s[1] ? (s[1].includes(s[0]) ? s[1] : `${s[0]} (${s[1]})`) : s[0];
const spKey = (s) => `${s[0]}|${s[1]}`;
const BY_LABEL = new Map(SPECIES.map((s) => [spLabel(s).toLowerCase(), s]));
const BY_KEY = new Map(SPECIES.map((s) => [spKey(s), s]));
// shared with reader-ocr.js
self.normName = norm;
self.SPECIES_NAMES = new Map(SPECIES.map((s) => [norm(s[0]), s[0]]));
const findByLabel = (t) => BY_LABEL.get(String(t || "").trim().toLowerCase()) || pickSpecies(t, "", F.tag.value);
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- scoring ----------
function points(sp, h, w, ivSum, xxl, ratioMax) {
  const avgH = sp[5], avgW = sp[6];
  const ph = 800 * (h / avgH) / ratioMax;
  const pw = 150 * (w / avgW) / (ratioMax + 0.5);
  const pi = 50 * ivSum / 45;
  const px = xxl ? 178 : 0;
  return { ph, pw, pi, px, total: ph + pw + pi + px };
}
function isXXL(sp, tag) {
  if (SIZE_FORMS[sp[0].toLowerCase()]) return sp[1] === "Super Size";
  return tag === "XXL";
}
function scoreRecord(r) {
  const sp = BY_KEY.get(r.sp);
  if (!sp || !(r.h > 0) || !(r.w > 0)) return null;
  const ivSum = (r.atk || 0) + (r.def || 0) + (r.hp || 0);
  const xxl = isXXL(sp, r.tag || "");
  const est = !!sp[8];
  let ratio = sp[7] / sp[5];
  if (est) {
    // unknown limit: use the chosen class, raised to the smallest one this Pokémon's height fits under
    ratio = r.cls || 1.75;
    const seen = r.h / sp[5];
    if (seen > ratio) ratio = [1.55, 1.75, 2].find((c) => c >= seen) || seen;
  }
  const mid = points(sp, r.h, r.w, ivSum, xxl, ratio);
  const lo = points(sp, Math.max(0, r.h - 0.005), Math.max(0, r.w - 0.005), ivSum, xxl, ratio).total;
  const hi = points(sp, r.h + 0.005, r.w + 0.005, ivSum, xxl, ratio).total;
  return { ...mid, lo: Math.round(lo), hi: Math.round(hi), mid: Math.round(mid.total), xxl, est };
}
function pickSpecies(name, formHint, tag) {
  const n = norm(name);
  if (!n) return null;
  const cands = SPECIES.filter((s) => norm(s[0]) === n);
  if (!cands.length) return null;
  if (SIZE_FORMS[cands[0][0].toLowerCase()]) return cands.find((s) => s[1] === TAG_TO_SIZE_FORM[tag || ""]) || cands[0];
  const hint = (formHint || "").trim().toLowerCase();
  if (hint) {
    const m = cands.find((s) => s[1].toLowerCase().includes(hint));
    if (m) return m;
  }
  return cands.find((s) => !s[1]) || cands[0];
}

// ---------- checking a reading against what the species can be ----------
// Height ÷ species average for each size tag (Pokémon GO's size classes), with a little slack for rounding.
const SIZE_CLASSES = { XXS: [0, 0.5], XS: [0.5, 0.75], "": [0.75, 1.25], XL: [1.25, 1.5], XXL: [1.5, 9] };
const maxRatio = (sp) => (sp[8] ? 2 : sp[7] / sp[5]);
const heightPlausible = (sp, h) => { const r = h / sp[5]; return r >= 0.47 && r <= maxRatio(sp) + 0.03; };
const weightPlausible = (sp, w) => { const r = w / sp[6]; return r >= 0.15 && r <= 5; };
function tagFits(sp, h, tag) {
  if (SIZE_FORMS[sp[0].toLowerCase()]) return true; // the tag picks the form instead
  const [lo, hi] = SIZE_CLASSES[tag || ""], r = h / sp[5];
  return r >= lo - 0.03 && r <= hi + 0.03;
}
function chooseForm(name, v, tag, h) {
  const cands = SPECIES.filter((s) => norm(s[0]) === norm(name));
  if (!cands.length) return { sp: null };
  if (SIZE_FORMS[cands[0][0].toLowerCase()]) return { sp: pickSpecies(name, "", tag) };
  if (cands.length === 1) return { sp: cands[0] };
  let pool = cands;
  if (v.form) { const m = cands.filter((s) => s[1].toLowerCase().includes(String(v.form).toLowerCase())); if (m.length) pool = m; }
  const types = (v.types || []).map((t) => TYPES.findIndex((x) => x.toUpperCase() === String(t).toUpperCase())).filter((i) => i > 0);
  if (types.length && pool.length > 1) {
    const score = (s) => types.reduce((a, t) => a + (s[3] === t || s[4] === t ? 2 : -3), 0) + (v.type_dual ? (s[4] ? 1 : -1) : 0);
    const top = Math.max(...pool.map(score)); pool = pool.filter((s) => score(s) === top);
  }
  if (pool.length > 1 && h) { const fit = pool.filter((s) => heightPlausible(s, h) && tagFits(s, h, tag)); if (fit.length) pool = fit; }
  const sameSize = pool.every((s) => s[5] === pool[0][5] && s[6] === pool[0][6] && s[7] === pool[0][7]);
  return { sp: pool.find((s) => !s[1]) || pool[0], formUnsure: !sameSize };
}
// Turn a reading (from the phone or the online reader) into a record plus the fields you should check.
function resolveReading(v, ivs) {
  const flags = [];
  const tag = ["XXS", "XS", "XL", "XXL"].includes(v.height_tag) ? v.height_tag : "";
  const alts = v.alts || {};
  const name = v.species && SPECIES.some((s) => norm(s[0]) === norm(v.species)) ? v.species : "";
  const forms = SPECIES.filter((s) => norm(s[0]) === norm(name));
  const uniq = (a) => [...new Set(a.filter((x) => typeof x === "number" && x > 0))];
  const hCands = uniq([v.height_m, ...(alts.height_m || [])]), wCands = uniq([v.weight_kg, ...(alts.weight_kg || [])]);
  let h = forms.length ? hCands.find((x) => forms.some((s) => heightPlausible(s, x))) ?? null : (hCands[0] ?? null);
  const { sp, formUnsure } = name ? chooseForm(name, v, tag, h) : { sp: null };
  if (sp && h != null && !heightPlausible(sp, h)) h = hCands.find((x) => heightPlausible(sp, x)) ?? null;
  let w = sp ? wCands.find((x) => weightPlausible(sp, x)) ?? null : (wCands[0] ?? null);
  if (!sp) flags.push({ f: "f-species", m: v.species ? `couldn't match "${v.species}", pick the species` : (v.nickname ? `"${v.nickname}" looks like a nickname, pick the species` : "pick the species") });
  else if (formUnsure) flags.push({ f: "f-species", m: `check the form (${forms.map((s) => s[1] || "regular").join(" or ")})` });
  if (h == null) flags.push({ f: "f-h", m: hCands.length ? "the height looks partly hidden, type it in" : "type in the height" });
  if (w == null) flags.push({ f: "f-w", m: wCands.length ? "the weight looks partly hidden, type it in" : "type in the weight" });
  if (h == null && v.height_tag !== "?" && !tag) flags.push({ f: "f-tag", m: "check the size tag too, it's often hidden with the height" });
  else if (v.height_tag === "?") flags.push({ f: "f-tag", m: "couldn't read the size tag; XXL adds 178 points" });
  else if (sp && h != null && !tagFits(sp, h, tag)) flags.push({ f: "f-tag", m: tag ? `check the size tag (${tag} doesn't match this height)` : "check the size tag (this height suggests one)" });
  else if (sp && SIZE_FORMS[sp[0].toLowerCase()] && !v.online && !tag) flags.push({ f: "f-tag", m: "check the size tag; for this species it decides the size form, and none was found" });
  if (v.cp == null || v.cp_unsure) flags.push({ f: "f-cp", m: "check the CP" });
  if (!ivs && !v.ivs) flags.push({ f: "f-atk", m: "add an appraisal screenshot or type the IVs" });
  const rec = {
    sp: sp ? spKey(sp) : "", spText: v.species || "",
    nick: v.nickname || "", cp: v.cp ?? null, h, w, tag,
    buddy: BUDDY_RANK[v.buddy_level] != null ? v.buddy_level : "none",
    atk: ivs ? ivs.atk : v.ivs?.atk ?? null, def: ivs ? ivs.def : v.ivs?.def ?? null, hp: ivs ? ivs.hp : v.ivs?.hp ?? null,
    caught: /^\d{4}-\d{2}-\d{2}$/.test(v.caught_date || "") ? v.caught_date : "",
  };
  return { rec, flags };
}
function showFlags(flags) {
  document.querySelectorAll(".check").forEach((el) => el.classList.remove("check"));
  flags.forEach((x) => { const el = $(x.f); if (el) el.classList.add("check"); });
}

// ---------- IV bars measured from pixels ----------
function measureIVs(c) {
  const W = c.width, H = c.height;
  const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const kind = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // tolerances allow for JPEG compression, which shifts these flat colours by several levels
    const neutral = Math.abs(r - g) <= 14 && Math.abs(g - b) <= 14;
    if (neutral && Math.min(r, g, b) >= 234) return 0;                          // white / near-white edge
    if (r >= 205 && r - g >= 50 && r - b >= 70) return 1;                       // filled: orange, or pink when the stat is 15
    if (neutral && r >= 198) return 2;                                          // empty grey
    return 3;
  };
  const maxGap = Math.max(6, Math.round(W * 0.015)), minSpan = W * 0.22;
  const rows = [];
  for (let y = Math.floor(H * 0.25); y < H; y++) {
    let start = -1, last = -1, fill = 0, empty = 0, gap = 0, odd = 0;
    const close = () => {
      if (start >= 0) {
        const span = last - start + 1;
        // the bar must sit on the white appraisal card: look a few pixels past each end for white
        const whiteNear = (x0, dir) => { for (let k = 2; k <= 8; k++) { const x = x0 + dir * k; if (x < 0 || x >= W) return false; if (kind((y * W + x) * 4) === 0) return true; } return false; };
        if (span >= minSpan && (fill + empty) / span >= 0.85 && whiteNear(start, -1) && whiteNear(last, 1)) rows.push({ y, x0: start, x1: last, fill, empty });
      }
      start = -1; fill = 0; empty = 0; gap = 0; odd = 0;
    };
    for (let x = 0; x < W; x++) {
      const k = kind((y * W + x) * 4);
      if (k === 1 || k === 2) {
        if (start < 0) start = x;
        last = x; gap = 0; odd = 0;
        if (k === 1) fill++; else empty++;
      } else if (start >= 0) {
        gap++;
        odd = k === 3 ? odd + 1 : 0;
        if (gap > maxGap || odd > 6) close();
      }
    }
    close();
  }
  const bands = [];
  for (const r of rows) {
    const b = bands[bands.length - 1];
    if (b && r.y - b.y1 <= 1 && Math.abs(r.x0 - b.x0) < W * 0.02 && Math.abs(r.x1 - b.x1) < W * 0.02) { b.y1 = r.y; b.rows.push(r); }
    else bands.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1, rows: [r] });
  }
  const good = bands.filter((b) => b.y1 - b.y0 + 1 >= Math.max(4, H * 0.003));
  for (let i = good.length - 3; i >= 0; i--) {
    const t = good.slice(i, i + 3);
    const sameX = t.every((b) => Math.abs(b.x0 - t[0].x0) < W * 0.02 && Math.abs(b.x1 - t[0].x1) < W * 0.02);
    const g1 = t[1].y0 - t[0].y0, g2 = t[2].y0 - t[1].y0;
    if (sameX && g1 > 0 && Math.abs(g1 - g2) <= 0.25 * g1) {
      const iv = t.map((b) => { const m = b.rows[Math.floor(b.rows.length / 2)]; return Math.round(15 * m.fill / Math.max(1, m.fill + m.empty)); });
      return { atk: iv[0], def: iv[1], hp: iv[2] };
    }
  }
  return null;
}

// ---------- images ----------
function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That file isn't an image this browser can open."));
    img.src = URL.createObjectURL(file);
  });
}
function toCanvas(img, maxW) {
  const s = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ---------- screenshot readers: on this phone, or the optional online reader ----------
const READER_KEY = "showcase-scorer-reader", CONSENT_KEY = "showcase-scorer-online-consent";
let online = { available: false, provider: "", notice: "" };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
function readerMode() { return online.available && lsGet(READER_KEY) === "online" && lsGet(CONSENT_KEY) === "yes" ? "online" : "device"; }
async function checkOnline() {
  try {
    const r = await fetch("api/health", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); online = { available: !!j.online, provider: j.provider || "an online AI service", notice: j.notice || "", reports: !!j.reports }; }
  } catch { /* no server: on-device only */ }
  renderReader();
}
async function readOnline(task, canvases) {
  const images = canvases.map((c) => toCanvas(c, 1000).toDataURL("image/jpeg", 0.85).split(",")[1]);
  const r = await fetch("api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, images }) });
  if (r.status === 429) { const e = new Error("The online reader is busy or you've hit today's limit. Try again later, or switch to reading on this phone."); e.code = "rate_limited"; throw e; }
  if (!r.ok) throw new Error("The online reader didn't answer.");
  return r.json();
}
function renderReader() {
  const wrap = $("reader-online");
  wrap.classList.toggle("hidden", !online.available);
  $("reader-note").textContent = online.available ? "" : "Screenshots are read on this phone. Nothing is uploaded.";
  if (!online.available) return;
  const wantsOnline = lsGet(READER_KEY) === "online"; // chosen, maybe still waiting for consent
  $("rd-device").checked = !wantsOnline;
  $("rd-online").checked = wantsOnline;
  $("consent-text").textContent = `Online reading sends each screenshot you add to this site's server and to ${online.provider}. Screenshots aren't stored by this app. ${online.notice}`.trim();
  $("consent").classList.toggle("hidden", lsGet(CONSENT_KEY) === "yes" || lsGet(READER_KEY) !== "online");
}
$("rd-device").addEventListener("change", () => { lsSet(READER_KEY, "device"); renderReader(); });
$("rd-online").addEventListener("change", () => { lsSet(READER_KEY, "online"); renderReader(); });
$("consent-yes").addEventListener("click", () => { lsSet(CONSENT_KEY, "yes"); renderReader(); });
$("consent-no").addEventListener("click", () => { lsSet(READER_KEY, "device"); renderReader(); });

// ---------- storage: this browser ----------
const LS_KEY = "showcase-scorer-v1", LS_BUDDY = "showcase-scorer-buddies-v1";
let items = [];
let roster = []; // [{name, species, cp, lo, hi}] from buddy search screenshots
try { items = JSON.parse(lsGet(LS_KEY) || "[]"); } catch { items = []; }
try { roster = JSON.parse(lsGet(LS_BUDDY) || "[]"); } catch { roster = []; }
function saveAll() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); localStorage.setItem(LS_BUDDY, JSON.stringify(roster)); return true; }
  catch { return false; }
}
function saveItem(r) {
  const i = items.findIndex((x) => x.id === r.id);
  if (i >= 0) items[i] = r; else items.push(r);
  if (!saveAll()) throw new Error("This browser wouldn't save. Check that it isn't in Private Browsing.");
  render();
}
function deleteItem(id) { items = items.filter((x) => x.id !== id); saveAll(); render(); }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- review form ----------
let editing = null;
const F = { cls: $("f-cls"), sp: $("f-species"), nick: $("f-nick"), cp: $("f-cp"), h: $("f-h"), w: $("f-w"), tag: $("f-tag"), buddy: $("f-buddy"), atk: $("f-atk"), def: $("f-def"), hp: $("f-hp"), caught: $("f-caught") };
const numIn = (el) => { const v = parseFloat(el.value); return Number.isFinite(v) ? v : null; };
const ivNum = (el) => { const v = parseInt(el.value, 10); return Number.isFinite(v) ? Math.min(15, Math.max(0, v)) : null; };

function formRecord() {
  const sp = findByLabel(F.sp.value);
  return {
    id: editing && editing.id ? editing.id : "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    sp: sp ? spKey(sp) : "",
    nick: F.nick.value.trim(), cp: numIn(F.cp), h: numIn(F.h), w: numIn(F.w), tag: F.tag.value,
    cls: sp && sp[8] ? parseFloat(F.cls.value) : null,
    buddy: F.buddy.value, atk: ivNum(F.atk), def: ivNum(F.def), hp: ivNum(F.hp), caught: F.caught.value,
    added: editing && editing.added ? editing.added : Date.now(),
  };
}
function fillForm(r) {
  const sp = BY_KEY.get(r.sp);
  F.sp.value = sp ? spLabel(sp) : (r.spText || "");
  F.nick.value = r.nick || ""; F.cp.value = r.cp ?? ""; F.h.value = r.h ?? ""; F.w.value = r.w ?? "";
  F.tag.value = r.tag || ""; F.buddy.value = r.buddy || "none"; F.cls.value = String(r.cls || 1.75);
  F.atk.value = r.atk ?? ""; F.def.value = r.def ?? ""; F.hp.value = r.hp ?? ""; F.caught.value = r.caught || "";
  updatePreview();
}
function typeChips(sp) {
  if (!sp) return "";
  return [sp[3], sp[4]].filter(Boolean).map((t) => `<span class="chip t" style="background:${TYPE_COLORS[t]}">${TYPES[t]}</span>`).join("");
}
function eligibility(sp, buddy) {
  const parts = [`the <b>${esc(sp[0])}</b> showcase`];
  [sp[3], sp[4]].filter(Boolean).forEach((t) => parts.push(`<b>${TYPES[t]}</b>-type showcases`));
  if (BUDDY_RANK[buddy] >= 2) parts.push(`<b>Great Buddy</b> showcases`);
  return "Counts the same in " + parts.join(", ").replace(/, ([^,]*)$/, " and $1") + "." +
    (BUDDY_RANK[buddy] < 2 ? " Not eligible for Great Buddy showcases yet." : "");
}
function updatePreview() {
  const r = formRecord();
  const sp = BY_KEY.get(r.sp);
  $("type-chips").innerHTML = sp ? typeChips(sp) + (SIZE_FORMS[sp[0].toLowerCase()] ? `<span class="chip">Size form follows the height tag</span>` : "") : (F.sp.value ? `<span class="chip">Pick a species from the list</span>` : "");
  $("cls-wrap").classList.toggle("hidden", !(sp && sp[8]));
  const s = scoreRecord(r);
  if (!s) {
    $("score-big").textContent = "—";
    $("score-range").textContent = sp ? "Add height and weight" : "Pick a species";
    $("score-bars").innerHTML = ""; $("elig").innerHTML = ""; $("save-btn").disabled = !sp;
    return;
  }
  $("score-big").textContent = s.mid;
  $("score-range").textContent = (s.lo === s.hi ? "points" : `points, between ${s.lo} and ${s.hi}`) + (s.est ? " (estimate)" : "");
  const bar = (label, v, max) => `<div class="bar"><span>${label}</span><span class="track"><span class="fill" style="width:${Math.min(100, 100 * v / max)}%"></span></span><span>${Math.round(v)} / ${max}</span></div>`;
  $("score-bars").innerHTML = bar("Height", s.ph, 800) + bar("Weight", s.pw, 150) + bar("IVs", s.pi, 50) + bar("XXL", s.px, 178);
  $("elig").innerHTML = eligibility(sp, r.buddy);
  $("save-btn").disabled = false;
}
Object.values(F).forEach((el) => el.addEventListener("input", () => {
  el.classList.remove("check");
  if (el === F.tag) { // Pumpkaboo / Gourgeist: the height tag decides the size form
    const sp = findByLabel(F.sp.value);
    if (sp && SIZE_FORMS[sp[0].toLowerCase()]) { const want = pickSpecies(sp[0], "", F.tag.value); if (want && want !== sp) F.sp.value = spLabel(want); }
  }
  updatePreview();
}));
function openReview(r, thumbs) {
  editing = r;
  $("review").classList.remove("hidden");
  $("delete-btn").classList.toggle("hidden", !items.some((x) => x.id === r.id));
  $("thumbs").innerHTML = "";
  (thumbs || []).forEach((src) => { const i = document.createElement("img"); i.src = src; i.alt = "Screenshot"; $("thumbs").appendChild(i); });
  fillForm(r);
  showFlags([]);
  $("review").scrollIntoView({ behavior: "smooth", block: "start" });
}
function setStatus(msg, err) { const s = $("status"); s.textContent = msg; s.classList.toggle("err", !!err); }

// merge readings from several screenshots of one Pokémon (first value found wins)
function mergeReads(list) {
  const out = {};
  for (const v of list) for (const [k, val] of Object.entries(v || {})) {
    if (val == null || val === "" || (k === "buddy_level" && val === "none")) continue;
    if (out[k] == null || out[k] === "") out[k] = val;
  }
  return out;
}

// ---------- reading screenshots: one card per Pokémon ----------
let batch = [];        // [{bid, rec, flags, thumbs, ivNote}]
let batchOpen = null;  // bid of the batch card being edited
// A page screenshot and an appraisal screenshot are the same Pokémon only if they clearly match.
function sameMon(a, b) {
  if (!a.v.species || norm(a.v.species) !== norm(b.v.species)) return false;
  if (a.ivs && b.ivs && JSON.stringify(a.ivs) !== JSON.stringify(b.ivs)) return false;
  if (a.v.cp && b.v.cp && a.v.cp === b.v.cp) return true;
  return !!(a.v.height_m && a.v.height_m === b.v.height_m && a.v.weight_kg && a.v.weight_kg === b.v.weight_kg);
}
function mergeGroup(group) {
  const v = mergeReads(group.map((g) => g.v));
  v.alts = { cp: [], height_m: [], weight_kg: [] };
  v.types = [];
  for (const g of group) {
    for (const k of Object.keys(v.alts)) v.alts[k].push(...((g.v.alts && g.v.alts[k]) || []));
    for (const t of g.v.types || []) if (!v.types.includes(t)) v.types.push(t);
    if (g.v.type_dual) v.type_dual = true;
    if (g.v.cp_unsure && v.cp === g.v.cp) v.cp_unsure = true;
  }
  const withIv = group.find((g) => g.ivs);
  return { v, ivs: withIv ? withIv.ivs : null, thumbs: group.map((g) => g.src), online: group.every((g) => g.online) };
}
const scoreFlags = (flags) => flags.filter((x) => x.f !== "f-cp"); // CP doesn't change the score
function makeCard(group) {
  const { v, ivs, thumbs, online } = mergeGroup(group);
  if (online) v.online = true;
  const { rec, flags } = resolveReading(v, ivs);
  const bl = rosterLevel(rec);
  if (bl && BUDDY_RANK[bl.level] > BUDDY_RANK[rec.buddy]) { rec.buddy = bl.level; rec.buddyFrom = "list"; }
  const ivNote = ivs ? "IVs were measured from the appraisal bars." : (v.ivs ? "IVs were estimated from the screenshot. Check them against the appraisal bars." : "No appraisal found. Add an appraisal screenshot or type the IVs.");
  return { bid: "b" + Math.random().toString(36).slice(2, 9), rec, flags, thumbs, ivNote };
}
function cardStatus(card) {
  const buddyNote = card.rec.buddyFrom === "list" ? ` ${BUDDY_LABEL[card.rec.buddy]} comes from your buddy list.` : "";
  return card.flags.length ? `Please check: ${card.flags.map((x) => x.m).join("; ")}.${buddyNote}` : `Check the details, then save.${buddyNote}`;
}
function openCard(card) {
  batchOpen = card.bid;
  openReview(card.rec, card.thumbs);
  showFlags(card.flags);
  const note = $("iv-note"); note.classList.remove("hidden"); note.textContent = card.ivNote;
  setStatus(cardStatus(card), card.flags.length > 0);
}
function renderBatch() {
  const sec = $("batch");
  sec.classList.toggle("hidden", batch.length === 0);
  if (!batch.length) return;
  const ready = batch.filter((c) => c.rec.sp && !scoreFlags(c.flags).length).length;
  $("batch-h").textContent = `Screenshots read: ${batch.length} Pokémon`;
  $("batch-save").textContent = ready ? `Save ${ready} ready` : "Save ready";
  $("batch-save").disabled = !ready;
  $("batch-list").innerHTML = batch.map((c) => {
    const sp = BY_KEY.get(c.rec.sp), s = scoreRecord(c.rec), n = scoreFlags(c.flags).length;
    const title = sp ? esc(spLabel(sp)) + (c.rec.nick ? ` <span class="muted">· ${esc(c.rec.nick)}</span>` : "") : `<span class="muted">Species not found</span>`;
    return `<button type="button" class="item" data-bid="${c.bid}">
      <span class="name">${title}</span>
      <span class="pts">${s ? s.mid : "—"}<small>points</small></span>
      <span class="meta">CP ${c.rec.cp ?? "?"} · ${c.rec.h ?? "?"} m · ${c.rec.w ?? "?"} kg · ${c.rec.atk != null ? `${c.rec.atk}/${c.rec.def}/${c.rec.hp}` : "IVs ?"} · ${c.thumbs.length} screenshot${c.thumbs.length > 1 ? "s" : ""}</span>
      <span class="chips">${n ? `<span class="chip warn">${n} to check</span>` : '<span class="chip ok">Ready</span>'}${s && s.xxl ? '<span class="chip xxl">XXL</span>' : ""}</span>
    </button>`;
  }).join("");
}
$("batch-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-bid]"); if (!b) return;
  const card = batch.find((c) => c.bid === b.dataset.bid); if (card) openCard(card);
});
$("batch-save").addEventListener("click", () => {
  const ready = batch.filter((c) => c.rec.sp && !scoreFlags(c.flags).length);
  try {
    for (const c of ready) saveItem({ ...c.rec, id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), added: Date.now() });
    batch = batch.filter((c) => !ready.includes(c));
    renderBatch();
    setStatus(`Saved ${ready.length}.${batch.length ? ` ${batch.length} still need a check: tap each one.` : ""}`);
  } catch (e) { setStatus(e.message, true); }
});
$("batch-clear").addEventListener("click", () => {
  const b = $("batch-clear");
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to discard"; return; }
  b.dataset.confirm = ""; b.textContent = "Discard all";
  batch = []; batchOpen = null; renderBatch(); $("review").classList.add("hidden");
});

$("file-in").addEventListener("change", async (ev) => {
  const files = [...ev.target.files].slice(0, 20);
  ev.target.value = "";
  if (!files.length) return;
  const mode = readerMode();
  let fellBack = "";
  try {
    // read every screenshot on its own
    const reads = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Reading screenshot ${i + 1} of ${files.length}${mode === "online" ? " online" : ""}…${i === 0 && mode !== "online" ? " The first one takes a little longer." : ""}`);
      const img = await loadImage(files[i]);
      const c = toCanvas(img, 1400);
      let v = null, online = false;
      if (mode === "online" && !fellBack) {
        try { v = await readOnline("pokemon", [c]); online = true; } catch (e) { fellBack = e.message; }
      }
      if (!v) v = await self.OCR.readPokemon(c);
      reads.push({ v, ivs: measureIVs(c), src: img.src, online });
    }
    // pair up screenshots of the same Pokémon (in upload order); never combine different ones
    const groups = [];
    for (const r of reads) { const g = groups.find((grp) => grp.length < 3 && grp.every((x) => sameMon(x, r))); if (g) g.push(r); else groups.push([r]); }
    const cards = groups.map(makeCard);
    const lead = fellBack ? `${fellBack} Read on this phone instead. ` : "";
    if (cards.length === 1 && !batch.length) {
      openCard(cards[0]);
      batchOpen = null; // a single Pokémon goes straight to the form
      setStatus(lead + "Done. " + cardStatus(cards[0]), !!lead || cards[0].flags.length > 0);
    } else {
      batch.push(...cards);
      renderBatch();
      $("review").classList.add("hidden");
      const ready = cards.filter((c) => c.rec.sp && !scoreFlags(c.flags).length).length;
      setStatus(`${lead}Read ${files.length} screenshot${files.length > 1 ? "s" : ""}: ${cards.length} Pokémon. ${ready} ready to save${cards.length - ready ? `, ${cards.length - ready} need a check` : ""}.`, !!lead);
      $("batch").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    setStatus((e && e.message) || "Something went wrong reading those screenshots.", true);
  }
});
$("manual-btn").addEventListener("click", () => { batchOpen = null; $("iv-note").classList.add("hidden"); openReview({ buddy: "none" }, []); setStatus(""); F.sp.focus(); });
$("cancel-btn").addEventListener("click", () => { $("review").classList.add("hidden"); editing = null; batchOpen = null; });
$("save-btn").addEventListener("click", () => {
  const r = formRecord();
  if (!r.sp) { setStatus("Pick a species from the list before saving.", true); F.sp.focus(); return; }
  try {
    saveItem(r); $("review").classList.add("hidden"); editing = null;
    if (batchOpen) { batch = batch.filter((c) => c.bid !== batchOpen); batchOpen = null; renderBatch(); }
    setStatus(batch.length ? `Saved. ${batch.length} left in this batch.` : "Saved.");
  }
  catch (e) { setStatus(e.message, true); }
});
$("delete-btn").addEventListener("click", () => {
  if (!editing) return;
  const btn = $("delete-btn");
  if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Tap again to delete"; return; }
  btn.dataset.confirm = ""; btn.textContent = "Delete";
  deleteItem(editing.id); $("review").classList.add("hidden"); editing = null;
});

// ---------- buddy list from search screenshots ----------
const LEVEL_NAME = { 2: "good", 3: "great", 4: "ultra", 5: "best" };
function rosterLevel(r) {
  const sp = BY_KEY.get(r.sp);
  if (!sp || r.cp == null) return null;
  const same = (e) => norm(e.species) === norm(sp[0]) || norm(e.name) === norm(sp[0]) || (r.nick && norm(e.name) === norm(r.nick));
  const cpsOf = (e) => e.cps || [e.cp];
  let m = roster.find((e) => cpsOf(e).includes(r.cp) && same(e));
  if (!m) { // a current Best Buddy shows a boosted CP (about 7% higher), so allow a close match if it's the only one
    const near = roster.filter((e) => same(e) && cpsOf(e).some((c) => Math.abs(c - r.cp) / Math.min(c, r.cp) <= 0.08));
    if (near.length === 1) m = near[0];
  }
  return m && LEVEL_NAME[m.lo] ? { level: LEVEL_NAME[m.lo], exact: m.lo === m.hi } : null;
}
function renderRoster() {
  const counts = {}; roster.forEach((e) => { if (e.lo === e.hi) counts[e.lo] = (counts[e.lo] || 0) + 1; });
  const ranged = roster.filter((e) => e.lo !== e.hi).length;
  const parts = [5, 4, 3, 2].filter((l) => counts[l]).map((l) => `${counts[l]} ${BUDDY_LABEL[LEVEL_NAME[l]]}`);
  if (ranged) parts.push(`${ranged} Great Buddy or higher`);
  const el = $("buddy-status");
  if (!el.dataset.busy) { el.classList.remove("err"); el.textContent = roster.length ? `Your buddy list has ${roster.length}: ${parts.join(", ")}.` : "No buddy list yet."; }
  $("buddy-clear").classList.toggle("hidden", !roster.length);
}
// The same Pokémon can appear in a range search (buddy3-5) and an exact one (buddy5) with slightly
// different CPs (the current Best Buddy's CP boost). Fold those into one entry with the exact level.
function consolidateRoster() {
  const key = (e) => norm(e.species || e.name);
  const close = (a, b) => (a.cps || [a.cp]).some((c) => (b.cps || [b.cp]).some((d) => Math.abs(c - d) / Math.min(c, d) <= 0.08));
  const inside = (exact, range) => exact.lo === exact.hi && range.lo !== range.hi && exact.lo >= range.lo && exact.lo <= range.hi;
  const out = [];
  for (const e of roster) {
    const twin = out.find((x) => key(x) === key(e) && close(x, e) && (inside(e, x) || inside(x, e)));
    if (!twin) { out.push({ ...e }); continue; }
    if (e.lo === e.hi) { twin.lo = e.lo; twin.hi = e.hi; }
    twin.cps = [...new Set([...(twin.cps || [twin.cp]), ...(e.cps || [e.cp])])];
  }
  const before = roster.length;
  roster = out;
  return before - out.length;
}
function applyRosterToSaved() {
  let n = 0;
  items = items.map((r) => {
    const m = rosterLevel(r);
    if (m && (m.exact ? m.level !== r.buddy : BUDDY_RANK[m.level] > BUDDY_RANK[r.buddy])) { n++; return { ...r, buddy: m.level }; }
    return r;
  });
  if (n) { saveAll(); render(); }
  return n;
}
$("buddy-in").addEventListener("change", async (ev) => {
  const files = [...ev.target.files].slice(0, 12);
  ev.target.value = "";
  if (!files.length) return;
  const mode = readerMode();
  const el = $("buddy-status"); el.dataset.busy = "1"; el.classList.remove("err");
  let added = 0, read = 0, expected = null, goodNote = false;
  const problems = [];
  for (let i = 0; i < files.length; i++) {
    el.textContent = `Reading screenshot ${i + 1} of ${files.length}…`;
    try {
      const c = toCanvas(await loadImage(files[i]), 1400);
      let v = null;
      if (mode === "online") { try { v = await readOnline("buddy", [c]); } catch (e) { if (!problems.length) problems.push(e.message + " Read on this phone instead."); } }
      if (!v) v = await self.OCR.readBuddySearch(c);
      if (v.count) expected = v.count;
      const m = String(v.search_text || "").match(/buddy\s*(\d)(?:\s*-\s*(\d))?/i);
      if (!m) { problems.push(`Screenshot ${i + 1} doesn't show a buddy search (like buddy3-5) in the search bar.`); continue; }
      const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
      if (lo === 2) goodNote = true;
      if (lo < 2) { problems.push(`Screenshot ${i + 1} searches ${m[0]}, which includes Pokémon below Good Buddy. Search buddy3-5 instead.`); continue; }
      for (const p of v.pokemon || []) {
        const cp = parseInt(p.cp, 10); if (!Number.isFinite(cp)) continue;
        read++;
        const plo = p.best_buddy === true && hi === 5 ? 5 : lo, phi = p.best_buddy === true && hi === 5 ? 5 : hi;
        const species = p.species || (pickSpecies(p.name) || [""])[0];
        const e = roster.find((x) => x.cp === cp && norm(x.name) === norm(p.name));
        if (e) { if (plo === phi || e.lo !== e.hi) { e.lo = plo; e.hi = phi; e.species = species || e.species; } }
        else { roster.push({ name: p.name || species || "", species: species || p.name || "", cp, lo: plo, hi: phi }); added++; }
      }
    } catch (e) { problems.push((e && e.message) || "A screenshot couldn't be read."); }
  }
  added = Math.max(0, added - consolidateRoster());
  if (!saveAll()) problems.push("This browser wouldn't save the buddy list.");
  const updated = applyRosterToSaved();
  delete el.dataset.busy; renderRoster();
  const extra = (added ? ` Added ${added}.` : "") + (updated ? ` Updated the buddy level on ${updated} saved Pokémon.` : "") +
    (expected && read < expected ? ` The search found ${expected}; scroll down and add another screenshot for the rest.` : "") +
    (goodNote ? " That search includes Good Buddies, which can't enter Great Buddy showcases. Search buddy3-5 instead." : "");
  if (problems.length) { el.textContent = problems[0] + extra; el.classList.add("err"); }
  else el.textContent += extra;
});
$("buddy-clear").addEventListener("click", () => {
  const b = $("buddy-clear");
  if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to clear"; return; }
  b.dataset.confirm = ""; b.textContent = "Clear buddy list";
  roster = []; saveAll(); renderRoster();
});
["f-cp", "f-species", "f-nick"].forEach((id) => $(id).addEventListener("change", () => {
  const m = rosterLevel(formRecord());
  if (m && BUDDY_RANK[m.level] > BUDDY_RANK[F.buddy.value]) { F.buddy.value = m.level; updatePreview(); }
}));

// ---------- list ----------
let filter = "all";
const EXAMPLE = { id: "example", sp: "Pumpkaboo|Super Size", nick: "", cp: 245, h: 0.7, w: 11.44, tag: "XXL", buddy: "none", atk: 4, def: 5, hp: 11, caught: "2026-10-30", added: 0, example: true };
function itemMatches(r, sp) {
  if (filter === "all") return true;
  if (filter === "buddy") return BUDDY_RANK[r.buddy] >= 2;
  const t = Number(filter);
  return sp[3] === t || sp[4] === t;
}
function render() {
  const rows = items.map((r) => ({ r, sp: BY_KEY.get(r.sp), s: scoreRecord(r) })).filter((x) => x.sp);
  const present = new Set(); rows.forEach((x) => { present.add(x.sp[3]); if (x.sp[4]) present.add(x.sp[4]); });
  const fl = [["all", "All"], ...[...present].sort((a, b) => TYPES[a].localeCompare(TYPES[b])).map((t) => [String(t), TYPES[t]])];
  if (rows.some((x) => BUDDY_RANK[x.r.buddy] >= 2)) fl.push(["buddy", "Great Buddy+"]);
  if (!fl.some(([k]) => k === filter)) filter = "all";
  $("filters").innerHTML = fl.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${esc(l)}</button>`).join("");
  $("filters").classList.toggle("hidden", rows.length === 0);
  const sort = $("sort").value;
  const shown = rows.filter((x) => itemMatches(x.r, x.sp)).sort((a, b) =>
    sort === "recent" ? (b.r.caught || "").localeCompare(a.r.caught || "") || (b.r.added - a.r.added) : ((b.s ? b.s.mid : -1) - (a.s ? a.s.mid : -1)));
  const list = shown.length ? shown : (rows.length ? [] : [{ r: EXAMPLE, sp: BY_KEY.get(EXAMPLE.sp), s: scoreRecord(EXAMPLE) }]);
  $("list").innerHTML = list.map(({ r, sp, s }) => {
    const iv = [r.atk, r.def, r.hp].every((v) => v != null) ? `${r.atk}/${r.def}/${r.hp}` : "IVs ?";
    const title = r.nick ? `${esc(r.nick)} <span class="muted">· ${esc(spLabel(sp))}</span>` : esc(spLabel(sp));
    return `<button type="button" class="item${r.example ? " example" : ""}" data-id="${esc(r.id)}">
      <span class="name">${r.example ? "Example: " : ""}${title}</span>
      <span class="pts">${s ? s.mid : "—"}<small>${s && s.lo !== s.hi ? `${s.lo}–${s.hi}` : "points"}</small></span>
      <span class="meta">CP ${r.cp ?? "?"} · ${r.h ?? "?"} m · ${r.w ?? "?"} kg · ${iv}${r.caught ? " · caught " + esc(r.caught) : ""}</span>
      <span class="chips">${typeChips(sp)}${s && s.xxl ? '<span class="chip xxl">XXL</span>' : (r.tag ? `<span class="chip">${esc(r.tag)}</span>` : "")}${BUDDY_LABEL[r.buddy] ? `<span class="chip buddy">${BUDDY_LABEL[r.buddy]}</span>` : ""}${s && s.est ? '<span class="chip">Estimate</span>' : ""}</span>
    </button>`;
  }).join("") || `<p class="muted">Nothing saved matches this filter.</p>`;
  renderRoster();
  $("list-status").textContent = rows.length ? `${rows.length} saved on this phone` : "Add a Pokémon above to start your list.";
}
$("filters").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (b) { filter = b.dataset.f; render(); } });
$("sort").addEventListener("change", render);
$("list").addEventListener("click", (e) => {
  const b = e.target.closest(".item"); if (!b) return;
  const r = b.dataset.id === "example" ? { ...EXAMPLE, id: undefined, example: undefined } : items.find((x) => x.id === b.dataset.id);
  if (r) { $("iv-note").classList.add("hidden"); openReview({ ...r }, []); }
});

// ---------- CSV, backup and restore ----------
function csv() {
  const head = ["Species", "Nickname", "Types", "CP", "Height m", "Weight kg", "Size tag", "XXL bonus", "Attack", "Defense", "HP", "Buddy level", "Caught", "Points", "Points low", "Points high", "Estimate"];
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = items.map((r) => {
    const sp = BY_KEY.get(r.sp); if (!sp) return null; const s = scoreRecord(r);
    return [spLabel(sp), r.nick, [sp[3], sp[4]].filter(Boolean).map((t) => TYPES[t]).join("/"), r.cp, r.h, r.w, r.tag, s && s.xxl ? "yes" : "no", r.atk, r.def, r.hp, BUDDY_LABEL[r.buddy] || "None", r.caught, s ? s.mid : "", s ? s.lo : "", s ? s.hi : "", s && s.est ? "yes" : "no"].map(q).join(",");
  }).filter(Boolean);
  return [head.join(","), ...lines].join("\n");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const today = () => new Date().toISOString().slice(0, 10);
$("csv-dl").addEventListener("click", () => download(`showcase-scores-${today()}.csv`, csv(), "text/csv"));
$("csv-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(csv()); $("list-status").textContent = "Copied. Paste it into a spreadsheet."; }
  catch { $("list-status").textContent = "Couldn't copy here. Use Download CSV instead."; }
});
$("backup-btn").addEventListener("click", () => download(`showcase-backup-${today()}.json`, JSON.stringify({ app: "showcase-scorer", version: 1, items, roster }, null, 1), "application/json"));
$("restore-in").addEventListener("change", async (ev) => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== "showcase-scorer" || !Array.isArray(j.items)) throw new Error();
    const have = new Set(items.map((i) => i.id)); let n = 0;
    for (const r of j.items) if (r && r.id && !have.has(r.id)) { items.push(r); n++; }
    for (const e of j.roster || []) if (!roster.some((x) => x.cp === e.cp && norm(x.name) === norm(e.name))) roster.push(e);
    saveAll(); render();
    $("list-status").textContent = `Restored ${n} Pokémon from the backup.`;
  } catch { $("list-status").textContent = "That file isn't a Showcase Scorer backup."; }
});

// ---------- report a problem ----------
let reportShots = [], reportExtra = [], reportContext = null, lastFlags = [];
const origShowFlags = showFlags;
showFlags = (flags) => { lastFlags = flags; origShowFlags(flags); };
function openReport(fromReading) {
  reportShots = fromReading ? [...document.querySelectorAll("#thumbs img")].map((i) => i.src) : [];
  reportExtra = [];
  reportContext = fromReading ? { rec: formRecord(), flags: lastFlags.map((x) => x.m), status: $("status").textContent } : null;
  $("r-shots").checked = reportShots.length > 0;
  $("r-shots").parentElement.classList.toggle("hidden", reportShots.length === 0);
  $("r-shots-label").textContent = `Include the ${reportShots.length} screenshot${reportShots.length === 1 ? "" : "s"} from this reading`;
  ["r-what", "r-expected"].forEach((id) => { $(id).value = ""; });
  try { $("r-contact").value = localStorage.getItem("showcase-scorer-contact") || ""; } catch { /* fine */ }
  $("r-status").textContent = ""; $("r-copy").classList.add("hidden"); $("r-send").disabled = false;
  renderReportThumbs();
  $("report").classList.remove("hidden");
  $("report").scrollIntoView({ behavior: "smooth", block: "start" });
  $("r-what").focus();
}
function renderReportThumbs() {
  const srcs = [...($("r-shots").checked ? reportShots : []), ...reportExtra];
  $("r-thumbs").innerHTML = srcs.map((s) => `<img src="${s}" alt="Screenshot to send">`).join("");
}
function reportText() {
  const lines = [`Showcase Scorer ${APP_VERSION} problem report`, `What went wrong: ${$("r-what").value.trim()}`];
  if ($("r-expected").value.trim()) lines.push(`Expected: ${$("r-expected").value.trim()}`);
  lines.push(`Phone: ${navigator.userAgent}`, `Screen: ${screen.width}x${screen.height} @${devicePixelRatio}x`);
  if (reportContext) lines.push(`What the app read: ${JSON.stringify(reportContext)}`);
  return lines.join("\n");
}
async function srcToB64(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return toCanvas(img, 1000).toDataURL("image/jpeg", 0.8).split(",")[1];
}
$("report-btn").addEventListener("click", () => openReport(false));
$("report-reading").addEventListener("click", () => openReport(true));
$("r-cancel").addEventListener("click", () => $("report").classList.add("hidden"));
$("r-shots").addEventListener("change", renderReportThumbs);
$("r-files").addEventListener("change", async (ev) => {
  for (const f of [...ev.target.files].slice(0, 4)) reportExtra.push(URL.createObjectURL(f));
  ev.target.value = ""; renderReportThumbs();
});
$("r-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(reportText()); $("r-status").textContent = "Copied. Paste it into a message to whoever shared this app."; }
  catch { $("r-status").textContent = "Couldn't copy here."; }
});
$("r-send").addEventListener("click", async () => {
  const st = $("r-status"); st.classList.remove("err");
  if ($("r-what").value.trim().length < 3) { st.textContent = "Say what went wrong first."; st.classList.add("err"); $("r-what").focus(); return; }
  const srcs = [...($("r-shots").checked ? reportShots : []), ...reportExtra].slice(0, 4);
  $("r-send").disabled = true; st.textContent = srcs.length ? "Preparing screenshots…" : "Sending…";
  try {
    const images = []; for (const s of srcs) images.push(await srcToB64(s));
    st.textContent = "Sending…";
    try { localStorage.setItem("showcase-scorer-contact", $("r-contact").value.trim()); } catch { /* fine */ }
    const res = await fetch("api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      what: $("r-what").value, expected: $("r-expected").value, contact: $("r-contact").value, version: APP_VERSION,
      device: { ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}x`, standalone: matchMedia("(display-mode: standalone)").matches || !!navigator.standalone, reader: readerMode() },
      context: reportContext, images }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "The report didn't go through.");
    st.textContent = "Thanks! Your report was sent."; 
    setTimeout(() => $("report").classList.add("hidden"), 2500);
  } catch (e) {
    st.textContent = `${navigator.onLine === false ? "You're offline. " : ""}${e.message && !/fetch|network|load/i.test(e.message) ? e.message : "The report couldn't be sent."} You can copy it instead.`;
    st.classList.add("err"); $("r-copy").classList.remove("hidden"); $("r-send").disabled = false;
  }
});

// ---------- start ----------
$("version").textContent = `Version ${APP_VERSION}`;
$("species-list").innerHTML = SPECIES.map((s) => `<option value="${esc(spLabel(s))}"></option>`).join("");
render();
checkOnline();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
self.__test = { getBatch: () => batch, sameMon, resolveReading, chooseForm, rosterLevel, setRoster: (r) => { roster = r; }, points, scoreRecord, measureIVs, pickSpecies, BY_KEY, toCanvas };
