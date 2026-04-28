import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { users } from "../db/schema";
import {
  createSession,
  deleteSession,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
} from "../lib/auth";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export const authRouter = router({
  // ─── 現在のユーザー情報を取得 ────────────────────────────────────────────────
  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.user ?? null;
  }),

  // ─── パスワードログイン ──────────────────────────────────────────────────────
  loginWithPassword: publicProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ユーザー名またはパスワードが正しくありません",
        });
      }

      const isValid = await verifyPassword(input.password, user.passwordHash);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ユーザー名またはパスワードが正しくありません",
        });
      }

      if (!user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "このアカウントは無効化されています",
        });
      }

      const sessionId = await createSession(user.id);

      ctx.res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE * 1000,
        path: "/",
      });

      return { success: true, user };
    }),

  // ─── ゲストログイン ──────────────────────────────────────────────────────────
  guestLogin: publicProcedure.mutation(async ({ ctx }) => {
    // ゲストユーザーを取得（username = "guest"）
    const [guestUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, "guest"))
      .limit(1);

    if (!guestUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "ゲストアカウントが設定されていません",
      });
    }

    const sessionId = await createSession(guestUser.id);

    ctx.res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE * 1000,
      path: "/",
    });

    return { success: true, user: guestUser };
  }),

  // ─── ログアウト ──────────────────────────────────────────────────────────────
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const sessionId = ctx.req.cookies?.[SESSION_COOKIE];
    if (sessionId) {
      await deleteSession(sessionId);
    }
    ctx.res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { success: true };
  }),
});
