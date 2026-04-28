import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { LogIn, LogOut, Clock, Plus, CalendarDays, Users } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const DEPARTMENT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  warehouse: "倉庫",
  operation: "運行管理",
  admin: "管理",
};

const DEPARTMENT_CLASS: Record<string, string> = {
  maintenance: "bg-blue-100 text-blue-800",
  painting: "bg-green-100 text-green-800",
  slitter: "bg-orange-100 text-orange-800",
  drone: "bg-purple-100 text-purple-800",
  warehouse: "bg-teal-100 text-teal-800",
  operation: "bg-cyan-100 text-cyan-800",
};

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/**
 * 勤怠状態を 0〜6 の数値で表現する
 *
 * 0 = 未出勤
 * 1 = 出勤中（1回目）
 * 2 = 一時退勤中（1回目退勤済み、2回目未出勤）
 * 3 = 出勤中（2回目）
 * 4 = 一時退勤中（2回目退勤済み、3回目未出勤）
 * 5 = 出勤中（3回目）
 * 6 = 打刻完了（3回目退勤済み）
 */
type AttendanceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function calcAttendanceStep(today: {
  clockIn?: Date | string | null;
  clockOut?: Date | string | null;
  clockIn2?: Date | string | null;
  clockOut2?: Date | string | null;
  clockIn3?: Date | string | null;
  clockOut3?: Date | string | null;
} | null | undefined): AttendanceStep {
  if (!today?.clockIn) return 0;
  if (!today.clockOut) return 1;
  if (!today.clockIn2) return 2;
  if (!today.clockOut2) return 3;
  if (!today.clockIn3) return 4;
  if (!today.clockOut3) return 5;
  return 6;
}

