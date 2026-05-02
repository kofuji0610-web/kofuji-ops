import React, { useMemo } from "react";
import { Wrench, Paintbrush, Scissors, Plane } from "lucide-react";

/** スケジュール画面「全体共有 × 週表示」用 */
const BUSINESS_DEPT_KEYS = ["maintenance", "painting", "slitter", "drone"] as const;
type BusinessDeptKey = (typeof BUSINESS_DEPT_KEYS)[number];

const DEPT_LABEL_JA: Record<BusinessDeptKey, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
};

const DEPT_ICON_MAP = {
  maintenance: Wrench,
  painting: Paintbrush,
  slitter: Scissors,
  drone: Plane,
} as const;

const DEPT_COLOR_MAP = {
  maintenance: "#60A5FA",
  painting: "#4ADE80",
  slitter: "#FCD34D",
  drone: "#A78BFA",
} as const;

const ALL_DEPT_FALLBACK: BusinessDeptKey = BUSINESS_DEPT_KEYS[0];

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"] as const;

const MAX_VISIBLE_EVENTS = 3;

export type OverallWeekMatrixSchedule = {
  id: number;
  userId: number;
  title: string;
  startAt: Date;
  endAt: Date;
  scheduleDepartment: string | null;
  allDay?: boolean;
};

export type OverallWeekMatrixMember = {
  id: string;
  name: string;
  displayName: string | null;
  department: string | null;
  role: string | null;
};

export type OverallWeekMatrixViewProps = {
  schedules: OverallWeekMatrixSchedule[];
  weekDays: Date[];
  members: OverallWeekMatrixMember[];
  activeDepts: Set<string>;
  onEventClick?: (ev: OverallWeekMatrixSchedule, e: React.MouseEvent) => void;
};

type MatrixRow =
  | { kind: "dept"; key: BusinessDeptKey }
  | { kind: "member"; key: BusinessDeptKey; member: OverallWeekMatrixMember };

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

