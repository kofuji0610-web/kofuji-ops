import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Request, Response } from "express";
import { getUserFromSession, SESSION_COOKIE } from "./auth";
import type { User } from "../db/schema";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface Context {
  req: Request;
  res: Response;
  user: User | null;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const sessionId = req.cookies?.[SESSION_COOKIE] ?? "";
  const user = await getUserFromSession(sessionId);
  return { req, res, user };
}

// ─── tRPC 初期化 ──────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── 認証済みプロシージャ ──────────────────────────────────────────────────────

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ─── 管理者プロシージャ ────────────────────────────────────────────────────────

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
