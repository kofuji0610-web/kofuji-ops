import React from "react";
import { Card, CardContent } from "../components/ui/card";

export default function DroneSales() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ドローン営業</h1>
        <p className="text-muted-foreground text-sm mt-1">ドローン部門の営業管理</p>
      </div>
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          ドローン営業機能は開発中です
        </CardContent>
      </Card>
    </div>
  );
}
