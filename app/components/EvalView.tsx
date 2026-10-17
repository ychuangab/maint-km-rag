"use client";

import results from "@/data/eval_results.json";

type Row = { method: string; p5: number; r10: number; mrr: number; p5_direct: number; p5_paraphrase: number };
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function EvalView() {
  const table = results.table as Row[];
  const best = (k: keyof Omit<Row, "method">) => Math.max(...table.map((r) => r[k]));
  const cols: [keyof Omit<Row, "method">, string][] = [
    ["p5", "Precision@5"],
    ["r10", "Recall@10"],
    ["mrr", "MRR"],
    ["p5_direct", "P@5 直接問法"],
    ["p5_paraphrase", "P@5 換句話說"],
  ];
  return (
    <>
      <section className="card">
        <h2>檢索評測（{results.date}）</h2>
        <p className="small">
          {results.questions} 題、{results.records} 筆履歷。每題的標準答案是同一故障型態的所有紀錄；一半題目沿用履歷用詞，
          另一半刻意換句話說、避開關鍵字。
        </p>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr><th>做法</th>{cols.map(([, label]) => <th key={label} className="num">{label}</th>)}</tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.method}>
                  <td>{r.method}</td>
                  {cols.map(([k]) => (
                    <td key={k} className={`num${r[k] === best(k) ? " best" : ""}`}>{pct(r[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="small" style={{ marginTop: 12 }}>
          <li>換句話說的問題，BM25 幾乎找不到；等權重融合（1:1）會被拖累，反而不如只用向量。</li>
          <li>改成 BM25:向量 = 1:2 後，送進重排的前 20 筆候選涵蓋率最高（95.5%）；只用向量時有一題前 20 筆完全沒命中，加入 BM25 後補回。</li>
          <li>LLM 重排把正確紀錄推到前面，是品質提升最大的一步。</li>
        </ul>
      </section>

      <section className="card">
        <h2>門檻與範圍</h2>
        <p>
          重排門檻 {results.tau}：達標紀錄的 Precision {pct(results.gated.precision)}、Recall {pct(results.gated.recall)}。
        </p>
        <h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>同廠查無（三廠沒有這些設備）</h3>
        <ul>
          {results.scope.map((s) => (
            <li key={s.q}>{s.q}<br /><span className="small">→ {s.banner ?? "（未出現說明）"}；找到 {s.found} 筆正確紀錄</span></li>
          ))}
        </ul>
        <h3 style={{ fontSize: 15, margin: "14px 0 6px" }}>離題問題（應回覆查無）</h3>
        <ul>
          {results.offTopic.map((o) => (
            <li key={o.q}>{o.q}　<span className="small">→ 達標 {o.passed} 筆{o.passed === 0 ? "，正確回覆查無" : ""}</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}
