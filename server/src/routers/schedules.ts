import { z } from "zod";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { schedules, users, scheduleTasks } from "../db/schema";
import { canReadUserWithRole, readableRolesForViewer } from "../lib/accessControl";
import { canEditScheduleOf } from "../utils/schedulePermission";
import {
  addScheduleTask,
  deleteScheduleTask,
  getScheduleById,
  getScheduleTasksByScheduleId,
  getUserById,
  softDeleteScheduleById,
  toggleScheduleTask,
} from "../db/scheduleQueries";

function assertCanEditOthersSchedule(
  ctx: { user: { id: number; role: string } },
  ownerUserId: number,
  ownerRole: string | null | undefined
) {
  if (!ownerRole) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
  if (ctx.user.id === ownerUserId) return;
  if (!canEditScheduleOf(ctx.user.role, ownerRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "編集権限がありません" });
  }
}

function assertCanViewScheduleOwner(
  ctx: { user: { id: number; role: string } },
  ownerUserId: number,
  ownerRole: string | null | undefined
) {
  if (!ownerRole) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
  if (ctx.user.id === ownerUserId) return;
  if (!canReadUserWithRole(ctx.user.role, ownerRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
  }
}

async function loadTaskWithSchedule(taskId: number) {
  const [row] = await db
    .select({ task: scheduleTasks, schedule: schedules })
    .from(scheduleTasks)
    .innerJoin(schedules, eq(scheduleTasks.scheduleId, schedules.id))
    .where(eq(scheduleTasks.id, taskId))
    .limit(1);
  return row ?? null;
}

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
      const conditions = [eq(schedules.isDeleted, false)];
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
        scheduleType: z.enum(["department", "personal", "vehicle", "equipment"]).optional(),
        scheduleDepartment: z
          .enum(["maintenance", "painting", "slitter", "drone", "all", "personal"])
          .optional(),
        resourceName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(schedules).values({
        title: input.title,
        description: input.description ?? null,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        allDay: input.allDay ?? false,
        color: input.color ?? null,
        scheduleType: input.scheduleType,
        scheduleDepartment: input.scheduleDepartment,
        resourceName: input.resourceName ?? null,
        userId: ctx.user.id,
        createdBy: ctx.user.id,
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
        scheduleType: z.enum(["department", "personal", "vehicle", "equipment"]).optional(),
        scheduleDepartment: z
          .enum(["maintenance", "painting", "slitter", "drone", "all", "personal"])
          .optional(),
        resourceName: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const target = await getScheduleById(input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });
      const targetUser = await getUserById(target.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanEditOthersSchedule(ctx, target.userId, targetUser.role);

      const { id, startAt, endAt, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (startAt) updateData.startAt = new Date(startAt);
      if (endAt) updateData.endAt = new Date(endAt);

      await db.update(schedules).set(updateData).where(eq(schedules.id, id));
      return { success: true };
    }),

  // ─── スケジュールを削除（論理削除） ──────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const target = await getScheduleById(input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });
      const targetUser = await getUserById(target.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanEditOthersSchedule(ctx, target.userId, targetUser.role);

      await softDeleteScheduleById(input.id);
      return { success: true };
    }),

  getTasks: protectedProcedure
    .input(z.object({ scheduleId: z.number() }))
    .query(async ({ ctx, input }) => {
      const schedule = await getScheduleById(input.scheduleId);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });
      const owner = await getUserById(schedule.userId);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanViewScheduleOwner(ctx, schedule.userId, owner.role);
      return getScheduleTasksByScheduleId(input.scheduleId);
    }),

  addTask: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number(),
        title: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await getScheduleById(input.scheduleId);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "スケジュールが見つかりません" });
      const owner = await getUserById(schedule.userId);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanEditOthersSchedule(ctx, schedule.userId, owner.role);
      await addScheduleTask(input.scheduleId, input.title);
      return { success: true };
    }),

  toggleTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        isCompleted: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await loadTaskWithSchedule(input.taskId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
      const owner = await getUserById(row.schedule.userId);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanEditOthersSchedule(ctx, row.schedule.userId, owner.role);
      await toggleScheduleTask(input.taskId, input.isCompleted);
      return { success: true };
    }),

  deleteTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadTaskWithSchedule(input.taskId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
      const owner = await getUserById(row.schedule.userId);
      if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      assertCanEditOthersSchedule(ctx, row.schedule.userId, owner.role);
      await deleteScheduleTask(input.taskId);
      return { success: true };
    }),
});
