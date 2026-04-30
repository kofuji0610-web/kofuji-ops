/** server/src/utils/schedulePermission.ts と同一ロジック */

const ROLE_RANK: Record<string, number> = {
  admin: 4,
  manager: 3,
  leader: 2,
  user: 1,
};

export function canEditScheduleOf(editorRole: string, targetRole: string): boolean {
  if (editorRole === "admin") return true;
  return (ROLE_RANK[editorRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0);
}
