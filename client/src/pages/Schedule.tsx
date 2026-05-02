import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import holidayJp from "@holiday-jp/holiday_jp";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Paintbrush,
  Plane,
  Scissors,
  UserCircle,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  PersonalDayView,
  ScheduleDayTimeLabelsColumn,
  ScheduleDayTimeGridColumn,
  SCHEDULE_DAY_TIME_AXIS_WIDTH_PX,
  PIXELS_PER_HOUR,
  clipTimedSegmentToDay,
  endOfLocalDay,
  segmentLayout,
  startOfLocalDay,
} from "@/components/schedule/PersonalDayView";
import { canEditScheduleOf } from "@/utils/schedulePermission";
import { OverallDayMatrixView } from "@/components/schedule/OverallDayMatrixView";

// ─── 定数（全タブ共通） ───────────────────────────────────────────────────────

const DEPT_CONFIG = {
  maintenance: { label: "整備", color: "#60A5FA", bg: "bg-blue-400", border: "border-blue-400" },
  painting: { label: "塗装", color: "#4ADE80", bg: "bg-green-400", border: "border-green-400" },
  slitter: { label: "スリッター", color: "#FCD34D", bg: "bg-amber-300", border: "border-amber-300" },
  drone: { label: "ドローン", color: "#A78BFA", bg: "bg-violet-400", border: "border-violet-400" },
  all: { label: "全部署", color: "#94A3B8", bg: "bg-slate-400", border: "border-slate-400" },
  personal: { label: "個人", color: "#F9A8D4", bg: "bg-pink-300", border: "border-pink-300" },
} as const;

const DEPT_KEYS = Object.keys(DEPT_CONFIG) as (keyof typeof DEPT_CONFIG)[];

/** 左フィルター・部署予定フォーム・日表示の部署行（all / personal は DEPT_CONFIG に残す） */
const BUSINESS_DEPT_KEYS = ["maintenance", "painting", "slitter", "drone"] as const;

const DEPT_FILTER_ICON_COMPONENTS = {
  maintenance: Wrench,
  painting: Paintbrush,
  slitter: Scissors,
  drone: Plane,
} as const;

type BusinessDeptKey = (typeof BUSINESS_DEPT_KEYS)[number];

const DEFAULT_FORM_DEPT: BusinessDeptKey = BUSINESS_DEPT_KEYS[0];

/** `week-${ymd}-${n}` droppable ids; suffix must be numeric per parseDropToAnchor. */
const DEPT_WEEK_DROP_ID_NUM: Record<BusinessDeptKey, number> = {
  maintenance: 1,
  painting: 2,
  slitter: 3,
  drone: 4,
};

function isBusinessDeptKey(k: string): boolean {
  return (BUSINESS_DEPT_KEYS as readonly string[]).includes(k);
}

function parseUserBusinessDeptKeys(department: string | null): string[] {
  if (!department?.trim()) return [];
  const out: string[] = [];
  for (const part of department.split(",")) {
    const t = part.trim();
    if (isBusinessDeptKey(t)) out.push(t);
  }
  return out;
}

function normalizeActiveDeptsPref(saved?: string[]): Set<string> {
  const fallback = () => new Set<string>([...BUSINESS_DEPT_KEYS]);
  if (!saved?.length) return fallback();
  const filtered = saved.filter(isBusinessDeptKey);
  return filtered.length ? new Set(filtered) : fallback();
}

type ScheduleScopeTab = "personal" | "department" | "overall";

const TASK_TYPES_BY_DEPT: Record<string, string[]> = {
  maintenance: ["点検", "オイル交換", "タイヤ交換・点検", "ブレーキ整備", "エンジン整備", "車体修理", "洗車", "打合せ", "その他"],
  painting: ["下処理", "塗装", "清掃", "デザイン", "打合せ", "その他"],
  drone: ["国家資格講習", "NTT講習", "機械整備", "打合せ", "その他"],
  slitter: ["裁断", "清掃", "打合せ", "その他"],
  all: ["打合せ", "研修", "その他"],
  personal: ["打合せ", "研修", "講習", "休暇", "その他"],
};

const SHIFT_CONFIG = {
  work: { label: "出勤", color: "bg-green-100 text-green-700 border-green-300" },
  off: { label: "休み", color: "bg-red-100 text-red-700 border-red-300" },
  remote: { label: "リモート", color: "bg-blue-100 text-blue-700 border-blue-300" },
  leave: { label: "有休", color: "bg-orange-100 text-orange-700 border-orange-300" },
} as const;

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
/** 週次工数表ヘッダー（月〜日 = ISO 週の月曜始まり） */
const WEEKDAY_HEADERS_MO_SU = ["月", "火", "水", "木", "金", "土", "日"];
const LABEL_W = 160;
const CALENDAR_PREFS_KEY = "schedule-calendar-prefs-v1";

type CalendarPrefs = {
  view?: "month" | "week" | "timeline";
  tlMode?: "month" | "week" | "day";
  density?: "comfortable" | "compact";
  scheduleScope?: ScheduleScopeTab;
  activeDepts?: string[];
  selectedMemberIds?: number[];
};

function loadCalendarPrefs(): CalendarPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CALENDAR_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CalendarPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatEventTimeLabel(ev: ScheduleRow): string {
  if (ev.allDay) return "終日";
  return `${formatHm(ev.startAt)}-${formatHm(ev.endAt)}`;
}

function getDeptChipClass(dept: string | null | undefined): string {
  const dk = (dept ?? "all") as keyof typeof DEPT_CONFIG;
  if (dk === "maintenance") return "bg-blue-100 text-blue-900 border-blue-200";
  if (dk === "painting") return "bg-green-100 text-green-900 border-green-200";
  if (dk === "slitter") return "bg-amber-100 text-amber-900 border-amber-200";
  if (dk === "drone") return "bg-violet-100 text-violet-900 border-violet-200";
  if (dk === "personal") return "bg-pink-100 text-pink-900 border-pink-200";
  return "bg-slate-100 text-slate-900 border-slate-200";
}

function getDeptAccentClass(dept: string | null | undefined): string {
  const dk = (dept ?? "all") as keyof typeof DEPT_CONFIG;
  if (dk === "maintenance") return "border-l-blue-400";
  if (dk === "painting") return "border-l-green-400";
  if (dk === "slitter") return "border-l-amber-400";
  if (dk === "drone") return "border-l-violet-400";
  if (dk === "personal") return "border-l-pink-400";
  return "border-l-slate-400";
}

function canDeleteSchedule(
  viewerId: number,
  viewerRole: string,
  ownerId: number,
  ownerRole: string | null | undefined
): boolean {
  if (!ownerRole) return false;
  if (viewerId === ownerId) return true;
  return canEditScheduleOf(viewerRole, ownerRole);
}

// ─── 日付ユーティリティ ──────────────────────────────────────────────────────

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** 月カレンダー用 42 マス（先頭は含む週の日曜から） */
function getMonthGridDates(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const pad = first.getDay();
  const start = new Date(year, month, 1 - pad);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(addDays(start, i));
  }
  return cells;
}

function isHolidayOrSunday(d: Date): boolean {
  if (d.getDay() === 0) return true;
  return holidayJp.isHoliday(d);
}

