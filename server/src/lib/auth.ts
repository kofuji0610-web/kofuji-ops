import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import type { User } from "../db/schema";

export const SESSION_COOKIE = "session_id";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── セッション取得 ────────────────────────────────────────────────────────────

export async function getUserFromSession(sessionId: string): Promise<User | null> {
  if (!sessionId) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session || session.expiresAt < new Date()) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

// ─── セッション作成 ────────────────────────────────────────────────────────────

export async function createSession(userId: number): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });
  return sessionId;
}

// ─── セッション削除 ────────────────────────────────────────────────────────────

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// ─── パスワードハッシュ ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(password + process.env.PASSWORD_SALT).digest("hex");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const hashed = await hashPassword(password);
  return hashed === hash;
}

// ─── 認証ガード ────────────────────────────────────────────────────────────────

export function requireAuth(user: User | null): asserts user is User {
  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Please login (10001)",
    });
  }
}

export function requireRole(user: User | null, role: "manager" | "admin"): asserts user is User {
  requireAuth(user);
  if (role === "admin" && user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  if (role === "manager" && user.role !== "manager" && user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "マネージャー権限が必要です" });
  }
}
