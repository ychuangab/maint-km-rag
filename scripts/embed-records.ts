// 預先計算所有履歷的向量，寫入 data/embeddings.json：npm run embed
import { readFile, writeFile } from "node:fs/promises";
import { embed, EMBED_DIM, EMBED_MODEL } from "../lib/gemini.ts";
import type { MaintRecord } from "../lib/types.ts";
import { encode, recordText } from "../lib/vector.ts";

const records: MaintRecord[] = JSON.parse(await readFile(new URL("../data/records.json", import.meta.url), "utf8"));
const vectors: { [id: string]: string } = {};
const BATCH = 50;
for (let i = 0; i < records.length; i += BATCH) {
  const batch = records.slice(i, i + BATCH);
  const vecs = await embed(batch.map(recordText), "RETRIEVAL_DOCUMENT");
  if (vecs.length !== batch.length || vecs.some((v) => v.length !== EMBED_DIM)) throw new Error("向量數量或維度不符");
  batch.forEach((r, j) => (vectors[r.id] = encode(vecs[j])));
  console.log(`${Math.min(i + BATCH, records.length)}/${records.length}`);
}
await writeFile(
  new URL("../data/embeddings.json", import.meta.url),
  JSON.stringify({ model: EMBED_MODEL, dim: EMBED_DIM, vectors }),
);
