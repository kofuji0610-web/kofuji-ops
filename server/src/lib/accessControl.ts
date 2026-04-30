import type { User } from "../db/schema";
import { canEditScheduleOf } from "../utils/schedulePermission";

/**
 * 閲覧者が「対象ユーザー（role）」の情報を読めるか。
 * user: user のみ / manager: user+manager / admin: すべて
 */
export function canReadUserWithRole(viewerRole: string, targetRole: string | null | undefined): boolean {
  if (!targetRole) return false;
  if (viewerRole === "admin") return true;
  if (viewerRole === "manager") return targetRole === "user" || targetRole === "manager";
  if (viewerRole === "leader") return targetRole === "user";
  if (viewerRole === "user") return targetRole === "user";
  return false;
}

/** Drizzle の inArray 等に渡す、閲覧可能な role 一覧（日報・勤怠など既存の閲覧範囲。leader は Phase 2 で個別調整可） */
export function readableRolesForViewer(
  viewerRole: string
): ("user" | "manager" | "leader" | "admin")[] {
  if (viewerRole === "admin") return ["user", "manager", "leader", "admin"];
  if (viewerRole === "manager") return ["user", "manager"];
  if (viewerRole === "user") return ["user"];
  if (viewerRole === "leader") return ["user"];
  return [];
}

/**
 * 日報タスクの完了切替が許されるか。
 * user: 自分の日報のみ / manager: 一般ユーザー分のみ / admin: すべて
 */
export function canToggleReportTask(viewer: User, reportOwnerUserId: number, reportOwnerRole: string | null | undefined): boolean {
  if (!reportOwnerRole) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role === "manager") return reportOwnerRole === "user";
  if (viewer.role === "user") return viewer.id === reportOwnerUserId;
  return false;
}

/**
 * 勤怠の手動更新（管理用）が許されるか。
 * admin: すべて / manager: 一般ユーザー分 + 自分 / user: 不可
 */
export function canManualUpdateAttendance(viewer: User, ownerUserId: number, ownerRole: string | null | undefined): boolean {
  if (!ownerRole) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role === "manager") {
    if (ownerRole === "user") return true;
    if (ownerUserId === viewer.id) return true;
    return false;
  }
  return false;
}

/**
 * 他人のスケジュールの更新・削除が許されるか（作成は常に本人のみ）。
 * admin: すべて / manager: 一般ユーザー分 + 自分の分 / user: 自分のみ（他人は不可）
 */
export function canMutateSchedule(viewer: User, scheduleOwnerUserId: number, scheduleOwnerRole: string | null | undefined): boolean {
  if (!scheduleOwnerRole) return false;
  if (viewer.id === scheduleOwnerUserId) return true;
  return canEditScheduleOf(viewer.role, scheduleOwnerRole);
}
