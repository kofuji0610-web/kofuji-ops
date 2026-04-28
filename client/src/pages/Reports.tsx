import React from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

const DEPARTMENT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  warehouse: "倉庫",
  operation: "運行管理",
  admin: "管理",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  submitted: "提出済み",
  approved: "承認済み",
  rejected: "差し戻し",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function Reports() {
  const [, navigate] = useLocation();
  useAuth();

  const { data: reports, isLoading } = trpc.reports.list.useQuery({
    myOnly: true,
    limit: 50,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">業務日報</h1>
          <p className="text-muted-foreground text-sm mt-1">日報の作成・確認</p>
        </div>
        <Button onClick={() => navigate("/reports/new")} className="gap-1.5">
          <Plus className="w-4 h-4" />
          日報作成
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : !reports || reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              日報がありません
            </div>
          ) : (
            <div className="space-y-1">
              {reports.map(({ report }) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1"
                  onClick={() => navigate(`/reports/${report.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(report.workDate).toLocaleDateString("ja-JP", {
                        year: "numeric",
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
                    className={`text-xs ${STATUS_CLASS[report.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {STATUS_LABEL[report.status] ?? report.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
