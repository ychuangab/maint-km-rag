---
marp: true
size: 16:9
paginate: true
title: 設備維護知識庫
style: |
  section {
    background: #ffffff;
    color: #1f1f1f;
    font-family: "Inter", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    font-size: 26px;
    padding: 56px 72px;
  }
  section::after { color: #9b9b9b; font-size: 16px; }
  h1 { font-size: 54px; margin: 0 0 10px; font-weight: 700; color: #1f1f1f; }
  h1, h2 { border: none; }
  h2 { font-size: 34px; margin: 0 0 24px; font-weight: 600; display: flex; align-items: center; gap: 14px; }
  h2::before { content: "K"; display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #1f1f1f; color: #fff; font-size: 17px; font-weight: 800; }
  p, li { line-height: 1.6; }
  ul { padding-left: 1.1em; }
  strong { font-weight: 700; }
  code { background: #f1f1f1; border-radius: 6px; padding: 1px 6px; font-size: 0.85em; }
  .muted { color: #6b6b6b; font-size: 20px; }
  .bubble { background: #f2f2f2; border-radius: 22px; padding: 12px 22px; display: inline-block; }
  .quote { border-left: 4px solid #d4d4d4; padding: 4px 18px; margin: 10px 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .card { border: 1px solid #e5e5e5; border-radius: 16px; padding: 16px 18px; font-size: 20px; line-height: 1.55; }
  .card b { display: block; font-size: 22px; margin-bottom: 6px; }
  .flow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 21px; }
  .flow span { border: 1px solid #e5e5e5; border-radius: 999px; padding: 6px 16px; background: #f7f7f8; }
  .flow i { color: #9b9b9b; font-style: normal; }
  .shot { width: 100%; border-radius: 14px; border: 1px solid #e5e5e5; display: block; }
  .clip { max-height: 410px; overflow: hidden; border-radius: 14px; border: 1px solid #e5e5e5; }
  .clip .shot { border: none; }
  .cap { font-size: 17px; color: #6b6b6b; margin-top: 6px; }
  section table { display: table; border-collapse: collapse; font-size: 21px; width: 100%; }
  section table th, section table td { background: none !important; border: none; border-bottom: 1px solid #e5e5e5; }
  th, td { border-bottom: 1px solid #e5e5e5; padding: 6px 10px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: #6b6b6b; font-weight: 500; }
  tr.best td { font-weight: 700; color: #1a7f37; }
---

<!-- _paginate: false -->

<div class="muted">km-kb ▾</div>

# 設備維護知識庫

從維護履歷找「這個異常，以前怎麼處理」

<div class="bubble">螺旋空壓機一直跳 E-04 高溫停機要怎麼查？</div>

<div class="muted" style="margin-top:26px">

Demo　maint-km-rag.vercel.app
GitHub　github.com/ychuangab/maint-km-rag

</div>

---

## 實務背景

- 維護經驗散在 Excel 履歷（實務資料 5,000 筆以上）
- 遇到異常靠人工翻找，人員異動就帶走經驗
- 系統上線前需要驗收：**找得準不準、該說查無時有沒有說**

<div class="quote">

我的角色：以維護部提供的實際問題建立題庫，逐題驗收新舊版本，提出門檻、歸納、廠別說明等改善建議。
這個公開版用虛構資料、以自己的實作重建同樣的架構。

</div>

---

## 解法架構

<div class="flow">
<span>問句</span><i>→</i><span>BM25 前 30</span><span>向量 前 30</span><i>→</i><span>RRF 1:2 融合</span><i>→</i><span>LLM 重排</span><i>→</i><span>門檻 0.6</span><i>→</i><span>廠別篩選</span><i>→</i><span>綜合研判</span>
</div>

<div class="grid2" style="margin-top:34px">
<div class="card"><b>資料</b>282 筆虛構履歷：3 個廠區、12 種設備、72 種故障型態；三廠刻意沒有輸送帶、天車、鍋爐。</div>
<div class="card"><b>部署</b>向量預先算好隨程式部署，不需向量資料庫；BM25 與 RRF 在伺服器端即時計算。</div>
</div>

---

## 關鍵設計

<div class="grid3">
<div class="card"><b>檢索全庫，達標後才篩廠別</b>同廠沒有就列他廠經驗並明說，不把「別廠有」誤報成「查無」。</div>
<div class="card"><b>門檻決定查無</b>重排分數都低於門檻就回覆查無，離題問題不硬湊答案。</div>
<div class="card"><b>可回溯</b>作法相同的紀錄歸納成一步、標列號，展開看原文；引用必須在案例中，不顯示相似度數字。</div>
</div>

---

## 操作畫面：提問

<div class="grid2">
<div><img class="shot" src="img/welcome.jpg"><div class="cap">建議問題：直接問、換句話說、同廠查無、離題</div></div>
<div><img class="shot" src="img/status.jpg"><div class="cap">即時狀態：混合檢索 → 重排與門檻 → 綜合研判</div>
<img class="shot" src="img/trace.jpg" style="margin-top:12px;max-height:250px;object-fit:cover;object-position:top"><div class="cap">檢索過程：BM25、向量名次與重排分數</div></div>
</div>

---

## 操作畫面：回答

<div class="grid2">
<div><div class="clip"><img class="shot" src="img/answer.jpg"></div><div class="cap">🔧 依據筆數 → 綜合研判 → 處理內容（展開為原文與列號）</div></div>
<div><div class="clip"><img class="shot" src="img/scope.jpg"></div><div class="cap">問三廠的天車：查無同廠，改列他廠 3 筆並提醒適用性</div></div>
</div>

---

## 驗證成效

<div class="grid2">
<div>

| 做法 | P@5 | R@10 | MRR |
|---|---|---|---|
| BM25 | 42% | 53% | 53% |
| 向量 | 70% | 86% | 82% |
| RRF 1:1 | 55% | 74% | 70% |
| RRF 1:2 | 58% | 78% | 72% |
| <b>1:2＋重排</b> | <b>85%</b> | <b>95%</b> | <b>92%</b> |

</div>
<div class="card">
<b>48 題評測（一半刻意換句話說）</b>

- 換句話說時 BM25 只剩 10%，等權重融合反而輸給純向量
- 調成 1:2 後候選涵蓋率最高（95.5%）
- 重排是提升最大的一步
- 同廠查無 3/3、離題 3/3 正確

</div>
</div>

---

## 限制與下一步

<div class="grid2">
<div class="card"><b>限制</b>

- 資料為合成，故障型態比真實紀錄乾淨
- 只取最後一則提問，未做多輪改寫
- LLM 重排增加約 5 秒延遲

</div>
<div class="card"><b>下一步</b>

- 線上查詢保存每筆分數，用真實流量校準門檻
- 加入外部搜尋補充，並與內部紀錄分開標示
- 依使用回饋持續擴充評測題庫

</div>
</div>
