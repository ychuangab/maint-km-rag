// 預先算好的履歷向量（data/embeddings.json，float32 以 base64 存放），查詢時只需算問句向量。
export type VectorStore = { ids: string[]; vecs: Float32Array[] };

export function decode(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function encode(v: number[]): string {
  return Buffer.from(new Float32Array(v).buffer).toString("base64");
}

export function cosine(a: Float32Array | number[], b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function nearest(store: VectorStore, q: number[], topK: number): { id: string; score: number }[] {
  return store.ids
    .map((id, i) => ({ id, score: cosine(q, store.vecs[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// 履歷轉成向量化用的文字；建索引與評測都用這一個格式
export function recordText(r: { equipment: string; symptom: string; cause: string; action: string }): string {
  return `${r.equipment}｜異常：${r.symptom}｜原因：${r.cause}｜處理：${r.action}`;
}
