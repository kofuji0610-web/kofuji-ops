import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const SCHEDULE_COLORS = [
  { value: "blue", label: "青", class: "bg-blue-500" },
  { value: "green", label: "緑", class: "bg-green-500" },
  { value: "red", label: "赤", class: "bg-red-500" },
  { value: "orange", label: "橙", class: "bg-orange-500" },
  { value: "purple", label: "紫", class: "bg-purple-500" },
];

function getColorClass(color?: string | null) {
  const found = SCHEDULE_COLORS.find((c) => c.value === color);
  return found?.class ?? "bg-blue-500";
}

// ─── コンポーネント ───────────────────────────────────────────────────────────

export default function Schedule() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    allDay: false,
    color: "blue",
  });

  // ─── 月の範囲を計算 ────────────────────────────────────────────────────────

  const monthStart = useMemo(
    () => new Date(currentYear, currentMonth, 1).toISOString(),
    [currentYear, currentMonth]
  );
  const monthEnd = useMemo(
    () => new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString(),
    [currentYear, currentMonth]
  );

  const { data: schedules } = trpc.schedules.list.useQuery({
    startAt: monthStart,
    endAt: monthEnd,
  });

  const createMutation = trpc.schedules.create.useMutation({
    onSuccess: () => {
      utils.schedules.list.invalidate();
      toast.success("スケジュールを追加しました");
      setShowForm(false);
      setFormData({ title: "", description: "", startAt: "", endAt: "", allDay: false, color: "blue" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.schedules.delete.useMutation({
    onSuccess: () => {
      utils.schedules.list.invalidate();
      toast.success("削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── カレンダー生成 ────────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [currentYear, currentMonth]);

  const getSchedulesForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return (schedules ?? []).filter((s) => {
      const start = new Date(s.startAt).toISOString().split("T")[0];
      const end = new Date(s.endAt).toISOString().split("T")[0];
      return start <= dateStr && dateStr <= end;
    });
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startAt || !formData.endAt) {
      toast.error("タイトル・開始日時・終了日時は必須です");
      return;
    }
    createMutation.mutate({
      title: formData.title,
      description: formData.description || null,
      startAt: new Date(formData.startAt).toISOString(),
      endAt: new Date(formData.endAt).toISOString(),
      allDay: formData.allDay,
      color: formData.color,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">スケジュール</h1>
          <p className="text-muted-foreground text-sm mt-1">予定の確認・登録ができます</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          追加
        </Button>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">新しい予定を追加</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  placeholder="予定のタイトル"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="startAt">開始日時 *</Label>
                  <Input
                    id="startAt"
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => setFormData((p) => ({ ...p, startAt: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endAt">終了日時 *</Label>
                  <Input
                    id="endAt"
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={(e) => setFormData((p) => ({ ...p, endAt: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">メモ</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="任意のメモ"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  キャンセル
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending}>
                  追加
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* カレンダー */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {currentYear}年{currentMonth + 1}月
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}
              >
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const isToday =
                day === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear();
              const daySchedules = getSchedulesForDay(day);
              const dayOfWeek = (i % 7);
              return (
                <div
                  key={day}
                  className={`min-h-[52px] p-1 rounded-md border ${isToday ? "border-primary bg-primary/5" : "border-transparent"}`}
                >
                  <p
                    className={`text-xs font-medium mb-0.5 ${isToday ? "text-primary" : dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""}`}
                  >
                    {day}
                  </p>
                  {daySchedules.slice(0, 2).map((s) => (
                    <div
                      key={s.id}
                      className={`text-[10px] text-white rounded px-1 mb-0.5 truncate ${getColorClass(s.color)}`}
                      title={s.title}
                    >
                      {s.title}
                    </div>
                  ))}
                  {daySchedules.length > 2 && (
                    <p className="text-[10px] text-muted-foreground">+{daySchedules.length - 2}</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 今月の予定一覧 */}
      {schedules && schedules.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">今月の予定一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getColorClass(s.color)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" 〜 "}
                      {new Date(s.endAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    )}
                  </div>
                  {(user?.id === s.userId || user?.role === "admin") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate({ id: s.id })}
                    >
                      削除
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
