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

/** Same scale for both columns (px per hour, 24h = full day). */
export const PIXELS_PER_HOUR = 48;
/** Left time-axis column width; keep in sync with department day grid `grid-template-columns`. */
export const SCHEDULE_DAY_TIME_AXIS_WIDTH_PX = 40;
const DAY_MINUTES = 24 * 60;
export const TIMELINE_HEIGHT_PX = 24 * PIXELS_PER_HOUR;
const HALF_H = PIXELS_PER_HOUR / 2;
const MIN_EVENT_PX = 22;

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

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

/** Clip [start,end) to local calendar day of `day`. Returns null if no overlap. */
export function clipTimedSegmentToDay(
  ev: PersonalDayEvent,
  dayStart: Date,
  dayEnd: Date
): { start: Date; end: Date } | null {
  if (ev.allDay) return null;
  const s = ev.startAt.getTime();
  const e = ev.endAt.getTime();
  const ds = dayStart.getTime();
  const de = dayEnd.getTime();
  const cs = Math.max(s, ds);
  const ce = Math.min(e, de);
  if (ce <= cs) return null;
  return { start: new Date(cs), end: new Date(ce) };
}

export function segmentLayout(
  seg: { start: Date; end: Date },
  dayStart: Date
): { top: number; height: number } {
  const fromMidnightMin = (seg.start.getTime() - dayStart.getTime()) / 60_000;
  const durMin = (seg.end.getTime() - seg.start.getTime()) / 60_000;
  const top = (fromMidnightMin / DAY_MINUTES) * TIMELINE_HEIGHT_PX;
  const height = Math.max((durMin / DAY_MINUTES) * TIMELINE_HEIGHT_PX, MIN_EVENT_PX);
  return { top, height };
}

const HALF_HOUR_LINES = Array.from({ length: 48 }, (_, i) => ({
  key: `slot-${i}`,
  top: (i + 1) * HALF_H,
  dashed: (i + 1) % 2 !== 0,
}));

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => ({
  h,
  top: h * PIXELS_PER_HOUR,
  text: `${String(h).padStart(2, "0")}:00`,
}));

function EventBlock({
  ev,
  dayStart,
  onEventClick,
}: {
  ev: PersonalDayEvent;
  dayStart: Date;
  onEventClick: (ev: PersonalDayEvent, e: React.MouseEvent) => void;
}) {
  const seg = clipTimedSegmentToDay(ev, dayStart, endOfLocalDay(dayStart));
  if (!seg) return null;
  const { top, height } = segmentLayout(seg, dayStart);
  return (
    <button
      type="button"
      style={{ top, height }}
      className={cn(
        "absolute right-1 left-1 z-[1] flex min-h-0 min-w-0 flex-col overflow-hidden rounded border border-slate-200/90 bg-white/95 px-1 py-0.5 text-left shadow-sm backdrop-blur-[1px] transition-colors hover:bg-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      )}
      onClick={(e) => onEventClick(ev, e)}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dotClass(ev), "ring-1 ring-black/5")} aria-hidden />
        <span className="truncate text-[10px] font-semibold leading-tight text-slate-800">{ev.title}</span>
      </span>
      <span className="mt-0.5 font-mono text-[9px] tabular-nums text-slate-400">
        {formatHm(seg.start)}–{formatHm(seg.end)}
      </span>
    </button>
  );
}

