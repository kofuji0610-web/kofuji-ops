import { webPush } from "./webPush";
import { getNotificationSettings } from "../db/scheduleQueries";

export async function sendPushNotification(userId: number, title: string, body: string) {
  const settings = await getNotificationSettings(userId);
  if (!settings?.pushEnabled || !settings.pushSubscription) return;
  try {
    const sub = JSON.parse(settings.pushSubscription) as Parameters<typeof webPush.sendNotification>[0];
    await webPush.sendNotification(sub, JSON.stringify({ title, body }));
  } catch (e) {
    console.error("Push notification failed:", e);
  }
}
