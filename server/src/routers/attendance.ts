/**
 * 勤怠管理 tRPC ルーター
 *
 * エンドポイント一覧:
 *   attendance.today          - 今日の自分の勤怠レコードを取得
 *   attendance.list           - 期間指定で勤怠一覧を取得
 *   attendance.activeMembers  - 現在出勤中のメンバー一覧を取得
 *   attendance.clockIn        - 出勤打刻
 *   attendance.clockOut       - 退勤打刻
 *   attendance.update         - 勤怠レコードを手動更新（管理者用）
 *
 * IMPORTANT: 打刻ロジックについて
 *   1日に最大3回の出退勤に対応している。
 *   clockIn → clockOut → clockIn2 → clockOut2 → clockIn3 → clockOut3 の順で記録する。
 *   フロントエンドの calcAttendanceStep() と対応しているため、
 *   このロジックを変更する場合は Home.tsx と Attendance.tsx も合わせて修正すること。
 */

import { z } from "zod";
import { eq, and, gte, lte, isNotNull, isNull, or, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { attendances, users } from "../db/schema";
import { canManualUpdateAttendance, canReadUserWithRole, readableRolesForViewer } from "../lib/accessControl";
import { getTodayJstYmd, parseYmdToDate } from "../lib/date";

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function getTodayDate(): Date {
  return parseYmdToDate(getTodayJstYmd());
}

// ─── ルーター ─────────────────────────────────────────────────────────────────

export const attendanceRouter = router({
  // ─── 今日の勤怠レコードを取得 ────────────────────────────────────────────────
  today: protectedProcedure.query(async ({ ctx }) => {
    const today = getTodayDate();
    const [record] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.userId, ctx.user.id),
          eq(attendances.workDate, today)
        )
      )
      .limit(1);
    return record ?? null;
  }),

  // ─── 勤怠一覧を取得 ──────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        myOnly: z.boolean().optional().default(true),
        userId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.myOnly ? ctx.user.id : (input.userId ?? ctx.user.id);

      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      }
      if (targetUserId !== ctx.user.id && !canReadUserWithRole(ctx.user.role, targetUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }

      const records = await db
        .select({ attendance: attendances, user: users })
        .from(attendances)
        .leftJoin(users, eq(attendances.userId, users.id))
        .where(
          and(
            eq(attendances.userId, targetUserId),
            gte(attendances.workDate, parseYmdToDate(input.startDate)),
            lte(attendances.workDate, parseYmdToDate(input.endDate))
          )
        )
        .orderBy(attendances.workDate);

      return records;
    }),

  // ─── 出勤中メンバー一覧を取得 ────────────────────────────────────────────────
  activeMembers: protectedProcedure.query(async ({ ctx }) => {
    const today = getTodayDate();

    // 今日の勤怠レコードのうち、いずれかの clockIn が打刻済みで clockOut が未打刻のもの
    const records = await db
      .select({ attendance: attendances, user: users })
      .from(attendances)
      .leftJoin(users, eq(attendances.userId, users.id))
      .where(
        and(
          eq(attendances.workDate, today),
          inArray(users.role, readableRolesForViewer(ctx.user.role)),
          or(
            and(isNotNull(attendances.clockIn), isNull(attendances.clockOut)),
            and(isNotNull(attendances.clockIn2), isNull(attendances.clockOut2)),
            and(isNotNull(attendances.clockIn3), isNull(attendances.clockOut3))
          )
        )
      );

    return records;
  }),

  // ─── 出勤打刻 ────────────────────────────────────────────────────────────────
  //
  // 打刻の優先順位:
  //   1. clockIn が未打刻 → clockIn に記録
  //   2. clockIn/clockOut が打刻済み、clockIn2 が未打刻 → clockIn2 に記録
  //   3. clockIn2/clockOut2 が打刻済み、clockIn3 が未打刻 → clockIn3 に記録
  //   4. すべて打刻済み → エラー
  clockIn: protectedProcedure.mutation(async ({ ctx }) => {
    const today = getTodayDate();
    const now = new Date();

    const [existing] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.userId, ctx.user.id),
          eq(attendances.workDate, today)
        )
      )
      .limit(1);

    if (!existing) {
      // 初回出勤: レコードを新規作成
      await db.insert(attendances).values({
        userId: ctx.user.id,
        workDate: today,
        attendanceType: "normal",
        clockIn: now,
      });
      return { success: true, round: 1 };
    }

    if (!existing.clockIn) {
      // clockIn が未打刻（通常ありえないが念のため）
      await db
        .update(attendances)
        .set({ clockIn: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 1 };
    }

    if (existing.clockOut && !existing.clockIn2) {
      // 1回目退勤済み → 2回目出勤
      await db
        .update(attendances)
        .set({ clockIn2: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 2 };
    }

    if (existing.clockOut2 && !existing.clockIn3) {
      // 2回目退勤済み → 3回目出勤
      await db
        .update(attendances)
        .set({ clockIn3: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 3 };
    }

    throw new Error("これ以上出勤打刻できません（最大3回）");
  }),

  // ─── 退勤打刻 ────────────────────────────────────────────────────────────────
  //
  // 打刻の優先順位:
  //   1. clockIn 打刻済み、clockOut 未打刻 → clockOut に記録
  //   2. clockIn2 打刻済み、clockOut2 未打刻 → clockOut2 に記録
  //   3. clockIn3 打刻済み、clockOut3 未打刻 → clockOut3 に記録
  //   4. 出勤打刻がない → エラー
  clockOut: protectedProcedure.mutation(async ({ ctx }) => {
    const today = getTodayDate();
    const now = new Date();

    const [existing] = await db
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.userId, ctx.user.id),
          eq(attendances.workDate, today)
        )
      )
      .limit(1);

    if (!existing?.clockIn) {
      throw new Error("出勤打刻がありません");
    }

    if (!existing.clockOut) {
      // 1回目退勤
      await db
        .update(attendances)
        .set({ clockOut: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 1 };
    }

    if (existing.clockIn2 && !existing.clockOut2) {
      // 2回目退勤
      await db
        .update(attendances)
        .set({ clockOut2: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 2 };
    }

    if (existing.clockIn3 && !existing.clockOut3) {
      // 3回目退勤
      await db
        .update(attendances)
        .set({ clockOut3: now })
        .where(eq(attendances.id, existing.id));
      return { success: true, round: 3 };
    }

    throw new Error("退勤打刻できる状態ではありません");
  }),

  // ─── 勤怠レコードを手動更新（管理者用） ──────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        attendanceType: z
          .enum(["normal", "paid_leave", "absence", "late", "early_leave"])
          .optional(),
        clockIn: z.string().datetime().optional().nullable(),
        clockOut: z.string().datetime().optional().nullable(),
        clockIn2: z.string().datetime().optional().nullable(),
        clockOut2: z.string().datetime().optional().nullable(),
        clockIn3: z.string().datetime().optional().nullable(),
        clockOut3: z.string().datetime().optional().nullable(),
        note: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const [existing] = await db.select().from(attendances).where(eq(attendances.id, id)).limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "勤怠レコードが見つかりません" });
      }

      const [owner] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
      if (!owner) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      }
      if (!canManualUpdateAttendance(ctx.user, owner.id, owner.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const updateData: Record<string, unknown> = {};

      if (data.attendanceType !== undefined) updateData.attendanceType = data.attendanceType;
      if (data.clockIn !== undefined) updateData.clockIn = data.clockIn ? new Date(data.clockIn) : null;
      if (data.clockOut !== undefined) updateData.clockOut = data.clockOut ? new Date(data.clockOut) : null;
      if (data.clockIn2 !== undefined) updateData.clockIn2 = data.clockIn2 ? new Date(data.clockIn2) : null;
      if (data.clockOut2 !== undefined) updateData.clockOut2 = data.clockOut2 ? new Date(data.clockOut2) : null;
      if (data.clockIn3 !== undefined) updateData.clockIn3 = data.clockIn3 ? new Date(data.clockIn3) : null;
      if (data.clockOut3 !== undefined) updateData.clockOut3 = data.clockOut3 ? new Date(data.clockOut3) : null;
      if (data.note !== undefined) updateData.note = data.note;

      await db
        .update(attendances)
        .set(updateData as never)
        .where(eq(attendances.id, id));

      return { success: true };
    }),
});
