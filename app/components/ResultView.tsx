"use client";

import type { MaintRecord, Result } from "@/lib/types.ts";

// 不顯示相似度數字，只分兩級（沿用原系統的做法，避免使用者把分數當成機率）
const HIGH = 0.9;

function Rows({ ids, byId, score }: { ids: string[]; byId: Map<string, MaintRecord>; score: Map<string, number | null> }) {
  return (
    <ul>
      {ids.map((id) => {
        const r = byId.get(id);
        if (!r) return null;
        const high = (score.get(id) ?? 0) >= HIGH;
        return (
          <li key={id}>
            {r.action}
            <span className="src">
              <code>{id}</code>　{r.plant}・{r.equipment} {r.equip_code}・{r.date}
              <span className={`lvl${high ? " high" : ""}`}>{high ? "高度相似" : "部分相似"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// 回答結構沿用原系統：橫幅 → 綜合研判 → 處理內容（摺疊分群，展開是原文與列號）
export function ResultView({ result }: { result: Result }) {
  const byId = new Map(result.records.map((r) => [r.id, r]));
  const score = new Map(result.candidates.map((c) => [c.id, c.rerank]));
  const a = result.answer;

  if (result.route === "no_match" || !a) {
    return (
      <div className="md">
        <blockquote>🔍 <b>知識庫中沒有相似記錄</b></blockquote>
        <p>請補充設備名稱與異常現象，例如「空壓機排氣溫度過高跳機」。</p>
        <Trace result={result} byId={byId} />
      </div>
    );
  }

  const synthIds = new Set(result.shown.slice(0, 10));
  const cited = new Set(a.steps.flatMap((s) => s.cites));
  const uncited = result.shown.filter((id) => !cited.has(id));

  return (
    <div className="md">
      <blockquote>🔧 <b>依據 {result.shown.length} 筆歷史記錄</b></blockquote>
      {result.banner && <p>{result.banner}</p>}

      <h3>綜合研判</h3>
      <p>{a.summary}</p>
      {a.causes.length > 0 && (
        <ul>
          {a.causes.map((c, i) => (
            <li key={i}>{c.text} {c.cites.map((id) => <code key={id}>{id}</code>)}</li>
          ))}
        </ul>
      )}
      {a.notes && <p>{a.notes}</p>}
      <p>
        <em>
          {synthIds.size < result.shown.length
            ? `以上敘述根據相關度最高的 ${synthIds.size} 筆案例；完整 ${result.shown.length} 筆列於下方。`
            : "以上敘述與下方分群都根據全部達標案例。"}
        </em>
      </p>

      <h3>處理內容</h3>
      {a.steps.map((s, i) => (
        <details key={i}>
          <summary>{s.title}（{s.cites.length} 筆）</summary>
          <p>{s.detail}</p>
          <Rows ids={s.cites} byId={byId} score={score} />
        </details>
      ))}
      {uncited.length > 0 && (
        <details>
          <summary>其他相關紀錄（{uncited.length} 筆）</summary>
          <Rows ids={uncited} byId={byId} score={score} />
        </details>
      )}
      {result.droppedCites.length > 0 && <p><em>已移除不在案例中的引用：{result.droppedCites.join("、")}</em></p>}
      <Trace result={result} byId={byId} />
    </div>
  );
}

function Trace({ result, byId }: { result: Result; byId: Map<string, MaintRecord> }) {
  const shown = new Set(result.shown);
  return (
    <details className="trace">
      <summary>檢索過程・{(result.elapsedMs / 1000).toFixed(1)} 秒</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>列號</th><th>設備</th><th>異常</th><th className="num">BM25</th><th className="num">向量</th><th className="num">重排</th><th>結果</th></tr>
          </thead>
          <tbody>
            {result.candidates.map((c) => {
              const r = byId.get(c.id)!;
              const passed = (c.rerank ?? 0) >= result.tau;
              return (
                <tr key={c.id} className={passed ? "pass" : ""}>
                  <td>{c.id}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.plant}・{r.equipment}</td>
                  <td>{r.symptom}</td>
                  <td className="num">{c.bm25Rank ?? "—"}</td>
                  <td className="num">{c.vecRank ?? "—"}</td>
                  <td className="num">{c.rerank === null ? "—" : c.rerank.toFixed(1)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{shown.has(c.id) ? "顯示" : passed ? "範圍外" : "未達標"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p><em>BM25 與向量各取前 30 筆，RRF（1:2）融合取前 {result.candidates.length} 筆，LLM 重排門檻 {result.tau}。</em></p>
    </details>
  );
}