function overlapsCalendarDay(ev: OverallWeekMatrixSchedule, ymd: string): boolean {
  const ds = formatYmd(ev.startAt);
  const de = formatYmd(ev.endAt);
  return ds <= ymd && ymd <= de;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatHm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatEventLine(ev: OverallWeekMatrixSchedule): string {
  if (ev.allDay) return `終日 ${ev.title}`;
  return `${formatHm(ev.startAt)} ${ev.title}`;
}

function sortEventsForCell(list: OverallWeekMatrixSchedule[]): OverallWeekMatrixSchedule[] {
  return [...list].sort((a, b) => {
    const pa = a.allDay ? 1 : 0;
    const pb = b.allDay ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return a.startAt.getTime() - b.startAt.getTime();
  });
}

function eventsForDeptCell(
  dept: BusinessDeptKey,
  ymd: string,
  list: OverallWeekMatrixSchedule[]
): OverallWeekMatrixSchedule[] {
  return list.filter((s) => {
    if (!overlapsCalendarDay(s, ymd)) return false;
    const sd = s.scheduleDepartment ?? "all";
    if (sd === dept) return true;
    if (sd === "all" && dept === ALL_DEPT_FALLBACK) return true;
    return false;
  });
}

function eventsForMemberCell(
  memberIdStr: string,
  ymd: string,
  list: OverallWeekMatrixSchedule[]
): OverallWeekMatrixSchedule[] {
  const mid = Number(memberIdStr);
  return list.filter((s) => overlapsCalendarDay(s, ymd) && s.userId === mid);
}

export function OverallWeekMatrixView({
  schedules,
  weekDays,
  members,
  activeDepts,
  onEventClick,
}: OverallWeekMatrixViewProps) {
  const visibleDeptKeys = useMemo(
    () => BUSINESS_DEPT_KEYS.filter((k) => activeDepts.has(k)),
    [activeDepts]
  );

  const rows: MatrixRow[] = useMemo(() => {
    const out: MatrixRow[] = [];
    for (const key of visibleDeptKeys) {
      out.push({ kind: "dept", key });
    }
    for (const key of visibleDeptKeys) {
      const inDept = members.filter((m) => parseMemberDeptKeys(m.department).includes(key));
      for (const member of inDept) {
        out.push({ kind: "member", key, member });
      }
    }
    return out;
  }, [visibleDeptKeys, members]);

  const deptRowsCount = visibleDeptKeys.length;
  const memberRowsCount = rows.filter((r) => r.kind === "member").length;

  const gridCols = useMemo(
    () => `minmax(6rem, 7rem) repeat(${weekDays.length}, minmax(0, 1fr))`,
    [weekDays.length]
  );

  const gridRows = `auto repeat(${deptRowsCount}, 36px) repeat(${memberRowsCount}, minmax(0, 1fr))`;

  function labelForRow(row: MatrixRow): string {
    if (row.kind === "dept") return DEPT_LABEL_JA[row.key];
    const m = row.member;
    return m.displayName?.trim() || m.name;
  }

  function eventsForCell(row: MatrixRow, ymd: string): OverallWeekMatrixSchedule[] {
    if (row.kind === "dept") return sortEventsForCell(eventsForDeptCell(row.key, ymd, schedules));
    return sortEventsForCell(eventsForMemberCell(row.member.id, ymd, schedules));
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-md border border-slate-200 bg-white [scrollbar-width:thin]">
      <div
        className="grid w-full min-h-0 min-w-0 flex-1 gap-px bg-slate-200 text-xs"
        style={{ gridTemplateColumns: gridCols, gridTemplateRows: gridRows }}
      >
        <div className="sticky top-0 z-10 bg-slate-100 px-2 py-1 font-semibold text-slate-700"> </div>
        {weekDays.map((d) => {
          const wd = WEEKDAY_JP[d.getDay()];
          return (
            <div
              key={formatYmd(d)}
              className="sticky top-0 z-10 bg-slate-100 px-0.5 py-1 text-center font-medium text-[10px] text-slate-600"
            >
              {wd} {d.getDate()}
            </div>
          );
        })}

        {rows.map((row, ri) => {
          const label =
            row.kind === "member" ? (
              <span className="flex items-center gap-1.5 pl-3 text-slate-700">
                {(() => {
                  const Icon = DEPT_ICON_MAP[row.key];
                  return <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />;
                })()}
                {labelForRow(row)}
              </span>
            ) : (
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                {(() => {
                  const Icon = DEPT_ICON_MAP[row.key];
                  return (
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: DEPT_COLOR_MAP[row.key] }}
                      aria-hidden
                    />
                  );
                })()}
                {labelForRow(row)}
              </span>
            );

          return (
            <React.Fragment key={`${row.kind}-${row.kind === "member" ? row.member.id : row.key}-${ri}`}>
              <div className="flex min-h-[2.25rem] items-center bg-white px-2 py-1">{label}</div>
              {weekDays.map((d) => {
                const ymd = formatYmd(d);
                const evts = eventsForCell(row, ymd);
                const visible = evts.slice(0, MAX_VISIBLE_EVENTS);
                const rest = evts.length - visible.length;

                return (
                  <div
                    key={`${ymd}-${ri}`}
                    className="min-h-[2.25rem] min-w-0 border-l border-slate-100 bg-white px-0.5 py-0.5 align-top"
                  >
                    <div className="flex max-h-28 flex-col gap-0.5 overflow-hidden">
                      {visible.map((ev) => (
                        <button
                          key={`${ev.id}-${ymd}`}
                          type="button"
                          className="truncate rounded border border-slate-200 bg-slate-50 px-0.5 py-px text-left text-[10px] text-slate-800 hover:bg-slate-100"
                          title={formatEventLine(ev)}
                          onClick={(e) => onEventClick?.(ev, e)}
                        >
                          {formatEventLine(ev)}
                        </button>
                      ))}
                      {rest > 0 && (
                        <span className="text-[10px] text-muted-foreground px-0.5">他 {rest} 件</span>
                      )}
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
