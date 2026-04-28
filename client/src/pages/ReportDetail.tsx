import React from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

const DEPARTMENT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  admin: "管理",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  submitted: "提出済み",
  approved: "承認済み",
  rejected: "差し戻し",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function ReportDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const reportId = parseInt(params.id ?? "0");

  const { data, isLoading } = trpc.reports.getById.useQuery({ id: reportId });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>日報が見つかりません</p>
        <Button variant="link" onClick={() => navigate("/reports")}>一覧に戻る</Button>
      </div>
    );
  }

  const { report, user, tasks } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/reports")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">日報詳細</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date(report.workDate).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">基本情報</CardTitle>
            <Badge className={STATUS_CLASSES[report.status] ?? "bg-gray-100 text-gray-700"}>
              {STATUS_LABELS[report.status] ?? report.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">作業者</span>
            <span>{user?.displayName || user?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">部署</span>
            <span>{DEPARTMENT_LABELS[report.department] ?? report.department}</span>
          </div>
          {report.sharedInfo && (
            <div>
              <p className="text-muted-foreground mb-1">共有事項</p>
              <p className="bg-muted/50 rounded-md p-2 text-sm whitespace-pre-wrap">{report.sharedInfo}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {tasks && tasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">作業内容</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  {task.isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {(task.vehicleNumber || task.taskType) && (
                      <p className="text-xs text-muted-foreground mb-0.5">
                        {[task.vehicleNumber, task.taskType].filter(Boolean).join(" / ")}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{task.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
