import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { LogIn, LogOut, Download, History } from "lucide-react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const ATTENDANCE_TYPE_LABEL: Record<string, string> = {
  normal: "通常",
  paid_leave: "有給休暇",
  absence: "欠勤",
  late: "遅刻",
  early_leave: "早退",
};

// ─── ユーティリティ ───────────────────────────────────────────────────────────

function formatTime(ts?: Date | string | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcWorkDuration(clockIn?: Date | string | null, clockOut?: Date | string | null): string {
  if (!clockIn || !clockOut) return "-";
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}時間${mins}分`;
}

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
 *
 * NOTE: Home.tsx と同じロジックを使用すること。
 *       clockIn のみ参照する旧実装では 2 回目以降の打刻が正しく反映されない。
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

export default function Attendance() {
  const utils = trpc.useUtils();

  // 月選択（YYYY-MM 形式）
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const todayLabel = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  // ─── クエリ ──────────────────────────────────────────────────────────────

  const { data: todayAttendance, isLoading: isTodayLoading } =
    trpc.attendance.today.useQuery();

  // 月の開始日・終了日を計算
  const [yearStr, monthStr] = selectedMonth.split("-");
  const startDate = `${selectedMonth}-01`;
  const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const endDate = `${selectedMonth}-${lastDay}`;

  const { data: monthlyRecords, isLoading: isListLoading } =
    trpc.attendance.list.useQuery({
      startDate,
      endDate,
      myOnly: true,
    });

  // ─── 勤怠状態 ────────────────────────────────────────────────────────────

  /**
   * step: 現在の打刻ステップ（0〜6）
   *
   * IMPORTANT: Home.tsx と同じ calcAttendanceStep を使用する。
   * 旧実装（clockIn のみ参照）では 2 回目以降の打刻が正しく反映されなかった。
   */
  const step = calcAttendanceStep(todayAttendance);
  const showClockIn = step === 0 || step === 2 || step === 4;
  const showClockOut = step === 1 || step === 3 || step === 5;

  // ─── ミューテーション ────────────────────────────────────────────────────

  const clockInMutation = trpc.attendance.clockIn.useMutation({
    onSuccess: () => {
      // NOTE: invalidate() で全関連クエリのキャッシュを無効化する。
      //       refetch() のみでは他ページのキャッシュが更新されず巻き戻りが起きる。
      utils.attendance.today.invalidate();
      utils.attendance.list.invalidate();
      utils.attendance.activeMembers.invalidate();
      toast.success("出勤打刻しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const clockOutMutation = trpc.attendance.clockOut.useMutation({
    onSuccess: () => {
      utils.attendance.today.invalidate();
      utils.attendance.list.invalidate();
      utils.attendance.activeMembers.invalidate();
      toast.success("退勤打刻しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── CSV エクスポート ────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (!monthlyRecords) return;
    const rows = [
      ["日付", "出勤時刻", "退勤時刻", "勤務時間", "種別"],
      ...monthlyRecords.map(({ attendance }) => [
        new Date(attendance.workDate).toLocaleDateString("ja-JP"),
        formatTime(attendance.clockIn),
        formatTime(attendance.clockOut),
        calcWorkDuration(attendance.clockIn, attendance.clockOut),
        ATTENDANCE_TYPE_LABEL[attendance.attendanceType] ?? attendance.attendanceType,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `勤怠_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── レンダリング ────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">勤怠管理</h1>
        <p className="text-muted-foreground text-sm mt-1">出退勤の記録・確認ができます</p>
      </div>

      {/* 今日の勤怠カード */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            今日の勤怠
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{todayLabel}</p>

          {isTodayLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : (
            <>
              {/* 打刻時刻の表示 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">出勤</p>
                  <p className="text-2xl font-bold">
                    {todayAttendance?.clockIn ? formatTime(todayAttendance.clockIn) : "--:--"}
                  </p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">退勤</p>
                  <p className="text-2xl font-bold">
                    {todayAttendance?.clockOut ? formatTime(todayAttendance.clockOut) : "--:--"}
                  </p>
                </div>
              </div>

              {/* 勤務時間 */}
              {todayAttendance?.clockIn && todayAttendance?.clockOut && (
                <div className="text-center text-sm text-muted-foreground">
                  勤務時間:{" "}
                  <span className="font-medium text-foreground">
                    {calcWorkDuration(todayAttendance.clockIn, todayAttendance.clockOut)}
                  </span>
                </div>
              )}

              {/* 2回目・3回目の打刻表示 */}
              {(todayAttendance?.clockIn2 || todayAttendance?.clockIn3) && (
                <div className="text-xs text-muted-foreground space-y-1 border-t pt-2">
                  {todayAttendance?.clockIn2 && (
                    <p>
                      ②出勤: {formatTime(todayAttendance.clockIn2)}
                      {todayAttendance.clockOut2 &&
                        ` 〜 退勤: ${formatTime(todayAttendance.clockOut2)}`}
                    </p>
                  )}
                  {todayAttendance?.clockIn3 && (
                    <p>
                      ③出勤: {formatTime(todayAttendance.clockIn3)}
                      {todayAttendance.clockOut3 &&
                        ` 〜 退勤: ${formatTime(todayAttendance.clockOut3)}`}
                    </p>
                  )}
                </div>
              )}

              {/* 打刻ボタン */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending || !showClockIn}
                  className="h-14 flex-col gap-1 text-sm"
                  variant={!showClockIn ? "outline" : "default"}
                >
                  {clockInMutation.isPending ? (
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <LogIn className="w-5 h-5" />
                  )}
                  {step === 0 ? "出勤打刻" : step === 2 || step === 4 ? "再出勤打刻" : "出勤済み"}
                </Button>
                <Button
                  onClick={() => clockOutMutation.mutate()}
                  disabled={clockOutMutation.isPending || !showClockOut}
                  className="h-14 flex-col gap-1 text-sm"
                  variant={!showClockOut ? "outline" : "default"}
                >
                  {clockOutMutation.isPending ? (
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <LogOut className="w-5 h-5" />
                  )}
                  {step === 6
                    ? "打刻完了"
                    : showClockOut
                    ? "退勤打刻"
                    : "退勤済み"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 勤怠履歴カード */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" />勤怠履歴</CardTitle>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 px-3 text-sm border border-white/50 rounded-md bg-white/20 text-white placeholder:text-white/60"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 gap-1"
            >
              <Download className="w-4 h-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isListLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : !monthlyRecords || monthlyRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              この月の勤怠記録はありません
            </div>
          ) : (
            <div className="space-y-1">
              {monthlyRecords.map(({ attendance }) => (
                <div
                  key={attendance.id}
                  className="flex items-center justify-between py-2.5 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(attendance.workDate).toLocaleDateString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ATTENDANCE_TYPE_LABEL[attendance.attendanceType] ?? attendance.attendanceType}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      {formatTime(attendance.clockIn)} 〜 {formatTime(attendance.clockOut)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {calcWorkDuration(attendance.clockIn, attendance.clockOut)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: number;
  workDate: Date | string;
  attendanceType: string;
  clockIn?: Date | string | null;
  clockOut?: Date | string | null;
  clockIn2?: Date | string | null;
  clockOut2?: Date | string | null;
  clockIn3?: Date | string | null;
  clockOut3?: Date | string | null;
}
