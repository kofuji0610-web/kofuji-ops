import React from "react";
import { useLocation } from "wouter";
import { Plus, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function MaintenanceList() {
  const [, navigate] = useLocation();

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
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Wrench className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">整備記録はまだありません</p>
          <Button variant="link" size="sm" onClick={() => navigate("/maintenance/new")}>
            最初の記録を追加する
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
