import React from "react";
import { Card, CardContent } from "../components/ui/card";

export default function PurchaseDashboard() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">購買ダッシュボード</h1>
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          購買ダッシュボードは開発中です
        </CardContent>
      </Card>
    </div>
  );
}
