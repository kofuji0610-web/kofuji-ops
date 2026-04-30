// .env ファイルを読み込む（tsx 実行時は自動読み込みされないため明示的に実行）
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./lib/trpc";
import calendarAuthRouter from "./routes/calendarAuth";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000");

// ─── ミドルウェア ─────────────────────────────────────────────────────────────

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL ?? "http://localhost:5173",
    credentials: true,
  })
);

// ─── OAuth カレンダー連携（Express ルート）──────────────────────────────────

app.use("/api/auth", calendarAuthRouter);

// ─── tRPC ─────────────────────────────────────────────────────────────────────

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ─── 静的ファイル配信（本番環境） ──────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../../client/dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ─── サーバー起動 ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   tRPC endpoint: http://localhost:${PORT}/api/trpc`);
});
