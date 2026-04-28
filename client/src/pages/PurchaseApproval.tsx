import React from "react";
import { ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function PurchaseApproval() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">購買申請</h1>
        <p className="text-muted-foreground text-sm mt-1">購買申請の作成・確認ができます</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">購買申請機能は開発中です</p>
        </CardContent>
      </Card>
    </div>
  );
}
