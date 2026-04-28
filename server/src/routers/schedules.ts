import { z } from "zod";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { schedules, users } from "../db/schema";
import { canMutateSchedule, readableRolesForViewer } from "../lib/accessControl";

export const schedulesRouter = router({
  // ─── スケジュール一覧を取得 ──────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        myOnly: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.myOnly) {
        conditions.push(eq(schedules.userId, ctx.user.id));
      } else {
        conditions.push(inArray(users.role, readableRolesForViewer(ctx.user.role)));
      }
      if (input.startAt) conditions.push(gte(schedules.startAt, new Date(input.startAt)));
      if (input.endAt) conditions.push(lte(schedules.endAt, new Date(input.endAt)));

      const rows = await db
        .select({ schedule: schedules, user: users })
        .from(schedules)
        .innerJoin(users, eq(schedules.userId, users.id))
        .where(and(...conditions))
        .orderBy(schedules.startAt);

      return rows.map((r) => ({ ...r.schedule, user: r.user }));
    }),

  // ─── スケジュールを作成 ──────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional().nullable(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
        allDay: z.boolean().optional().default(false),
        color: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(schedules).values({
        ...input,
        userId: ctx.user.id,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
      });
      return { success: true };
    }),

  // ─── スケジュールを更新 ──────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional().nullable(),
        startAt: z.string().datetime().optional(),
        endAt: z.string().datetime().optional(),
        allDay: z.boolean().optional(),
        color: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, startAt, endAt, ...rest } = input;
      const [existing] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.id, id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });

      const [owner] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      if (!canMutateSchedule(ctx.user, existing.userId, owner.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "編集権限がありません" });
      }

      const updateData: Record<string, unknown> = { ...rest };
      if (startAt) updateData.startAt = new Date(startAt);
      if (endAt) updateData.endAt = new Date(endAt);

      await db.update(schedules).set(updateData).where(eq(schedules.id, id));
      return { success: true };
    }),

  // ─── スケジュールを削除 ──────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });

      const [owner] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      if (!canMutateSchedule(ctx.user, existing.userId, owner.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "削除権限がありません" });
      }

      await db.delete(schedules).where(eq(schedules.id, input.id));
      return { success: true };
    }),
});
