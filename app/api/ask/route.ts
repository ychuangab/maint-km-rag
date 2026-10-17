import { run } from "@/lib/pipeline.ts";
import { allow } from "@/lib/ratelimit.ts";
import type { StreamEvent } from "@/lib/types.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

// 回應為 NDJSON：每行一個事件，最後一行是結果或錯誤
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!allow(ip)) return Response.json({ error: "查詢次數過多，請稍後再試" }, { status: 429 });
  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  if (!query || typeof query !== "string") return Response.json({ error: "請輸入問題" }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(new TextEncoder().encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "result", result: await run(query, send) });
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg.length > 300 ? msg.slice(0, 300) + "…" : msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
