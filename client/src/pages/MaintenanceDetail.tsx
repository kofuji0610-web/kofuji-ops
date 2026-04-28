import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

export default function MaintenanceDetail() {
  const [, navigate] = useLocation();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/maintenance")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">整備記録詳細</h1>
      </div>
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          整備記録詳細は開発中です
        </CardContent>
      </Card>
    </div>
  );
}
