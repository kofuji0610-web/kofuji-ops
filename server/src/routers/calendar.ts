import { z } from "zod";
import { router, protectedProcedure } from "../lib/trpc";
import { clearCalendarIntegration, getCalendarIntegration } from "../db/scheduleQueries";

export const calendarRouter = router({
  getIntegrations: protectedProcedure.query(async ({ ctx }) => {
    const google = await getCalendarIntegration(ctx.user.id, "google");
    const outlook = await getCalendarIntegration(ctx.user.id, "outlook");
    return {
      google: google?.accessToken
        ? { connected: true as const, syncEnabled: google.syncEnabled }
        : null,
      microsoft: outlook?.accessToken
        ? { connected: true as const, syncEnabled: outlook.syncEnabled }
        : null,
    };
  }),

  disconnect: protectedProcedure
    .input(z.object({ provider: z.enum(["google", "microsoft"]) }))
    .mutation(async ({ ctx, input }) => {
      const p = input.provider === "microsoft" ? "outlook" : "google";
      await clearCalendarIntegration(ctx.user.id, p);
      return { success: true };
    }),
});