function getHolidayName(d: Date): string | null {
  const holiday = holidayJp.isHoliday(d) as unknown;
  if (!holiday || typeof holiday !== "object") return null;
  if (!("name" in holiday)) return null;
  const name = (holiday as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function isSaturday(d: Date): boolean {
  return d.getDay() === 6;
}

function parseDropToAnchor(dropId: string): { ymd: string; hour: number | null } | null {
  const mDay = dropId.match(/^(?:day|week)-(\d{4}-\d{2}-\d{2})(?:-\d+)?$/);
  if (mDay) return { ymd: mDay[1], hour: null };
  const mTl = dropId.match(/^tl-(?:month|week)-[a-z]+-(\d{4}-\d{2}-\d{2})$/);
  if (mTl) return { ymd: mTl[1], hour: null };
  const tlDay = dropId.match(/^tl-day-[^-]+-(\d{4}-\d{2}-\d{2})-(\d{1,2})$/);
  if (tlDay) return { ymd: tlDay[1], hour: parseInt(tlDay[2], 10) };
  return null;
}

type ScheduleRow = {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  color: string | null;
  scheduleType: string | null;
  scheduleDepartment: string | null;
  resourceName: string | null;
  createdBy: number;
  isDeleted: boolean;
  user: {
    id: number;
    name: string;
    role: string | null;
    department: string | null;
    displayName: string | null;
  };
};

const DEPT_SCOPE_KEYS = ["maintenance", "painting", "slitter", "drone"] as const;

function matchesScheduleScope(s: ScheduleRow, scope: ScheduleScopeTab): boolean {
  const st = (s.scheduleType ?? "").toLowerCase();
  const sd = s.scheduleDepartment ?? "all";
  if (scope === "personal") {
    return st === "personal" || sd === "personal";
  }
  if (scope === "overall") {
    return sd === "all";
  }
  if (st === "personal" || sd === "personal") return false;
  if (sd === "all") return false;
  return (DEPT_SCOPE_KEYS as readonly string[]).includes(sd);
}

function normalizeScheduleScope(v: unknown): ScheduleScopeTab {
  if (v === "personal" || v === "department" || v === "overall") return v;
  return "department";
}

// ─── シフト・工数タブ ───────────────────────────────────────────────────────

function parseShiftNotes(notes: string | null): { startTime?: string; endTime?: string; note?: string } {
  if (!notes) return {};
  try {
    const j = JSON.parse(notes) as { startTime?: string; endTime?: string; note?: string };
    return typeof j === "object" && j ? j : {};
  } catch {
    return {};
  }
}

function shiftDateStr(v: unknown): string {
  if (v instanceof Date) return format(v, "yyyy-MM-dd");
  return format(new Date(String(v)), "yyyy-MM-dd");
}

function canEditShiftForMember(
  viewerId: number,
  viewerRole: string,
  memberId: number,
  memberRole: string | null | undefined
): boolean {
  const targetRole = memberRole ?? "user";
  if (viewerRole === "user") return viewerId === memberId;
  if (viewerId === memberId) return true;
  return canEditScheduleOf(viewerRole, targetRole);
}

function canEditHoursForMember(
  viewerId: number,
  viewerRole: string,
  memberId: number,
  memberRole: string | null | undefined
): boolean {
  return canEditShiftForMember(viewerId, viewerRole, memberId, memberRole);
}

function ShiftTab() {
  const { user } = useAuth();
  const role = user?.role ?? "user";
  const uid = user?.id ?? 0;

  const [shiftDate, setShiftDate] = useState(() => new Date());
  const [editingCell, setEditingCell] = useState<{ userId: number; date: string } | null>(null);
  const [shiftForm, setShiftForm] = useState({
    shiftType: "work" as "work" | "off" | "remote" | "leave",
    startTime: "09:00",
    endTime: "18:00",
    note: "",
  });

  const isLeaderOrAbove = ["admin", "manager", "leader"].includes(role);

  const shiftRangeInput = useMemo(
    () => ({
      startDate: format(startOfMonth(shiftDate), "yyyy-MM-dd"),
      endDate: format(endOfMonth(shiftDate), "yyyy-MM-dd"),
    }),
    [shiftDate]
  );

  const { data: shiftData = [], refetch: refetchShifts } = isLeaderOrAbove
    ? trpc.shifts.teamShifts.useQuery(shiftRangeInput)
    : trpc.shifts.myShifts.useQuery(shiftRangeInput);

  const upsertShiftMutation = trpc.shifts.upsert.useMutation({
    onSuccess: () => {
      void refetchShifts();
      setEditingCell(null);
      toast.success("シフトを保存しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: members = [] } = trpc.users.listForSchedule.useQuery();

  const monthDays = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(shiftDate), end: endOfMonth(shiftDate) }),
    [shiftDate]
  );

  const shiftMap = useMemo(() => {
    const m = new Map<string, (typeof shiftData)[number]>();
    for (const s of shiftData) {
      const ds = shiftDateStr(s.shiftDate);
      m.set(`${s.userId}-${ds}`, s);
    }
    return m;
  }, [shiftData]);

  const tableMembers = useMemo(() => {
    if (isLeaderOrAbove) return members;
    return members.filter((m) => m.id === uid);
  }, [members, isLeaderOrAbove, uid]);

  const openEditor = (memberId: number, dateStr: string, memberRole: string | null | undefined) => {
    if (!canEditShiftForMember(uid, role, memberId, memberRole)) return;
    const row = shiftMap.get(`${memberId}-${dateStr}`);
    const meta = parseShiftNotes(row?.notes ?? null);
    setShiftForm({
      shiftType: (row?.shiftType as typeof shiftForm.shiftType) ?? "work",
      startTime: meta.startTime ?? "09:00",
      endTime: meta.endTime ?? "18:00",
      note: meta.note ?? "",
    });
    setEditingCell({ userId: memberId, date: dateStr });
  };

  const saveShift = () => {
    if (!editingCell) return;
    upsertShiftMutation.mutate({
      userId: editingCell.userId,
      date: editingCell.date,
      shiftType: shiftForm.shiftType,
      startTime: shiftForm.shiftType === "off" || shiftForm.shiftType === "leave" ? undefined : shiftForm.startTime,
      endTime: shiftForm.shiftType === "off" || shiftForm.shiftType === "leave" ? undefined : shiftForm.endTime,
      note: shiftForm.note || undefined,
    });
  };

  const monthLabel = format(shiftDate, "yyyy年 M月");

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Button type="button" variant="outline" size="icon" onClick={() => setShiftDate((d) => addMonths(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => setShiftDate((d) => addMonths(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{monthLabel}</span>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-muted/60">
              <th className="border p-1 text-left sticky left-0 z-10 bg-muted/90 min-w-[120px]">メンバー</th>
              {monthDays.map((d) => (
                <th key={formatYmd(d)} className="border p-0.5 text-center font-normal min-w-[28px]">
                  <div>{d.getDate()}</div>
                  <div className="text-[10px] text-muted-foreground">{WEEKDAY_LABELS[d.getDay()]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableMembers.map((m) => (
              <tr key={m.id}>
                <td className="border p-1 sticky left-0 z-10 bg-background font-medium">{m.displayName ?? m.name}</td>
                {monthDays.map((d) => {
                  const ymd = formatYmd(d);
                  const s = shiftMap.get(`${m.id}-${ymd}`);
                  const st = (s?.shiftType ?? "work") as keyof typeof SHIFT_CONFIG;
                  const cfg = SHIFT_CONFIG[st] ?? SHIFT_CONFIG.work;
                  const editable = canEditShiftForMember(uid, role, m.id, m.role);
                  return (
                    <td key={ymd} className="border p-0">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => openEditor(m.id, ymd, m.role)}
                        className={cn(
                          "w-full min-h-[32px] px-0.5 py-1 text-[10px] leading-tight border border-transparent rounded-sm",
                          cfg.color,
                          editable ? "hover:opacity-90 cursor-pointer" : "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <span className="block truncate max-w-[36px] mx-auto" title={s ? cfg.label : ""}>
                          {s ? cfg.label : "—"}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingCell && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[80] bg-black/40"
            aria-label="閉じる"
            onClick={() => setEditingCell(null)}
          />
          <Card className="fixed z-[90] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,380px)] shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-base">シフト編集</CardTitle>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCell(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{editingCell.date}</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SHIFT_CONFIG) as (keyof typeof SHIFT_CONFIG)[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={shiftForm.shiftType === k ? "default" : "outline"}
                    className={cn("text-xs", shiftForm.shiftType === k && SHIFT_CONFIG[k].color)}
                    onClick={() => setShiftForm((p) => ({ ...p, shiftType: k }))}
                  >
                    {SHIFT_CONFIG[k].label}
                  </Button>
                ))}
              </div>
              {shiftForm.shiftType !== "off" && shiftForm.shiftType !== "leave" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">開始</Label>
                    <Input
                      type="time"
                      value={shiftForm.startTime}
                      onChange={(e) => setShiftForm((p) => ({ ...p, startTime: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">終了</Label>
                    <Input
                      type="time"
                      value={shiftForm.endTime}
                      onChange={(e) => setShiftForm((p) => ({ ...p, endTime: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">メモ</Label>
                <Input
                  value={shiftForm.note}
                  onChange={(e) => setShiftForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="任意"
                />
              </div>
              <Button type="button" className="w-full" onClick={saveShift} disabled={upsertShiftMutation.isPending}>
                保存
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function WorkHoursTab() {
  const { user } = useAuth();
  const role = user?.role ?? "user";
  const uid = user?.id ?? 0;
  const isAdmin = role === "admin";

  const [hoursWeekStart, setHoursWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [localHours, setLocalHours] = useState<Record<string, string>>({});

  const isLeaderOrAbove = ["admin", "manager", "leader"].includes(role);

  const hoursRangeInput = useMemo(() => {
    const end = new Date(hoursWeekStart);
    end.setDate(end.getDate() + 6);
    return {
      startDate: format(hoursWeekStart, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [hoursWeekStart]);

  const { data: hoursData = [], refetch: refetchHours } = isLeaderOrAbove
    ? trpc.workHours.teamHours.useQuery(hoursRangeInput)
    : trpc.workHours.myHours.useQuery(hoursRangeInput);

  const upsertHoursMutation = trpc.workHours.upsert.useMutation({
    onSuccess: () => void refetchHours(),
    onError: (e) => toast.error(e.message),
  });

  const { data: members = [] } = trpc.users.listForSchedule.useQuery();

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoursWeekStart);
      d.setDate(hoursWeekStart.getDate() + i);
      return d;
    });
  }, [hoursWeekStart]);

  useEffect(() => {
    setLocalHours(() => {
      const next: Record<string, string> = {};
      for (const row of hoursData) {
        const ds =
          row.workDate instanceof Date
            ? format(row.workDate, "yyyy-MM-dd")
            : format(new Date(String(row.workDate)), "yyyy-MM-dd");
        next[`${row.userId}-${ds}`] = String(row.hours ?? "0");
      }
      return next;
    });
  }, [hoursData]);

  const tableMembers = useMemo(() => {
    if (isLeaderOrAbove) return members;
    return members.filter((m) => m.id === uid);
  }, [members, isLeaderOrAbove, uid]);

  const getKey = (memberId: number, d: Date) => `${memberId}-${format(d, "yyyy-MM-dd")}`;

  const commitCell = (memberId: number, d: Date, memberRole: string | null | undefined) => {
    if (!canEditHoursForMember(uid, role, memberId, memberRole)) return;
    const key = getKey(memberId, d);
    const raw = localHours[key] ?? "0";
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0 || n > 24) {
      toast.error("0〜24の範囲で入力してください");
      return;
    }
    upsertHoursMutation.mutate({
      userId: memberId,
      date: format(d, "yyyy-MM-dd"),
      hours: Math.round(n * 2) / 2,
    });
  };

  const weekLabel = `${format(weekDates[0], "yyyy/MM/dd")} 〜 ${format(weekDates[6], "yyyy/MM/dd")}`;

  const exportCSV = () => {
    const rows = tableMembers.map((m) => {
      const weekVals = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(hoursWeekStart);
        d.setDate(hoursWeekStart.getDate() + i);
        const key = getKey(m.id, d);
        return localHours[key] ?? "0";
      });
      const total = weekVals.reduce((s, v) => s + Number(v || 0), 0);
      const name = m.displayName ?? m.name ?? "";
      return [name, ...weekVals, String(total)].join(",");
    });
    const header = ["メンバー", ...WEEKDAY_HEADERS_MO_SU, "週計"].join(",");
    const bom = "\uFEFF";
    const blob = new Blob([bom + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `工数_${format(hoursWeekStart, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setHoursWeekStart((d) => addDays(d, -7))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setHoursWeekStart((d) => addDays(d, 7))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{weekLabel}</span>
        {isAdmin && (
          <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={exportCSV}>
            CSV出力
          </Button>
        )}
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-muted/60">
              <th className="border p-1 text-left sticky left-0 z-10 bg-muted/90 min-w-[120px]">メンバー</th>
              {weekDates.map((d, i) => (
                <th key={i} className="border p-1 text-center font-normal min-w-[72px]">
                  <div>{format(d, "M/d")}</div>
                  <div className="text-[10px] text-muted-foreground">{WEEKDAY_HEADERS_MO_SU[i]}</div>
                </th>
              ))}
              <th className="border p-1 text-center min-w-[64px] bg-muted/40">週計</th>
            </tr>
          </thead>
          <tbody>
            {tableMembers.map((m) => {
              const weekVals = weekDates.map((d) => {
                const key = getKey(m.id, d);
                return localHours[key] ?? "";
              });
              const total = weekVals.reduce((s, v) => s + (parseFloat(v) || 0), 0);
              return (
                <tr key={m.id}>
                  <td className="border p-1 sticky left-0 z-10 bg-background font-medium">{m.displayName ?? m.name}</td>
                  {weekDates.map((d) => {
                    const key = getKey(m.id, d);
                    const editable = canEditHoursForMember(uid, role, m.id, m.role);
                    return (
                      <td key={key} className="border p-0.5">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          disabled={!editable}
                          className={cn(
                            "w-full h-8 px-1 text-right rounded border bg-background text-xs",
                            !editable && "opacity-50 cursor-not-allowed"
                          )}
                          value={localHours[key] ?? ""}
                          placeholder="0"
                          onChange={(e) => setLocalHours((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => commitCell(m.id, d, m.role)}
                        />
                      </td>
                    );
                  })}
                  <td className="border p-1 text-right tabular-nums bg-muted/20 font-medium">{total.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function NotificationTab() {
  const utils = trpc.useUtils();
  const [settings, setSettings] = useState({
    inAppEnabled: true,
    pushEnabled: false,
    slackEnabled: false,
    slackWebhookUrl: "",
    reminderMinutes: 60,
  });
  const [slackTestSending, setSlackTestSending] = useState(false);

  const { data: savedSettings, refetch: refetchSettings } = trpc.notifications.getSettings.useQuery();
  const { data: vapidKey } = trpc.notifications.getVapidPublicKey.useQuery();
  const { data: calendarIntegrations, refetch: refetchCalendarIntegrations } =
    trpc.calendar.getIntegrations.useQuery();

  useEffect(() => {
    if (!savedSettings) return;
    setSettings((s) => ({
      ...s,
      inAppEnabled: savedSettings.inAppEnabled ?? true,
      pushEnabled: savedSettings.pushEnabled ?? false,
      slackEnabled: savedSettings.slackEnabled ?? false,
      slackWebhookUrl: savedSettings.slackWebhookUrl ?? "",
      reminderMinutes: savedSettings.reminderMinutes ?? 60,
    }));
  }, [savedSettings]);

  const updateSettingsMutation = trpc.notifications.updateSettings.useMutation({
    onSuccess: () => void refetchSettings(),
    onError: (e) => toast.error(e.message),
  });

  const testSlackMutation = trpc.notifications.testSlack.useMutation();
  const disconnectCalendarMutation = trpc.calendar.disconnect.useMutation({
    onSuccess: () => {
      void refetchCalendarIntegrations();
      void utils.calendar.getIntegrations.invalidate();
    },
  });

  const subscribePush = async () => {
    if (!vapidKey?.publicKey) {
      toast.error("VAPID 公開鍵が未設定です（サーバーの .env を確認）");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await reg.update();
      const ready = await navigator.serviceWorker.ready;
      const sub = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
      });
      const json = sub.toJSON();
      await updateSettingsMutation.mutateAsync({
        pushEnabled: true,
        pushSubscription: JSON.stringify(json),
      });
      setSettings((s) => ({ ...s, pushEnabled: true }));
      toast.success("ブラウザ通知を有効にしました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "プッシュ通知の購読に失敗しました");
    }
  };

  return (
    <div className="max-w-2xl space-y-8 text-sm">
      <section className="space-y-2">
        <h3 className="text-base font-semibold">アプリ内通知（一覧モード）</h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.inAppEnabled}
            onCheckedChange={(v) => {
              setSettings((s) => ({ ...s, inAppEnabled: v }));
              updateSettingsMutation.mutate({ inAppEnabled: v });
            }}
          />
          <span className="text-muted-foreground">ヘッダーの通知一覧に表示する</span>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">ブラウザ通知</h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.pushEnabled}
            onCheckedChange={(v) => {
              if (v) void subscribePush();
              else {
                setSettings((s) => ({ ...s, pushEnabled: false }));
                updateSettingsMutation.mutate({ pushEnabled: false });
              }
            }}
          />
          <span className="text-muted-foreground">プッシュ通知を受け取る（HTTPS または localhost）</span>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Slack 連携</h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={settings.slackEnabled}
            onCheckedChange={(v) => {
              setSettings((s) => ({ ...s, slackEnabled: v }));
              updateSettingsMutation.mutate({ slackEnabled: v });
            }}
          />
          <span className="text-muted-foreground">Slack へ通知する</span>
        </div>
        {settings.slackEnabled && (
          <div className="space-y-2 pl-1">
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={settings.slackWebhookUrl}
              onChange={(e) => setSettings((s) => ({ ...s, slackWebhookUrl: e.target.value }))}
              onBlur={(e) =>
                updateSettingsMutation.mutate({ slackWebhookUrl: e.target.value || undefined })
              }
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={slackTestSending || !settings.slackWebhookUrl}
              onClick={async () => {
                setSlackTestSending(true);
                try {
                  await testSlackMutation.mutateAsync({ webhookUrl: settings.slackWebhookUrl });
                  toast.success("テスト通知を送信しました");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "送信に失敗しました");
                } finally {
                  setSlackTestSending(false);
                }
              }}
            >
              {slackTestSending ? "送信中..." : "テスト送信"}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">リマインダー</h3>
        <Select
          value={String(settings.reminderMinutes)}
          onValueChange={(v) => {
            const val = Number(v);
            setSettings((s) => ({ ...s, reminderMinutes: val }));
            updateSettingsMutation.mutate({ reminderMinutes: val });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15分前</SelectItem>
            <SelectItem value="30">30分前</SelectItem>
            <SelectItem value="60">1時間前</SelectItem>
            <SelectItem value="120">2時間前</SelectItem>
            <SelectItem value="1440">前日</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-semibold">外部カレンダー連携</h3>

        <div className="flex flex-wrap items-center gap-2 border rounded-md p-3">
          <span className="font-medium min-w-[140px]">Google Calendar</span>
          {calendarIntegrations?.google ? (
            <>
              <Badge variant="outline">接続中</Badge>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => disconnectCalendarMutation.mutate({ provider: "google" })}
              >
                連携解除
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => (window.location.href = "/api/auth/google/calendar")}>
              連携する
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border rounded-md p-3">
          <span className="font-medium min-w-[140px]">Outlook / Microsoft 365</span>
          {calendarIntegrations?.microsoft ? (
            <>
              <Badge variant="outline">接続中</Badge>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => disconnectCalendarMutation.mutate({ provider: "microsoft" })}
              >
                連携解除
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={() => (window.location.href = "/api/auth/microsoft/calendar")}>
              連携する
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── DnD チップ ──────────────────────────────────────────────────────────────

function DraggableEventChip({
  id,
  children,
  dense = false,
  className,
}: {
  id: string;
  children: React.ReactNode;
  dense?: boolean;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-0.5 max-w-full rounded border px-1 text-left leading-tight shadow-sm",
        dense ? "py-0 text-[10px]" : "py-0.5 text-[11px]",
        isDragging && "opacity-40",
        className
      )}
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-60 pointer-events-none" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function DroppableCell({
  id,
  children,
  className,
  onContextMenu,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} onContextMenu={onContextMenu} className={cn(className, isOver && "ring-2 ring-primary ring-inset")}>
      {children}
    </div>
  );
}

// ─── CalendarTab ─────────────────────────────────────────────────────────────

function CalendarTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [initialPrefs] = useState<CalendarPrefs>(() => loadCalendarPrefs());

  const [view, setView] = useState<"month" | "week" | "timeline">(() => {
    const v = initialPrefs.view;
    if (v === "month" || v === "week" || v === "timeline") return v;
    return "month";
  });
  const [tlMode, setTlMode] = useState<"month" | "week" | "day">(initialPrefs.tlMode ?? "month");
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeDepts, setActiveDepts] = useState<Set<string>>(() =>
    normalizeActiveDeptsPref(initialPrefs.activeDepts)
  );
  const [density] = useState<"comfortable" | "compact">(initialPrefs.density ?? "comfortable");
  const [scheduleScope, setScheduleScope] = useState<ScheduleScopeTab>(() =>
    normalizeScheduleScope(initialPrefs.scheduleScope)
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(
    () => new Set(initialPrefs.selectedMemberIds ?? [])
  );
  const [selectedEvent, setSelectedEvent] = useState<ScheduleRow | null>(null);
  const [showEventPanel, setShowEventPanel] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    scheduleType: "department" | "personal";
    department: BusinessDeptKey;
    startAt: string;
    endAt: string;
    allDay: boolean;
    color: string;
  }>({
    title: "",
    description: "",
    scheduleType: "department",
    department: DEFAULT_FORM_DEPT,
    startAt: "",
    endAt: "",
    allDay: false,
    color: "#3B82F6",
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const isDraggingRef = useRef(false);
  const [dragEvent, setDragEvent] = useState<ScheduleRow | null>(null);
  const [dayListYmd, setDayListYmd] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState<string>(() => formatYmd(new Date()));

  const rangeInput = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();

    if (view === "month") {
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return { startAt: start.toISOString(), endAt: end.toISOString() };
    }

    if (view === "week") {
      const sun = startOfWeekSunday(currentDate);
      const sat = addDays(sun, 6);
      sat.setHours(23, 59, 59, 999);
      return { startAt: sun.toISOString(), endAt: sat.toISOString() };
    }

    // timeline
    if (tlMode === "month") {
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return { startAt: start.toISOString(), endAt: end.toISOString() };
    }
    if (tlMode === "week") {
      const sun = startOfWeekSunday(currentDate);
      const sat = addDays(sun, 6);
      sat.setHours(23, 59, 59, 999);
      return { startAt: sun.toISOString(), endAt: sat.toISOString() };
    }
    const d0 = new Date(currentDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(currentDate);
    d1.setHours(23, 59, 59, 999);
    return { startAt: d0.toISOString(), endAt: d1.toISOString() };
  }, [view, tlMode, currentDate]);

  const { data: rawSchedules = [], refetch } = trpc.schedules.list.useQuery(rangeInput);

  const schedules = useMemo(
    () =>
      rawSchedules.map((s) => ({
        ...s,
        startAt: new Date(s.startAt as unknown as string),
        endAt: new Date(s.endAt as unknown as string),
      })) as ScheduleRow[],
    [rawSchedules]
  );

  const { data: members = [] } = trpc.users.listForSchedule.useQuery();

  const { data: tasks = [], refetch: refetchTasks } = trpc.schedules.getTasks.useQuery(
    { scheduleId: selectedEvent?.id ?? 0 },
    { enabled: !!selectedEvent?.id }
  );

  const createMutation = trpc.schedules.create.useMutation({
    onSuccess: () => {
      void refetch();
      utils.schedules.list.invalidate();
      setShowForm(false);
      resetForm();
      toast.success("スケジュールを追加しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.schedules.update.useMutation({
    onSuccess: () => {
      void refetch();
      utils.schedules.list.invalidate();
      toast.success("更新しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.schedules.delete.useMutation({
    onSuccess: () => {
      void refetch();
      utils.schedules.list.invalidate();
      setShowEventPanel(false);
      setSelectedEvent(null);
      toast.success("削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const addTaskMutation = trpc.schedules.addTask.useMutation({
    onSuccess: () => {
      void refetchTasks();
      setNewTaskTitle("");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleTaskMutation = trpc.schedules.toggleTask.useMutation({
    onSuccess: () => void refetchTasks(),
    onError: (e) => toast.error(e.message),
  });

  const deleteTaskMutation = trpc.schedules.deleteTask.useMutation({
    onSuccess: () => void refetchTasks(),
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFormData({
      title: "",
      description: "",
      scheduleType: "department",
      department: DEFAULT_FORM_DEPT,
      startAt: "",
      endAt: "",
      allDay: false,
      color: "#3B82F6",
    });
  }

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (!matchesScheduleScope(s, scheduleScope)) return false;
      const dept = (s.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG;
      const dk = DEPT_CONFIG[dept] ? dept : "all";
      if (dk !== "personal" && dk !== "all" && !activeDepts.has(dk)) return false;
      if (selectedMemberIds.size > 0 && !selectedMemberIds.has(s.userId)) return false;
      return true;
    });
  }, [schedules, scheduleScope, activeDepts, selectedMemberIds]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const eventsForDay = useCallback(
    (ymd: string) =>
      filteredSchedules.filter((s) => {
        const ds = formatYmd(s.startAt);
        const de = formatYmd(s.endAt);
        return ds <= ymd && ymd <= de;
      }).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    [filteredSchedules]
  );

  const handleDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      if (!id.startsWith("event-")) return;
      const sid = parseInt(id.replace("event-", ""), 10);
      const ev = filteredSchedules.find((x) => x.id === sid) ?? schedules.find((x) => x.id === sid);
      if (ev) setDragEvent(ev);
      isDraggingRef.current = true;
    },
    [filteredSchedules, schedules]
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragEvent(null);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 200);
      const { active, over } = e;
      if (!over) return;
      const aid = String(active.id);
      if (!aid.startsWith("event-")) return;
      const sid = parseInt(aid.replace("event-", ""), 10);
      const ev = schedules.find((x) => x.id === sid);
      if (!ev) return;
      const parsed = parseDropToAnchor(String(over.id));
      if (!parsed) return;

      const duration = ev.endAt.getTime() - ev.startAt.getTime();
      let newStart: Date;
      if (parsed.hour != null) {
        const [Y, M, D] = parsed.ymd.split("-").map(Number);
        newStart = new Date(Y, M - 1, D, parsed.hour, 0, 0, 0);
      } else {
        const [Y, M, D] = parsed.ymd.split("-").map(Number);
        newStart = new Date(Y, M - 1, D, ev.startAt.getHours(), ev.startAt.getMinutes(), 0, 0);
      }
      const newEnd = new Date(newStart.getTime() + duration);

      updateMutation.mutate({
        id: sid,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
      });
    },
    [schedules, updateMutation]
  );

  const openCreateForDay = (ymd: string) => {
    const [Y, M, D] = ymd.split("-").map(Number);
    const s = new Date(Y, M - 1, D, 9, 0, 0, 0);
    const en = new Date(Y, M - 1, D, 10, 0, 0, 0);
    setFormData((prev) => ({
      ...prev,
      startAt: toDatetimeLocal(s),
      endAt: toDatetimeLocal(en),
    }));
    setShowForm(true);
  };

  const openDuplicateFromEvent = (ev: ScheduleRow) => {
    const dupDeptRaw = ev.scheduleDepartment ?? "all";
    const dupDepartment: BusinessDeptKey =
      ev.scheduleType === "personal"
        ? DEFAULT_FORM_DEPT
        : isBusinessDeptKey(dupDeptRaw)
          ? (dupDeptRaw as BusinessDeptKey)
          : DEFAULT_FORM_DEPT;
    setFormData({
      title: `${ev.title}（複製）`,
      description: ev.description ?? "",
      scheduleType: (ev.scheduleType === "personal" ? "personal" : "department") as "department" | "personal",
      department: dupDepartment,
      startAt: toDatetimeLocal(ev.startAt),
      endAt: toDatetimeLocal(ev.endAt),
      allDay: ev.allDay,
      color: ev.color ?? "#3B82F6",
    });
    setShowForm(true);
  };

  const addTasksFromInput = async () => {
    if (!selectedEvent) return;
    const lines = newTaskTitle
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return;
    try {
      await Promise.all(lines.map((title) => addTaskMutation.mutateAsync({ scheduleId: selectedEvent.id, title })));
      setNewTaskTitle("");
      void refetchTasks();
      toast.success(`${lines.length}件のタスクを追加しました`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "タスクの追加に失敗しました");
    }
  };

  const navPrev = () => {
    if (view === "month") {
      setCurrentDate((d) => addMonths(d, -1));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, -7));
    } else if (view === "timeline") {
      if (tlMode === "month") setCurrentDate((d) => addMonths(d, -1));
      else if (tlMode === "week") setCurrentDate((d) => addDays(d, -7));
      else setCurrentDate((d) => addDays(d, -1));
    }
  };

  const navNext = () => {
    if (view === "month") {
      setCurrentDate((d) => addMonths(d, 1));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, 7));
    } else if (view === "timeline") {
      if (tlMode === "month") setCurrentDate((d) => addMonths(d, 1));
      else if (tlMode === "week") setCurrentDate((d) => addDays(d, 7));
      else setCurrentDate((d) => addDays(d, 1));
    }
  };

  const y = currentDate.getFullYear();
  const mo = currentDate.getMonth();
  const monthGrid = useMemo(() => getMonthGridDates(y, mo), [y, mo]);
  const weekDays = useMemo(() => {
    const sun = startOfWeekSunday(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
  }, [currentDate]);

  const toggleDeptFilter = (key: string) => {
    setActiveDepts((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const toggleCollapsed = (key: string) => {
    setCollapsedDepts((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const periodLabel =
    view === "month"
      ? `${y}年${mo + 1}月`
      : view === "week"
        ? `${format(weekDays[0], "yyyy年M月d日")} - ${format(weekDays[6], "M月d日")}`
        : tlMode === "month"
          ? `${y}年${mo + 1}月`
          : tlMode === "week"
            ? `${format(weekDays[0], "yyyy年M月d日")} - ${format(weekDays[6], "M月d日")}`
            : `${format(currentDate, "yyyy年M月d日")}`;

  const dayListEvents = useMemo(() => {
    if (!dayListYmd) return [];
    return eventsForDay(dayListYmd);
  }, [dayListYmd, eventsForDay]);

  const todayYmd = formatYmd(new Date());
  const selectedDaySchedules = useMemo(
    () => eventsForDay(selectedYmd).slice(0, 10),
    [eventsForDay, selectedYmd]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs: CalendarPrefs = {
      view,
      tlMode,
      density,
      scheduleScope,
      activeDepts: [...activeDepts].filter(isBusinessDeptKey),
      selectedMemberIds: [...selectedMemberIds],
    };
    window.localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify(prefs));
  }, [view, tlMode, density, scheduleScope, activeDepts, selectedMemberIds]);

  const deptWeekFill = view === "week" && scheduleScope === "department";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 p-3 pb-10 bg-slate-100/70",
        deptWeekFill ? "min-h-0 flex-1" : "min-h-min"
      )}
    >
      <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="min-w-[160px]">
            <h2 className="text-sm font-semibold tracking-wide text-slate-800">スケジュール</h2>
          </div>

          <div className="text-center">
            <p className="text-base font-semibold tracking-wide text-slate-800">{periodLabel}</p>
          </div>

          <div className="flex items-center justify-start lg:justify-end">
            <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-xs" onClick={() => setShowForm(true)}>
              ＋ 新規予定
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <Button
                type="button"
                variant={scheduleScope === "personal" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                onClick={() => setScheduleScope("personal")}
              >
                個人
              </Button>
              <Button
                type="button"
                variant={scheduleScope === "department" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                onClick={() => setScheduleScope("department")}
              >
                部署
              </Button>
              <Button
                type="button"
                variant={scheduleScope === "overall" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                onClick={() => setScheduleScope("overall")}
              >
                全体共有
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={navPrev}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <Button
                  type="button"
                  variant={view === "timeline" && tlMode === "day" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                  onClick={() => {
                    setView("timeline");
                    setTlMode("day");
                  }}
                >
                  日
                </Button>
                <Button
                  type="button"
                  variant={view === "week" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                  onClick={() => setView("week")}
                >
                  週
                </Button>
                <Button
                  type="button"
                  variant={view === "month" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-2.5 text-xs sm:px-3"
                  onClick={() => setView("month")}
                >
                  月
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={navNext}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:hidden shrink-0">
        <button
          type="button"
          onClick={() => {
            setShowLeftPanel((v) => !v);
            setShowRightPanel(false);
          }}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm"
        >
          フィルター
        </button>
        <button
          type="button"
          onClick={() => {
            setShowRightPanel((v) => !v);
            setShowLeftPanel(false);
          }}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm"
        >
          本日の予定
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground shrink-0">
        <Badge variant="outline">表示予定: {filteredSchedules.length}件</Badge>
        <Badge variant="outline">部署: {activeDepts.size}/{BUSINESS_DEPT_KEYS.length}</Badge>
        <Badge variant="outline">
          メンバー: {selectedMemberIds.size === 0 ? "全員" : `${selectedMemberIds.size}名選択`}
        </Badge>
      </div>

      <div className={cn("flex min-h-0 flex-col", deptWeekFill && "flex-1 min-h-0")}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            className={cn(
              "grid min-h-0 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_228px] items-stretch gap-1.5",
              deptWeekFill && "flex-1 min-h-0"
            )}
          >
          <>
            {showLeftPanel && (
              <div
                className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                onClick={() => setShowLeftPanel(false)}
              />
            )}
            <Card
              className={cn(
                "h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-slate-200 bg-white shadow-sm",
                "hidden lg:flex",
                showLeftPanel &&
                  "fixed left-0 top-0 z-50 flex h-full w-[280px] rounded-none lg:static lg:z-auto lg:h-full lg:w-full lg:rounded-lg"
              )}
            >
            <CardHeader className="shrink-0 py-1.5 px-2 border-b">
              <CardTitle className="text-sm flex items-center gap-1">
                <Users className="h-4 w-4" />
                フィルター
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden py-1.5 px-2">
              <div className="shrink-0">
                <MiniMonthPicker
                  currentDate={currentDate}
                  onPickDate={(d) => {
                    setCurrentDate(d);
                    setSelectedYmd(formatYmd(d));
                  }}
                  onPrevMonth={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()))}
                  onNextMonth={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()))}
                />
              </div>

              <div className="shrink-0 space-y-1.5">
                <p className="rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  表示部署
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {BUSINESS_DEPT_KEYS.map((k) => {
                    const deptOn = activeDepts.has(k);
                    const deptHex = DEPT_CONFIG[k].color;
                    const DeptFilterIcon = DEPT_FILTER_ICON_COMPONENTS[k];
                    return (
                      <button
                        key={`side-${k}`}
                        type="button"
                        aria-pressed={deptOn}
                        onClick={() => toggleDeptFilter(k)}
                        className={cn(
                          "flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium text-slate-700 transition-[filter,box-shadow]",
                          deptOn ? "font-semibold shadow-md" : "shadow-sm hover:brightness-[0.97]"
                        )}
                        style={{
                          backgroundColor: deptOn ? `${deptHex}48` : `${deptHex}22`,
                          border: deptOn
                            ? `2px solid ${deptHex}`
                            : `1px solid rgba(203, 213, 225, 0.55)`,
                          boxShadow: deptOn ? "0 1px 4px rgba(15, 23, 42, 0.07)" : undefined,
                        }}
                      >
                        <DeptFilterIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                        <span className="min-w-0 truncate">{DEPT_CONFIG[k].label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <p className="shrink-0 rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  メンバー
                </p>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                  {members.map((m) => {
                    const memberOn = selectedMemberIds.has(m.id);
                    const firstBizDept = parseUserBusinessDeptKeys(m.department ?? null)[0] as
                      | keyof typeof DEPT_CONFIG
                      | undefined;
                    const deptHex =
                      (firstBizDept && DEPT_CONFIG[firstBizDept]
                        ? DEPT_CONFIG[firstBizDept].color
                        : undefined) ?? DEPT_CONFIG.all.color;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={memberOn}
                        onClick={() =>
                          setSelectedMemberIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(m.id)) n.delete(m.id);
                            else n.add(m.id);
                            return n;
                          })
                        }
                        className={cn(
                          "flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[10px] font-medium text-slate-700 transition-[filter,box-shadow]",
                          memberOn ? "font-semibold shadow-md" : "shadow-sm hover:brightness-[0.97]"
                        )}
                        style={{
                          backgroundColor: memberOn ? `${deptHex}48` : `${deptHex}22`,
                          border: memberOn
                            ? `1px solid ${deptHex}9E`
                            : `1px solid ${deptHex}52`,
                          boxShadow: memberOn ? "0 1px 4px rgba(15, 23, 42, 0.07)" : undefined,
                        }}
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]"
                          aria-hidden
                        >
                          <UserCircle className="h-3 w-3 text-slate-500" aria-hidden />
                        </span>
                        <span className="min-w-0 truncate">{m.displayName ?? m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
          </>

          <div
            className={cn(
              "flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200/80 bg-white shadow-sm",
              deptWeekFill ? "overflow-x-hidden" : "overflow-x-auto"
            )}
          >
            {view === "month" && (
              <MonthGridView
                month={mo}
                cells={monthGrid}
                density={density}
                scheduleScope={scheduleScope}
                eventsForDay={eventsForDay}
                onCellClick={openCreateForDay}
                onDaySelect={(ymd) => setSelectedYmd(ymd)}
                selectedYmd={selectedYmd}
                onMoreClick={(ymd) => setDayListYmd(ymd)}
                onEventClick={(ev, e) => {
                  if (isDraggingRef.current) return;
                  setSelectedEvent(ev);
                  setPopoverAnchor({ x: e.clientX, y: e.clientY });
                  setShowEventPanel(true);
                }}
              />
            )}
            {view === "week" &&
              (scheduleScope === "personal" && user ? (
                <PersonalWeekCompareView
                  weekDays={weekDays}
                  user={{ id: user.id, department: user.department }}
                  viewerRole={user.role ?? "user"}
                  schedules={schedules}
                  filteredSchedules={filteredSchedules}
                  density={density}
                  activeDepts={activeDepts}
                  selectedMemberIds={selectedMemberIds}
                  onCellClick={openCreateForDay}
                  onEventClick={(ev, e) => {
                    if (isDraggingRef.current) return;
                    setSelectedEvent(ev);
                    setPopoverAnchor({ x: e.clientX, y: e.clientY });
                    setShowEventPanel(true);
                  }}
                />
              ) : scheduleScope === "department" ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
                  <DepartmentWeekGridView
                    weekDays={weekDays}
                    activeDepts={activeDepts}
                    filteredSchedules={filteredSchedules}
                    density={density}
                    onCellClick={openCreateForDay}
                    onEventClick={(ev, e) => {
                      if (isDraggingRef.current) return;
                      setSelectedEvent(ev);
                      setPopoverAnchor({ x: e.clientX, y: e.clientY });
                      setShowEventPanel(true);
                    }}
                  />
                </div>
              ) : (
                <WeekMemberMatrixView
                  weekDays={weekDays}
                  members={members.filter((m) => selectedMemberIds.size === 0 || selectedMemberIds.has(m.id))}
                  filteredSchedules={filteredSchedules}
                  density={density}
                  onCellClick={openCreateForDay}
                  onEventClick={(ev, e) => {
                    if (isDraggingRef.current) return;
                    setSelectedEvent(ev);
                    setPopoverAnchor({ x: e.clientX, y: e.clientY });
                    setShowEventPanel(true);
                  }}
                />
              ))}
            {view === "timeline" && (
              scheduleScope === "personal" && tlMode === "day" && user ? (
                <PersonalDayView
                  schedules={filteredSchedules}
                  currentDate={currentDate}
                  user={{ id: user.id, department: user.department }}
                  onEventClick={(ev, e) => {
                    if (isDraggingRef.current) return;
                    setSelectedEvent(ev as ScheduleRow);
                    setPopoverAnchor({ x: e.clientX, y: e.clientY });
                    setShowEventPanel(true);
                  }}
                />
              ) : scheduleScope === "overall" && tlMode === "day" ? (
                <OverallDayMatrixView
                  schedules={filteredSchedules}
                  currentDate={currentDate}
                  members={
                    members as unknown as import("@/components/schedule/OverallDayMatrixView").OverallDayMatrixMember[]
                  }
                  activeDepts={activeDepts}
                  onEventClick={(ev, e) => {
                    if (isDraggingRef.current) return;
                    setSelectedEvent(ev as ScheduleRow);
                    setPopoverAnchor({ x: e.clientX, y: e.clientY });
                    setShowEventPanel(true);
                  }}
                />
              ) : (
                <TimelineView
                  tlMode={tlMode}
                  currentDate={currentDate}
                  year={y}
                  month={mo}
                  weekDays={weekDays}
                  collapsedDepts={collapsedDepts}
                  toggleCollapsed={toggleCollapsed}
                  activeDepts={activeDepts}
                  filteredSchedules={filteredSchedules}
                  eventsForDay={eventsForDay}
                  onCellClick={openCreateForDay}
                  onEventClick={(ev, e) => {
                    if (isDraggingRef.current) return;
                    setSelectedEvent(ev);
                    setPopoverAnchor({ x: e.clientX, y: e.clientY });
                    setShowEventPanel(true);
                  }}
                />
              )
            )}
          </div>

          <>
            {showRightPanel && (
              <div
                className="fixed inset-0 z-40 bg-black/40 lg:hidden"
                onClick={() => setShowRightPanel(false)}
              />
            )}
            <Card
              className={cn(
                "h-full min-h-0 min-w-0 flex-col overflow-hidden border-slate-200 bg-white shadow-sm",
                "hidden lg:flex",
                showRightPanel &&
                  "fixed right-0 top-0 z-50 flex h-full w-[280px] rounded-none lg:static lg:z-auto lg:h-full lg:w-auto lg:rounded-lg"
              )}
            >
            <CardHeader className="shrink-0 py-2 px-3 border-b">
              <CardTitle className="text-sm">本日の予定</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2 px-3 [scrollbar-width:thin]">
              <p className="text-[11px] text-muted-foreground">{selectedYmd}</p>
              {selectedDaySchedules.length === 0 ? (
                <p className="text-xs text-muted-foreground">予定はありません</p>
              ) : (
                selectedDaySchedules.map((ev) => (
                  <button
                    key={`day-${ev.id}`}
                    type="button"
                    className="w-full text-left rounded-md border border-slate-200 p-2 hover:bg-slate-50"
                    onClick={(e) => {
                      setSelectedEvent(ev);
                      setPopoverAnchor({ x: e.clientX, y: e.clientY });
                      setShowEventPanel(true);
                    }}
                  >
                    <p className="text-[11px] text-muted-foreground">{formatEventTimeLabel(ev)}</p>
                    <p className="text-xs font-semibold truncate">{ev.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{ev.user.displayName ?? ev.user.name}</p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
          </>
        </div>

        <DragOverlay>
          {dragEvent ? (
            <div
              className={cn(
                "rounded border px-2 py-1 text-xs shadow-lg max-w-[200px]",
                DEPT_CONFIG[(dragEvent.scheduleDepartment as keyof typeof DEPT_CONFIG) ?? "all"]?.bg ?? "bg-slate-400",
                "text-white"
              )}
            >
              {dragEvent.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      </div>

      {showEventPanel && selectedEvent && popoverAnchor && user && (
        <EventPopover
          anchor={popoverAnchor}
          event={selectedEvent}
          tasks={tasks}
          newTaskTitle={newTaskTitle}
          setNewTaskTitle={setNewTaskTitle}
          taskProgress={tasks.length ? tasks.filter((t) => t.completed).length / tasks.length : 0}
          onClose={() => {
            setShowEventPanel(false);
            setSelectedEvent(null);
          }}
          onDelete={() => deleteMutation.mutate({ id: selectedEvent.id })}
          onDuplicate={() => openDuplicateFromEvent(selectedEvent)}
          canDelete={canDeleteSchedule(user.id, user.role ?? "user", selectedEvent.userId, selectedEvent.user.role)}
          addTask={addTasksFromInput}
          toggleTask={(taskId, completed) => toggleTaskMutation.mutate({ taskId, isCompleted: completed })}
          deleteTask={(taskId) => deleteTaskMutation.mutate({ taskId })}
          taskAdding={addTaskMutation.isPending}
        />
      )}

      {dayListYmd && (
        <>
          <button type="button" className="fixed inset-0 z-[74] bg-black/25" aria-label="閉じる" onClick={() => setDayListYmd(null)} />
          <Card className="fixed z-[75] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,540px)] max-h-[80vh] overflow-auto shadow-xl">
            <CardHeader className="py-3">
              <CardTitle className="text-base">{dayListYmd} の予定一覧</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dayListEvents.length === 0 && <p className="text-sm text-muted-foreground">予定はありません</p>}
              {dayListEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="w-full text-left border rounded-md p-2 hover:bg-muted/40"
                  onClick={() => {
                    setDayListYmd(null);
                    setSelectedEvent(ev);
                    setPopoverAnchor({
                      x: Math.max(24, Math.floor(window.innerWidth / 2) - 100),
                      y: Math.max(24, Math.floor(window.innerHeight / 2) - 120),
                    });
                    setShowEventPanel(true);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{formatEventTimeLabel(ev)}</Badge>
                    <Badge variant="outline">{DEPT_CONFIG[(ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG]?.label ?? "全部署"}</Badge>
                    <span className="font-medium truncate">{ev.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    担当: {ev.user.displayName ?? ev.user.name}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {showForm && (
        <CreateFormModal
          formData={formData}
          setFormData={setFormData}
          onClose={() => {
            setShowForm(false);
            resetForm();
          }}
          onSubmit={() => {
            if (!formData.title.trim() || !formData.startAt || !formData.endAt) {
              toast.error("タイトル・開始・終了は必須です");
              return;
            }
            const start = new Date(formData.startAt);
            const end = new Date(formData.endAt);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
              toast.error("開始・終了日時が不正です");
              return;
            }
            if (start >= end) {
              toast.error("終了日時は開始日時より後にしてください");
              return;
            }
            const dept =
              formData.scheduleType === "personal"
                ? "personal"
                : isBusinessDeptKey(formData.department)
                  ? formData.department
                  : DEFAULT_FORM_DEPT;
            createMutation.mutate({
              title: formData.title.trim(),
              description: formData.description || null,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              allDay: formData.allDay,
              color: formData.color || null,
              scheduleType: formData.scheduleType === "personal" ? "personal" : "department",
              scheduleDepartment: dept,
            });
          }}
        />
      )}
    </div>
  );
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MiniMonthPicker({
  currentDate,
  onPickDate,
  onPrevMonth,
  onNextMonth,
}: {
  currentDate: Date;
  onPickDate: (d: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = formatYmd(new Date());
  const cells = getMonthGridDates(year, month);
  const selected = formatYmd(currentDate);
  return (
    <div className="border rounded-md p-2">
      <div className="flex items-center justify-between mb-1">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onPrevMonth}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <div className="text-xs font-semibold">{year}年 {month + 1}月</div>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onNextMonth}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-center mb-0.5 text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={`mini-w-${w}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const ymd = formatYmd(d);
          const inMonth = d.getMonth() === month;
          const isToday = ymd === today;
          const isSelected = ymd === selected;
          return (
            <button
              key={`mini-${ymd}`}
              type="button"
              className={cn(
                "h-6 rounded text-[10px]",
                !inMonth && "opacity-35",
                isHolidayOrSunday(d) && "text-pink-600",
                isSaturday(d) && "text-sky-600",
                isToday && "ring-1 ring-primary",
                isSelected && "bg-primary text-primary-foreground"
              )}
              onClick={() => onPickDate(new Date(d))}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function monthEventColorKey(ev: ScheduleRow): string | null | undefined {
  const st = (ev.scheduleType ?? "").toLowerCase();
  const sd = ev.scheduleDepartment ?? "all";
  if (st === "personal" || sd === "personal") {
    const keys = parseUserBusinessDeptKeys(ev.user?.department ?? null);
    return keys[0] ?? "personal";
  }
  return ev.scheduleDepartment;
}

function departmentMonthChipIcon(sd: string | null | undefined) {
  const raw = sd ?? "all";
  const key =
    raw === "all" || !isBusinessDeptKey(raw)
      ? DEFAULT_FORM_DEPT
      : (raw as keyof typeof DEPT_FILTER_ICON_COMPONENTS);
  return DEPT_FILTER_ICON_COMPONENTS[key];
}

function MonthGridView({
  month,
  cells,
  density,
  scheduleScope,
  eventsForDay,
  onCellClick,
  onDaySelect,
  selectedYmd,
  onMoreClick,
  onEventClick,
}: {
  month: number;
  cells: Date[];
  density: "comfortable" | "compact";
  scheduleScope: ScheduleScopeTab;
  eventsForDay: (ymd: string) => ScheduleRow[];
  onCellClick: (ymd: string) => void;
  onDaySelect: (ymd: string) => void;
  selectedYmd: string;
  onMoreClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());

  const cellMinHeight = density === "compact" ? "min-h-[100px]" : "min-h-[118px]";
  const cellInnerMinHeight = density === "compact" ? "min-h-[88px]" : "min-h-[106px]";
  const visibleEventCount = density === "compact" ? 3 : 2;

  return (
    <div className="grid w-full min-w-0 max-w-full grid-cols-7 overflow-x-hidden border-t border-l border-slate-200/70">
      {WEEKDAY_LABELS.map((w) => (
        <div key={w} className="bg-slate-50 py-1.5 text-center text-xs font-medium border-r border-b border-slate-200/70">
          {w}
        </div>
      ))}
      {cells.map((d) => {
        const ymd = formatYmd(d);
        const inMonth = d.getMonth() === month;
        const list = eventsForDay(ymd);
        const hol = isHolidayOrSunday(d);
        const holidayName = getHolidayName(d);
        const sat = isSaturday(d);
        const isToday = ymd === todayYmd;

        return (
          <DroppableCell
            key={ymd}
            id={`day-${ymd}`}
            className={cn(
              cellMinHeight + " p-1.5 border-r border-b border-slate-200/70 bg-background text-left align-top",
              !inMonth && "opacity-40",
              hol && "bg-pink-50/70",
              !hol && sat && "bg-sky-50/70",
              selectedYmd === ymd && "bg-primary/5"
            )}
          >
            <div
              role="presentation"
              className={cn("w-full h-full text-left flex flex-col cursor-pointer", cellInnerMinHeight)}
              onClick={() => onDaySelect(ymd)}
              onContextMenu={(e) => {
                e.preventDefault();
                onCellClick(ymd);
              }}
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground"
                  )}
                >
                  {d.getDate()}
                </span>
                {holidayName && <span className="text-[9px] text-pink-700 truncate max-w-[56px]">{holidayName}</span>}
              </div>
              <div className="flex-1 flex flex-col gap-1 mt-1 min-h-0 overflow-hidden">
                {list.slice(0, visibleEventCount).map((ev) => {
                  const colorKey =
                    scheduleScope === "department"
                      ? (ev.scheduleDepartment ?? "all")
                      : monthEventColorKey(ev);
                  if (scheduleScope === "department") {
                    const DeptIcon = departmentMonthChipIcon(ev.scheduleDepartment);
                    return (
                      <DraggableEventChip
                        key={ev.id}
                        id={`event-${ev.id}`}
                        dense={false}
                        className={cn(
                          getDeptChipClass(colorKey),
                          getDeptAccentClass(colorKey),
                          "border-l-4 max-w-full min-w-0 min-h-[22px] overflow-hidden px-1 py-0.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-md"
                        )}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(ev, e);
                          }}
                          className="flex min-w-0 max-w-full items-center gap-0.5 overflow-hidden"
                        >
                          <DeptIcon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] leading-tight">
                            <span className="tabular-nums opacity-90">{ev.allDay ? "終日" : formatHm(ev.startAt)}</span>
                            <span className="mx-0.5 font-semibold opacity-90">·</span>
                            <span className="font-semibold">{ev.title}</span>
                          </span>
                        </span>
                      </DraggableEventChip>
                    );
                  }
                  return (
                    <DraggableEventChip
                      key={ev.id}
                      id={`event-${ev.id}`}
                      dense={false}
                      className={cn(
                        getDeptChipClass(colorKey),
                        getDeptAccentClass(colorKey),
                        "border-l-4 min-h-[26px] px-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-md"
                      )}
                    >
                      <span onClick={(e) => { e.stopPropagation(); onEventClick(ev, e); }} className="truncate">
                        <span className="text-[10px] opacity-80 mr-1">{formatEventTimeLabel(ev)}</span>
                        <span className="text-[11px] font-semibold">{ev.title}</span>
                      </span>
                    </DraggableEventChip>
                  );
                })}
                {list.length > visibleEventCount && (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground text-left hover:underline px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoreClick(ymd);
                    }}
                  >
                    他 {list.length - visibleEventCount} 件
                  </button>
                )}
              </div>
            </div>
          </DroppableCell>
        );
      })}
    </div>
  );
}

function PersonalWeekCompareView({
  weekDays,
  user,
  viewerRole,
  schedules,
  filteredSchedules,
  density,
  activeDepts,
  selectedMemberIds,
  onCellClick,
  onEventClick,
}: {
  weekDays: Date[];
  user: { id: number; department: string | null };
  viewerRole: string;
  schedules: ScheduleRow[];
  filteredSchedules: ScheduleRow[];
  density: "comfortable" | "compact";
  activeDepts: Set<string>;
  selectedMemberIds: Set<number>;
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());
  const cellMinHeight = density === "compact" ? "min-h-[86px]" : "min-h-[112px]";
  const visibleCount = density === "compact" ? 3 : 2;

  const userDeptKeys = useMemo(() => parseUserBusinessDeptKeys(user.department), [user.department]);
  const userDeptSet = useMemo(() => new Set(userDeptKeys), [userDeptKeys]);
  const managerBroadDeptColumn = viewerRole === "manager" && userDeptKeys.length === 0;

  return (
    <div className="min-w-[min(100%,720px)]">
      <div
        className="grid border-b bg-slate-100 sticky top-0 z-20"
        style={{ gridTemplateColumns: "88px minmax(0, 1fr) minmax(0, 1fr)" }}
      >
        <div className="p-2 border-r bg-slate-100" aria-hidden />
        <div className="p-2 text-xs font-semibold border-r bg-slate-100 text-center">部署スケジュール</div>
        <div className="p-2 text-xs font-semibold bg-slate-100 text-center">個人スケジュール</div>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        {weekDays.map((d) => {
          const ymd = formatYmd(d);
          const hol = isHolidayOrSunday(d);
          const sat = isSaturday(d);
          const isToday = ymd === todayYmd;

          const deptList = schedules
            .filter((ev) => {
              const ds = formatYmd(ev.startAt);
              const de = formatYmd(ev.endAt);
              if (ds > ymd || de < ymd) return false;
              const st = (ev.scheduleType ?? "").toLowerCase();
              const sdRaw = ev.scheduleDepartment ?? "all";
              if (st === "personal" || sdRaw === "personal") return false;
              const dept = sdRaw as keyof typeof DEPT_CONFIG;
              const dk = DEPT_CONFIG[dept] ? dept : "all";
              if (dk !== "personal" && dk !== "all" && !activeDepts.has(dk as string)) return false;
              if (selectedMemberIds.size > 0 && !selectedMemberIds.has(ev.userId)) return false;
              if (userDeptKeys.length === 0) {
                if (!managerBroadDeptColumn) return false;
                if (sdRaw === "all") return false;
                return isBusinessDeptKey(sdRaw);
              }
              if (sdRaw === "all") return true;
              return userDeptSet.has(sdRaw);
            })
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

          const personalList = filteredSchedules
            .filter((ev) => {
              const ds = formatYmd(ev.startAt);
              const de = formatYmd(ev.endAt);
              return ds <= ymd && ymd <= de;
            })
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

          return (
            <div
              key={ymd}
              className="grid border-b"
              style={{ gridTemplateColumns: "88px minmax(0, 1fr) minmax(0, 1fr)" }}
            >
              <div
                className={cn(
                  "p-2 border-r flex flex-col justify-center gap-0.5 text-xs font-medium",
                  hol && "bg-pink-50",
                  !hol && sat && "bg-sky-50",
                  isToday && "bg-primary/10"
                )}
              >
                <span className={cn("tabular-nums", isToday && "text-primary font-semibold")}>
                  {d.getMonth() + 1}/{d.getDate()}
                </span>
                <span className="text-[11px] text-muted-foreground leading-none">
                  ({WEEKDAY_LABELS[d.getDay()]})
                </span>
              </div>

              <DroppableCell
                id={`week-pwc-dept-${ymd}`}
                className={cn(
                  "p-1 border-r flex flex-col gap-1 relative",
                  cellMinHeight,
                  hol && "bg-pink-50",
                  !hol && sat && "bg-sky-50",
                  "hover:bg-muted/20 transition-colors"
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCellClick(ymd);
                }}
              >
                {deptList.length === 0 && (
                  <button
                    type="button"
                    className="absolute right-1 top-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => onCellClick(ymd)}
                    aria-label="予定を追加"
                  >
                    +
                  </button>
                )}
                {deptList.slice(0, visibleCount).map((ev) => (
                  <DraggableEventChip
                    key={ev.id}
                    id={`event-${ev.id}`}
                    dense={density === "compact"}
                    className={cn(
                      getDeptChipClass(ev.scheduleDepartment),
                      getDeptAccentClass(ev.scheduleDepartment),
                      "border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    )}
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev, e);
                      }}
                      className="block"
                    >
                      <span className="block text-[10px] opacity-90 leading-tight">{formatEventTimeLabel(ev)}</span>
                      <span className="block truncate text-[11px] leading-tight">{ev.title}</span>
                    </span>
                  </DraggableEventChip>
                ))}
                {deptList.length > visibleCount && (
                  <span className="text-[10px] text-muted-foreground px-1">+{deptList.length - visibleCount}件</span>
                )}
              </DroppableCell>

              <DroppableCell
                id={`week-pwc-prs-${ymd}`}
                className={cn(
                  "p-1 flex flex-col gap-1 relative",
                  cellMinHeight,
                  hol && "bg-pink-50",
                  !hol && sat && "bg-sky-50",
                  "hover:bg-muted/20 transition-colors"
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCellClick(ymd);
                }}
              >
                {personalList.length === 0 && (
                  <button
                    type="button"
                    className="absolute right-1 top-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => onCellClick(ymd)}
                    aria-label="予定を追加"
                  >
                    +
                  </button>
                )}
                {personalList.slice(0, visibleCount).map((ev) => (
                  <DraggableEventChip
                    key={ev.id}
                    id={`event-${ev.id}`}
                    dense={density === "compact"}
                    className={cn(
                      "border border-slate-200 bg-white text-slate-800 border-l-[3px] border-l-slate-300",
                      "shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    )}
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev, e);
                      }}
                      className="flex min-w-0 w-full items-start gap-1"
                    >
                      <UserCircle className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                      <span className="min-w-0 flex-1 flex flex-col gap-0">
                        <span className="text-[10px] leading-tight text-slate-600">{formatEventTimeLabel(ev)}</span>
                        <span className="truncate text-[11px] leading-tight text-slate-800">{ev.title}</span>
                        <span className="truncate text-[9px] leading-tight text-slate-500">
                          {ev.user.displayName ?? ev.user.name}
                        </span>
                      </span>
                    </span>
                  </DraggableEventChip>
                ))}
                {personalList.length > visibleCount && (
                  <span className="text-[10px] text-muted-foreground px-1">
                    +{personalList.length - visibleCount}件
                  </span>
                )}
              </DroppableCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentWeekGridView({
  weekDays,
  activeDepts,
  filteredSchedules,
  density,
  onCellClick,
  onEventClick,
}: {
  weekDays: Date[];
  activeDepts: Set<string>;
  filteredSchedules: ScheduleRow[];
  density: "comfortable" | "compact";
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());
  const visibleCount = density === "compact" ? 3 : 2;
  const visibleDepts = BUSINESS_DEPT_KEYS.filter((k) => activeDepts.has(k));
  const n = visibleDepts.length;
  const dateColPx = 88;
  const gridTemplateColumns = `${dateColPx}px repeat(${n}, minmax(0, 1fr))`;

  const deptColBorder = (i: number) => (i > 0 ? "border-l border-slate-200" : "");

  const eventsForDeptDay = (dept: string, ymd: string) =>
    filteredSchedules
      .filter((s) => {
        const sd = s.scheduleDepartment ?? "all";
        if (formatYmd(s.startAt) > ymd || formatYmd(s.endAt) < ymd) return false;
        if (sd === dept) return true;
        if (sd === "all" && dept === DEFAULT_FORM_DEPT) return true;
        return false;
      })
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  if (visibleDepts.length === 0) {
    return <div className="min-h-[160px] rounded-md border border-slate-200 bg-white" />;
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="z-30 shrink-0 border-b border-slate-200 bg-white">
          <div className="grid w-full bg-muted/30" style={{ gridTemplateColumns }}>
            <div
              className="box-border h-11 shrink-0 border-r border-slate-200 bg-muted/30"
              style={{ width: dateColPx, minWidth: dateColPx, maxWidth: dateColPx }}
              aria-hidden
            />
            {visibleDepts.map((dept, i) => {
              const DeptFilterIcon = DEPT_FILTER_ICON_COMPONENTS[dept as keyof typeof DEPT_FILTER_ICON_COMPONENTS];
              return (
                <div
                  key={`dwk-hdr-${dept}`}
                  className={cn(
                    "flex h-11 min-w-0 items-center justify-center gap-1 overflow-hidden px-1 text-center text-xs font-semibold text-slate-800",
                    deptColBorder(i)
                  )}
                >
                  <DeptFilterIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="min-w-0 truncate">{DEPT_CONFIG[dept].label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div
          className="grid min-h-0 flex-1 overflow-hidden"
          style={{ gridTemplateRows: `repeat(${weekDays.length}, minmax(0, 1fr))` }}
        >
          {weekDays.map((d) => {
            const ymd = formatYmd(d);
            const hol = isHolidayOrSunday(d);
            const sat = isSaturday(d);
            const isToday = ymd === todayYmd;
            return (
              <div key={ymd} className="grid h-full min-h-0 min-w-0 border-b border-slate-200" style={{ gridTemplateColumns }}>
              <div
                className={cn(
                  "box-border flex min-h-0 flex-col justify-center gap-0.5 border-r border-slate-200 p-2 text-xs font-medium",
                  hol && "bg-pink-50",
                  !hol && sat && "bg-sky-50",
                  isToday && "bg-primary/10"
                )}
                style={{ width: dateColPx, minWidth: dateColPx, maxWidth: dateColPx }}
              >
                <span className={cn("tabular-nums", isToday && "font-semibold text-primary")}>
                  {d.getMonth() + 1}/{d.getDate()}
                </span>
                <span className="text-[11px] leading-none text-muted-foreground">
                  ({WEEKDAY_LABELS[d.getDay()]})
                </span>
              </div>
              {visibleDepts.map((dept, i) => {
                const list = eventsForDeptDay(dept, ymd);
                const dk = dept as BusinessDeptKey;
                return (
                  <DroppableCell
                    key={`dwk-${ymd}-${dept}`}
                    id={`week-${ymd}-${DEPT_WEEK_DROP_ID_NUM[dk]}`}
                    className={cn(
                      "group relative flex min-h-0 min-w-0 flex-col gap-1 overflow-x-hidden overflow-y-auto p-1 [scrollbar-width:thin]",
                      hol && "bg-pink-50",
                      !hol && sat && "bg-sky-50",
                      "hover:bg-muted/20 transition-colors",
                      deptColBorder(i)
                    )}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onCellClick(ymd);
                    }}
                  >
                    {list.length === 0 && (
                      <button
                        type="button"
                        className="absolute right-1 top-1 text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onCellClick(ymd)}
                        aria-label="予定を追加"
                      >
                        +
                      </button>
                    )}
                    {list.slice(0, visibleCount).map((ev) => (
                      <DraggableEventChip
                        key={ev.id}
                        id={`event-${ev.id}`}
                        dense={density === "compact"}
                        className={cn(
                          getDeptChipClass(ev.scheduleDepartment),
                          getDeptAccentClass(ev.scheduleDepartment),
                          "max-w-full min-w-0 overflow-hidden border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                        )}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(ev, e);
                          }}
                          className="block min-w-0 max-w-full overflow-hidden"
                        >
                          <span className="block truncate whitespace-nowrap text-[10px] leading-tight opacity-90">
                            {formatEventTimeLabel(ev)}
                          </span>
                          <span className="block truncate text-[11px] leading-tight">{ev.title}</span>
                        </span>
                      </DraggableEventChip>
                    ))}
                    {list.length > visibleCount && (
                      <span className="text-[10px] text-muted-foreground px-1">+{list.length - visibleCount}件</span>
                    )}
                  </DroppableCell>
                );
              })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekMemberMatrixView({
  weekDays,
  members,
  filteredSchedules,
  density,
  onCellClick,
  onEventClick,
}: {
  weekDays: Date[];
  members: {
    id: number;
    name: string;
    displayName: string | null;
  }[];
  filteredSchedules: ScheduleRow[];
  density: "comfortable" | "compact";
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());
  const cellMinHeight = density === "compact" ? "min-h-[86px]" : "min-h-[112px]";
  const visibleCount = density === "compact" ? 3 : 2;

  return (
    <div className="min-w-[980px]">
      <div
        className="grid border-b bg-slate-100 sticky top-0 z-20"
        style={{ gridTemplateColumns: "180px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="p-2 text-xs font-semibold border-r bg-slate-100">メンバー</div>
        {weekDays.map((d) => {
          const ymd = formatYmd(d);
          const hol = isHolidayOrSunday(d);
          const sat = isSaturday(d);
          const isToday = ymd === todayYmd;
          const holidayName = getHolidayName(d);
          return (
            <div key={ymd} className={cn("p-2 border-r text-center", hol && "bg-pink-50", !hol && sat && "bg-sky-50", isToday && "bg-primary/10")}>
              <div className="text-[11px] text-muted-foreground tracking-wide">{WEEKDAY_LABELS[d.getDay()]}</div>
              <div className={cn("text-base font-semibold leading-tight", isToday && "text-primary")}>{d.getDate()}</div>
              {holidayName && <div className="text-[9px] text-pink-700 truncate">{holidayName}</div>}
            </div>
          );
        })}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        {members.map((m) => (
          <div
            key={m.id}
            className="grid border-b"
            style={{ gridTemplateColumns: "180px repeat(7, minmax(0, 1fr))" }}
          >
            <div className="p-2 text-xs font-medium border-r sticky left-0 bg-white z-10 truncate flex items-center gap-2">
              <span className="inline-flex h-5 w-5 rounded-full bg-slate-200 text-[10px] items-center justify-center text-slate-700">
                {(m.displayName ?? m.name).slice(0, 1)}
              </span>
              <span className="truncate">{m.displayName ?? m.name}</span>
            </div>
            {weekDays.map((d) => {
              const ymd = formatYmd(d);
              const hol = isHolidayOrSunday(d);
              const sat = isSaturday(d);
              const list = filteredSchedules
                .filter((ev) => ev.userId === m.id && formatYmd(ev.startAt) <= ymd && ymd <= formatYmd(ev.endAt))
                .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
              return (
                <DroppableCell
                  key={`${m.id}-${ymd}`}
                  id={`week-${ymd}-${m.id}`}
                  className={cn(
                    "p-1 border-r flex flex-col gap-1 relative",
                    cellMinHeight,
                    hol && "bg-pink-50",
                    !hol && sat && "bg-sky-50",
                    "hover:bg-muted/20 transition-colors"
                  )}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onCellClick(ymd);
                  }}
                >
                  {list.length === 0 && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => onCellClick(ymd)}
                      aria-label="予定を追加"
                    >
                      +
                    </button>
                  )}
                  {list.slice(0, visibleCount).map((ev) => (
                    <DraggableEventChip
                      key={ev.id}
                      id={`event-${ev.id}`}
                      dense={density === "compact"}
                      className={cn(
                        getDeptChipClass(ev.scheduleDepartment),
                        getDeptAccentClass(ev.scheduleDepartment),
                        "border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      )}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(ev, e);
                        }}
                        className="block"
                      >
                        <span className="block text-[10px] opacity-90 leading-tight">{formatEventTimeLabel(ev)}</span>
                        <span className="block truncate text-[11px] leading-tight">{ev.title}</span>
                      </span>
                    </DraggableEventChip>
                  ))}
                  {list.length > visibleCount && (
                    <span className="text-[10px] text-muted-foreground px-1">+{list.length - visibleCount}件</span>
                  )}
                </DroppableCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineView({
  tlMode,
  currentDate,
  year,
  month,
  weekDays,
  collapsedDepts,
  toggleCollapsed,
  activeDepts,
  filteredSchedules,
  eventsForDay,
  onCellClick,
  onEventClick,
}: {
  tlMode: "month" | "week" | "day";
  currentDate: Date;
  year: number;
  month: number;
  weekDays: Date[];
  collapsedDepts: Set<string>;
  toggleCollapsed: (k: string) => void;
  activeDepts: Set<string>;
  filteredSchedules: ScheduleRow[];
  eventsForDay: (ymd: string) => ScheduleRow[];
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  if (tlMode === "day") {
    const ymd = formatYmd(currentDate);
    const dayStart = startOfLocalDay(currentDate);
    const dayEnd = endOfLocalDay(currentDate);
    const hours = Array.from({ length: 24 }, (_, h) => h);

    const deptEventsFor = (dept: string) =>
      filteredSchedules.filter((s) => {
        const sd = s.scheduleDepartment ?? "all";
        if (formatYmd(s.startAt) > ymd || formatYmd(s.endAt) < ymd) return false;
        if (sd === dept) return true;
        if (sd === "all" && dept === DEFAULT_FORM_DEPT) return true;
        return false;
      });

    const visibleDepts = BUSINESS_DEPT_KEYS.filter((k) => activeDepts.has(k));
    const n = visibleDepts.length;
    const tw = SCHEDULE_DAY_TIME_AXIS_WIDTH_PX;
    const gridTemplateColumns =
      n <= 4
        ? `${tw}px repeat(${n}, minmax(0, 1fr))`
        : `${tw}px repeat(${n}, minmax(120px, 1fr))`;

    let hasAnyAllDay = false;
    for (const dept of visibleDepts) {
      for (const ev of deptEventsFor(dept)) {
        if (ev.allDay) {
          hasAnyAllDay = true;
          break;
        }
      }
      if (hasAnyAllDay) break;
    }

    if (visibleDepts.length === 0) {
      return <div className="min-h-[160px] rounded-md border border-slate-200 bg-white" />;
    }

    const deptColBorder = (i: number) => (i > 0 ? "border-l border-slate-200" : "");

    return (
      <div
        className={cn(
          "rounded-md border border-slate-200 bg-white",
          n <= 4 ? "w-full max-w-full overflow-x-hidden" : "overflow-x-auto [scrollbar-width:thin]"
        )}
      >
        <div
          className={cn(
            "max-h-[70vh] min-h-0 w-full overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]",
            n > 4 && "min-w-max"
          )}
          onContextMenu={(e) => {
            e.preventDefault();
            onCellClick(ymd);
          }}
        >
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
            {hasAnyAllDay && (
              <div className="grid w-full border-b border-slate-200 bg-slate-50/50" style={{ gridTemplateColumns }}>
                <div
                  className="box-border flex min-h-[3rem] items-center justify-center border-r border-slate-200 bg-slate-50/50 px-0.5 py-1"
                  style={{ width: tw, minWidth: tw, maxWidth: tw }}
                >
                  <span className="text-[10px] font-medium leading-none text-slate-400">終日</span>
                </div>
                {visibleDepts.map((dept, i) => {
                  const allDay = deptEventsFor(dept).filter((ev) => ev.allDay);
                  return (
                    <div
                      key={`allday-${dept}`}
                      className={cn("min-h-[3rem] min-w-0 px-2 py-1.5", deptColBorder(i))}
                    >
                      <div className="flex flex-wrap gap-1">
                        {allDay.map((ev) => (
                          <DraggableEventChip
                            key={ev.id}
                            id={`event-${ev.id}`}
                            className={cn(
                              getDeptChipClass(ev.scheduleDepartment),
                              getDeptAccentClass(ev.scheduleDepartment),
                              "border-l-4 shadow-sm"
                            )}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick(ev, e);
                              }}
                              className="block truncate"
                            >
                              {ev.title}
                            </span>
                          </DraggableEventChip>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid w-full bg-muted/30" style={{ gridTemplateColumns }}>
              <div
                className="box-border h-9 shrink-0 border-r border-slate-200 bg-muted/30"
                style={{ width: tw, minWidth: tw, maxWidth: tw }}
                aria-hidden
              />
              {visibleDepts.map((dept, i) => {
                const DeptFilterIcon = DEPT_FILTER_ICON_COMPONENTS[dept as keyof typeof DEPT_FILTER_ICON_COMPONENTS];
                return (
                  <div
                    key={`hdr-${dept}`}
                    className={cn(
                      "flex h-9 min-w-0 items-center justify-center gap-1 px-1 text-center text-xs font-semibold text-slate-800",
                      deptColBorder(i)
                    )}
                  >
                    <DeptFilterIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    <span className="min-w-0 truncate">{DEPT_CONFIG[dept].label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid w-full shrink-0" style={{ gridTemplateColumns }}>
            <ScheduleDayTimeLabelsColumn />
            {visibleDepts.map((dept, i) => {
              const raw = deptEventsFor(dept);
              const timed: ScheduleRow[] = [];
              for (const ev of raw) {
                if (!ev.allDay && clipTimedSegmentToDay(ev, dayStart, dayEnd)) timed.push(ev);
              }
              return (
                <div key={dept} className={cn("min-w-0", deptColBorder(i))}>
                  <ScheduleDayTimeGridColumn>
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="pointer-events-auto absolute right-0 left-0 z-[1]"
                        style={{ top: h * PIXELS_PER_HOUR, height: PIXELS_PER_HOUR }}
                      >
                        <DroppableCell id={`tl-day-${dept}-${ymd}-${h}`} className="h-full w-full">
                          <div className="h-full w-full" aria-hidden />
                        </DroppableCell>
                      </div>
                    ))}
                    {timed.map((ev) => {
                      const seg = clipTimedSegmentToDay(ev, dayStart, dayEnd);
                      if (!seg) return null;
                      const { top, height } = segmentLayout(seg, dayStart);
                      const cfg =
                        DEPT_CONFIG[(ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG] ?? DEPT_CONFIG.all;
                      return (
                        <div
                          key={`${dept}-${ev.id}`}
                          className="absolute right-1 left-1 z-[2] min-h-0 min-w-0 overflow-hidden"
                          style={{ top, height }}
                        >
                          <DraggableEventChip
                            id={`event-${ev.id}`}
                            dense
                            className={cn(
                              "h-full min-h-0 w-full flex-col items-stretch justify-start gap-0.5 overflow-hidden py-0.5",
                              cfg.bg,
                              "border-white/30 text-white shadow-sm"
                            )}
                          >
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick(ev, e);
                              }}
                              className="block min-w-0"
                            >
                              <span className="block text-[10px] leading-tight opacity-90">
                                {formatEventTimeLabel(ev)}
                              </span>
                              <span className="block truncate text-[11px] leading-tight">{ev.title}</span>
                            </span>
                          </DraggableEventChip>
                        </div>
                      );
                    })}
                  </ScheduleDayTimeGridColumn>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const dayDates: Date[] =
    tlMode === "month"
      ? Array.from({ length: daysInMonth(year, month) }, (_, i) => new Date(year, month, i + 1))
      : weekDays;

  return (
    <div className="overflow-x-auto">
      {DEPT_KEYS.map((dept) => {
        if (collapsedDepts.has(dept)) {
          return (
            <button
              key={dept}
              type="button"
              className="flex w-full border-b py-2 text-left text-sm"
              style={{ paddingLeft: LABEL_W }}
              onClick={() => toggleCollapsed(dept)}
            >
              ▶ {DEPT_CONFIG[dept].label}
            </button>
          );
        }
        return (
          <div key={dept} className="flex border-b min-h-[72px]">
            <button
              type="button"
              className="shrink-0 flex items-start pt-2 text-sm font-medium border-r bg-muted/20 px-2"
              style={{ width: LABEL_W }}
              onClick={() => toggleCollapsed(dept)}
            >
              ▼ {DEPT_CONFIG[dept].label}
            </button>
            <div className="flex flex-1 min-w-0">
              {dayDates.map((d) => {
                const ymd = formatYmd(d);
                const hol = isHolidayOrSunday(d);
                const sat = isSaturday(d);
                const list = eventsForDay(ymd).filter((ev) => (ev.scheduleDepartment ?? "all") === dept);
                const dropId = `tl-${tlMode}-${dept}-${ymd}`;
                return (
                  <DroppableCell
                    key={ymd + dept}
                    id={dropId}
                    className={cn(
                      "flex-1 min-w-[72px] border-l p-0.5 flex flex-col gap-0.5",
                      hol && "bg-pink-50",
                      !hol && sat && "bg-sky-50"
                    )}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onCellClick(ymd);
                    }}
                  >
                    <button type="button" className="text-[10px] text-muted-foreground w-full" onClick={() => onCellClick(ymd)}>
                      {d.getDate()}
                    </button>
                    {list.map((ev) => {
                      const cfg = DEPT_CONFIG[(ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG] ?? DEPT_CONFIG.all;
                      return (
                        <DraggableEventChip key={ev.id} id={`event-${ev.id}`} className={cn(cfg.bg, "text-white")}>
                          <span onClick={(e) => { e.stopPropagation(); onEventClick(ev, e); }} className="truncate">
                            {ev.title}
                          </span>
                        </DraggableEventChip>
                      );
                    })}
                  </DroppableCell>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventPopover({
  anchor,
  event,
  tasks,
  newTaskTitle,
  setNewTaskTitle,
  taskProgress,
  onClose,
  onDelete,
  onDuplicate,
  canDelete,
  addTask,
  toggleTask,
  deleteTask,
  taskAdding,
}: {
  anchor: { x: number; y: number };
  event: ScheduleRow;
  tasks: { id: number; title: string; completed: boolean }[];
  newTaskTitle: string;
  setNewTaskTitle: (s: string) => void;
  taskProgress: number;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  canDelete: boolean;
  addTask: () => void | Promise<void>;
  toggleTask: (id: number, completed: boolean) => void;
  deleteTask: (id: number) => void;
  taskAdding: boolean;
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(anchor.x, vw - 352);
  const top = Math.min(anchor.y, vh - 400);
  const dk = (event.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[60] bg-black/20" aria-label="閉じる" onClick={onClose} />
      <Card
        className="fixed z-[70] w-[336px] shadow-xl"
        style={{ left, top }}
      >
        <CardHeader className="flex flex-row items-start justify-between py-3 px-3 space-y-0">
          <CardTitle className="text-base leading-tight pr-6">{event.title}</CardTitle>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm px-3 pb-3">
          <div className="flex flex-wrap items-center gap-1">
            <div className={cn("inline-block text-xs px-2 py-0.5 rounded border", DEPT_CONFIG[dk]?.border ?? "", DEPT_CONFIG[dk]?.bg, "text-white")}>
              {DEPT_CONFIG[dk]?.label ?? dk}
            </div>
            <Badge variant="outline">担当: {event.user.displayName ?? event.user.name}</Badge>
            <Badge variant="outline">{event.scheduleType === "personal" ? "個人予定" : "部署予定"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {event.startAt.toLocaleString()} 〜 {event.endAt.toLocaleString()}
          </p>
          {event.description && <p className="text-xs whitespace-pre-wrap">{event.description}</p>}

          <div className="space-y-1">
            <div className="h-1.5 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${taskProgress * 100}%` }} />
            </div>
            <div className="flex gap-1">
              <textarea
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="タスクを追加（改行で複数入力）"
                className="w-full border rounded-md min-h-[56px] px-2 py-1 text-xs bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void addTask();
                  }
                }}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={taskAdding || !newTaskTitle.trim()} onClick={() => void addTask()}>
              {taskAdding ? "追加中..." : "タスクを追加"}
            </Button>
            <ul className="max-h-32 overflow-auto space-y-1">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => toggleTask(t.id, !t.completed)}
                  />
                  <span className={cn(t.completed && "line-through opacity-60")}>{t.title}</span>
                  <button type="button" className="ml-auto text-destructive text-[10px]" onClick={() => deleteTask(t.id)}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {canDelete && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={onDuplicate}>
                複製して作成
              </Button>
              <Button type="button" variant="destructive" size="sm" className="w-full" onClick={onDelete}>
                スケジュールを削除
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CreateFormModal({
  formData,
  setFormData,
  onClose,
  onSubmit,
}: {
  formData: {
    title: string;
    description: string;
    scheduleType: "department" | "personal";
    department: BusinessDeptKey;
    startAt: string;
    endAt: string;
    allDay: boolean;
    color: string;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      scheduleType: "department" | "personal";
      department: BusinessDeptKey;
      startAt: string;
      endAt: string;
      allDay: boolean;
      color: string;
    }>
  >;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-[80] bg-black/40" aria-label="閉じる" onClick={onClose} />
      <Card className="fixed z-[90] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,440px)] max-h-[90vh] overflow-auto shadow-xl border-slate-200">
        <CardHeader>
          <CardTitle>予定を追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>タイトル</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>種別</Label>
            <select
              className="w-full border rounded-md h-9 px-2 text-sm bg-background"
              value={formData.scheduleType}
              onChange={(e) =>
                setFormData((p) => {
                  const scheduleType = e.target.value as "department" | "personal";
                  if (scheduleType === "personal") return { ...p, scheduleType };
                  const dept = p.department;
                  return {
                    ...p,
                    scheduleType,
                    department: isBusinessDeptKey(dept) ? dept : DEFAULT_FORM_DEPT,
                  };
                })
              }
            >
              <option value="department">部署</option>
              <option value="personal">個人</option>
            </select>
          </div>
          {formData.scheduleType === "department" && (
            <div className="space-y-1">
              <Label>部署</Label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                value={formData.department}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, department: e.target.value as BusinessDeptKey }))
                }
              >
                {BUSINESS_DEPT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {DEPT_CONFIG[k].label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>開始</Label>
            <Input
              type="datetime-local"
              value={formData.startAt}
              onChange={(e) => setFormData((p) => ({ ...p, startAt: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>終了</Label>
            <Input
              type="datetime-local"
              value={formData.endAt}
              onChange={(e) => setFormData((p) => ({ ...p, endAt: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.allDay}
              onChange={(e) => setFormData((p) => ({ ...p, allDay: e.target.checked }))}
            />
            終日
          </label>
          <div className="space-y-1">
            <Label>色</Label>
            <Input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
              className="h-9 p-1"
            />
          </div>
          <div className="space-y-1">
            <Label>説明</Label>
            <textarea
              className="w-full border rounded-md min-h-[72px] px-2 py-1 text-sm"
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="button" className="flex-1" onClick={onSubmit}>
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── ページ ───────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  return (
    <div className="flex min-h-full flex-col pb-6">
      <Tabs defaultValue="calendar" className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 mx-4 mt-2">
          <TabsTrigger value="calendar">カレンダー</TabsTrigger>
          <TabsTrigger value="shift">シフト管理</TabsTrigger>
          <TabsTrigger value="hours">工数管理</TabsTrigger>
          <TabsTrigger value="notification">通知設定</TabsTrigger>
        </TabsList>
        <TabsContent
          value="calendar"
          className="mt-0 flex flex-1 min-h-0 flex-col overflow-y-auto overflow-x-hidden data-[state=inactive]:hidden"
        >
          <CalendarTab />
        </TabsContent>
        <TabsContent value="shift" className="flex-1 overflow-auto p-4 mt-0 data-[state=inactive]:hidden">
          <ShiftTab />
        </TabsContent>
        <TabsContent value="hours" className="flex-1 overflow-auto p-4 mt-0 data-[state=inactive]:hidden">
          <WorkHoursTab />
        </TabsContent>
        <TabsContent value="notification" className="flex-1 overflow-auto p-4 mt-0 data-[state=inactive]:hidden">
          <NotificationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
