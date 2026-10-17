// 每個 serverless 實例各自計數的簡易限流，擋掉連續濫用即可；實例重啟後歸零。
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 15;
const hits = new Map<string, number[]>();

export function allow(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
