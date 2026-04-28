import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Home,
  FileText,
  Clock,
  Calendar,
  User,
  Users,
  Car,
  ShoppingCart,
  BarChart3,
  Settings,
  Building,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { toast } from "sonner";

// ─── ナビゲーション定義 ───────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path?: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "menu" | "asset" | "analytics" | "admin";
  roles?: string[];
  departments?: string[];
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "ダッシュボード", path: "/", icon: Home, group: "menu" },
  { label: "業務日報", path: "/reports", icon: FileText, group: "menu" },
  { label: "勤怠管理", path: "/attendance", icon: Clock, group: "menu" },
  { label: "スケジュール", path: "/schedule", icon: Calendar, group: "menu" },

  { label: "購買申請", path: "/purchase", icon: ShoppingCart, group: "asset" },
  { label: "車輌管理", path: "/maintenance", icon: Car, group: "asset", departments: ["maintenance", "admin"] },

  { label: "塗装売上集計", path: "/painting-sales", icon: BarChart3, group: "analytics", departments: ["painting", "admin"] },
  { label: "ドローン売上集計", path: "/drone-sales", icon: BarChart3, group: "analytics", departments: ["drone", "admin"] },

  { label: "ユーザー管理", path: "/admin/users", icon: Users, group: "admin", roles: ["admin"] },
  { label: "部署管理", icon: Building, group: "admin", roles: ["admin"], disabled: true },
  { label: "システム設定", icon: Settings, group: "admin", roles: ["admin"], disabled: true },
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

  const sectionTitles: Record<NavItem["group"], string> = {
    menu: "メニュー",
    asset: "資産管理",
    analytics: "集計",
    admin: "管理",
  };

  const navGroups: NavItem["group"][] = ["menu", "asset", "analytics", "admin"];
  const roleLabel =
    user.role === "admin" ? "管理者" : user.role === "manager" ? "マネージャー" : "一般";

  const handleNavClick = (item: NavItem, mobile: boolean) => {
    if (item.disabled || !item.path) {
      toast.info(`${item.label} は準備中です`);
      return;
    }
    navigate(item.path);
    if (mobile) setIsMobileOpen(false);
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex flex-col h-full bg-[#0a1530] text-slate-100 border-r border-[#1c2a4f]",
        mobile ? "w-full" : "w-[250px]"
      )}
    >
      {/* ロゴ */}
      <div className="px-4 py-4 border-b border-[#1c2a4f]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-white/10 border border-white/20 flex items-center justify-center shrink-0 text-[10px] font-bold tracking-wide">
            KFJ
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">コフジ物流株式会社</p>
            <p className="text-[11px] text-slate-300 truncate">京浜支店</p>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navGroups.map((group) => {
          const items = visibleNavItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-4">
              <p className="px-4 pb-1.5 text-[11px] font-semibold text-slate-400 tracking-wide">
                {sectionTitles[group]}
              </p>
              <div className="space-y-1 px-2">
                {items.map((item) => {
                  const isActive = !!item.path && location === item.path;
                  return (
                    <button
                      key={item.label}
                      onClick={() => handleNavClick(item, mobile)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg border transition-colors",
                        item.disabled
                          ? "text-slate-500 border-transparent hover:bg-white/5"
                          : isActive
                          ? "bg-[#1d3f8f] text-white border-[#3f66c8] shadow-[inset_0_0_0_1px_rgba(90,130,230,0.2)]"
                          : "text-slate-200 border-transparent hover:bg-[#182546] hover:text-white"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4 shrink-0", isActive && "text-blue-100")} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-200" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ユーザー情報 */}
      <div
        className="flex items-center gap-3 px-3 py-3 border-t border-[#1c2a4f] bg-[#091229] cursor-pointer hover:bg-[#112044]"
        onClick={() => {
          navigate("/profile");
          if (mobile) setIsMobileOpen(false);
        }}
      >
        <div className="w-8 h-8 rounded-full bg-[#1b336d] border border-[#3a5fb6] flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-slate-100" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate text-slate-100">
            {user.displayName || user.name}
          </p>
          <p className="text-xs text-slate-400 truncate">
            {user.department ?? "未設定"} ・ {roleLabel}
          </p>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-500" />
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
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <p className="text-sm font-semibold">コフジ物流株式会社</p>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
