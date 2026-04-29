import { z } from "zod";
import { eq, and, desc, gte, lte, inArray, asc, sql } from "drizzle-orm";
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
        vehicleCount: z.number().optional().nullable(),
        vehicleDetails: z.string().optional().nullable(),
        droneDetails: z.array(z.object({
          trainingType: z.string(),
          trainingName: z.string().optional(),
          count: z.number().optional(),
          salesAmount: z.number().optional(),
          result: z.string().optional(),
          note: z.string().optional(),
          attendees: z.array(z.object({
            name: z.string(),
            type: z.string(),
            company: z.string().optional(),
          })).optional(),
        })).optional(),
        slitterDetails: z.array(z.object({
          clientName: z.string().optional(),
          rawW: z.string().optional(),
          rawL: z.string().optional(),
          rawLen: z.string().optional(),
          procW: z.string().optional(),
          procL: z.string().optional(),
          procLen: z.string().optional(),
          honsu: z.string().optional(),
          choTori: z.string().optional(),
          speed: z.string().optional(),
          totalM: z.number().optional(),
          processTime: z.number().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
          salesAmount: z.number().optional(),
          caseStatus: z.string().optional(),
          note: z.string().optional(),
        })).optional(),
        paintingDetails: z.array(z.object({
          salesType: z.string().optional(),
          clientName: z.string().optional(),
          vehicleBase: z.string().optional(),
          vehicleNumberPrefix: z.string().optional(),
          vehicleName: z.string().optional(),
          vehicleNumber: z.string().optional(),
          vehicleModel: z.string().optional(),
          vehicleSpec: z.string().optional(),
          salesAmount: z.number().optional(),
          outsourceName: z.string().optional(),
          outsourceCost: z.number().optional(),
          workEntries: z.array(z.object({
            workTypes: z.array(z.string()).optional(),
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            processTime: z.string().optional(),
            note: z.string().optional(),
          })).optional(),
        })).optional(),
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
      const { tasks, droneDetails, slitterDetails, paintingDetails, ...reportData } = input;

      const [result] = await db.insert(reports).values({
        ...reportData,
        workDate: parseYmdToDate(reportData.workDate),
        userId: ctx.user.id,
        droneDetails: droneDetails ? JSON.stringify(droneDetails) : undefined,
        slitterDetails: slitterDetails ? JSON.stringify(slitterDetails) : undefined,
        paintingDetails: paintingDetails ? JSON.stringify(paintingDetails) : undefined,
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

  // ─── 前日の日報提出状況（閲覧可能メンバー全体）を取得 ────────────────────────────
  yesterdaySubmissionStatus: protectedProcedure.query(async ({ ctx }) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ymd = yesterday.toISOString().split("T")[0];
    const roles = readableRolesForViewer(ctx.user.role);

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        department: users.department,
      })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.role, roles)))
      .orderBy(asc(users.id));

    if (members.length === 0) {
      return {
        targetDate: ymd,
        submitted: [] as Array<{
          userId: number;
          name: string;
          displayName: string | null;
          department: string | null;
          reportId: number | null;
        }>,
        unsubmitted: [] as Array<{
          userId: number;
          name: string;
          displayName: string | null;
          department: string | null;
          reportId: number | null;
        }>,
      };
    }

    const memberIds = members.map((m) => m.id);
    const rows = await db
      .select({
        userId: reports.userId,
        reportId: reports.id,
        status: reports.status,
      })
      .from(reports)
      .where(
        and(inArray(reports.userId, memberIds), eq(reports.workDate, parseYmdToDate(ymd)))
      );

    const submittedMap = new Map<number, number>();
    for (const row of rows) {
      if (row.status !== "draft" && !submittedMap.has(row.userId)) {
        submittedMap.set(row.userId, row.reportId);
      }
    }

    const submitted = members
      .filter((m) => submittedMap.has(m.id))
      .map((m) => ({
        userId: m.id,
        name: m.name,
        displayName: m.displayName,
        department: m.department,
        reportId: submittedMap.get(m.id) ?? null,
      }));

    const unsubmitted = members
      .filter((m) => !submittedMap.has(m.id))
      .map((m) => ({
        userId: m.id,
        name: m.name,
        displayName: m.displayName,
        department: m.department,
        reportId: null,
      }));

    return { targetDate: ymd, submitted, unsubmitted };
  }),

  // ─── ドローン月次集計（本日除く） ────────────────────────────────────────────
  getMonthlySummary: protectedProcedure
    .input(z.object({ workDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const date = new Date(input.workDate);
      const monthStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const monthEnd = prevDate.toISOString().split("T")[0];
      if (monthStart > monthEnd) return { totalCount: 0, totalSales: 0 };
      const rows = await db
        .select({ vehicleCount: reports.vehicleCount, droneDetails: reports.droneDetails })
        .from(reports)
        .where(
          and(
            eq(reports.userId, ctx.user.id),
            eq(reports.department, "drone"),
            sql`DATE(${reports.workDate}) >= ${monthStart}`,
            sql`DATE(${reports.workDate}) <= ${monthEnd}`
          )
        );
      let totalCount = 0;
      let totalSales = 0;
      for (const row of rows) {
        totalCount += row.vehicleCount ?? 0;
        if (row.droneDetails) {
          try {
            const details = JSON.parse(row.droneDetails) as Array<{ salesAmount?: number }>;
            for (const d of details) totalSales += d.salesAmount ?? 0;
          } catch {}
        }
      }
      return { totalCount, totalSales };
    }),

  // ─── スリッター月次集計 ────────────────────────────────────────────────────
  getMonthlySlitterSummary: protectedProcedure
    .input(z.object({ workDate: z.string() }))
    .query(async ({ ctx, input }) => {
      const date = new Date(input.workDate);
      const monthStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEnd = input.workDate;
      const rows = await db
        .select({ vehicleCount: reports.vehicleCount, slitterDetails: reports.slitterDetails })
        .from(reports)
        .where(
          and(
            eq(reports.userId, ctx.user.id),
            eq(reports.department, "slitter"),
            sql`DATE(${reports.workDate}) >= ${monthStart}`,
            sql`DATE(${reports.workDate}) <= ${monthEnd}`
          )
        );
      let monthlyTotalM = 0;
      let monthlyProcessTime = 0;
      let monthlyCaseCount = 0;
      for (const row of rows) {
        monthlyCaseCount += row.vehicleCount ?? 0;
        if (row.slitterDetails) {
          try {
            const details = JSON.parse(row.slitterDetails) as Array<{ totalM?: number; processTime?: number }>;
            for (const d of details) {
              monthlyTotalM += d.totalM ?? 0;
              monthlyProcessTime += d.processTime ?? 0;
            }
          } catch {}
        }
      }
      return { monthlyTotalM, monthlyProcessTime, monthlyCaseCount };
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
