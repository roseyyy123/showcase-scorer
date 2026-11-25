// Showcase Scorer server. Works as Cloudflare Pages "advanced mode" (_worker.js, deployable by
// drag and drop) and as a Cloudflare Worker (wrangler.toml points here).
// It serves the app's files and:
//   /api/report   problem reports from testers, stored in a KV namespace bound as REPORTS
//   /api/reports  the triage feed (needs the ADMIN_TOKEN secret)
//   /api/read     the optional online screenshot reader
// The API key never reaches the browser. Choose a provider with environment settings:
//   GEMINI_API_KEY (secret)  -> Google Gemini API (default model: GEMINI_MODEL)
//   AI binding               -> Cloudflare Workers AI (model: WORKERS_AI_MODEL), used when no Gemini key is set
//   neither                  -> online reading is off; the app reads screenshots on the phone

const POKEMON_PROMPT = `These are Pokémon GO screenshots of ONE Pokémon: its detail page and/or its appraisal screen.
Return ONLY a JSON object with these keys:
"species": the English Pokédex species name. If the name shown is a nickname, identify the species from the sprite.
"nickname": the name shown on screen if it differs from the species name, else "".
"form": a form word if one is evident (Alolan, Galarian, Hisuian, Paldean, Origin, etc.), else "".
"cp": integer or null.
"height_m": number or null (the HEIGHT value).
"weight_kg": number or null (the WEIGHT value).
"height_tag": the small size badge shown above the HEIGHT value: "XXS", "XS", "XL", "XXL", or "" if none.
"buddy_level": "best" if a Best Buddy medal (a small round pink-and-gold medal with a heart) appears just left of the Pokémon's name, or if text on screen says Best Buddy; "good", "great" or "ultra" only if text on screen names that level; otherwise "none". (A white speech bubble with smiling faces above the CP arc only means it is the current buddy; ignore it.)
"ivs": {"atk":n,"def":n,"hp":n} read from the three appraisal bars (Attack, Defense, HP; each bar has 3 segments of 5 points, 0-15), or null if no appraisal is shown.
"caught_date": "YYYY-MM-DD" if a caught date is shown, else "".
Use null for anything not visible. No commentary.`;

const BUDDY_PROMPT = `This is a Pokémon GO storage screenshot showing the results of a search.
Return ONLY a JSON object: {"search_text": the exact text typed in the search bar at the top, "count": the number in brackets under POKÉMON at the top or null, "pokemon": [{"name": the name shown under the Pokémon (may be a nickname), "species": the English species name identified from the sprite, "cp": integer CP, "best_buddy": true if a small round pink-and-gold medal with a heart sits at the top-right of that Pokémon's tile, else false}]}.
Include one entry per Pokémon tile whose CP number and name are both fully visible, in reading order. Skip tiles cut off at the top or bottom edge. No commentary.`;

const MAX_IMAGES = 4, MAX_IMAGE_B64 = 1_500_000; // about 1.1 MB per image after base64

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function provider(env) {
  if (env.GEMINI_API_KEY) return { id: "gemini", name: "Google (Gemini API)", notice: env.PROVIDER_NOTICE || "Google may use what's sent through its free tier to improve its products, so don't send screenshots with anything private in them." };
  if (env.AI) return { id: "workers-ai", name: "Cloudflare Workers AI", notice: env.PROVIDER_NOTICE || "" };
  return null;
}

function parseJSONLoose(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in model answer");
  return JSON.parse(m[0]);
}

async function askGemini(env, prompt, images) {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((data) => ({ inline_data: { mime_type: "image/jpeg", data } }))] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (res.status === 429) { const e = new Error("provider rate limit"); e.status = 429; throw e; }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return parseJSONLoose(text);
}

