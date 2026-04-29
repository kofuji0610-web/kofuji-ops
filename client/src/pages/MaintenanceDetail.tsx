import React from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { trpc } from "../lib/trpc";

export default function MaintenanceDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const reportId = Number(params.id);
  const { data, isLoading } = trpc.maintenance.getReport.useQuery(
    { id: reportId },
    { enabled: Number.isFinite(reportId) }
  );

  const partCategoryLabels: Record<string, string> = {
    engine: "エンジン系",
    drivetrain: "動力伝達系",
    suspension: "足回り・ステアリング",
    brake: "ブレーキ系",
    electrical: "電気系",
    body: "ボディ・外装",
    other: "その他",
  };

  const conditionLabels: Record<string, string> = {
    normal: "異常なし",
    worn: "摩耗・劣化",
    damaged: "損傷・変形",
    cracked: "亀裂・破損",
    leaking: "漏れ",
    bulb_out: "球切れ",
    other: "その他",
  };

  const actionLabels: Record<string, string> = {
    inspection_only: "点検のみ",
    cleaning: "清掃・洗浄",
    adjustment: "調整",
    lubrication: "給脂・注油",
    parts_replacement: "部品交換",
    repair: "修理・加工",
    observation: "経過観察",
    other: "その他",
  };

  const conditionClass = (condition: string) =>
    condition === "normal"
      ? "bg-sky-100 text-sky-800 border-sky-300"
      : "bg-slate-100 text-slate-800 border-slate-300";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/maintenance")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">整備記録詳細</h1>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10">
            <div className="w-6 h-6 mx-auto animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            整備記録が見つかりません
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>作業日: {new Date(data.report.workDate).toLocaleDateString("ja-JP")}</p>
              <p>車番: {data.report.vehicleNumber || "-"}</p>
              <p>車種: {data.report.vehicleType || "-"}</p>
              <p>走行距離: {data.report.odometer ? `${data.report.odometer} km` : "-"}</p>
              <p>
                作業時間: {data.report.workStartTime || "--:--"} 〜 {data.report.workEndTime || "--:--"}
              </p>
              <p>事故フラグ: {data.report.isAccident ? "あり" : "なし"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">整備明細</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.details.length === 0 ? (
                <p className="text-sm text-muted-foreground">整備明細はありません</p>
              ) : (
                data.details.map((detail, idx) => (
                  <div key={detail.id} className="border rounded-md p-3 space-y-2 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">明細 {idx + 1}</p>
                      <span className="text-xs text-muted-foreground">
                        {partCategoryLabels[detail.partCategory] ?? detail.partCategory}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${conditionClass(detail.condition)}`}>
                        {conditionLabels[detail.condition] ?? detail.condition}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-100 text-blue-700 border-blue-200">
                        {actionLabels[detail.action] ?? detail.action}
                      </span>
                    </div>
                    {detail.notes && <p className="text-sm">{detail.notes}</p>}
                    {(detail.parts ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">使用部品</p>
                        <div className="space-y-1">
                          {(detail.parts ?? []).map((p) => (
                            <div key={p.id} className="text-xs text-muted-foreground">
                              {p.partName} × {p.quantity}
                              {p.unit}
                              {p.position ? `（${p.position}）` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(detail.photos ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">写真</p>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                          {(detail.photos ?? []).map((photo) => (
                            <a
                              key={photo.id}
                              href={photo.fileUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="block border rounded-md overflow-hidden bg-muted/20 hover:border-primary"
                            >
                              {photo.fileUrl ? (
                                <img
                                  src={photo.fileUrl}
                                  alt={photo.fileName ?? "整備写真"}
                                  className="w-full h-20 object-cover"
                                />
                              ) : (
                                <div className="h-20 flex items-center justify-center text-[11px] text-muted-foreground">
                                  画像未設定
                                </div>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
