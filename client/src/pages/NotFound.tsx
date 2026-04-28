import React from "react";
import { useLocation } from "wouter";
import { Button } from "../components/ui/button";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">ページが見つかりませんでした</p>
      <Button onClick={() => navigate("/")}>ホームへ戻る</Button>
    </div>
  );
}
