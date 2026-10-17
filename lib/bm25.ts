// 中文 BM25：中文切成二字詞（bigram），英數字保留完整詞（例如 E-04、AC-201）。
// 各欄位依重要性重複計入，症狀權重最高，和私有版的欄位加權概念一致。
import type { MaintRecord } from "./types.ts";

export function tokenize(text: string): string[] {
  const t = text.normalize("NFKC").toLowerCase();
  const out: string[] = [];
  for (const m of t.matchAll(/[a-z0-9]+(?:[-.][a-z0-9]+)*|[一-鿿]+/g)) {
    const w = m[0];
    if (/^[一-鿿]/.test(w)) {
      if (w.length === 1) out.push(w);
      for (let i = 0; i + 1 < w.length; i++) out.push(w.slice(i, i + 2));
    } else {
      out.push(w);
    }
  }
  return out;
}

const FIELD_WEIGHTS: [keyof MaintRecord, number][] = [
  ["symptom", 3],
  ["equipment", 2],
  ["equip_code", 1],
  ["cause", 1],
  ["action", 1],
];

export type Bm25Index = {
  ids: string[];
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgLen: number;
};

export function buildIndex(records: MaintRecord[]): Bm25Index {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const r of records) {
    const m = new Map<string, number>();
    let n = 0;
    for (const [field, w] of FIELD_WEIGHTS) {
      for (const tok of tokenize(String(r[field]))) {
        m.set(tok, (m.get(tok) ?? 0) + w);
        n += w;
      }
    }
    for (const tok of m.keys()) df.set(tok, (df.get(tok) ?? 0) + 1);
    tf.push(m);
    len.push(n);
  }
  return { ids: records.map((r) => r.id), tf, len, df, avgLen: len.reduce((a, b) => a + b, 0) / records.length };
}

export function search(index: Bm25Index, query: string, topK: number, k1 = 1.2, b = 0.75): { id: string; score: number }[] {
  const N = index.ids.length;
  const terms = [...new Set(tokenize(query))];
  const scores = index.ids.map((id, i) => {
    let s = 0;
    for (const t of terms) {
      const f = index.tf[i].get(t);
      if (!f) continue;
      const df = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.len[i]) / index.avgLen)));
    }
    return { id, score: s };
  });
  return scores.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}
