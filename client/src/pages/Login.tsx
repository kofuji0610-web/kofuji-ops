import React, { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";

export default function Login() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: () => {
      navigate("/");
    },
    onError: (e) => {
      toast.error(e.message || "ログインに失敗しました");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("ユーザー名とパスワードを入力してください");
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-8 p-8 max-w-sm w-full">
        {/* ロゴ */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">コフジ物流株式会社</h1>
            <p className="text-sm text-muted-foreground mt-2">
              ログインして業務を開始してください
            </p>
          </div>
        </div>

        {/* ログインフォーム */}
        <Card className="w-full">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">ユーザー名</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ユーザー名を入力"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  autoComplete="current-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-medium"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "ログイン中..." : "IDでログイン"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Google ログイン（ローカル・未設定環境では未対応） */}
        <div className="w-full space-y-3">
          <Button
            type="button"
            variant="outline"
            disabled
            size="lg"
            className="w-full h-12 text-base font-medium"
          >
            Googleログインは現在準備中
          </Button>
        </div>
      </div>
    </div>
  );
}
