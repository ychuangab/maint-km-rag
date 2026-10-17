import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "設備維護知識庫",
  description: "以維護履歷建立的混合檢索問答：BM25＋向量 RRF 融合、LLM 重排與門檻，回答標註引用紀錄，同廠查無時明確告知。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
