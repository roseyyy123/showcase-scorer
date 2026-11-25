// Unit tests for _worker.js with an in-memory stand-in for Cloudflare KV.  Run: node tests/server-test.mjs
import worker from "../_worker.js";
const store = new Map();
const KV = {
  async get(k, o) { const e = store.get(k); if (!e) return null; if (o?.type === "json") return JSON.parse(e.v); if (o?.type === "arrayBuffer") return e.v.buffer || e.v; return e.v; },
  async put(k, v, o) { store.set(k, { v, metadata: o?.metadata }); },
  async list({ prefix }) { return { keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.metadata })), list_complete: true }; },
};
const TOKEN = "t".repeat(40);
const env = { REPORTS: KV, ADMIN_TOKEN: TOKEN, ASSETS: { fetch: async () => new Response("asset") } };
const call = (path, opts = {}) => worker.fetch(new Request("https://x.test" + path, opts), env);
const post = (path, body, headers = {}) => call(path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: JSON.stringify(body) });
const admin = { authorization: "Bearer " + TOKEN };
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  got: " + JSON.stringify(got)}`); };

const health = await (await call("/api/health")).json();
check("health says reporting is on", health.reports === true, health);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
let r = await post("/api/report", { what: "Mewtwo CP read as 10", expected: "4029", version: "1.3.0", device: { ua: "iPhone", screen: "440x956" }, context: { rec: { sp: "Mewtwo|" } }, images: [jpeg] });
const { id } = await r.json();
check("tester can send a report", r.status === 200 && !!id, r.status);
check("empty report rejected", (await post("/api/report", { what: "" })).status === 400, null);
check("bad image rejected", (await post("/api/report", { what: "x y z", images: ["%%%"] })).status === 400, null);
check("reports list needs the admin key", (await call("/api/reports")).status === 401, null);
check("wrong admin key refused", (await call("/api/reports", { headers: { authorization: "Bearer " + "x".repeat(40) } })).status === 401, null);
const list = await (await call("/api/reports", { headers: admin })).json();
check("admin sees the new report with an image link", list.reports.length === 1 && list.reports[0].what === "Mewtwo CP read as 10" && list.reports[0].images[0].endsWith(`/api/reports/${id}/images/0`), list);
const img = await call(`/api/reports/${id}/images/0`, { headers: admin });
check("admin can download the screenshot", img.status === 200 && (await img.arrayBuffer()).byteLength === 7, img.status);
check("screenshot needs the admin key", (await call(`/api/reports/${id}/images/0`)).status === 401, null);
r = await post(`/api/reports/${id}/status`, { status: "triaged", notion_url: "https://notion.so/x", priority: "P2" }, admin);
check("admin can mark it triaged", r.status === 200, r.status);
const after = await (await call("/api/reports", { headers: admin })).json();
check("triaged reports leave the 'new' list", after.reports.length === 0, after);
const all = await (await call("/api/reports?status=all", { headers: admin })).json();
check("status=all still shows it, with Notion link", all.reports[0].status === "triaged" && all.reports[0].notion_url === "https://notion.so/x", all);
for (let i = 0; i < 14; i++) await post("/api/report", { what: "spam test " + i });
check("15 reports per phone per day, then a polite refusal", (await post("/api/report", { what: "one too many" })).status === 429, null);
const env2 = { ASSETS: env.ASSETS };
check("without storage set up, reporting says so", (await worker.fetch(new Request("https://x.test/api/report", { method: "POST", body: "{}" }), env2)).status === 503, null);
check("app files still served", (await (await call("/index.html")).text()) === "asset", null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
