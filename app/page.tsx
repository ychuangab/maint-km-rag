"use client";

import { useRef, useState } from "react";
import type { Result, StreamEvent } from "@/lib/types.ts";
import { EvalView } from "./components/EvalView.tsx";
import { ResultView } from "./components/ResultView.tsx";

const REPO_URL = "https://github.com/ychuangab/maint-km-rag";

const EXAMPLES: { kind: string; q: string }[] = [
  { kind: "直接問法", q: "螺旋空壓機一直跳E-04高溫停機要怎麼查？" },
  { kind: "換句話說", q: "履帶運轉時總是歪向一側摩擦外框且發出刮削聲該如何調整？" },
  { kind: "同廠查無", q: "三廠的天車主卷揚煞車打滑怎麼處理？" },
  { kind: "指定廠別", q: "二廠冰水主機冰水不冷、壓力偏低要從哪裡查？" },
  { kind: "離題", q: "今天中午要吃什麼？" },
];

type Stage = "retrieve" | "rerank" | "synthesize";
const STEPS: { key: Stage; name: string; desc: string }[] = [
  { key: "retrieve", name: "混合檢索", desc: "BM25 關鍵字與向量語意各取前 30 筆，RRF 加權融合" },
  { key: "rerank", name: "重排與門檻", desc: "LLM 依問題為候選打分，低於門檻視為無關" },
  { key: "synthesize", name: "綜合研判", desc: "歸納原因與處理步驟，每點標註引用列號" },
];
type StepState = Record<Stage, { status: "idle" | "running" | "done"; detail?: string }>;
const idle = (): StepState => ({ retrieve: { status: "idle" }, rerank: { status: "idle" }, synthesize: { status: "idle" } });

export default function Page() {
  const [tab, setTab] = useState<"ask" | "eval">("ask");
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState<StepState>(idle);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(q: string) {
    if (!q.trim() || running) return;
    setQuery(q);
    setRunning(true);
    setResult(null);
    setError(null);
    setSteps(idle());
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `伺服器錯誤 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          if (e.type === "stage") {
            setSteps((p) => ({ ...p, [e.stage]: { status: e.status === "start" ? "running" : "done", detail: e.detail } }));
          } else if (e.type === "result") {
            setResult(e.result);
          } else {
            throw new Error(e.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <h1>設備維護知識庫</h1>
      <p className="lead">
        用過去的維護履歷回答「這台設備出現這個異常，以前怎麼處理」。混合檢索找出相似紀錄，LLM 重排後只用達標的紀錄歸納答案，
        每個步驟都標註引用列號，可以回到原始紀錄核對。
      </p>
      <div className="tags">
        <span className="tag">BM25＋向量 RRF</span>
        <span className="tag">LLM 重排＋門檻</span>
        <span className="tag">引用核對</span>
        <span className="tag">廠別範圍篩選</span>
        <span className="tag">評測集</span>
      </div>

      <div className="tabs">
        <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}>問答</button>
        <button className={tab === "eval" ? "active" : ""} onClick={() => setTab("eval")}>評測結果</button>
      </div>

      {tab === "eval" ? (
        <EvalView />
      ) : (
        <>
          <section className="card">
            <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(query); }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入設備與異常現象，例如：空壓機排氣溫度過高跳機"
                maxLength={200}
                disabled={running}
              />
              <button className="primary" disabled={running || !query.trim()}>查詢</button>
            </form>
            <div className="chips">
              {EXAMPLES.map((e) => (
                <button key={e.q} className="chip" disabled={running} onClick={() => ask(e.q)}>
                  <span className="k">{e.kind}</span>{e.q}
                </button>
              ))}
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              資料為 282 筆虛構維護履歷（一廠、二廠、三廠，12 種設備；三廠沒有輸送帶、天車、鍋爐）。
              <a href={`${REPO_URL}/blob/main/data/records.json`} target="_blank" rel="noreferrer">檢視資料</a>
            </p>
          </section>

          {(running || result || error) && (
            <section className="card">
              <div className="steps three">
                {STEPS.map((s, i) => (
                  <div key={s.key} className={`step ${steps[s.key].status}`}>
                    <div className="no">步驟 {i + 1}</div>
                    <div className="name">{s.name}</div>
                    <div className="desc">{steps[s.key].detail ?? s.desc}</div>
                  </div>
                ))}
              </div>
              {error && <div className="error-box">查詢失敗：{error}</div>}
            </section>
          )}

          {result && <ResultView result={result} />}
        </>
      )}

      <footer>
        原型來自實際工作：工廠維護履歷知識庫的驗收測試與改善建議。公開版用虛構資料重新實作，不含任何公司資料或程式碼。
        原始碼：<a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}
