import React, { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, UserCheck, UserX } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  user: "一般",
  manager: "マネージャー",
  admin: "管理者",
};

const DEPT_LABELS: Record<string, string> = {
  maintenance: "整備",
  painting: "塗装",
  slitter: "スリッター",
  drone: "ドローン",
  warehouse: "倉庫",
  operation: "運行管理",
  admin: "管理",
};

const DEPT_OPTION_ORDER = [
  "maintenance",
  "painting",
  "slitter",
  "drone",
  "warehouse",
  "operation",
  "admin",
] as const;

function departmentsToPayload(keys: string[]): string | null {
  const ordered = DEPT_OPTION_ORDER.filter((k) => keys.includes(k));
  return ordered.length === 0 ? null : ordered.join(",");
}

function parseDepartmentsFromUser(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((k) => (DEPT_OPTION_ORDER as readonly string[]).includes(k));
}

function formatUserDepartmentsList(raw: string | null | undefined): string {
  if (!raw?.trim()) return "-";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length === 0) return "-";
  return keys.map((k) => DEPT_LABELS[k] ?? k).join("・");
}

interface UserForm {
  username: string;
  password: string;
  name: string;
  displayName: string;
  role: "user" | "manager" | "admin";
  departmentKeys: string[];
}

const DEFAULT_FORM: UserForm = {
  username: "",
  password: "",
  name: "",
  displayName: "",
  role: "user",
  departmentKeys: [],
};

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(DEFAULT_FORM);

  const { data: users, isLoading } = trpc.users.list.useQuery();

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("ユーザーを作成しました");
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("更新しました");
      setEditId(null);
      setForm(DEFAULT_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("更新しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const deptPayload = departmentsToPayload(form.departmentKeys);
    if (editId !== null) {
      updateMutation.mutate({
        id: editId,
        name: form.name,
        displayName: form.displayName || null,
        role: form.role,
        department: deptPayload,
        ...(form.password ? { password: form.password } : {}),
      });
    } else {
      createMutation.mutate({
        username: form.username,
        password: form.password,
        name: form.name,
        displayName: form.displayName || null,
        role: form.role,
        department: deptPayload,
      });
    }
  };

  const startEdit = (user: NonNullable<typeof users>[number]) => {
    setEditId(user.id);
    setForm({
      username: user.username ?? "",
      password: "",
      name: user.name,
      displayName: user.displayName ?? "",
      role: (user.role as "user" | "manager" | "admin") ?? "user",
      departmentKeys: parseDepartmentsFromUser(user.department),
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="text-muted-foreground text-sm mt-1">システムユーザーの管理</p>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm(DEFAULT_FORM); }}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          追加
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editId ? "ユーザー編集" : "新規ユーザー作成"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!editId && (
                <div>
                  <Label>ユーザー名（ログインID）</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="例: tanaka_taro"
                    className="mt-1"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>氏名</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="田中 太郎"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>表示名</Label>
                  <Input
                    value={form.displayName}
                    onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                    placeholder="田中さん"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label>権限</Label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as "user" | "manager" | "admin" }))}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="user">一般</option>
                    <option value="manager">マネージャー</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>部署</Label>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-2 rounded-md border border-input bg-background p-2">
                    {DEPT_OPTION_ORDER.map((key) => (
                      <label key={key} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={form.departmentKeys.includes(key)}
                          onChange={(e) => {
                            setForm((p) => ({
                              ...p,
                              departmentKeys: e.target.checked
                                ? [...p.departmentKeys, key]
                                : p.departmentKeys.filter((k) => k !== key),
                            }));
                          }}
                          className="rounded border-input"
                        />
                        <span>{DEPT_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label>{editId ? "新しいパスワード（変更する場合のみ）" : "パスワード"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="6文字以上"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}>
                  キャンセル
                </Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editId ? "更新" : "作成"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ユーザー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-2">
              {(users ?? []).map((user) => (
                <div key={user.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      user.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {(user.displayName || user.name).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.displayName || user.name}
                      {!user.isActive && (
                        <span className="ml-1 text-xs text-muted-foreground">（無効）</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{user.username} · {formatUserDepartmentsList(user.department)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {ROLE_LABELS[user.role ?? "user"] ?? user.role}
                  </Badge>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(user)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${user.isActive ? "text-destructive" : "text-sky-700"}`}
                      onClick={() =>
                        toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })
                      }
                    >
                      {user.isActive ? (
                        <UserX className="w-3.5 h-3.5" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
