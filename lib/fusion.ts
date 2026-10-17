// RRF 融合與範圍判斷：都是不經模型的確定性邏輯
import type { Candidate, MaintRecord, Scope } from "./types.ts";

export const RRF_K = 60;
// [BM25, 向量] 權重。評測顯示換句話說的問題 BM25 幾乎找不到，等權重會拖累融合名次；
// 1:2 時送進重排的前 20 筆候選召回率最高（見 README 評測）
export const RRF_WEIGHTS = [1, 2];

export function rrf(lists: { id: string }[][], topK: number, weights = RRF_WEIGHTS): Candidate[] {
  const map = new Map<string, Candidate>();
  lists.forEach((list, li) => {
    list.forEach((x, rank) => {
      const c = map.get(x.id) ?? { id: x.id, bm25Rank: null, vecRank: null, rrf: 0, rerank: null };
      c.rrf += weights[li] / (RRF_K + rank + 1);
      if (li === 0) c.bm25Rank = rank + 1;
      else c.vecRank = rank + 1;
      map.set(x.id, c);
    });
  });
  return [...map.values()].sort((a, b) => b.rrf - a.rrf).slice(0, topK);
}

const PLANT_RE = /([一二三123１２３])\s*廠/;
const PLANT_NAMES: { [k: string]: string } = { 一: "一廠", "1": "一廠", 二: "二廠", "2": "二廠", 三: "三廠", "3": "三廠" };

// 設備別名，從問句判斷提到哪種設備（只用於顯示說明，不過濾檢索）
const EQUIP_ALIASES: [string, string[]][] = [
  ["空壓機", ["空壓機", "空壓", "壓縮機"]],
  ["冷卻水塔", ["冷卻水塔", "水塔"]],
  ["冰水主機", ["冰水主機", "冰機", "冰水機"]],
  ["輸送帶", ["輸送帶", "輸送機", "皮帶"]],
  ["射出成型機", ["射出成型機", "射出機", "成型機"]],
  ["包裝機", ["包裝機", "封箱機", "貼標機"]],
  ["堆高機", ["堆高機", "叉車"]],
  ["天車", ["天車", "吊車", "起重機"]],
  ["鍋爐", ["鍋爐"]],
  ["真空幫浦", ["真空幫浦", "真空泵", "真空pump"]],
  ["純水系統", ["純水系統", "純水", "ro"]],
  ["廢氣洗滌塔", ["廢氣洗滌塔", "洗滌塔"]],
];

export function detectScope(query: string): Scope {
  const q = query.normalize("NFKC").toLowerCase();
  const pm = q.match(PLANT_RE);
  const plant = pm ? PLANT_NAMES[pm[1]] ?? null : null;
  // 取問句中最早出現的設備名稱，例如「冰機壓縮機跳脫」是冰水主機，不是空壓機
  let equipment: string | null = null;
  let first = Infinity;
  for (const [name, aliases] of EQUIP_ALIASES) {
    for (const a of aliases) {
      const i = q.indexOf(a);
      if (i >= 0 && i < first) [first, equipment] = [i, name];
    }
  }
  return { plant, equipment };
}

// 達標之後才篩選顯示：問句提到設備就先留同設備，再看廠別；同廠沒有就列他廠並明說。
// 篩選不改變「有沒有找到」的判定，避免把「別廠有經驗」誤報成「查無資料」。
export function applyScope(qualified: MaintRecord[], scope: Scope): { shown: MaintRecord[]; banner: string | null } {
  if (qualified.length === 0) return { shown: qualified, banner: null };
  const notes: string[] = [];

  // 設備：同設備有達標紀錄才篩；完全沒有就不篩，可能是使用者用了別的說法
  let pool = qualified;
  if (scope.equipment) {
    const sameEquip = qualified.filter((r) => r.equipment === scope.equipment);
    if (sameEquip.length > 0) {
      pool = sameEquip;
      const otherEquip = qualified.length - sameEquip.length;
      if (otherEquip > 0) notes.push(`另有其他設備 ${otherEquip} 筆相似紀錄未列出`);
    }
  }
  if (!scope.plant) return { shown: pool, banner: notes.length ? `已依問句篩選「${scope.equipment}」的紀錄；${notes.join("；")}。` : null };

  const samePlant = pool.filter((r) => r.plant === scope.plant);
  if (samePlant.length > 0) {
    const otherPlant = pool.length - samePlant.length;
    if (otherPlant > 0) notes.unshift(`另有其他廠 ${otherPlant} 筆相似紀錄未列出`);
    return { shown: samePlant, banner: notes.length ? `已依問句篩選${scope.plant}的 ${samePlant.length} 筆紀錄；${notes.join("；")}。` : null };
  }
  const what = scope.equipment ? `「${scope.equipment}」` : "";
  return {
    shown: pool,
    banner: `${scope.plant}查無${what}相符紀錄，以下為其他廠同型設備的 ${pool.length} 筆處理經驗，請確認適用性。`,
  };
}