async function askWorkersAI(env, prompt, images) {
  const model = env.WORKERS_AI_MODEL || "@cf/mistralai/mistral-small-3.1-24b-instruct";
  const out = await env.AI.run(model, {
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...images.map((data) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${data}` } }))] }],
    max_tokens: 1200,
    temperature: 0,
  });
  return parseJSONLoose(typeof out === "string" ? out : out.response ?? out.choices?.[0]?.message?.content);
}

async function handleRead(request, env) {
  const p = provider(env);
  if (!p) return json({ error: "Online reading isn't set up on this server." }, 404);
  if (env.RATE_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many screenshots. Try again in a minute." }, 429);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const task = body && body.task;
  const images = Array.isArray(body?.images) ? body.images : [];
  if (!["pokemon", "buddy"].includes(task)) return json({ error: "Unknown task." }, 400);
  if (!images.length || images.length > MAX_IMAGES || images.some((s) => typeof s !== "string" || s.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(s.slice(0, 200))))
    return json({ error: `Send 1 to ${MAX_IMAGES} JPEG images as base64.` }, 400);
  const prompt = task === "pokemon" ? POKEMON_PROMPT : BUDDY_PROMPT;
  try {
    const data = p.id === "gemini" ? await askGemini(env, prompt, images) : await askWorkersAI(env, prompt, images);
    return json(data);
  } catch (e) {
    if (e.status === 429) return json({ error: "The AI service's free limit is used up for now." }, 429);
    console.log("read failed", e.message);
    return json({ error: "The AI service didn't give a usable answer." }, 502);
  }
}


// ---------- problem reports ----------
const MAX_REPORT_IMAGES = 4, MAX_REPORT_IMAGE_B64 = 1_400_000, MAX_TEXT = 4000, REPORTS_PER_IP_PER_DAY = 15;
const clip = (v, n) => String(v ?? "").slice(0, n);
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function isAdmin(request, env) {
  const t = env.ADMIN_TOKEN, h = request.headers.get("authorization") || "";
  if (!t || t.length < 24 || !h.startsWith("Bearer ")) return false;
  const a = h.slice(7);
  if (a.length !== t.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0;
}

async function createReport(request, env) {
  if (!env.REPORTS) return json({ error: "Reporting isn't set up on this site yet." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10), rlKey = `rl:${ip}:${day}`;
  const used = parseInt((await env.REPORTS.get(rlKey)) || "0", 10);
  if (used >= REPORTS_PER_IP_PER_DAY) return json({ error: "You've sent a lot of reports today. Thanks! Try again tomorrow." }, 429);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const what = clip(b.what, MAX_TEXT).trim();
  if (what.length < 3) return json({ error: "Say what went wrong." }, 400);
  const images = Array.isArray(b.images) ? b.images.slice(0, MAX_REPORT_IMAGES) : [];
  if (images.some((s) => typeof s !== "string" || s.length > MAX_REPORT_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(s.slice(0, 200))))
    return json({ error: `Up to ${MAX_REPORT_IMAGES} JPEG screenshots, about 1 MB each.` }, 400);
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const report = {
    id, received: new Date().toISOString(), status: "new",
    what, expected: clip(b.expected, MAX_TEXT).trim(), contact: clip(b.contact, 200).trim(),
    version: clip(b.version, 40), device: { ua: clip(b.device?.ua, 300), screen: clip(b.device?.screen, 40), standalone: !!b.device?.standalone, reader: clip(b.device?.reader, 20) },
    context: JSON.parse(clip(JSON.stringify(b.context ?? null), 8000) || "null") ?? null,
    image_count: images.length,
  };
  for (let i = 0; i < images.length; i++) await env.REPORTS.put(`img:${id}:${i}`, b64ToBytes(images[i]));
  await env.REPORTS.put(`report:${id}`, JSON.stringify(report), { metadata: { status: "new", received: report.received } });
  await env.REPORTS.put(rlKey, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return json({ id });
}

async function listReports(request, env, url) {
  const want = url.searchParams.get("status") || "new";
  const out = []; let cursor;
  do {
    const page = await env.REPORTS.list({ prefix: "report:", cursor, limit: 1000 });
    for (const k of page.keys) {
      if (want !== "all" && (k.metadata?.status || "new") !== want) continue;
      const r = await env.REPORTS.get(k.name, { type: "json" });
      if (!r) continue;
      r.images = Array.from({ length: r.image_count || 0 }, (_, i) => `${url.origin}/api/reports/${r.id}/images/${i}`);
      out.push(r);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && out.length < 200);
  out.sort((a, b) => a.received.localeCompare(b.received));
  return json({ reports: out });
}

async function setReportStatus(request, env, id) {
  const key = `report:${id}`, r = await env.REPORTS.get(key, { type: "json" });
  if (!r) return json({ error: "No such report." }, 404);
  let b; try { b = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const allowed = ["new", "triaged", "fixed", "wont-fix", "duplicate"];
  if (!allowed.includes(b.status)) return json({ error: `status must be one of ${allowed.join(", ")}` }, 400);
  r.status = b.status;
  if (b.notion_url) r.notion_url = clip(b.notion_url, 300);
  if (b.priority) r.priority = clip(b.priority, 4);
  r.updated = new Date().toISOString();
  await env.REPORTS.put(key, JSON.stringify(r), { metadata: { status: r.status, received: r.received } });
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), p = url.pathname;
    if (p === "/api/health") {
      const pr = provider(env);
      return json({ online: !!pr, provider: pr?.name, notice: pr?.notice, reports: !!env.REPORTS });
    }
    if (p === "/api/read") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return handleRead(request, env);
    }
    if (p === "/api/report") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      return createReport(request, env);
    }
    if (p.startsWith("/api/reports")) {
      if (!env.REPORTS) return json({ error: "Reporting isn't set up on this site yet." }, 503);
      if (!isAdmin(request, env)) return json({ error: "Not allowed." }, 401);
      const m = p.match(/^\/api\/reports\/([\w-]+)(?:\/(images)\/(\d)|\/(status))?$/);
      if (p === "/api/reports" && request.method === "GET") return listReports(request, env, url);
      if (m && m[2] === "images" && request.method === "GET") {
        const bytes = await env.REPORTS.get(`img:${m[1]}:${m[3]}`, { type: "arrayBuffer" });
        return bytes ? new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } }) : json({ error: "No such image." }, 404);
      }
      if (m && m[4] === "status" && request.method === "POST") return setReportStatus(request, env, m[1]);
      return json({ error: "Not found." }, 404);
    }
    return env.ASSETS.fetch(request); // the app's static files
  },
};
