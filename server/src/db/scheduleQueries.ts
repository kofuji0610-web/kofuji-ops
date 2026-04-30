import { and, asc, count, desc, eq, gte, gt, inArray, isNull, lte, lt, sql } from "drizzle-orm";
import { db } from "./client";
import { readableRolesForViewer } from "../lib/accessControl";
import {
  calendarIntegrations,
  notifications,
  notificationSettings,
  scheduleTasks,
  schedules,
  shifts,
  users,
  workHours,
} from "./schema";

/** YYYY-MM-DD をローカル日付として解釈（期間フィルタ用） */
export function parseDateOnly(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

export async function getUserById(id: number) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getScheduleById(id: number) {
  const [row] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
  return row ?? null;
}

/** 期間と重なるスケジュール（論理削除除外）。userIds 省略時は全ユーザー。 */
export async function findActiveSchedulesOverlappingRange(
  rangeStart: Date,
  rangeEnd: Date,
  userIds?: number[]
) {
  const overlap = and(
    eq(schedules.isDeleted, false),
    lt(schedules.startAt, rangeEnd),
    gt(schedules.endAt, rangeStart)
  );
  const scope = userIds?.length ? and(overlap, inArray(schedules.userId, userIds)) : overlap;
  return db.select().from(schedules).where(scope).orderBy(asc(schedules.startAt));
}

export async function softDeleteScheduleById(scheduleId: number) {
  await db
    .update(schedules)
    .set({ isDeleted: true, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schedules.id, scheduleId));
}

export async function listTasksForSchedule(scheduleId: number) {
  return db
    .select()
    .from(scheduleTasks)
    .where(eq(scheduleTasks.scheduleId, scheduleId))
    .orderBy(asc(scheduleTasks.sortOrder), asc(scheduleTasks.id));
}

export async function getScheduleTasksByScheduleId(scheduleId: number) {
  return listTasksForSchedule(scheduleId);
}

export async function addScheduleTask(scheduleId: number, title: string) {
  const [maxRow] = await db
    .select({ mx: scheduleTasks.sortOrder })
    .from(scheduleTasks)
    .where(eq(scheduleTasks.scheduleId, scheduleId))
    .orderBy(desc(scheduleTasks.sortOrder))
    .limit(1);
  const nextOrder = (maxRow?.mx ?? -1) + 1;
  await db.insert(scheduleTasks).values({
    scheduleId,
    title,
    completed: false,
    sortOrder: nextOrder,
  });
}

export async function toggleScheduleTask(taskId: number, isCompleted: boolean) {
  await db.update(scheduleTasks).set({ completed: isCompleted }).where(eq(scheduleTasks.id, taskId));
}

export async function deleteScheduleTask(taskId: number) {
  await db.delete(scheduleTasks).where(eq(scheduleTasks.id, taskId));
}

export async function replaceScheduleTasks(
  scheduleId: number,
  tasks: Array<{ title: string; completed?: boolean; sortOrder: number }>
) {
  await db.transaction(async (tx) => {
    await tx.delete(scheduleTasks).where(eq(scheduleTasks.scheduleId, scheduleId));
    if (tasks.length === 0) return;
    await tx.insert(scheduleTasks).values(
      tasks.map((t, i) => ({
        scheduleId,
        title: t.title,
        completed: t.completed ?? false,
        sortOrder: t.sortOrder ?? i,
      }))
    );
  });
}

/** 閲覧ロールに合うアクティブユーザーの ID（チーム表示用） */
export async function getTeamUserIdsForViewer(viewerRole: string): Promise<number[]> {
  const roles = readableRolesForViewer(viewerRole);
  if (roles.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, roles)));
  return rows.map((r) => r.id);
}

export async function getWorkHoursForUsersBetweenDates(
  userIds: number[],
  fromDate: string,
  toDate: string
) {
  if (userIds.length === 0) return [];
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  return db
    .select()
    .from(workHours)
    .where(and(inArray(workHours.userId, userIds), gte(workHours.workDate, from), lte(workHours.workDate, to)))
    .orderBy(asc(workHours.workDate));
}

export async function getWorkHours(userId: number, startDate: string, endDate: string) {
  return getWorkHoursForUsersBetweenDates([userId], startDate, endDate);
}

export async function getTeamWorkHours(startDate: string, endDate: string, viewerRole: string) {
  const ids = await getTeamUserIdsForViewer(viewerRole);
  return getWorkHoursForUsersBetweenDates(ids, startDate, endDate);
}

