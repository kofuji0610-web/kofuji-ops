import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../lib/trpc";
import { canEditScheduleOf } from "../utils/schedulePermission";
import { getShifts, getTeamShifts, getUserById, parseDateOnly, upsertShift } from "../db/scheduleQueries";

export const shiftsRouter = router({
  myShifts: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      return getShifts(ctx.user.id, input.startDate, input.endDate);
    }),

  teamShifts: protectedProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "user") throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
      return getTeamShifts(input.startDate, input.endDate, ctx.user.role);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        date: z.string(),
        shiftType: z.enum(["work", "off", "remote", "leave"]),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
      if (!canEditScheduleOf(ctx.user.role, targetUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
      }

      const notes =
        input.startTime || input.endTime || input.note
          ? JSON.stringify({
              startTime: input.startTime,
              endTime: input.endTime,
              note: input.note,
            })
          : undefined;

      await upsertShift({
        userId: input.userId,
        shiftDate: parseDateOnly(input.date),
        shiftType: input.shiftType,
        notes: notes ?? null,
      });
      return { success: true };
    }),
});
