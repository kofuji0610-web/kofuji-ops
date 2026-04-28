import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Home,
  FileText,
  Clock,
  Calendar,
  User,
  Users,
  Wrench,
  ShoppingCart,
  ChevronRight,
  Menu,
  X,
  Building2,
  PaintBucket,
  Drone,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

// ─── ナビゲーション定義 ───────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  departments?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "ホーム", path: "/", icon: Home },
  { label: "業務日報", path: "/reports", icon: FileText },
  { label: "勤怠管理", path: "/attendance", icon: Clock },
  { label: "スケジュール", path: "/schedule", icon: Calendar },
  { label: "整備記録", path: "/maintenance", icon: Wrench, departments: ["maintenance", "admin"] },
  { label: "購買申請", path: "/purchase", icon: ShoppingCart },
  { label: "塗装営業", path: "/painting-sales", icon: PaintBucket, departments: ["painting", "admin"] },
  { label: "ドローン営業", path: "/drone-sales", icon: Drone, departments: ["drone", "admin"] },
  { label: "ユーザー管理", path: "/admin/users", icon: Users, roles: ["admin"] },
];

// ─── コンポーネント ───────────────────────────────────────────────────────────

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [location, navigate] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(user.role ?? "")) return false;
    if (item.departments && !item.departments.includes(user.department ?? "")) return false;
    return true;
  });

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex flex-col h-full bg-background border-r",
        mobile ? "w-full" : "w-64"
      )}
    >
      {/* ロゴ */}
      <div className="flex items-center gap-3 px-4 py-4 border-b">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">コフジ物流</p>
          <p className="text-xs text-muted-foreground truncate">業務管理システム</p>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleNavItems.map((item) => {
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                if (mobile) setIsMobileOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3" />}
            </button>
          );
        })}
      </nav>

      {/* ユーザー情報 */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-t cursor-pointer hover:bg-muted/40"
        onClick={() => {
          navigate("/profile");
          if (mobile) setIsMobileOpen(false);
        }}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {user.displayName || user.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user.username}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* デスクトップサイドバー */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* モバイルオーバーレイ */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 z-10">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* モバイルヘッダー */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(true)}
            className="h-8 w-8"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <p className="text-sm font-semibold">コフジ物流 業務管理</p>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
