import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

const BUSINESS_DEPT_KEYS = ["maintenance", "painting", "slitter", "drone"] as const;
type BusinessDeptKey = (typeof BUSINESS_DEPT_KEYS)[number];

/** Parent schedules satisfy this shape (structural typing). */
export interface PersonalDayEvent {
  id: number;
  userId: number;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  scheduleType: string | null;
  scheduleDepartment: string | null;
}

const DEPT_DOT_CLASS: Record<string, string> = {
  maintenance: "bg-blue-400",
  painting: "bg-green-400",
  slitter: "bg-amber-300",
  drone: "bg-violet-400",
  all: "bg-slate-400",
  personal: "bg-pink-300",
};

function isBusinessDeptKey(k: string): boolean {
  return (BUSINESS_DEPT_KEYS as readonly string[]).includes(k);
}

function parseUserBusinessDepartments(user: { department: string | null }): BusinessDeptKey[] {
  if (!user.department?.trim()) return [];
  const out: BusinessDeptKey[] = [];
  for (const part of user.department.split(",")) {
    const t = part.trim();
    if (isBusinessDeptKey(t)) out.push(t as BusinessDeptKey);
  }
  return out;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${mm}`;
}

function scheduleSpansYmd(ev: PersonalDayEvent, ymd: string): boolean {
  return formatYmd(ev.startAt) <= ymd && ymd <= formatYmd(ev.endAt);
}

function isDeptLane(ev: PersonalDayEvent, userDeptKeys: ReadonlySet<BusinessDeptKey>): boolean {
  const st = (ev.scheduleType ?? "").toLowerCase();
  const sd = ev.scheduleDepartment ?? "all";
  if (st === "personal" || sd === "personal") return false;
  if (sd === "all") return true;
  return userDeptKeys.has(sd as BusinessDeptKey);
}

function isMyPersonal(ev: PersonalDayEvent, userId: number): boolean {
  if (ev.userId !== userId) return false;
  const st = (ev.scheduleType ?? "").toLowerCase();
  const sd = ev.scheduleDepartment ?? "all";
  return st === "personal" || sd === "personal";
}

function dotClass(ev: PersonalDayEvent): string {
  const sd = ev.scheduleDepartment ?? "all";
  return DEPT_DOT_CLASS[sd] ?? DEPT_DOT_CLASS.all;
}

export function PersonalDayView({
  schedules,
  currentDate,
  user,
  onEventClick,
}: {
  schedules: readonly PersonalDayEvent[];
  currentDate: Date;
  user: { id: number; department: string | null };
  onEventClick: (ev: PersonalDayEvent, e: React.MouseEvent) => void;
}) {
  const ymd = useMemo(() => formatYmd(currentDate), [currentDate]);
  const deptKeys = useMemo(() => parseUserBusinessDepartments(user), [user.department]);
  const userDeptSet = useMemo(() => new Set<BusinessDeptKey>(deptKeys), [deptKeys]);

  const { left, right } = useMemo(() => {
    const dept: PersonalDayEvent[] = [];
    const mine: PersonalDayEvent[] = [];
    for (const ev of schedules) {
      if (!scheduleSpansYmd(ev, ymd)) continue;
      if (isMyPersonal(ev, user.id)) mine.push(ev);
      if (deptKeys.length > 0 && isDeptLane(ev, userDeptSet)) dept.push(ev);
    }
    const byStart = (a: PersonalDayEvent, b: PersonalDayEvent) => a.startAt.getTime() - b.startAt.getTime();
    dept.sort(byStart);
    mine.sort(byStart);
    return { left: dept, right: mine };
  }, [schedules, ymd, user.id, deptKeys, userDeptSet]);

  const timeLabel = (ev: PersonalDayEvent) => (ev.allDay ? "終日" : formatHm(ev.startAt));

  const renderColumn = (title: string, emptyHint: string | null, list: PersonalDayEvent[]) => (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-slate-800">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [scrollbar-width:thin]">
        {emptyHint ? (
          <p className="text-center text-xs text-muted-foreground leading-relaxed">{emptyHint}</p>
        ) : list.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">この日の予定はありません</p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 rounded-md border border-slate-200/90 bg-white px-2 py-1.5 text-left text-slate-900 shadow-sm transition-colors hover:bg-slate-50/90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  )}
                  onClick={(e) => onEventClick(ev, e)}
                >
                  <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {timeLabel(ev)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dotClass(ev), "ring-1 ring-black/5")}
                        aria-hidden
                      />
                      <span className="line-clamp-2 text-xs font-medium">{ev.title}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const deptEmptyHint =
    deptKeys.length === 0
      ? "所属部署が設定されていません。システム管理者に所属の登録を依頼してください。"
      : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-white">
      <div className="grid h-full min-h-0 min-w-0 max-w-full grid-cols-2 divide-x divide-slate-200">
        {renderColumn("部署スケジュール", deptEmptyHint, deptKeys.length === 0 ? [] : left)}
        {renderColumn("個人スケジュール", null, right)}
      </div>
    </div>
  );
}
