// 評測：比較 BM25、向量、混合、混合＋重排四種做法。npm run eval
// 每題的標準答案是同一故障型態的所有履歷（data/eval.json，由 make_records.py 產生）。
// 指標：Precision@5、Recall@10、MRR；重排另計門檻後的 Precision 與「查無」判定。
import { readFile, writeFile } from "node:fs/promises";
import { applyScope, detectScope, rrf } from "../lib/fusion.ts";
import { rerank } from "../lib/gemini.ts";
import { bm25Top, byId, hybrid, normalizeQuery, TAU, vectorTop } from "../lib/pipeline.ts";

type Q = { q: string; style: string; expected: string[] };
const evalSet = JSON.parse(await readFile(new URL("../data/eval.json", import.meta.url), "utf8")) as {
  questions: Q[];
  scope: { q: string; plant: string; expected: string[] }[];
  off_topic: string[];
};

const p5 = (ids: string[], exp: Set<string>) => ids.slice(0, 5).filter((x) => exp.has(x)).length / Math.min(5, exp.size);
const r10 = (ids: string[], exp: Set<string>) => ids.slice(0, 10).filter((x) => exp.has(x)).length / exp.size;
const mrr = (ids: string[], exp: Set<string>) => {
  const i = ids.findIndex((x) => exp.has(x));
  return i < 0 ? 0 : 1 / (i + 1);
};

type Row = { method: string; style: string; p5: number; r10: number; mrr: number };
const rows: Row[] = [];
const gated: { style: string; precision: number; recall: number }[] = [];

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()!); }));
}

await pool(evalSet.questions, 4, async (item) => {
  const q = normalizeQuery(item.q);
  const exp = new Set(item.expected);
  const bHits = bm25Top(q);
  const vHits = await vectorTop(q);
  const b = bHits.map((x) => x.id);
  const v = vHits.map((x) => x.id);
  const equal = rrf([bHits, vHits], 20, [1, 1]).map((x) => x.id);
  const cands = await hybrid(q);
  const h = cands.map((x) => x.id);
  const { scores } = await rerank(q, cands.map((c) => byId.get(c.id)!));
  const rr = [...cands].sort((a, b2) => (scores.get(b2.id) ?? 0) - (scores.get(a.id) ?? 0) || b2.rrf - a.rrf).map((c) => c.id);
  for (const [method, ids] of [["BM25", b], ["向量", v], ["混合 RRF 1:1", equal], ["混合 RRF 1:2", h], ["混合 1:2＋重排", rr]] as const) {
    rows.push({ method, style: item.style, p5: p5(ids, exp), r10: r10(ids, exp), mrr: mrr(ids, exp) });
  }
  const passed = cands.filter((c) => (scores.get(c.id) ?? 0) >= TAU).map((c) => c.id);
  const hit = passed.filter((x) => exp.has(x)).length;
  gated.push({ style: item.style, precision: passed.length ? hit / passed.length : 0, recall: hit / exp.size });
  process.stdout.write(".");
});

// 範圍題：問三廠沒有的設備，應找到他廠經驗並出現說明
const scopeResults: { q: string; banner: string | null; found: number }[] = [];
for (const s of evalSet.scope) {
  const q = normalizeQuery(s.q);
  const cands = await hybrid(q);
  const { scores } = await rerank(q, cands.map((c) => byId.get(c.id)!));
  const qualified = cands.filter((c) => (scores.get(c.id) ?? 0) >= TAU).map((c) => byId.get(c.id)!);
  const { shown, banner } = applyScope(qualified, detectScope(q));
  scopeResults.push({ q: s.q, banner, found: shown.filter((r) => s.expected.includes(r.id)).length });
}

// 離題：應該全部低於門檻而回覆查無
const offTopic: { q: string; passed: number }[] = [];
for (const q of evalSet.off_topic) {
  const cands = await hybrid(q);
  const { scores } = await rerank(q, cands.map((c) => byId.get(c.id)!));
  offTopic.push({ q, passed: cands.filter((c) => (scores.get(c.id) ?? 0) >= TAU).length });
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const methods = ["BM25", "向量", "混合 RRF 1:1", "混合 RRF 1:2", "混合 1:2＋重排"];
const table = methods.map((m) => {
  const of = (style?: string) => rows.filter((r) => r.method === m && (!style || r.style === style));
  return {
    method: m,
    p5: avg(of().map((r) => r.p5)),
    r10: avg(of().map((r) => r.r10)),
    mrr: avg(of().map((r) => r.mrr)),
    p5_direct: avg(of("direct").map((r) => r.p5)),
    p5_paraphrase: avg(of("paraphrase").map((r) => r.p5)),
  };
});
const summary = {
  date: new Date().toISOString().slice(0, 10),
  questions: evalSet.questions.length,
  records: byId.size,
  tau: TAU,
  table,
  gated: { precision: avg(gated.map((g) => g.precision)), recall: avg(gated.map((g) => g.recall)) },
  scope: scopeResults,
  offTopic,
};
await writeFile(new URL("../data/eval_results.json", import.meta.url), JSON.stringify(summary, null, 1));
console.log("\n" + JSON.stringify(summary, null, 1));
