import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { LogIn, LogOut, Clock } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const DEPARTMENT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  admin: "管理",
};

const REPORT_STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  submitted: "提出済み",
  approved: "提出済み",
  rejected: "提出済み",
};

const REPORT_STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-blue-100 text-blue-800",
};

const DEPARTMENT_CLASS: Record<string, string> = {
  maintenance: "bg-blue-100 text-blue-800",
  painting: "bg-green-100 text-green-800",
  slitter: "bg-orange-100 text-orange-800",
  drone: "bg-purple-100 text-purple-800",
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

  const { data: recentReports } = trpc.reports.list.useQuery({ myOnly: true, limit: 5 });

  const { data: todayAttendance, refetch: refetchToday } =
    trpc.attendance.today.useQuery();

  const { data: activeMembers, refetch: refetchActiveMembers } =
    trpc.attendance.activeMembers.useQuery();

  const todayStr = useMemo(() => today.toISOString().split("T")[0], []);

  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split("T")[0];
  }, []);

  const weekEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d.toISOString().split("T")[0];
  }, []);

  const { data: weekSchedules } = trpc.schedules.list.useQuery({
    startAt: weekStart,
    endAt: weekEnd,
  });

  const todaySchedules = useMemo(
    () =>
      weekSchedules
        ? weekSchedules.filter((s) => {
            const start = new Date(s.startAt).toISOString().split("T")[0];
            const end = new Date(s.endAt).toISOString().split("T")[0];
            return start <= todayStr && end >= todayStr;
          })
        : [],
    [weekSchedules, todayStr]
  );

  const { data: sharedReports } = trpc.reports.sharedAndOrders.useQuery({ limit: 20 });
  const { data: submissionStatus } = trpc.reports.todaySubmissionStatus.useQuery();

  const yesterdayLabel = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return `${m}/${day}（${w}）`;
  }, []);

  const sharedInfoReports = useMemo(
    () => (sharedReports ?? []).filter(({ report }) => report.sharedInfo?.trim()),
    [sharedReports]
  );

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
    <div className="space-y-5">
      {/* ヘッダー */}
      <div>
        <p className="text-sm text-muted-foreground">{todayLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">
          おはようございます、{displayName}さん
        </h1>
        {deptLabel && (
          <p className="text-sm text-muted-foreground mt-0.5">{deptLabel}</p>
        )}
      </div>

      {/* 勤怠カード */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isWorking ? "bg-green-100" : "bg-muted"
                }`}
              >
                <Clock
                  className={`w-5 h-5 ${isWorking ? "text-green-600" : "text-muted-foreground"}`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{statusLabel}</p>
                <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
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
                  className="h-9 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
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
                  className="h-9 gap-1.5 border-orange-400 text-orange-600 hover:bg-orange-50"
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">出勤中のメンバー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activeMembers.map((m) => {
                if (!m.user) return null;
                return (
                  <div
                    key={m.user.id}
                    className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-medium">
                      {m.user.displayName || m.user.name}
                    </span>
                    {m.user.department && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          DEPARTMENT_CLASS[m.user.department] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {DEPARTMENT_LABELS[m.user.department] ?? m.user.department}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最近の日報 */}
      {recentReports && recentReports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">最近の日報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentReports.map(({ report }) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                  onClick={() => navigate(`/reports/${report.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(report.workDate).toLocaleDateString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {DEPARTMENT_LABELS[report.department] ?? report.department}
                    </p>
                  </div>
                  <Badge
                    className={`text-xs ${REPORT_STATUS_CLASS[report.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {REPORT_STATUS_LABEL[report.status] ?? report.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