/** Left column only (00:00 … 23:00); same geometry as personal day view. */
export function ScheduleDayTimeLabelsColumn() {
  return (
    <div
      className="relative box-border shrink-0 select-none border-r border-slate-100/90 bg-white"
      style={{
        width: SCHEDULE_DAY_TIME_AXIS_WIDTH_PX,
        minWidth: SCHEDULE_DAY_TIME_AXIS_WIDTH_PX,
        maxWidth: SCHEDULE_DAY_TIME_AXIS_WIDTH_PX,
        height: TIMELINE_HEIGHT_PX,
        minHeight: TIMELINE_HEIGHT_PX,
      }}
    >
      {HOUR_LABELS.map(({ h, top, text }) => (
        <span
          key={h}
          className="absolute left-0 right-0 pr-0.5 text-right font-mono text-[10px] tabular-nums leading-none text-slate-400/90"
          style={{ top: top + 2 }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

/** Grid + overlays without the time labels column (for multi-column day layouts). */
export function ScheduleDayTimeGridColumn({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-w-0 w-full flex-1 shrink-0 bg-slate-50/35"
      style={{ height: TIMELINE_HEIGHT_PX, minHeight: TIMELINE_HEIGHT_PX }}
    >
      {HALF_HOUR_LINES.map(({ key, top, dashed }) => (
        <div
          key={key}
          className={cn(
            "pointer-events-none absolute right-0 left-0 z-0 border-b",
            dashed ? "border-dashed border-slate-200/55" : "border-slate-200/70"
          )}
          style={{ top }}
        />
      ))}
      {children}
    </div>
  );
}

/** Hour labels + grid; render timed overlays as children (same geometry as personal day view). */
export function ScheduleDayTimeAxis({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0">
      <ScheduleDayTimeLabelsColumn />
      <ScheduleDayTimeGridColumn>{children}</ScheduleDayTimeGridColumn>
    </div>
  );
}

function DayTimeline({
  timed,
  dayStart,
  onEventClick,
}: {
  timed: readonly PersonalDayEvent[];
  dayStart: Date;
  onEventClick: (ev: PersonalDayEvent, e: React.MouseEvent) => void;
}) {
  return (
    <ScheduleDayTimeAxis>
      {timed.map((ev) => (
        <EventBlock key={ev.id} ev={ev} dayStart={dayStart} onEventClick={onEventClick} />
      ))}
    </ScheduleDayTimeAxis>
  );
}

function ScheduleColumn({
  title,
  emptyHint,
  events,
  dayStart,
  onEventClick,
}: {
  title: string;
  emptyHint: string | null;
  events: readonly PersonalDayEvent[];
  dayStart: Date;
  onEventClick: (ev: PersonalDayEvent, e: React.MouseEvent) => void;
}) {
  const { allDay, timed } = useMemo(() => {
    const ad: PersonalDayEvent[] = [];
    const td: PersonalDayEvent[] = [];
    for (const ev of events) {
      if (ev.allDay) ad.push(ev);
      else if (clipTimedSegmentToDay(ev, dayStart, endOfLocalDay(dayStart))) td.push(ev);
    }
    return { allDay: ad, timed: td };
  }, [events, dayStart]);

  if (emptyHint) {
    return (
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-slate-800">
          {title}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
            <div className="space-y-2 px-2 py-2">
              <p className="flex h-[5rem] shrink-0 flex-col justify-center overflow-y-auto text-center text-xs text-muted-foreground leading-relaxed">
                {emptyHint}
              </p>
              <DayTimeline timed={[]} dayStart={dayStart} onEventClick={onEventClick} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasAny = allDay.length > 0 || timed.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-slate-800">
        {title}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        {allDay.length > 0 && (
          <div className="shrink-0 space-y-1 border-b border-slate-100 bg-slate-50/50 px-2 py-1.5">
            <p className="text-[10px] font-medium text-slate-400">終日</p>
            <div className="flex flex-wrap gap-1">
              {allDay.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className={cn(
                    "inline-flex max-w-full min-w-0 items-center gap-1 rounded border border-slate-200/90 bg-white px-1.5 py-0.5 text-left text-[10px] font-medium text-slate-800 shadow-sm hover:bg-slate-50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  )}
                  onClick={(e) => onEventClick(ev, e)}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass(ev))} aria-hidden />
                  <span className="truncate">{ev.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
          {!hasAny ? (
            <div className="space-y-2 px-2 py-2">
              <p className="flex h-[5rem] shrink-0 flex-col justify-center text-center text-xs text-muted-foreground leading-relaxed">
                この日の予定はありません
              </p>
              <DayTimeline timed={[]} dayStart={dayStart} onEventClick={onEventClick} />
            </div>
          ) : (
            <div className="px-0 py-1">
              <DayTimeline timed={timed} dayStart={dayStart} onEventClick={onEventClick} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
  const dayStart = useMemo(() => startOfLocalDay(currentDate), [currentDate]);
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

  const deptEmptyHint =
    deptKeys.length === 0
      ? "所属部署が設定されていません。システム管理者に所属の登録を依頼してください。"
      : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-white">
      <div className="grid h-full min-h-0 min-w-0 max-w-full grid-cols-2 divide-x divide-slate-200">
        <ScheduleColumn
          title="部署スケジュール"
          emptyHint={deptEmptyHint}
          events={deptKeys.length === 0 ? [] : left}
          dayStart={dayStart}
          onEventClick={onEventClick}
        />
        <ScheduleColumn title="個人スケジュール" emptyHint={null} events={right} dayStart={dayStart} onEventClick={onEventClick} />
      </div>
    </div>
  );
}
