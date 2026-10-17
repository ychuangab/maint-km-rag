"use client";

import type { MaintRecord, Result } from "@/lib/types.ts";

function Cites({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <a key={id} className="cite" href={`#case-${id}`}>{id}</a>
      ))}
    </>
  );
}

function Raw({ ids, byId }: { ids: string[]; byId: Map<string, MaintRecord> }) {
  if (ids.length === 0) return null;
  return (
    <details>
      <summary>查看 {ids.length} 筆原始紀錄</summary>
      {ids.map((id) => {
        const r = byId.get(id);
        if (!r) return null;
        return (
          <div key={id} className="raw">
            <b>{id}</b>　{r.plant} {r.equip_code}　{r.date}<br />
            異常：{r.symptom}<br />
            處理：{r.action}
          </div>
        );
      })}
    </details>
  );
}

export function ResultView({ result }: { result: Result }) {
  const byId = new Map(result.records.map((r) => [r.id, r]));
  const score = new Map(result.candidates.map((c) => [c.id, c.rerank]));
  const shown = new Set(result.shown);
  const a = result.answer;

  return (
    <>
      {result.banner && <div className="banner">⚠ {result.banner}</div>}

      <section className="card answer">
        <h2>綜合研判</h2>
        {result.route === "no_match" || !a ? (
          <p>
            知識庫中沒有找到足夠相似的維護紀錄（重排分數都低於門檻 {result.tau}）。
            請補充設備名稱與異常現象，例如「空壓機排氣溫度過高跳機」。
          </p>
        ) : (
          <>
            <p>{a.summary}</p>
            {a.causes.length > 0 && (
              <>
                <h3>可能原因</h3>
                <ul>
                  {a.causes.map((c, i) => (
                    <li key={i}>{c.text}<Cites ids={c.cites} /></li>
                  ))}
                </ul>
              </>
            )}
            {a.steps.length > 0 && (
              <>
                <h3>建議處理步驟</h3>
                <ol>
                  {a.steps.map((s, i) => (
                    <li key={i}>
                      <b>{s.title}</b>：{s.detail}<Cites ids={s.cites} />
                      <Raw ids={s.cites} byId={byId} />
                    </li>
                  ))}
                </ol>
              </>
            )}
            {a.notes && <p className="small" style={{ marginTop: 12 }}>注意：{a.notes}</p>}
            {result.droppedCites.length > 0 && (
              <p className="small">已移除模型引用但不在下方案例中的列號：{result.droppedCites.join("、")}</p>
            )}
          </>
        )}
        <p className="small" style={{ marginTop: 12 }}>模型 {result.model}　｜　耗時 {(result.elapsedMs / 1000).toFixed(1)} 秒</p>
      </section>

      {result.shown.length > 0 && (
        <section className="card">
          <h2>參考案例（{result.shown.length} 筆）</h2>
          <div className="cases">
            {result.shown.map((id) => {
              const r = byId.get(id)!;
              return (
                <div key={id} id={`case-${id}`} className="case">
                  <div className="head">
                    <span>{id}　{r.date}</span>
                    <span>相關度 {((score.get(id) ?? 0) * 10).toFixed(0)}/10</span>
                  </div>
                  <div className="title">{r.plant} {r.zone}・{r.equipment}（{r.equip_code}）</div>
                  <dl>
                    <dt>異常</dt><dd>{r.symptom}</dd>
                    <dt>原因</dt><dd>{r.cause}</dd>
                    <dt>處理</dt><dd>{r.action}</dd>
                    <dt>停機</dt><dd>{r.downtime_min} 分鐘</dd>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <details>
          <summary>檢索過程：BM25 與向量各取前 30 筆，RRF 融合取前 {result.candidates.length} 筆，LLM 重排後門檻 {result.tau}</summary>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>列號</th><th>廠區・設備</th><th>異常內容</th>
                  <th className="num">BM25 名次</th><th className="num">向量名次</th><th className="num">RRF</th><th className="num">重排</th><th>結果</th>
                </tr>
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
                      <td className="num">{c.rrf.toFixed(4)}</td>
                      <td className="num">{c.rerank === null ? "—" : c.rerank.toFixed(1)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{shown.has(c.id) ? "顯示" : passed ? "達標・範圍外" : "未達標"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
