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
  LayoutGrid,
  List,
  Users,
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
import { canEditScheduleOf } from "@/utils/schedulePermission";

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

const MEMBER_COLORS = [
  "#60A5FA",
  "#4ADE80",
  "#FCD34D",
  "#A78BFA",
  "#F9A8D4",
  "#67E8F9",
  "#FCA5A5",
  "#6EE7B7",
  "#FDE68A",
  "#C4B5FD",
];

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

function isSaturday(d: Date): boolean {
  return d.getDay() === 6;
}

function parseDropToAnchor(dropId: string): { ymd: string; hour: number | null } | null {
  const mDay = dropId.match(/^(?:day|week)-(\d{4}-\d{2}-\d{2})$/);
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
  className,
}: {
  id: string;
  children: React.ReactNode;
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
        "flex items-center gap-0.5 max-w-full rounded border px-1 py-0.5 text-left text-[10px] leading-tight shadow-sm",
        isDragging && "opacity-40",
        className
      )}
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-60 pointer-events-none" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function DroppableCell({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary ring-inset")}>
      {children}
    </div>
  );
}

// ─── CalendarTab ─────────────────────────────────────────────────────────────

function CalendarTab() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [view, setView] = useState<"month" | "week" | "timeline">("month");
  const [tlMode, setTlMode] = useState<"month" | "week" | "day">("month");
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeDepts, setActiveDepts] = useState<Set<string>>(
    () => new Set(["maintenance", "painting", "slitter", "drone", "all", "personal"])
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleRow | null>(null);
  const [showEventPanel, setShowEventPanel] = useState(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduleType: "department" as "department" | "personal",
    department: "all",
    startAt: "",
    endAt: "",
    allDay: false,
    color: "#3B82F6",
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const isDraggingRef = useRef(false);
  const [dragEvent, setDragEvent] = useState<ScheduleRow | null>(null);

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
      department: "all",
      startAt: "",
      endAt: "",
      allDay: false,
      color: "#3B82F6",
    });
  }

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const dept = (s.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG;
      const dk = DEPT_CONFIG[dept] ? dept : "all";
      if (!activeDepts.has(dk)) return false;
      if (selectedMemberIds.size > 0 && !selectedMemberIds.has(s.userId)) return false;
      return true;
    });
  }, [schedules, activeDepts, selectedMemberIds]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const eventsForDay = useCallback(
    (ymd: string) =>
      filteredSchedules.filter((s) => {
        const ds = formatYmd(s.startAt);
        const de = formatYmd(s.endAt);
        return ds <= ymd && ymd <= de;
      }),
    [filteredSchedules]
  );

  const memberColor = useCallback((userId: number) => MEMBER_COLORS[userId % MEMBER_COLORS.length], []);

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

  const navPrev = () => {
    if (view === "month") {
      setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, -7));
    } else if (view === "timeline") {
      if (tlMode === "month") setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
      else if (tlMode === "week") setCurrentDate((d) => addDays(d, -7));
      else setCurrentDate((d) => addDays(d, -1));
    }
  };

  const navNext = () => {
    if (view === "month") {
      setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    } else if (view === "week") {
      setCurrentDate((d) => addDays(d, 7));
    } else if (view === "timeline") {
      if (tlMode === "month") setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
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

  const titleBar =
    view === "month"
      ? `${y}年 ${mo + 1}月`
      : view === "week"
        ? `週: ${formatYmd(weekDays[0])} 〜 ${formatYmd(weekDays[6])}`
        : tlMode === "month"
          ? `TL 月: ${y}年 ${mo + 1}月`
          : tlMode === "week"
            ? `TL 週: ${formatYmd(weekDays[0])} 〜`
            : `TL 日: ${formatYmd(currentDate)}`;

  return (
    <div className="flex flex-col h-full min-h-0 gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" onClick={navPrev} aria-label="前">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={navNext} aria-label="次">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2">{titleBar}</span>
        </div>

        <div className="flex rounded-md border p-0.5 bg-muted/40">
          <Button
            type="button"
            variant={view === "month" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setView("month")}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            月
          </Button>
          <Button
            type="button"
            variant={view === "week" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setView("week")}
          >
            週
          </Button>
          <Button
            type="button"
            variant={view === "timeline" ? "secondary" : "ghost"}
            size="sm"
            className="h-8"
            onClick={() => setView("timeline")}
          >
            <List className="h-4 w-4 mr-1" />
            TL
          </Button>
        </div>

        {view === "timeline" && (
          <div className="flex gap-1">
            {(["month", "week", "day"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={tlMode === m ? "default" : "outline"}
                onClick={() => setTlMode(m)}
              >
                {m === "month" ? "月" : m === "week" ? "週" : "日"}
              </Button>
            ))}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={() => setShowMemberPanel((v) => !v)}>
          <Users className="h-4 w-4 mr-1" />
          メンバー
        </Button>

        <Button type="button" size="sm" onClick={() => setShowForm(true)}>
          ＋ 予定
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 shrink-0">
        {DEPT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggleDeptFilter(k)}
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              activeDepts.has(k) ? DEPT_CONFIG[k].border + " " + DEPT_CONFIG[k].bg + " text-white" : "opacity-40 border-muted"
            )}
          >
            {DEPT_CONFIG[k].label}
          </button>
        ))}
      </div>

      {showMemberPanel && (
        <Card className="shrink-0">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">表示するメンバー（未選択で全員）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 py-2 px-3">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMemberIds.has(m.id)}
                  onChange={() =>
                    setSelectedMemberIds((prev) => {
                      const n = new Set(prev);
                      if (n.has(m.id)) n.delete(m.id);
                      else n.add(m.id);
                      return n;
                    })
                  }
                />
                <span style={{ color: memberColor(m.id) }}>{m.displayName ?? m.name}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 overflow-auto border rounded-md bg-card">
          {view === "month" && (
            <MonthGridView
              month={mo}
              cells={monthGrid}
              eventsForDay={eventsForDay}
              onCellClick={openCreateForDay}
              onEventClick={(ev, e) => {
                if (isDraggingRef.current) return;
                setSelectedEvent(ev);
                setPopoverAnchor({ x: e.clientX, y: e.clientY });
                setShowEventPanel(true);
              }}
            />
          )}
          {view === "week" && (
            <WeekGridView
              weekDays={weekDays}
              eventsForDay={eventsForDay}
              onCellClick={openCreateForDay}
              onEventClick={(ev, e) => {
                if (isDraggingRef.current) return;
                setSelectedEvent(ev);
                setPopoverAnchor({ x: e.clientX, y: e.clientY });
                setShowEventPanel(true);
              }}
            />
          )}
          {view === "timeline" && (
            <TimelineView
              tlMode={tlMode}
              currentDate={currentDate}
              year={y}
              month={mo}
              weekDays={weekDays}
              collapsedDepts={collapsedDepts}
              toggleCollapsed={toggleCollapsed}
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
          )}
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
          canDelete={canDeleteSchedule(user.id, user.role ?? "user", selectedEvent.userId, selectedEvent.user.role)}
          addTask={() => {
            if (!newTaskTitle.trim()) return;
            addTaskMutation.mutate({ scheduleId: selectedEvent.id, title: newTaskTitle.trim() });
          }}
          toggleTask={(taskId, completed) => toggleTaskMutation.mutate({ taskId, isCompleted: completed })}
          deleteTask={(taskId) => deleteTaskMutation.mutate({ taskId })}
        />
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
            const dept = formData.scheduleType === "personal" ? "personal" : (formData.department as "maintenance");
            createMutation.mutate({
              title: formData.title.trim(),
              description: formData.description || null,
              startAt: new Date(formData.startAt).toISOString(),
              endAt: new Date(formData.endAt).toISOString(),
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

function MonthGridView({
  month,
  cells,
  eventsForDay,
  onCellClick,
  onEventClick,
}: {
  month: number;
  cells: Date[];
  eventsForDay: (ymd: string) => ScheduleRow[];
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());

  return (
    <div className="grid grid-cols-7 gap-px bg-border min-w-[720px]">
      {WEEKDAY_LABELS.map((w) => (
        <div key={w} className="bg-muted text-center text-xs py-1 font-medium">
          {w}
        </div>
      ))}
      {cells.map((d) => {
        const ymd = formatYmd(d);
        const inMonth = d.getMonth() === month;
        const list = eventsForDay(ymd);
        const hol = isHolidayOrSunday(d);
        const sat = isSaturday(d);
        const isToday = ymd === todayYmd;

        return (
          <DroppableCell
            key={ymd}
            id={`day-${ymd}`}
            className={cn(
              "min-h-[88px] p-0.5 bg-background text-left align-top",
              !inMonth && "opacity-40",
              hol && "bg-pink-100",
              !hol && sat && "bg-sky-100"
            )}
          >
            <div
              role="presentation"
              className="w-full h-full text-left flex flex-col min-h-[80px] cursor-pointer"
              onClick={() => onCellClick(ymd)}
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
              </div>
              <div className="flex-1 flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                {list.slice(0, 3).map((ev) => {
                  const dk = (ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG;
                  const cfg = DEPT_CONFIG[dk] ?? DEPT_CONFIG.all;
                  return (
                    <DraggableEventChip key={ev.id} id={`event-${ev.id}`} className={cn(cfg.bg, "text-white border-white/30")}>
                      <span onClick={(e) => { e.stopPropagation(); onEventClick(ev, e); }} className="truncate">
                        {ev.title}
                      </span>
                    </DraggableEventChip>
                  );
                })}
                {list.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{list.length - 3}件</span>
                )}
              </div>
            </div>
          </DroppableCell>
        );
      })}
    </div>
  );
}

