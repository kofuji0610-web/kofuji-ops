import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Download, TrendingUp, Users, Banknote, BookOpen } from "lucide-react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

const TRAINING_COLORS: Record<string, string> = {
  "国家資格講習": "#0ea5e9",
  "NTT講習":      "#6366f1",
  "機械整備":     "#64748b",
  "打合せ":       "#94a3b8",
  "その他":       "#cbd5e1",
};
const getTrainingColor = (type: string) =>
  TRAINING_COLORS[type] ?? `hsl(${(type.charCodeAt(0) * 37) % 360}, 60%, 55%)`;

export default function DroneSales() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<"monthly" | "yearly">("monthly");

  const { data: monthly, isLoading: monthlyLoading } = trpc.droneSales.getMonthlySummary.useQuery(
    { year, month },
    { enabled: view === "monthly" }
  );
  const { data: yearly, isLoading: yearlyLoading } = trpc.droneSales.getYearlySummary.useQuery(
    { year },
    { enabled: view === "yearly" }
  );

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  const exportCSV = () => {
    if (!monthly) return;
    const rows = [
      ["日付", "担当者", "講習種別", "講習名", "受講者数", "売上金額", "結果", "備考"],
      ...monthly.details.map((d) => [
        d.workDate, d.userName, d.trainingType, d.trainingName,
        d.attendeeCount, d.salesAmount, d.result, d.note,
      ]),
    ];
    const csv = rows.map((r) =>
      r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ドローン売上_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxDailyBar = Math.max(...(monthly?.dailyData.map((d) => d.totalSales) ?? [1]), 1);
  const maxYearlyBar = Math.max(...(yearly?.monthly.map((m) => m.totalSales) ?? [1]), 1);

  return (
    <div className="space-y-5 px-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-sky-600" />
            ドローン部門 売上集計
          </h1>
          <p className="text-muted-foreground text-sm mt-1">講習売上・受講者データの集計</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("monthly")}
            className={view === "monthly" ? "bg-sky-600 hover:bg-sky-700" : ""}
          >
            月次
          </Button>
          <Button
            variant={view === "yearly" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("yearly")}
            className={view === "yearly" ? "bg-sky-600 hover:bg-sky-700" : ""}
          >
            年次
          </Button>
          {view === "monthly" && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
              <Download className="w-3.5 h-3.5" />CSV
            </Button>
          )}
        </div>
      </div>

      {view === "monthly" && (
        <>
          {/* 月ナビゲーション */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-lg font-bold w-32 text-center">{year}年{month}月</span>
            <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>

          {monthlyLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
          ) : !monthly ? null : (
            <>
              {/* KPIカード */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <Banknote className="w-5 h-5 text-sky-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-sky-700">{monthly.totalSales.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">月間売上（円）</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <BookOpen className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-indigo-700">{monthly.totalLectures}</p>
                    <p className="text-xs text-muted-foreground">月間講習件数</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <Users className="w-5 h-5 text-cyan-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-cyan-700">{monthly.totalAttendees}</p>
                    <p className="text-xs text-muted-foreground">月間受講者数</p>
                  </CardContent>
                </Card>
              </div>

              {/* 日別売上グラフ */}
              {monthly.dailyData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">📅 日別売上</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-32 overflow-x-auto">
                      {monthly.dailyData.map((d) => (
                        <div key={d.date} className="flex flex-col items-center min-w-[28px]">
                          <div
                            className="w-5 rounded-t bg-sky-400 hover:bg-sky-500 transition-colors cursor-default"
                            style={{ height: `${Math.max(4, (d.totalSales / maxDailyBar) * 100)}px` }}
                            title={`${d.date}: ${d.totalSales.toLocaleString()}円`}
                          />
                          <span className="text-[9px] text-muted-foreground mt-1">{d.date.slice(8)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 講習種別内訳 */}
              {monthly.trainingData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">📊 講習種別内訳</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {monthly.trainingData.map((t) => (
                        <div key={t.trainingType} className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getTrainingColor(t.trainingType) }} />
                          <span className="text-sm w-28 shrink-0">{t.trainingType}</span>
                          <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                            <div className="h-full rounded" style={{
                              width: `${(t.totalSales / (monthly.totalSales || 1)) * 100}%`,
                              background: getTrainingColor(t.trainingType),
                            }} />
                          </div>
                          <span className="text-sm font-mono w-20 text-right">{t.totalSales.toLocaleString()}円</span>
                          <span className="text-xs text-muted-foreground w-12 text-right">{t.attendeeCount}人</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 明細テーブル */}
              {monthly.details.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">📋 講習明細</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">日付</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">担当</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">種別</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">講習名</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">受講者</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">売上</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">結果</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {monthly.details.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2">{d.workDate}</td>
                              <td className="px-3 py-2">{d.userName}</td>
                              <td className="px-3 py-2">
                                <span className="inline-block px-1.5 py-0.5 rounded text-white text-[10px]"
                                  style={{ background: getTrainingColor(d.trainingType) }}>
                                  {d.trainingType}
                                </span>
                              </td>
                              <td className="px-3 py-2 max-w-[140px] truncate">{d.trainingName}</td>
                              <td className="px-3 py-2 text-right">{d.attendeeCount}人</td>
                              <td className="px-3 py-2 text-right font-mono">{d.salesAmount.toLocaleString()}円</td>
                              <td className="px-3 py-2 max-w-[100px] truncate text-muted-foreground">{d.result}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {monthly.details.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    {year}年{month}月のデータはありません
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {view === "yearly" && (
        <>
          {/* 年ナビゲーション */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-lg font-bold w-24 text-center">{year}年</span>
            <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>

          {yearlyLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">読み込み中...</div>
          ) : !yearly ? null : (
            <>
              {/* 月別売上棒グラフ */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">📈 月別売上推移</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-40">
                    {yearly.monthly.map((m) => (
                      <div key={m.month} className="flex flex-col items-center flex-1">
                        <div
                          className="w-full rounded-t bg-sky-400 hover:bg-sky-500 cursor-pointer transition-colors"
                          style={{ height: `${Math.max(4, (m.totalSales / maxYearlyBar) * 130)}px` }}
                          onClick={() => { setMonth(m.month); setView("monthly"); }}
                          title={`${m.month}月: ${m.totalSales.toLocaleString()}円`}
                        />
                        <span className="text-[9px] text-muted-foreground mt-1">{m.month}月</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 月別サマリーテーブル */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">📋 月別サマリー</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">月</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">売上</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">講習数</th>
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">受講者</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {yearly.monthly.map((m) => (
                          <tr key={m.month} className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => { setMonth(m.month); setView("monthly"); }}>
                            <td className="px-3 py-2 font-medium">{m.month}月</td>
                            <td className="px-3 py-2 text-right font-mono">{m.totalSales.toLocaleString()}円</td>
                            <td className="px-3 py-2 text-right">{m.lectureCount}</td>
                            <td className="px-3 py-2 text-right">{m.attendeeCount}人</td>
                          </tr>
                        ))}
                        <tr className="bg-sky-50 font-bold border-t-2">
                          <td className="px-3 py-2">合計</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {yearly.monthly.reduce((s, m) => s + m.totalSales, 0).toLocaleString()}円
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yearly.monthly.reduce((s, m) => s + m.lectureCount, 0)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {yearly.monthly.reduce((s, m) => s + m.attendeeCount, 0)}人
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