export async function upsertWorkHour(row: typeof workHours.$inferInsert) {
  await db
    .insert(workHours)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        hours: row.hours,
        note: row.note,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

export async function getShiftsForUsersBetweenDates(
  userIds: number[],
  fromDate: string,
  toDate: string
) {
  if (userIds.length === 0) return [];
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  return db
    .select()
    .from(shifts)
    .where(and(inArray(shifts.userId, userIds), gte(shifts.shiftDate, from), lte(shifts.shiftDate, to)))
    .orderBy(asc(shifts.shiftDate));
}

export async function getShifts(userId: number, startDate: string, endDate: string) {
  return getShiftsForUsersBetweenDates([userId], startDate, endDate);
}

export async function getTeamShifts(startDate: string, endDate: string, viewerRole: string) {
  const ids = await getTeamUserIdsForViewer(viewerRole);
  return getShiftsForUsersBetweenDates(ids, startDate, endDate);
}

export async function upsertShift(row: typeof shifts.$inferInsert) {
  await db
    .insert(shifts)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        shiftType: row.shiftType,
        notes: row.notes,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

export async function listNotificationsForUser(userId: number, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.notifyAt))
    .limit(limit);
}

export async function getUnreadNotifications(userId: number, limit = 100) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.notifyAt))
    .limit(limit);
}

export async function countUnreadNotificationsForUser(userId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markNotificationRead(notificationId: number, userId: number) {
  await db
    .update(notifications)
    .set({ readAt: sql`CURRENT_TIMESTAMP` })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  await markNotificationRead(notificationId, userId);
}

export async function insertNotification(row: typeof notifications.$inferInsert) {
  await db.insert(notifications).values(row);
}

export async function getNotificationSettingsByUserId(userId: number) {
  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getNotificationSettings(userId: number) {
  return getNotificationSettingsByUserId(userId);
}

export async function upsertNotificationSettings(row: typeof notificationSettings.$inferInsert) {
  await db
    .insert(notificationSettings)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        inAppEnabled: row.inAppEnabled,
        reminderMinutes: row.reminderMinutes,
        pushEnabled: row.pushEnabled,
        emailEnabled: row.emailEnabled,
        slackWebhookUrl: row.slackWebhookUrl,
        pushSubscription: row.pushSubscription,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

/** emailEnabled は従来どおり Slack 有効フラグとして利用（slackEnabled と同期）。 */
export async function mergeNotificationSettingsForUser(
  userId: number,
  patch: {
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    slackEnabled?: boolean;
    slackWebhookUrl?: string;
    reminderMinutes?: number;
    pushSubscription?: string;
  }
) {
  const existing = await getNotificationSettingsByUserId(userId);
  await upsertNotificationSettings({
    userId,
    inAppEnabled: patch.inAppEnabled ?? existing?.inAppEnabled ?? true,
    reminderMinutes:
      patch.reminderMinutes !== undefined ? patch.reminderMinutes : existing?.reminderMinutes ?? null,
    pushEnabled: patch.pushEnabled ?? existing?.pushEnabled ?? true,
    emailEnabled:
      patch.slackEnabled !== undefined ? patch.slackEnabled : existing?.emailEnabled ?? false,
    slackWebhookUrl:
      patch.slackWebhookUrl !== undefined ? patch.slackWebhookUrl : existing?.slackWebhookUrl ?? null,
    pushSubscription:
      patch.pushSubscription !== undefined ? patch.pushSubscription : existing?.pushSubscription ?? null,
  });
}

export async function listCalendarIntegrationsByUserId(userId: number) {
  return db.select().from(calendarIntegrations).where(eq(calendarIntegrations.userId, userId));
}

export async function upsertCalendarIntegration(row: typeof calendarIntegrations.$inferInsert) {
  await db
    .insert(calendarIntegrations)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        externalCalendarId: row.externalCalendarId,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        tokenExpiresAt: row.tokenExpiresAt,
        syncEnabled: row.syncEnabled,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

export async function getCalendarIntegration(userId: number, provider: "google" | "outlook") {
  const [row] = await db
    .select()
    .from(calendarIntegrations)
    .where(and(eq(calendarIntegrations.userId, userId), eq(calendarIntegrations.provider, provider)))
    .limit(1);
  return row ?? null;
}

export async function clearCalendarIntegration(userId: number, provider: "google" | "outlook") {
  await db
    .update(calendarIntegrations)
    .set({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      externalCalendarId: null,
      syncEnabled: false,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(calendarIntegrations.userId, userId), eq(calendarIntegrations.provider, provider)));
}
