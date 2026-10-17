// 線上查詢管線：BM25 與向量各取前 30 → RRF 融合取前 20 → LLM 重排 → 門檻 TAU → 廠別顯示篩選 → 綜合研判
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex, search } from "./bm25.ts";
import { applyScope, detectScope, rrf } from "./fusion.ts";
import { embed, rerank, synthesize } from "./gemini.ts";
import type { Candidate, MaintRecord, Result, StreamEvent } from "./types.ts";
import { decode, nearest, type VectorStore } from "./vector.ts";

export const RETRIEVE_K = 30;
export const RERANK_N = 20;
export const TAU = 0.6;
export const SYNTH_MAX = 10;

// 用 fs 讀資料，網頁與評測腳本共用；Vercel 打包由 next.config 的 outputFileTracingIncludes 帶入
const load = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8"));
export const records = load("records.json") as MaintRecord[];
const embeddings = load("embeddings.json") as { vectors: { [id: string]: string } };
export const byId = new Map(records.map((r) => [r.id, r]));
const index = buildIndex(records);
const store: VectorStore = {
  ids: Object.keys(embeddings.vectors),
  vecs: Object.values(embeddings.vectors).map(decode),
};

export function normalizeQuery(q: string): string {
  return q.normalize("NFKC").replace(/\s+/g, " ").replace(/^(請問|幫我查|我想知道)/, "").trim().slice(0, 200);
}

export function bm25Top(query: string) {
  return search(index, query, RETRIEVE_K);
}

export async function vectorTop(query: string) {
  const [q] = await embed([query], "RETRIEVAL_QUERY");
  return nearest(store, q, RETRIEVE_K);
}

export async function hybrid(query: string): Promise<Candidate[]> {
  const [b, v] = await Promise.all([bm25Top(query), vectorTop(query)]);
  return rrf([b, v], RERANK_N);
}

// 模型引用的列號必須在顯示集合裡，否則使用者在下方案例找不到那一筆
export function filterCites(cites: string[], allowed: Set<string>, dropped: Set<string>): string[] {
  return cites.filter((c) => {
    if (allowed.has(c)) return true;
    dropped.add(c);
    return false;
  });
}

export async function run(rawQuery: string, send: (e: StreamEvent) => void): Promise<Result> {
  const started = Date.now();
  const query = normalizeQuery(rawQuery);
  if (query.length < 2) throw new Error("問題太短");
  const scope = detectScope(query);

  send({ type: "stage", stage: "retrieve", status: "start" });
  const candidates = await hybrid(query);
  send({ type: "stage", stage: "retrieve", status: "done", detail: `BM25＋向量融合取前 ${candidates.length} 筆` });

  send({ type: "stage", stage: "rerank", status: "start" });
  const { scores, model: m1 } = await rerank(query, candidates.map((c) => byId.get(c.id)!));
  for (const c of candidates) c.rerank = scores.get(c.id) ?? 0;
  const qualified = candidates
    .filter((c) => (c.rerank ?? 0) >= TAU)
    .sort((a, b) => (b.rerank ?? 0) - (a.rerank ?? 0) || b.rrf - a.rrf)
    .map((c) => byId.get(c.id)!);
  send({ type: "stage", stage: "rerank", status: "done", detail: `${qualified.length} 筆達到門檻 ${TAU}` });

  const base = { query, scope, candidates, records: candidates.map((c) => byId.get(c.id)!), tau: TAU };
  if (qualified.length === 0) {
    return { ...base, route: "no_match", banner: null, shown: [], answer: null, droppedCites: [], model: m1, elapsedMs: Date.now() - started };
  }

  const { shown, banner } = applyScope(qualified, scope);
  send({ type: "stage", stage: "synthesize", status: "start" });
  const { data: answer, model: m2 } = await synthesize(query, shown.slice(0, SYNTH_MAX), banner);
  const allowed = new Set(shown.slice(0, SYNTH_MAX).map((r) => r.id));
  const dropped = new Set<string>();
  answer.causes = answer.causes.map((c) => ({ ...c, cites: filterCites(c.cites, allowed, dropped) }));
  answer.steps = answer.steps.map((s) => ({ ...s, cites: filterCites(s.cites, allowed, dropped) }));
  send({ type: "stage", stage: "synthesize", status: "done" });

  return {
    ...base,
    route: "kb",
    banner,
    shown: shown.map((r) => r.id),
    answer,
    droppedCites: [...dropped],
    model: [...new Set([m1, m2])].join("、"),
    elapsedMs: Date.now() - started,
  };
}