// ─── コンポーネント ───────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isPunching, setIsPunching] = useState(false);

  const today = new Date();
  const todayLabel = today.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  // ─── クエリ ────────────────────────────────────────────────────────────────

  const { data: todayAttendance, refetch: refetchToday } =
    trpc.attendance.today.useQuery();

  const { data: activeMembers, refetch: refetchActiveMembers } =
    trpc.attendance.activeMembers.useQuery();

  const todayRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }, []);

  const { data: todayMemberSchedules } = trpc.schedules.list.useQuery({
    startAt: todayRange.startAt,
    endAt: todayRange.endAt,
    myOnly: false,
  });

  const { data: sharedReports } = trpc.reports.sharedAndOrders.useQuery({ limit: 20 });
  const { data: yesterdaySubmissionStatus } =
    trpc.reports.yesterdaySubmissionStatus.useQuery();

  const sharedInfoReports = useMemo(
    () => (sharedReports ?? []).filter(({ report }) => report.sharedInfo?.trim()),
    [sharedReports]
  );
  const previewSharedInfo = useMemo(() => sharedInfoReports.slice(0, 5), [sharedInfoReports]);

  const yesterdayLabel = useMemo(() => {
    const value = yesterdaySubmissionStatus?.targetDate;
    const base = value ? new Date(`${value}T00:00:00`) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    })();
    const m = base.getMonth() + 1;
    const day = base.getDate();
    const w = ["日", "月", "火", "水", "木", "金", "土"][base.getDay()];
    return `${m}/${day}（${w}）`;
  }, [yesterdaySubmissionStatus?.targetDate]);

  // ─── 勤怠状態 ──────────────────────────────────────────────────────────────

  const attendanceData = todayAttendance;

  /**
   * isWorking: 現在出勤中かどうか（いずれかの clockIn が打刻済みで clockOut が未打刻）
   */
  const isWorking =
    (!!attendanceData?.clockIn && !attendanceData?.clockOut) ||
    (!!attendanceData?.clockIn2 && !attendanceData?.clockOut2) ||
    (!!attendanceData?.clockIn3 && !attendanceData?.clockOut3);

  /**
   * step: 現在の打刻ステップ（0〜6）
   */
  const step = calcAttendanceStep(attendanceData);

  /**
   * showClockIn: 出勤ボタンを表示するか（step が 0, 2, 4 のとき）
   */
  const showClockIn = step === 0 || step === 2 || step === 4;

  /**
   * showClockOut: 退勤ボタンを表示するか（step が 1, 3, 5 のとき）
   */
  const showClockOut = step === 1 || step === 3 || step === 5;

  // ─── ミューテーション ──────────────────────────────────────────────────────

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      const suffix = step === 0 ? "" : step === 2 ? "（2回目）" : "（3回目）";
      toast.success(`出勤を打刻しました${suffix}`);
      refetchToday();
      refetchActiveMembers();
      setIsPunching(false);
    },
    onError: (e) => {
      toast.error(e.message || "打刻に失敗しました");
      setIsPunching(false);
    },
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      const suffix = step === 1 ? "" : step === 3 ? "（2回目）" : "（3回目）";
      toast.success(`退勤を打刻しました${suffix}`);
      refetchToday();
      refetchActiveMembers();
      setIsPunching(false);
    },
    onError: (e) => {
      toast.error(e.message || "打刻に失敗しました");
      setIsPunching(false);
    },
  });

  const handleClockIn = () => {
    setIsPunching(true);
    clockInMutation.mutate();
  };

  const handleClockOut = () => {
    setIsPunching(true);
    clockOutMutation.mutate();
  };

  // ─── 表示用 ────────────────────────────────────────────────────────────────

  const displayName = user?.displayName || user?.name || "ユーザー";
  const deptLabel = user?.department ? DEPARTMENT_LABELS[user.department] ?? "" : "";

  const formatTime = (ts?: Date | string | null) => {
    if (!ts) return "--:--";
    return new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };

  const getActiveClockInTime = (m: {
    attendance?: {
      clockIn?: Date | string | null;
      clockOut?: Date | string | null;
      clockIn2?: Date | string | null;
      clockOut2?: Date | string | null;
      clockIn3?: Date | string | null;
      clockOut3?: Date | string | null;
    } | null;
  }) => {
    const a = m.attendance;
    if (!a) return null;
    if (a.clockIn3 && !a.clockOut3) return a.clockIn3;
    if (a.clockIn2 && !a.clockOut2) return a.clockIn2;
    if (a.clockIn && !a.clockOut) return a.clockIn;
    return null;
  };

  const schedulesByUserId = useMemo(() => {
    const map = new Map<number, Array<{ id: number; title: string; startAt: Date | string }>>();
    for (const s of todayMemberSchedules ?? []) {
      if (!s.user?.id) continue;
      const list = map.get(s.user.id) ?? [];
      list.push({ id: s.id, title: s.title, startAt: s.startAt });
      map.set(s.user.id, list);
    }
    return map;
  }, [todayMemberSchedules]);

  const statusLabel =
    step === 6
      ? "本日の打刻完了"
      : isWorking
      ? "出勤中"
      : step === 0
      ? "未出勤"
      : "一時退勤中";

  // ─── レンダリング ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground/90">{todayLabel}</p>
        <h1 className="text-3xl font-bold tracking-tight">
          おはようございます、{displayName}さん
        </h1>
        {deptLabel && (
          <p className="text-sm font-medium text-muted-foreground">{deptLabel}</p>
        )}
      </div>

      {/* 勤怠カード */}
      <Card className={isWorking ? "border-l-4 border-l-emerald-500 border-slate-200/80 shadow-sm" : "border-slate-200/80 shadow-sm"}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isWorking ? "bg-emerald-100" : "bg-slate-100"
                }`}
              >
                <Clock
                  className={`w-5 h-5 ${isWorking ? "text-emerald-600" : "text-slate-500"}`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">{statusLabel}</p>
                <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                  {attendanceData?.clockIn && (
                    <p>
                      ①出勤: {formatTime(attendanceData.clockIn)}
                      {attendanceData.clockOut &&
                        ` 〜 退勤: ${formatTime(attendanceData.clockOut)}`}
                    </p>
                  )}
                  {attendanceData?.clockIn2 && (
                    <p>
                      ②出勤: {formatTime(attendanceData.clockIn2)}
                      {attendanceData.clockOut2 &&
                        ` 〜 退勤: ${formatTime(attendanceData.clockOut2)}`}
                    </p>
                  )}
                  {attendanceData?.clockIn3 && (
                    <p>
                      ③出勤: {formatTime(attendanceData.clockIn3)}
                      {attendanceData.clockOut3 &&
                        ` 〜 退勤: ${formatTime(attendanceData.clockOut3)}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {showClockIn && (
                <Button
                  size="sm"
                  onClick={handleClockIn}
                  disabled={isPunching}
                  className="h-10 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                >
                  <LogIn className="w-4 h-4" />
                  {step === 0 ? "出勤" : "再出勤"}
                </Button>
              )}
              {showClockOut && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClockOut}
                  disabled={isPunching}
                  className="h-10 px-4 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold"
                >
                  <LogOut className="w-4 h-4" />
                  退勤
                </Button>
              )}
              {step === 6 && (
                <span className="text-xs text-muted-foreground self-center">打刻完了</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 出勤中メンバー */}
      {activeMembers && activeMembers.length > 0 && (
        <Card className="border-emerald-100 bg-emerald-50/30 shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base font-semibold text-emerald-900 flex items-center gap-2">
              <Users className="w-4 h-4" />
              出勤中のメンバー
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                {activeMembers.length}人
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {activeMembers.map((m) => {
                if (!m.user) return null;
                const activeClockIn = getActiveClockInTime(m);
                const memberSchedules = schedulesByUserId.get(m.user.id) ?? [];
                return (
                  <div
                    key={m.user.id}
                    className="bg-white border border-emerald-100 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium">
                        {m.user.displayName || m.user.name}
                      </span>
                      {m.user.department && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                            DEPARTMENT_CLASS[m.user.department] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {DEPARTMENT_LABELS[m.user.department] ?? m.user.department}
                        </span>
                      )}
                      {activeClockIn && (
                        <span className="text-[11px] text-slate-500 ml-auto">
                          {formatTime(activeClockIn)}〜
                        </span>
                      )}
                    </div>

                    {memberSchedules.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {memberSchedules.slice(0, 2).map((schedule) => (
                          <div key={schedule.id} className="text-[11px] text-emerald-700 truncate">
                            {schedule.title}　{formatTime(schedule.startAt)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* クイック導線 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          size="lg"
          className="h-12 text-base font-semibold shadow-sm hover:shadow bg-indigo-600 hover:bg-indigo-700 gap-2"
          onClick={() => navigate("/reports/new")}
        >
          <Plus className="w-4 h-4" />
          日報を作成
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 text-base font-semibold border-slate-300 hover:bg-slate-50 gap-2"
          onClick={() => navigate("/schedule")}
        >
          <CalendarDays className="w-4 h-4" />
          スケジュール
        </Button>
      </div>

      {/* 昨日の日報提出状況 */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-slate-900">
            {yesterdayLabel} の日報提出状況
            {yesterdaySubmissionStatus && (
              <span className="ml-2 text-xs font-semibold text-indigo-700 bg-indigo-100 rounded-full px-2.5 py-1 align-middle">
                {yesterdaySubmissionStatus.submitted.length}/
                {yesterdaySubmissionStatus.submitted.length +
                  yesterdaySubmissionStatus.unsubmitted.length}
                名提出済
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-sky-800 mb-2.5">
                提出済み（{yesterdaySubmissionStatus?.submitted.length ?? 0}名）
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {(yesterdaySubmissionStatus?.submitted ?? []).map((member) => (
                  <div
                    key={`submitted-${member.userId}`}
                    className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {member.displayName || member.name}
                      </p>
                      {member.department && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {DEPARTMENT_LABELS[member.department] ?? member.department}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-rose-800 mb-2.5">
                未提出（{yesterdaySubmissionStatus?.unsubmitted.length ?? 0}名）
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {(yesterdaySubmissionStatus?.unsubmitted ?? []).map((member) => (
                  <div
                    key={`unsubmitted-${member.userId}`}
                    className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {member.displayName || member.name}
                      </p>
                      {member.department && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {DEPARTMENT_LABELS[member.department] ?? member.department}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 共有事項 */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg font-bold text-slate-900">
              共有事項
              <span className="ml-2 text-xs font-semibold text-indigo-700 bg-indigo-100 rounded-full px-2.5 py-1 align-middle">
                {sharedInfoReports.length}件
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" className="font-semibold" onClick={() => navigate("/reports")}>
              日報一覧
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {previewSharedInfo.length === 0 ? (
            <p className="text-sm text-muted-foreground">共有事項はありません。</p>
          ) : (
            <div className="space-y-1.5">
              {previewSharedInfo.map(({ report, user }) => (
                <button
                  key={report.id}
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
                  onClick={() => navigate(`/reports/${report.id}`)}
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {report.department && (
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          DEPARTMENT_CLASS[report.department] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {DEPARTMENT_LABELS[report.department] ?? report.department}
                      </span>
                    )}
                    <span>{user?.displayName || user?.name || "不明ユーザー"}</span>
                    <span>
                      {new Date(report.workDate).toLocaleDateString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm leading-6 mt-1 text-slate-800 line-clamp-2">{report.sharedInfo}</p>
                </button>
              ))}
              {sharedInfoReports.length > previewSharedInfo.length && (
                <p className="text-center text-sm text-muted-foreground pt-1">
                  他 {sharedInfoReports.length - previewSharedInfo.length} 件
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
