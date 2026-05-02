import React, { useMemo } from "react";

/** スケジュール画面「全体共有 × 日表示」用（TimelineView とは別経路で組み込み予定） */
const BUSINESS_DEPT_KEYS = ["maintenance", "painting", "slitter", "drone"] as const;
type BusinessDeptKey = (typeof BUSINESS_DEPT_KEYS)[number];

const DEPT_LABEL_JA: Record<BusinessDeptKey, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
};

/** 「all」は先頭部署（整備）行にのみ表示（既存 TimelineView 日表示の扱いに合わせる） */
const ALL_DEPT_FALLBACK: BusinessDeptKey = BUSINESS_DEPT_KEYS[0];

export type OverallDayMatrixSchedule = {
  id: number;
  userId: number;
  title: string;
  startAt: Date;
  endAt: Date;
  scheduleDepartment: string | null;
  allDay?: boolean;
};

export type OverallDayMatrixMember = {
  id: string;
  name: string;
  displayName: string | null;
  department: string | null;
  role: string | null;
};

function isBusinessDeptKey(k: string): k is BusinessDeptKey {
  return (BUSINESS_DEPT_KEYS as readonly string[]).includes(k);
}

function parseMemberDeptKeys(department: string | null): BusinessDeptKey[] {
  if (!department?.trim()) return [];
  const out: BusinessDeptKey[] = [];
  for (const part of department.split(",")) {
    const t = part.trim();
    if (isBusinessDeptKey(t)) out.push(t);
  }
  return out;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function overlapsCalendarDay(ev: OverallDayMatrixSchedule, ymd: string): boolean {
  const ds = formatYmd(ev.startAt);
  const de = formatYmd(ev.endAt);
  return ds <= ymd && ymd <= de;
}

function eventOverlapsHour(ev: OverallDayMatrixSchedule, dayBase: Date, hour: number): boolean {
  if (ev.allDay) return false;
  const start = new Date(dayBase);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(dayBase);
  end.setHours(hour + 1, 0, 0, 0);
  return ev.startAt < end && ev.endAt > start;
}

function schedulesForDeptRow(
  dept: BusinessDeptKey,
  list: OverallDayMatrixSchedule[],
  ymd: string
): OverallDayMatrixSchedule[] {
  return list.filter((s) => {
    if (!overlapsCalendarDay(s, ymd)) return false;
    const sd = s.scheduleDepartment ?? "all";
    if (sd === dept) return true;
    if (sd === "all" && dept === ALL_DEPT_FALLBACK) return true;
    return false;
  });
}

function schedulesForMemberRow(
  memberIdStr: string,
  list: OverallDayMatrixSchedule[],
  ymd: string
): OverallDayMatrixSchedule[] {
  const mid = Number(memberIdStr);
  return list.filter((s) => overlapsCalendarDay(s, ymd) && s.userId === mid);
}

type MatrixRow =
  | { kind: "dept"; key: BusinessDeptKey }
  | { kind: "member"; key: BusinessDeptKey; member: OverallDayMatrixMember };

export type OverallDayMatrixViewProps = {
  schedules: OverallDayMatrixSchedule[];
  currentDate: Date;
  members: OverallDayMatrixMember[];
  activeDepts: Set<string>;
  onEventClick?: (ev: OverallDayMatrixSchedule, e: React.MouseEvent) => void;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function OverallDayMatrixView({
  schedules,
  currentDate,
  members,
  activeDepts,
  onEventClick,
}: OverallDayMatrixViewProps) {
  const ymd = formatYmd(currentDate);
  const dayBase = useMemo(() => {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const daySchedules = useMemo(
    () => schedules.filter((s) => overlapsCalendarDay(s, ymd)),
    [schedules, ymd]
  );

  const visibleDeptKeys = useMemo(
    () => BUSINESS_DEPT_KEYS.filter((k) => activeDepts.has(k)),
    [activeDepts]
  );

  const rows: MatrixRow[] = useMemo(() => {
    const out: MatrixRow[] = [];
    for (const key of visibleDeptKeys) {
      out.push({ kind: "dept", key });
      const inDept = members.filter((m) => parseMemberDeptKeys(m.department).includes(key));
      for (const member of inDept) {
        out.push({ kind: "member", key, member });
      }
    }
    return out;
  }, [visibleDeptKeys, members]);

  function eventsForRow(row: MatrixRow): OverallDayMatrixSchedule[] {
    if (row.kind === "dept") return schedulesForDeptRow(row.key, daySchedules, ymd);
    return schedulesForMemberRow(row.member.id, daySchedules, ymd);
  }

  function labelForRow(row: MatrixRow): string {
    if (row.kind === "dept") return DEPT_LABEL_JA[row.key];
    const m = row.member;
    return m.displayName?.trim() || m.name;
  }

  const gridCols = `minmax(7rem,9rem) repeat(24, minmax(0,1fr))`;

  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 bg-white [scrollbar-width:thin]">
      <div
        className="grid w-full min-w-0 gap-px bg-slate-200 text-xs"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* ヘッダー行 */}
        <div className="sticky top-0 z-10 bg-slate-100 px-2 py-1 font-semibold text-slate-700"> </div>
        {HOURS.map((h) => (
          <div
            key={`h-${h}`}
            className="sticky top-0 z-10 bg-slate-100 px-0.5 py-1 text-center font-medium text-[10px] text-slate-600"
          >
            {h}
          </div>
        ))}

        {rows.map((row, ri) => {
          const rowEvents = eventsForRow(row);
          const label =
            row.kind === "member" ? (
              <span className="pl-3 text-slate-700">{labelForRow(row)}</span>
            ) : (
              <span className="font-semibold text-slate-800">{labelForRow(row)}</span>
            );

          return (
            <React.Fragment key={`${row.kind}-${row.kind === "member" ? row.member.id : row.key}-${ri}`}>
              <div className="flex min-h-[2.25rem] items-center bg-white px-2 py-1">{label}</div>
              {HOURS.map((h) => {
                const inHour = rowEvents.filter((ev) => eventOverlapsHour(ev, dayBase, h));
                return (
                  <div
                    key={`c-${ri}-${h}`}
                    className="min-h-[2.25rem] min-w-0 border-l border-slate-100 bg-white px-0.5 py-0.5 align-top"
                  >
                    <div className="flex max-h-14 flex-col gap-0.5 overflow-hidden">
                      {inHour.map((ev) => (
                        <button
                          key={`${ev.id}-${h}`}
                          type="button"
                          className="truncate rounded border border-slate-200 bg-slate-50 px-0.5 py-px text-left text-[10px] text-slate-800 hover:bg-slate-100"
                          title={ev.title}
                          onClick={(e) => onEventClick?.(ev, e)}
                        >
                          {ev.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