function WeekGridView({
  weekDays,
  eventsForDay,
  onCellClick,
  onEventClick,
}: {
  weekDays: Date[];
  eventsForDay: (ymd: string) => ScheduleRow[];
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  const todayYmd = formatYmd(new Date());

  return (
    <div className="grid grid-cols-7 gap-px bg-border min-w-[720px]">
      {weekDays.map((d) => {
        const ymd = formatYmd(d);
        const list = eventsForDay(ymd);
        const hol = isHolidayOrSunday(d);
        const sat = isSaturday(d);
        const isToday = ymd === todayYmd;
        return (
          <DroppableCell
            key={ymd}
            id={`week-${ymd}`}
            className={cn(
              "min-h-[220px] p-1 bg-background flex flex-col",
              hol && "bg-pink-100",
              !hol && sat && "bg-sky-100"
            )}
          >
            <div className="text-left shrink-0 mb-1 w-full cursor-pointer" onClick={() => onCellClick(ymd)}>
              <span className="text-[11px] text-muted-foreground block">{WEEKDAY_LABELS[d.getDay()]}</span>
              <span
                className={cn(
                  "text-sm font-semibold inline-flex w-7 h-7 items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground"
                )}
              >
                {d.getDate()}
              </span>
            </div>
            <div className="flex flex-col gap-1 overflow-auto flex-1">
              {list.map((ev) => {
                const dk = (ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG;
                const cfg = DEPT_CONFIG[dk] ?? DEPT_CONFIG.all;
                return (
                  <DraggableEventChip key={ev.id} id={`event-${ev.id}`} className={cn(cfg.bg, "text-white border-white/30")}>
                    <span onClick={(e) => { e.stopPropagation(); onEventClick(ev, e); }}>{ev.title}</span>
                  </DraggableEventChip>
                );
              })}
            </div>
          </DroppableCell>
        );
      })}
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
  filteredSchedules: ScheduleRow[];
  eventsForDay: (ymd: string) => ScheduleRow[];
  onCellClick: (ymd: string) => void;
  onEventClick: (ev: ScheduleRow, e: React.MouseEvent) => void;
}) {
  if (tlMode === "day") {
    const ymd = formatYmd(currentDate);
    const hours = Array.from({ length: 24 }, (_, h) => h);
    return (
      <div className="overflow-x-auto">
        {DEPT_KEYS.map((dept) => {
          if (collapsedDepts.has(dept)) {
            return (
              <button
                key={dept}
                type="button"
                className="flex w-full border-b py-1 px-2 text-left text-sm bg-muted/30"
                style={{ paddingLeft: LABEL_W }}
                onClick={() => toggleCollapsed(dept)}
              >
                ▶ {DEPT_CONFIG[dept].label}
              </button>
            );
          }
          const deptEvents = filteredSchedules.filter(
            (s) => (s.scheduleDepartment ?? "all") === dept && formatYmd(s.startAt) <= ymd && ymd <= formatYmd(s.endAt)
          );
          return (
            <div key={dept} className="border-b">
              <button
                type="button"
                className="flex items-center gap-2 py-1 px-2 text-sm font-medium bg-muted/20 w-full text-left"
                onClick={() => toggleCollapsed(dept)}
              >
                <span className="shrink-0 text-xs w-[160px] pl-2">▼ {DEPT_CONFIG[dept].label}</span>
                <div className="flex flex-1 relative h-14">
                  {hours.map((h) => (
                    <DroppableCell
                      key={h}
                      id={`tl-day-${dept}-${ymd}-${h}`}
                      className="flex-1 border-l border-dashed border-muted min-h-[56px]"
                    >
                      <button type="button" className="w-full h-full text-[10px] text-muted-foreground" onClick={() => onCellClick(ymd)}>
                        {h}
                      </button>
                    </DroppableCell>
                  ))}
                  {deptEvents.map((ev) => {
                    const sh = ev.startAt.getHours();
                    const eh = ev.endAt.getHours();
                    const left = (sh / 24) * 100;
                    const width = Math.max(((Math.min(eh + 1, 24) - sh) / 24) * 100, 4);
                    const cfg = DEPT_CONFIG[(ev.scheduleDepartment ?? "all") as keyof typeof DEPT_CONFIG] ?? DEPT_CONFIG.all;
                    return (
                      <div
                        key={ev.id}
                        className="absolute top-1 h-10 rounded border text-[10px] px-1 truncate pointer-events-none"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: "rgba(59,130,246,.85)",
                          color: "#fff",
                        }}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                </div>
              </button>
            </div>
          );
        })}
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
  canDelete,
  addTask,
  toggleTask,
  deleteTask,
}: {
  anchor: { x: number; y: number };
  event: ScheduleRow;
  tasks: { id: number; title: string; completed: boolean }[];
  newTaskTitle: string;
  setNewTaskTitle: (s: string) => void;
  taskProgress: number;
  onClose: () => void;
  onDelete: () => void;
  canDelete: boolean;
  addTask: () => void;
  toggleTask: (id: number, completed: boolean) => void;
  deleteTask: (id: number) => void;
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
          <div className={cn("inline-block text-xs px-2 py-0.5 rounded border", DEPT_CONFIG[dk]?.border ?? "", DEPT_CONFIG[dk]?.bg, "text-white")}>
            {DEPT_CONFIG[dk]?.label ?? dk}
          </div>
          <p className="text-xs text-muted-foreground">
            {event.startAt.toLocaleString()} 〜 {event.endAt.toLocaleString()}
          </p>
          {event.description && <p className="text-xs whitespace-pre-wrap">{event.description}</p>}

          <div className="space-y-1">
            <div className="h-1.5 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${taskProgress * 100}%` }} />
            </div>
            <div className="flex gap-1">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="タスクを追加"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTask();
                  }
                }}
              />
            </div>
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
            <Button type="button" variant="destructive" size="sm" className="w-full" onClick={onDelete}>
              スケジュールを削除
            </Button>
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
    department: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    color: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<(typeof formData)>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-[80] bg-black/40" aria-label="閉じる" onClick={onClose} />
      <Card className="fixed z-[90] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,420px)] max-h-[90vh] overflow-auto shadow-xl">
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
                setFormData((p) => ({ ...p, scheduleType: e.target.value as "department" | "personal" }))
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
                onChange={(e) => setFormData((p) => ({ ...p, department: e.target.value }))}
              >
                {DEPT_KEYS.map((k) => (
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
    <div className="flex flex-col h-full min-h-0">
      <Tabs defaultValue="calendar" className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 mx-4 mt-2">
          <TabsTrigger value="calendar">カレンダー</TabsTrigger>
          <TabsTrigger value="shift">シフト管理</TabsTrigger>
          <TabsTrigger value="hours">工数管理</TabsTrigger>
          <TabsTrigger value="notification">通知設定</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="flex-1 min-h-0 overflow-hidden mt-0 data-[state=inactive]:hidden">
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
