import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { canEditScheduleOf } from "../utils/schedulePermission";
import { getTeamWorkHours, getUserById, getWorkHours, parseDateOnly, upsertWorkHour } from "../db/scheduleQueries";

export const workHoursRouter = router({
  myHours: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      return getWorkHours(ctx.user.id, input.startDate, input.endDate);
    }),

  teamHours: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "user") throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
      return getTeamWorkHours(input.startDate, input.endDate, ctx.user.role);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        date: z.string(),
        hours: z.number().min(0).max(24),
        taskDescription: z.string().optional(),
        scheduleId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      void input.scheduleId;

      const targetUser = await getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      if (!canEditScheduleOf(ctx.user.role, targetUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
      }

      await upsertWorkHour({
        userId: input.userId,
        workDate: parseDateOnly(input.date),
        hours: String(input.hours),
        note: input.taskDescription ?? null,
      });
      return { success: true };
    }),
});
