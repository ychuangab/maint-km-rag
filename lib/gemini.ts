import { GoogleGenAI } from "@google/genai";
import type { Answer, MaintRecord } from "./types.ts";

export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";
export const EMBED_MODEL = "gemini-embedding-2";
export const EMBED_DIM = 768;
const ATTEMPTS = [MODEL, MODEL, FALLBACK_MODEL];

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("伺服器未設定 GEMINI_API_KEY");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function retryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|500|503|UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL)\b/.test(msg);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: (model: string) => Promise<T>, models = ATTEMPTS): Promise<{ data: T; model: string }> {
  let lastErr: unknown;
  for (const [i, model] of models.entries()) {
    try {
      return { data: await fn(model), model };
    } catch (err) {
      lastErr = err;
      if (!retryable(err) || i === models.length - 1) break;
      await sleep(1500 * (i + 1));
    }
  }
  if (retryable(lastErr)) throw new Error("Gemini 服務暫時忙碌，請稍後再試");
  throw lastErr;
}

async function json<T>(model: string, system: string, user: string, schema: object): Promise<T> {
  const res = await ai().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0 },
  });
  if (!res.text) throw new Error("模型沒有回傳內容");
  return JSON.parse(res.text) as T;
}

export async function embed(texts: string[], task: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const { data } = await withRetry(
    async (model) => {
      const res = await ai().models.embedContent({
        model,
        contents: texts.map((t) => ({ role: "user", parts: [{ text: t }] })),
        config: { taskType: task, outputDimensionality: EMBED_DIM },
      });
      return (res.embeddings ?? []).map((e) => e.values ?? []);
    },
    [EMBED_MODEL, EMBED_MODEL, EMBED_MODEL],
  );
  return data;
}

const fmt = (r: MaintRecord) =>
  `${r.id}｜${r.plant} ${r.equipment}（${r.equip_code}）｜異常：${r.symptom}｜原因：${r.cause}｜處理：${r.action}`;

const RERANK_PROMPT = `你是設備維護知識庫的相關度評分員。依使用者問題，為每筆維護履歷打 0～10 分：
10：同一種設備、同一類故障，處理方式可直接參考。
6～9：同設備且故障現象相近，或不同設備但故障機制與處理方式高度相同。
1～5：只有設備相同或只有字面相似，故障類型不同。
0：無關。
問題與設備維護無關時全部給 0。每筆都要評分，id 照抄。`;

export async function rerank(query: string, records: MaintRecord[]) {
  const schema = {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, score: { type: "integer" } }, required: ["id", "score"] },
      },
    },
    required: ["scores"],
  };
  const user = `問題：${query}\n\n履歷：\n${records.map(fmt).join("\n")}`;
  const { data, model } = await withRetry((m) => json<{ scores: { id: string; score: number }[] }>(m, RERANK_PROMPT, user, schema));
  const map = new Map(data.scores.map((s) => [s.id, Math.max(0, Math.min(10, s.score)) / 10]));
  return { scores: map, model };
}

const SYNTH_PROMPT = `你是設備維護顧問，只能根據提供的維護履歷回答。輸出 JSON：
- summary：一兩句結論，說明最可能的情況。
- causes：可能原因，依履歷中出現次數由多到少，每項附引用列號 cites。
- steps：建議處理步驟。把作法相同的多筆履歷歸納成同一步並列出所有列號；保留履歷中的零件、數值與參數，不可自行編造數值。
- notes：注意事項或資料限制，例如紀錄來自其他廠區、樣本少；沒有就給空字串。
規則：cites 只能填提供的列號（R 開頭）。履歷沒有提到的內容不要寫。使用繁體中文。`;

export async function synthesize(query: string, records: MaintRecord[], banner: string | null) {
  const cite = { type: "array", items: { type: "string" } };
  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      causes: { type: "array", items: { type: "object", properties: { text: { type: "string" }, cites: cite }, required: ["text", "cites"] } },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: { title: { type: "string" }, detail: { type: "string" }, cites: cite },
          required: ["title", "detail", "cites"],
        },
      },
      notes: { type: "string" },
    },
    required: ["summary", "causes", "steps", "notes"],
  };
  const user = `問題：${query}\n${banner ? `範圍說明：${banner}\n` : ""}\n維護履歷：\n${records.map(fmt).join("\n")}`;
  return withRetry((m) => json<Answer>(m, SYNTH_PROMPT, user, schema));
}
