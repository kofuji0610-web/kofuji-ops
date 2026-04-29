import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Wrench, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { trpc } from "../lib/trpc";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function MaintenanceList() {
  const [, navigate] = useLocation();
  const { data: reports, isLoading } = trpc.maintenance.listReports.useQuery({});
  const [dateFilter, setDateFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");

  const workCategoryLabels: Record<string, string> = {
    legal_inspection_3month: "3カ月法定点検",
    legal_inspection_12month: "12カ月法定点検",
    vehicle_inspection: "車検",
    general_repair: "一般修理",
    scheduled_maintenance: "定期整備",
    accident_repair: "事故修理",
    roadside_repair: "路上修理",
    other: "その他",
  };

  const filteredReports = useMemo(() => {
    const date = dateFilter.trim();
    const vehicle = vehicleFilter.trim().toLowerCase();
    return (reports ?? []).filter((report) => {
      const reportDate = new Date(report.workDate).toISOString().slice(0, 10);
      const dateMatched = !date || reportDate === date;
      const vehicleMatched =
        !vehicle ||
        (report.vehicleNumber ?? "").toLowerCase().includes(vehicle) ||
        (report.vehicleType ?? "").toLowerCase().includes(vehicle);
      return dateMatched && vehicleMatched;
    });
  }, [reports, dateFilter, vehicleFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">整備記録</h1>
          <p className="text-muted-foreground text-sm mt-1">車両整備の記録を管理します</p>
        </div>
        <Button size="sm" onClick={() => navigate("/maintenance/new")} className="gap-1.5">
          <Plus className="w-4 h-4" />
          新規記録
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2"><Search className="w-3.5 h-3.5" />検索・絞り込み</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setDateFilter("");
                setVehicleFilter("");
              }}
              disabled={!dateFilter && !vehicleFilter}
            >
              フィルタをクリア
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="maintenance-date-filter">作業日</Label>
            <Input
              id="maintenance-date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="maintenance-vehicle-filter">車番・車種キーワード</Label>
            <Input
              id="maintenance-vehicle-filter"
              type="text"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              placeholder="例: 2154 / 4t"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>
      {isLoading ? (
        <Card>
          <CardContent className="py-10">
            <div className="w-6 h-6 mx-auto animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </CardContent>
        </Card>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Wrench className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">
              {(reports ?? []).length === 0 ? "整備記録はまだありません" : "条件に一致する記録がありません"}
            </p>
            {(reports ?? []).length === 0 && (
              <Button variant="link" size="sm" onClick={() => navigate("/maintenance/new")}>
                最初の記録を追加する
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredReports.map((report) => (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => navigate(`/maintenance/${report.id}`)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {report.vehicleNumber || "車番未設定"} / {report.vehicleType || "車種未設定"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1.5">
                <p>作業日: {new Date(report.workDate).toLocaleDateString("ja-JP")}</p>
                <p>入庫目的: {workCategoryLabels[report.workCategory] ?? report.workCategory}</p>
                <p>走行距離: {report.odometer ? `${report.odometer} km` : "-"}</p>
                <p>
                  作業時間: {report.workStartTime || "--:--"} 〜 {report.workEndTime || "--:--"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
