import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { LogIn, LogOut, Clock } from "lucide-react";
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
  admin: "管理",
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

  const { data: todayAttendance, refetch: refetchToday } =
    trpc.attendance.today.useQuery();

  const { data: activeMembers, refetch: refetchActiveMembers } =
    trpc.attendance.activeMembers.useQuery();

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
                const activeClockIn = getActiveClockInTime(m);
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
                    {activeClockIn && (
                      <span className="text-xs text-muted-foreground">
                        出勤 {formatTime(activeClockIn)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* クイック導線 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button size="lg" className="h-12" onClick={() => navigate("/reports/new")}>
          日報を作成
        </Button>
        <Button size="lg" variant="outline" className="h-12" onClick={() => navigate("/schedule")}>
          スケジュール
        </Button>
      </div>

      {/* 昨日の日報提出状況 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            {yesterdayLabel} の日報提出状況
            {yesterdaySubmissionStatus && (
              <span className="ml-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                {yesterdaySubmissionStatus.submitted.length}/
                {yesterdaySubmissionStatus.submitted.length +
                  yesterdaySubmissionStatus.unsubmitted.length}
                名提出済
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-2">
                提出済み（{yesterdaySubmissionStatus?.submitted.length ?? 0}名）
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(yesterdaySubmissionStatus?.submitted ?? []).map((member) => (
                  <div
                    key={`submitted-${member.userId}`}
                    className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.displayName || member.name}
                      </p>
                      {member.department && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {DEPARTMENT_LABELS[member.department] ?? member.department}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-red-700 mb-2">
                未提出（{yesterdaySubmissionStatus?.unsubmitted.length ?? 0}名）
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(yesterdaySubmissionStatus?.unsubmitted ?? []).map((member) => (
                  <div
                    key={`unsubmitted-${member.userId}`}
                    className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.displayName || member.name}
                      </p>
                      {member.department && (
                        <p className="text-xs text-muted-foreground mt-0.5">
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
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">
              共有事項
              <span className="ml-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                {sharedInfoReports.length}件
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/reports")}>
              日報一覧
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {previewSharedInfo.length === 0 ? (
            <p className="text-sm text-muted-foreground">共有事項はありません。</p>
          ) : (
            <div className="space-y-1">
              {previewSharedInfo.map(({ report, user }) => (
                <button
                  key={report.id}
                  type="button"
                  className="w-full text-left rounded-md px-2 py-2 hover:bg-muted/40 transition-colors border-b last:border-b-0"
                  onClick={() => navigate(`/reports/${report.id}`)}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                  <p className="text-sm mt-1 line-clamp-2">{report.sharedInfo}</p>
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
