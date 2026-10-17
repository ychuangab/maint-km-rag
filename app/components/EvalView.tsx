"use client";

import results from "@/data/eval_results.json";

type Row = { method: string; p5: number; r10: number; mrr: number; p5_direct: number; p5_paraphrase: number };
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const COLS: [keyof Omit<Row, "method">, string][] = [
  ["p5", "P@5"],
  ["r10", "R@10"],
  ["mrr", "MRR"],
  ["p5_direct", "P@5 直接問"],
  ["p5_paraphrase", "P@5 換句話說"],
];

export function EvalView() {
  const table = results.table as Row[];
  const best = (k: keyof Omit<Row, "method">) => Math.max(...table.map((r) => r[k]));
  return (
    <div className="page">
      <h2>檢索評測</h2>
      <p className="muted">{results.questions} 題・{results.records} 筆履歷・{results.date}</p>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>做法</th>{COLS.map(([, l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.method}>
                <td>{r.method}</td>
                {COLS.map(([k]) => <td key={k} className={`num${r[k] === best(k) ? " best" : ""}`}>{pct(r[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="muted">
        <li>換句話說時 BM25 幾乎失效，等權重融合反而輸給純向量。</li>
        <li>調成 1:2 後候選涵蓋率最高；LLM 重排是提升最大的一步。</li>
        <li>門檻 {results.tau}：Precision {pct(results.gated.precision)}・Recall {pct(results.gated.recall)}</li>
      </ul>

      <h3>同廠查無</h3>
      <ul>
        {results.scope.map((s) => (
          <li key={s.q}>{s.q}<div className="muted">{s.banner}</div></li>
        ))}
      </ul>

      <h3>離題問題</h3>
      <ul>
        {results.offTopic.map((o) => (
          <li key={o.q}>{o.q} <span className="muted">→ {o.passed === 0 ? "回覆查無 ✓" : `誤判 ${o.passed} 筆`}</span></li>
        ))}
      </ul>
    </div>
  );
}
