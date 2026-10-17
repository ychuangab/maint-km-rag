import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex, search, tokenize } from "./bm25.ts";
import { applyScope, detectScope, rrf } from "./fusion.ts";
import type { MaintRecord } from "./types.ts";

const rec = (id: string, plant: string, equipment: string, symptom: string): MaintRecord => ({
  id, plant, equipment, symptom, zone: "A 區", equip_code: "X-101", date: "2024-01-01",
  cause: "", action: "", downtime_min: 30, pattern: "",
});

test("中文切二字詞，英數代碼保留完整", () => {
  assert.deepEqual(tokenize("E-04高溫"), ["e-04", "高溫"]);
  assert.deepEqual(tokenize("排氣溫度"), ["排氣", "氣溫", "溫度"]);
});

test("BM25 症狀相符者排前面", () => {
  const idx = buildIndex([rec("R1", "一廠", "空壓機", "排氣溫度過高跳機"), rec("R2", "一廠", "空壓機", "皮帶異音")]);
  assert.equal(search(idx, "排氣溫度高", 5)[0].id, "R1");
});

test("RRF 依權重融合並記錄各自名次", () => {
  const out = rrf([[{ id: "A" }, { id: "B" }], [{ id: "B" }, { id: "C" }]], 10, [1, 2]);
  assert.equal(out[0].id, "B");
  assert.equal(out[0].bm25Rank, 2);
  assert.equal(out[0].vecRank, 1);
});

test("辨識廠別與設備別名", () => {
  assert.deepEqual(detectScope("3廠吊車煞車打滑"), { plant: "三廠", equipment: "天車" });
  assert.deepEqual(detectScope("冰機壓縮機跳脫"), { plant: null, equipment: "冰水主機" });
});

const qualified = [
  rec("R1", "一廠", "輸送帶", "跑偏"),
  rec("R2", "二廠", "輸送帶", "跑偏"),
  rec("R3", "三廠", "空壓機", "皮帶斷裂"),
];

test("同廠沒有該設備時列他廠經驗並明說，不被別種設備頂替", () => {
  const { shown, banner } = applyScope(qualified, { plant: "三廠", equipment: "輸送帶" });
  assert.deepEqual(shown.map((r) => r.id), ["R1", "R2"]);
  assert.match(banner!, /三廠查無「輸送帶」/);
});

test("同廠有紀錄就只列同廠，並說明其他廠筆數", () => {
  const { shown, banner } = applyScope(qualified, { plant: "一廠", equipment: "輸送帶" });
  assert.deepEqual(shown.map((r) => r.id), ["R1"]);
  assert.match(banner!, /其他廠 1 筆/);
});

test("沒有提到範圍時不篩選", () => {
  assert.equal(applyScope(qualified, { plant: null, equipment: null }).shown.length, 3);
});
