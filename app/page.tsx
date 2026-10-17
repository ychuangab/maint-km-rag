"use client";

import { useEffect, useRef, useState } from "react";
import type { Result, StreamEvent } from "@/lib/types.ts";
import { EvalView } from "./components/EvalView.tsx";
import { ResultView } from "./components/ResultView.tsx";

const REPO_URL = "https://github.com/ychuangab/maint-km-rag";

const SUGGESTIONS = [
  { t: "螺旋空壓機一直跳 E-04 高溫停機", s: "直接問法", q: "螺旋空壓機一直跳E-04高溫停機要怎麼查？" },
  { t: "履帶總是歪向一側、摩擦外框", s: "換句話說，沒提到設備名稱", q: "履帶運轉時總是歪向一側摩擦外框且發出刮削聲該如何調整？" },
  { t: "三廠的天車主卷揚煞車打滑", s: "三廠沒有天車，改列他廠經驗", q: "三廠的天車主卷揚煞車打滑怎麼處理？" },
  { t: "今天中午要吃什麼？", s: "離題，應回覆查無", q: "今天中午要吃什麼？" },
];

const STAGE_TEXT: { [k: string]: string } = { retrieve: "混合檢索", rerank: "重排與門檻", synthesize: "綜合研判" };

type Turn = { id: number; q: string; status: string[]; result?: Result; error?: string };

export default function Page() {
  const [view, setView] = useState<"chat" | "eval">("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  const update = (id: number, f: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  async function ask(q: string) {
    if (!q.trim() || running) return;
    const id = Date.now();
    setView("chat");
    setInput("");
    setRunning(true);
    setTurns((ts) => [...ts, { id, q, status: [] }]);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
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
          if (e.type === "stage" && e.status === "done") {
            update(id, (t) => ({ ...t, status: [...t.status, `${STAGE_TEXT[e.stage]}${e.detail ? `：${e.detail}` : ""}`] }));
          } else if (e.type === "result") {
            update(id, (t) => ({ ...t, result: e.result }));
          } else if (e.type === "error") {
            throw new Error(e.message);
          }
        }
      }
    } catch (err) {
      update(id, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // 網址帶 ?sample=1 時自動問第一個建議問題
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (new URLSearchParams(window.location.search).get("sample") === "1") ask(SUGGESTIONS[0].q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = turns.length === 0;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="logo">K</span>維護知識庫</div>
        <button className="side-item" onClick={() => { setTurns([]); setView("chat"); }}>✎　新對話</button>
        <button className={`side-item${view === "eval" ? " active" : ""}`} onClick={() => setView("eval")}>📊　評測結果</button>
        <a className="side-item" href={`${REPO_URL}/blob/main/data/records.json`} target="_blank" rel="noreferrer">🗂　履歷資料</a>
        <div className="label">對話</div>
        <div className="history">
          {turns.map((t) => <button key={t.id} className="side-item" onClick={() => setView("chat")}>{t.q}</button>)}
        </div>
        <div className="foot"><a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>・資料為虛構</div>
      </aside>

      <div className="main">
        <div className="nav">
          <span className="model">km-kb <span className="caret">▾</span></span>
          <span className="spacer" />
          <span className="mobile-links">
            <button onClick={() => { setTurns([]); setView("chat"); }}>新對話</button>
            <button onClick={() => setView(view === "eval" ? "chat" : "eval")}>{view === "eval" ? "問答" : "評測"}</button>
          </span>
        </div>

        <div className="scroll">
          {view === "eval" ? (
            <EvalView />
          ) : empty ? (
            <div className="welcome">
              <div className="hello"><span className="logo">K</span>km-kb</div>
              <div className="sub">哪台設備出了什麼狀況？我從 282 筆維護履歷找以前的處理方式。</div>
              <Composer input={input} setInput={setInput} ask={ask} running={running} />
              <div className="suggest-label">⚡ 建議</div>
              {SUGGESTIONS.map((s) => (
                <button key={s.q} className="suggest" onClick={() => ask(s.q)} disabled={running}>
                  <div className="t">{s.t}</div>
                  <div className="s">{s.s}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="thread">
              {turns.map((t) => (
                <div key={t.id}>
                  <div className="msg-user"><div>{t.q}</div></div>
                  <div className="msg-ai">
                    <span className="logo">K</span>
                    <div className="content">
                      <div className="who">km-kb<span>{t.result?.model ?? ""}</span></div>
                      {!t.result && !t.error && (
                        <div className="status">
                          {t.status.map((s) => <span key={s}>✓ {s}</span>)}
                          <span className="now">{["混合檢索中…", "重排中…", "綜合研判中…"][Math.min(t.status.length, 2)]}</span>
                        </div>
                      )}
                      {t.error && <div className="md"><p className="err">⚠ {t.error}</p></div>}
                      {t.result && <ResultView result={t.result} />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
          )}
        </div>

        {view === "chat" && !empty && (
          <div className="composer-wrap">
            <Composer input={input} setInput={setInput} ask={ask} running={running} />
            <div className="disclaimer">回答依據虛構的維護履歷，實際處理請依現場判斷。</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ input, setInput, ask, running }: { input: string; setInput: (s: string) => void; ask: (q: string) => void; running: boolean }) {
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="描述設備與異常現象…" maxLength={200} />
      <button className="send" disabled={running || !input.trim()} aria-label="送出">↑</button>
    </form>
  );
}
