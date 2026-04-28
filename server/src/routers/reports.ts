import { z } from "zod";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { reports, reportTasks, users } from "../db/schema";
import { canReadUserWithRole, canToggleReportTask, readableRolesForViewer } from "../lib/accessControl";
import { parseYmdToDate } from "../lib/date";

export const reportsRouter = router({
  // ─── 日報一覧を取得 ──────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        myOnly: z.boolean().optional().default(false),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.myOnly) {
        conditions.push(eq(reports.userId, ctx.user.id));
      } else {
        conditions.push(inArray(users.role, readableRolesForViewer(ctx.user.role)));
      }
      if (input.startDate) conditions.push(gte(reports.workDate, parseYmdToDate(input.startDate)));
      if (input.endDate) conditions.push(lte(reports.workDate, parseYmdToDate(input.endDate)));

      const rows = await db
        .select({ report: reports, user: users })
        .from(reports)
        .innerJoin(users, eq(reports.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(reports.workDate))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  // ─── 日報詳細を取得 ──────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select({ report: reports, user: users })
        .from(reports)
        .innerJoin(users, eq(reports.userId, users.id))
        .where(eq(reports.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canReadUserWithRole(ctx.user.role, row.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }

      const tasks = await db
        .select()
        .from(reportTasks)
        .where(eq(reportTasks.reportId, input.id))
        .orderBy(reportTasks.sortOrder);

      return { ...row, tasks };
    }),

  // ─── 日報を作成 ──────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        department: z.string(),
        status: z.enum(["draft", "submitted"]).default("draft"),
        sharedInfo: z.string().optional().nullable(),
        orderInfo: z.string().optional().nullable(),
        isShared: z.boolean().optional().default(false),
        tasks: z
          .array(
            z.object({
              vehicleNumber: z.string().optional().nullable(),
              taskType: z.string().optional().nullable(),
              content: z.string().optional().nullable(),
              isCompleted: z.boolean().optional().default(false),
              sortOrder: z.number().optional().default(0),
            })
          )
          .optional()
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tasks, ...reportData } = input;

      const [result] = await db.insert(reports).values({
        ...reportData,
        workDate: parseYmdToDate(reportData.workDate),
        userId: ctx.user.id,
      });

      const reportId = (result as { insertId: number }).insertId;

      if (tasks.length > 0) {
        await db.insert(reportTasks).values(
          tasks.map((t, i) => ({
            reportId,
            vehicleNumber: t.vehicleNumber ?? null,
            taskType: t.taskType ?? null,
            content: t.content ?? null,
            isCompleted: t.isCompleted ?? false,
            sortOrder: t.sortOrder ?? i,
          }))
        );
      }

      return { id: reportId };
    }),

  // ─── 日報を更新 ──────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["draft", "submitted"]).optional(),
        sharedInfo: z.string().optional().nullable(),
        orderInfo: z.string().optional().nullable(),
        isShared: z.boolean().optional(),
        tasks: z
          .array(
            z.object({
              id: z.number().optional(),
              vehicleNumber: z.string().optional().nullable(),
              taskType: z.string().optional().nullable(),
              content: z.string().optional().nullable(),
              isCompleted: z.boolean().optional(),
              sortOrder: z.number().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tasks, ...data } = input;

      const [existing] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (existing.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "編集権限がありません" });
      }

      if (Object.keys(data).length > 0) {
        await db.update(reports).set(data).where(eq(reports.id, id));
      }

      return { success: true };
    }),

  // ─── 今日の提出状況を取得 ────────────────────────────────────────────────────
  todaySubmissionStatus: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().split("T")[0];
    const [row] = await db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.userId, ctx.user.id),
          eq(reports.workDate, parseYmdToDate(today))
        )
      )
      .limit(1);
    return { submitted: !!row && row.status !== "draft", report: row ?? null };
  }),

  // ─── 共有情報・受注情報を取得 ────────────────────────────────────────────────
  sharedAndOrders: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({ report: reports, user: users })
        .from(reports)
        .leftJoin(users, eq(reports.userId, users.id))
        .where(
          and(
            eq(reports.isShared, true),
            inArray(users.role, readableRolesForViewer(ctx.user.role))
          )
        )
        .orderBy(desc(reports.workDate))
        .limit(input.limit);
      return rows;
    }),
});

export const reportTasksRouter = router({
  // ─── タスク一覧を取得 ────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [meta] = await db
        .select({ report: reports, author: users })
        .from(reports)
        .innerJoin(users, eq(reports.userId, users.id))
        .where(eq(reports.id, input.reportId))
        .limit(1);

      if (!meta) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canReadUserWithRole(ctx.user.role, meta.author.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }

      return db
        .select()
        .from(reportTasks)
        .where(eq(reportTasks.reportId, input.reportId))
        .orderBy(reportTasks.sortOrder);
    }),

  // ─── タスクの完了状態を切り替え ──────────────────────────────────────────────
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.number(), isCompleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ task: reportTasks, report: reports, author: users })
        .from(reportTasks)
        .innerJoin(reports, eq(reportTasks.reportId, reports.id))
        .innerJoin(users, eq(reports.userId, users.id))
        .where(eq(reportTasks.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "タスクが見つかりません" });
      if (!canToggleReportTask(ctx.user, row.report.userId, row.author.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      await db
        .update(reportTasks)
        .set({ isCompleted: input.isCompleted })
        .where(eq(reportTasks.id, input.id));
      return { success: true };
    }),
});
