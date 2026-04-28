import React, { useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const DEPARTMENT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  warehouse: "倉庫",
  operation: "運行管理",
  admin: "管理",
};

const ROLE_LABELS: Record<string, string> = {
  user: "一般",
  manager: "マネージャー",
  admin: "管理者",
};

export default function Profile() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">プロフィール</h1>
        <p className="text-muted-foreground text-sm mt-1">アカウント情報の確認・変更</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">アカウント情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">表示名</p>
            <p className="text-sm font-medium">{user?.displayName || user?.name || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ユーザー名</p>
            <p className="text-sm font-medium">{user?.username || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">部署</p>
            <p className="text-sm font-medium">
              {user?.department ? DEPARTMENT_LABELS[user.department] ?? user.department : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">権限</p>
            <p className="text-sm font-medium">
              {user?.role ? ROLE_LABELS[user.role] ?? user.role : "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full"
          >
            ログアウト
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
