import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../lib/trpc";
import {
  getNotificationSettings,
  getUnreadNotifications,
  markNotificationAsRead,
  mergeNotificationSettingsForUser,
} from "../db/scheduleQueries";
import { sendSlackNotification } from "../lib/sendSlackNotification";

export const notificationsRouter = router({
  unread: protectedProcedure.query(async ({ ctx }) => {
    return getUnreadNotifications(ctx.user.id);
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationAsRead(input.id, ctx.user.id);
      return { success: true };
    }),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const row = await getNotificationSettings(ctx.user.id);
    if (!row) return null;
    return {
      inAppEnabled: row.inAppEnabled,
      pushEnabled: row.pushEnabled,
      slackEnabled: row.emailEnabled,
      slackWebhookUrl: row.slackWebhookUrl ?? "",
      reminderMinutes: row.reminderMinutes ?? 60,
      pushSubscription: row.pushSubscription,
    };
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        inAppEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        slackEnabled: z.boolean().optional(),
        slackWebhookUrl: z.string().optional(),
        reminderMinutes: z.number().optional(),
        pushSubscription: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await mergeNotificationSettingsForUser(ctx.user.id, input);
      return { success: true };
    }),

  getVapidPublicKey: publicProcedure.query(() => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
  }),

  testSlack: protectedProcedure
    .input(z.object({ webhookUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      await sendSlackNotification(input.webhookUrl, "✅ kofuji-ops からのテスト通知です");
      return { success: true };
    }),
});
