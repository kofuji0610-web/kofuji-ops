import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../lib/trpc";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword } from "../lib/auth";

const DEPARTMENT_KEYS = [
  "maintenance",
  "painting",
  "slitter",
  "drone",
  "warehouse",
  "operation",
  "admin",
] as const;

const ALLOWED_DEPARTMENT_SET = new Set<string>(DEPARTMENT_KEYS);

/** Comma-separated keys in users.department; null if empty. Max length matches varchar(50). */
function normalizeDepartmentForDb(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const tokens = s.split(",").map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const t of tokens) {
    if (!ALLOWED_DEPARTMENT_SET.has(t)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `無効な部署です: ${t}`,
      });
    }
    if (!seen.has(t)) {
      seen.add(t);
      ordered.push(t);
    }
  }
  const result = ordered.join(",");
  if (result.length > 50) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "部署の指定が長すぎます（50文字以内）",
    });
  }
  return ordered.length === 0 ? null : result;
}

const departmentFieldSchema = z.union([z.string(), z.null()]).optional();

export const usersRouter = router({
  // ─── ユーザー一覧を取得（管理者のみ） ────────────────────────────────────────
  list: adminProcedure.query(async () => {
    return db.select().from(users).orderBy(users.id);
  }),

  /** スケジュール画面用: id / name / displayName / department / role（ログインユーザー全員が参照可） */
  listForSchedule: protectedProcedure.query(async () => {
    return db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        department: users.department,
        role: users.role,
      })
      .from(users)
      .orderBy(asc(users.id));
  }),

  // ─── ユーザーを作成（管理者のみ） ────────────────────────────────────────────
  create: adminProcedure
    .input(
      z.object({
        username: z.string().min(1).max(100),
        password: z.string().min(6),
        name: z.string().min(1).max(100),
        displayName: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        role: z.enum(["user", "manager", "leader", "admin"]).default("user"),
        department: departmentFieldSchema,
      })
    )
    .mutation(async ({ input }) => {
      const { password, department: deptRaw, ...rest } = input;
      const department = normalizeDepartmentForDb(deptRaw);

      // ユーザー名の重複チェック
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "このユーザー名は既に使用されています",
        });
      }

      const passwordHash = await hashPassword(password);
      await db.insert(users).values({ ...rest, department, passwordHash });
      return { success: true };
    }),

  // ─── ユーザーを更新（管理者のみ） ────────────────────────────────────────────
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        displayName: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        role: z.enum(["user", "manager", "leader", "admin"]).optional(),
        department: departmentFieldSchema,
        isActive: z.boolean().optional(),
        password: z.string().min(6).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, password, department: deptRaw, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };

      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }
      if (deptRaw !== undefined) {
        updateData.department = normalizeDepartmentForDb(deptRaw);
      }

      await db.update(users).set(updateData).where(eq(users.id, id));
      return { success: true };
    }),

  // ─── 自分のプロフィールを更新 ────────────────────────────────────────────────
  updateMe: protectedProcedure
    .input(
      z.object({
        displayName: z.string().optional().nullable(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.displayName !== undefined) updateData.displayName = input.displayName;

      if (input.newPassword && input.currentPassword) {
        const { verifyPassword } = await import("../lib/auth");
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);

        if (!user?.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "パスワードが設定されていません" });
        }

        const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "現在のパスワードが正しくありません" });
        }

        updateData.passwordHash = await hashPassword(input.newPassword);
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(users).set(updateData).where(eq(users.id, ctx.user.id));
      }

      return { success: true };
    }),
});
