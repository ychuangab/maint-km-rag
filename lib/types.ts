export type MaintRecord = {
  id: string; // 列號 R0001
  plant: string;
  zone: string;
  equipment: string;
  equip_code: string;
  date: string;
  symptom: string;
  cause: string;
  action: string;
  downtime_min: number;
  pattern: string; // 產生資料用的故障型態代號，只供評測，不參與檢索
};

// 每筆候選在各階段的名次與分數，前端「檢索過程」面板顯示用
export type Candidate = {
  id: string;
  bm25Rank: number | null;
  vecRank: number | null;
  rrf: number;
  rerank: number | null; // 0～1；未進入重排為 null
};

export type Cite = { text: string; cites: string[] };

export type Answer = {
  summary: string;
  causes: Cite[];
  steps: { title: string; detail: string; cites: string[] }[];
  notes: string;
};

export type Scope = { plant: string | null; equipment: string | null };

export type Result = {
  query: string;
  route: "kb" | "no_match";
  scope: Scope;
  banner: string | null; // 範圍過濾說明，例如「三廠查無…以下為他廠經驗」
  shown: string[]; // 顯示且供綜合研判的列號，依分數排序
  answer: Answer | null;
  droppedCites: string[]; // 模型引用了不在顯示集合的列號，已移除
  candidates: Candidate[];
  records: MaintRecord[]; // 候選列號對應的履歷內容，前端顯示用
  tau: number;
  model: string;
  elapsedMs: number;
};

export type StreamEvent =
  | { type: "stage"; stage: "retrieve" | "rerank" | "synthesize"; status: "start" | "done"; detail?: string }
  | { type: "result"; result: Result }
  | { type: "error"; message: string };
