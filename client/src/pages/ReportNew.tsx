import React, { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const DEPARTMENT_OPTIONS = [
  { value: "maintenance", label: "整備" },
  { value: "painting", label: "塗装" },
  { value: "slitter", label: "スリッター" },
  { value: "drone", label: "ドローン" },
  { value: "admin", label: "管理" },
];

interface TaskForm {
  vehicleNumber: string;
  taskType: string;
  content: string;
  isCompleted: boolean;
}

export default function ReportNew() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const today = new Date().toISOString().split("T")[0];

  const [formData, setFormData] = useState({
    workDate: today,
    department: user?.department ?? "maintenance",
    status: "draft" as "draft" | "submitted",
    sharedInfo: "",
    orderInfo: "",
    isShared: false,
  });

  const [tasks, setTasks] = useState<TaskForm[]>([
    { vehicleNumber: "", taskType: "", content: "", isCompleted: false },
  ]);

  const createMutation = trpc.reports.create.useMutation({
    onSuccess: (data) => {
      utils.reports.list.invalidate();
      toast.success("日報を保存しました");
      navigate(`/reports/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addTask = () => {
    setTasks((prev) => [...prev, { vehicleNumber: "", taskType: "", content: "", isCompleted: false }]);
  };

  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: keyof TaskForm, value: string | boolean) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const handleSubmit = (status: "draft" | "submitted") => {
    createMutation.mutate({
      ...formData,
      status,
      sharedInfo: formData.sharedInfo || null,
      orderInfo: formData.orderInfo || null,
      tasks: tasks
        .filter((t) => t.content.trim())
        .map((t, i) => ({
          vehicleNumber: t.vehicleNumber || null,
          taskType: t.taskType || null,
          content: t.content,
          isCompleted: t.isCompleted,
          sortOrder: i,
        })),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/reports")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">日報作成</h1>
          <p className="text-muted-foreground text-sm mt-1">本日の業務内容を記録します</p>
        </div>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="workDate">作業日</Label>
              <Input
                id="workDate"
                type="date"
                value={formData.workDate}
                onChange={(e) => setFormData((p) => ({ ...p, workDate: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="department">部署</Label>
              <select
                id="department"
                value={formData.department}
                onChange={(e) => setFormData((p) => ({ ...p, department: e.target.value }))}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="sharedInfo">共有事項</Label>
            <textarea
              id="sharedInfo"
              value={formData.sharedInfo}
              onChange={(e) => setFormData((p) => ({ ...p, sharedInfo: e.target.value }))}
              placeholder="全員に共有したい情報を入力"
              rows={3}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* 作業タスク */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">作業内容</CardTitle>
          <Button variant="outline" size="sm" onClick={addTask} className="gap-1">
            <Plus className="w-4 h-4" />
            追加
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.map((task, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">作業 {i + 1}</p>
                {tasks.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeTask(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="車番"
                  value={task.vehicleNumber}
                  onChange={(e) => updateTask(i, "vehicleNumber", e.target.value)}
                />
                <Input
                  placeholder="作業種別"
                  value={task.taskType}
                  onChange={(e) => updateTask(i, "taskType", e.target.value)}
                />
              </div>
              <textarea
                placeholder="作業内容"
                value={task.content}
                onChange={(e) => updateTask(i, "content", e.target.value)}
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.isCompleted}
                  onChange={(e) => updateTask(i, "isCompleted", e.target.checked)}
                  className="rounded"
                />
                完了
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => handleSubmit("draft")}
          disabled={createMutation.isPending}
        >
          下書き保存
        </Button>
        <Button
          className="flex-1"
          onClick={() => handleSubmit("submitted")}
          disabled={createMutation.isPending}
        >
          提出
        </Button>
      </div>
    </div>
  );
}
