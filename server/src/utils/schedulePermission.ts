const ROLE_RANK: Record<string, number> = {
  admin: 4,
  manager: 3,
  leader: 2,
  user: 1,
};

/**
 * 編集者が対象ユーザーのスケジュールを編集できるか（ロール階層）。
 * admin は常に true。それ以外は編集者ランクが対象ランクより厳密に大きいときのみ true。
 */
export function canEditScheduleOf(editorRole: string, targetRole: string): boolean {
  if (editorRole === "admin") return true;
  return (ROLE_RANK[editorRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0);
}
