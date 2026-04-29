import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Camera, Plus, Play, Trash2, Ruler, Wrench, CheckCircle, RotateCcw } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const DEPARTMENT_OPTIONS = [
  { value: "maintenance", label: "整備" },
  { value: "painting", label: "塗装" },
  { value: "slitter", label: "スリッター" },
  { value: "drone", label: "ドローン" },
  { value: "warehouse", label: "倉庫" },
  { value: "operation", label: "運行管理" },
  { value: "admin", label: "管理" },
];

const MAINTENANCE_CATEGORIES = [
  "エンジン系",
  "動力伝達系",
  "足回り・ステアリング",
  "ブレーキ系",
  "電気系",
  "ボディ・外装",
  "その他",
];

const MAINTENANCE_CATEGORY_ITEMS: Record<string, string[]> = {
  "エンジン系": ["エンジンオイル", "オイル漏れ", "冷却水", "ファンベルト", "エアフィルター", "異音・振動"],
  "動力伝達系": ["クラッチ", "ミッション", "プロペラシャフト", "デフ", "グリスアップ", "異音・振動"],
  "足回り・ステアリング": ["タイヤ摩耗", "タイヤローテーション", "空気圧", "ハブ・ベアリング", "グリスアップ", "ステアリング操作", "サスペンション"],
  "ブレーキ系": ["ブレーキパッド", "ブレーキライニング", "ブレーキ液", "エア漏れ", "制動力"],
  "電気系": ["バッテリー", "セルモーター", "オルタネータ", "灯火類", "配線・接触不良"],
  "ボディ・外装": ["ミラー", "ワイパー", "ガラス", "ボディ損傷", "荷台・架装"],
  "その他": ["その他点検項目1", "その他点検項目2", "その他点検項目3"],
};

const MAINTENANCE_CONDITIONS = [
  { value: "normal", label: "異常なし" },
  { value: "worn", label: "摩耗・劣化" },
  { value: "damaged", label: "損傷・変形" },
  { value: "cracked", label: "亀裂・破損" },
  { value: "leaking", label: "漏れ" },
  { value: "bulb_out", label: "球切れ" },
  { value: "other", label: "その他" },
] as const;

const MAINTENANCE_ACTIONS = [
  { value: "inspection_only", label: "点検のみ" },
  { value: "cleaning", label: "清掃・洗浄" },
  { value: "adjustment", label: "調整" },
  { value: "lubrication", label: "給脂・注油" },
  { value: "parts_replacement", label: "部品交換" },
  { value: "repair", label: "修理・加工" },
  { value: "observation", label: "経過観察" },
  { value: "other", label: "その他" },
] as const;

// 点検項目ごとの関連する状態・処置オプション（整備士監修）
const ITEM_CONDITION_MAP: Record<string, readonly string[]> = {
  "エンジンオイル":       ["normal","worn","leaking","other"],
  "オイル漏れ":           ["normal","leaking","other"],
  "冷却水":               ["normal","worn","leaking","other"],
  "ファンベルト":         ["normal","worn","cracked","damaged"],
  "エアフィルター":       ["normal","worn","other"],
  "異音・振動":           ["normal","other"],
  "タイヤ摩耗":           ["normal","worn","damaged","cracked"],
  "空気圧":               ["normal","other"],
  "ハブ・ベアリング":     ["normal","worn","damaged"],
  "ステアリング操作":     ["normal","other"],
  "サスペンション":       ["normal","damaged","leaking","other"],
  "クラッチ":             ["normal","worn","other"],
  "ミッション":           ["normal","worn","leaking","other"],
  "プロペラシャフト":     ["normal","damaged","other"],
  "デフ":                 ["normal","worn","leaking","other"],
  "ブレーキパッド":       ["normal","worn","damaged"],
  "ブレーキライニング":   ["normal","worn","damaged"],
  "ブレーキ液":           ["normal","worn","leaking","other"],
  "エア漏れ":             ["normal","leaking","other"],
  "制動力":               ["normal","other"],
  "バッテリー":           ["normal","worn","other"],
  "灯火類":               ["normal","bulb_out","damaged"],
  "ボディ損傷":           ["normal","damaged","cracked","other"],
  "グリスアップ":         ["normal","worn","other"],
  "タイヤローテーション": ["normal","other"],
  "ミラー":               ["normal","damaged","other"],
  "ワイパー":             ["normal","worn","damaged","other"],
  "ガラス":               ["normal","damaged","cracked","other"],
  "荷台・架装":           ["normal","damaged","other"],
  "セルモーター":         ["normal","damaged","other"],
  "オルタネータ":         ["normal","worn","damaged","other"],
  "配線・接触不良":       ["normal","damaged","other"],
};

const ITEM_ACTION_MAP: Record<string, readonly string[]> = {
  "エンジンオイル":       ["inspection_only","parts_replacement","observation"],
  "オイル漏れ":           ["inspection_only","repair","observation"],
  "冷却水":               ["inspection_only","parts_replacement","observation"],
  "ファンベルト":         ["inspection_only","adjustment","parts_replacement"],
  "エアフィルター":       ["inspection_only","cleaning","parts_replacement"],
  "異音・振動":           ["inspection_only","repair","observation"],
  "タイヤ摩耗":           ["inspection_only","parts_replacement","adjustment"],
  "空気圧":               ["inspection_only","adjustment"],
  "ハブ・ベアリング":     ["inspection_only","lubrication","parts_replacement"],
  "ステアリング操作":     ["inspection_only","adjustment","repair"],
  "サスペンション":       ["inspection_only","repair","parts_replacement"],
  "クラッチ":             ["inspection_only","adjustment","parts_replacement"],
  "ミッション":           ["inspection_only","repair","observation"],
  "プロペラシャフト":     ["inspection_only","lubrication","repair"],
  "デフ":                 ["inspection_only","parts_replacement","observation"],
  "ブレーキパッド":       ["inspection_only","parts_replacement"],
  "ブレーキライニング":   ["inspection_only","parts_replacement"],
  "ブレーキ液":           ["inspection_only","parts_replacement"],
  "エア漏れ":             ["inspection_only","repair","observation"],
  "制動力":               ["inspection_only","adjustment","repair"],
  "バッテリー":           ["inspection_only","parts_replacement","observation"],
  "灯火類":               ["inspection_only","parts_replacement"],
  "ボディ損傷":           ["inspection_only","repair","observation"],
  "グリスアップ":         ["lubrication","inspection_only"],
  "タイヤローテーション": ["adjustment","inspection_only"],
  "ミラー":               ["inspection_only","parts_replacement","repair"],
  "ワイパー":             ["inspection_only","parts_replacement"],
  "ガラス":               ["inspection_only","repair","parts_replacement"],
  "荷台・架装":           ["inspection_only","repair","observation"],
  "セルモーター":         ["inspection_only","repair","parts_replacement"],
  "オルタネータ":         ["inspection_only","repair","parts_replacement","observation"],
  "配線・接触不良":       ["inspection_only","repair","observation"],
};

const MAINTENANCE_CATEGORY_TO_ENUM: Record<string, "engine" | "drivetrain" | "suspension" | "brake" | "electrical" | "body" | "other"> = {
  "エンジン系": "engine",
  "動力伝達系": "drivetrain",
  "足回り・ステアリング": "suspension",
  "ブレーキ系": "brake",
  "電気系": "electrical",
  "ボディ・外装": "body",
  "その他": "other",
};

const MAINTENANCE_ENUM_TO_CATEGORY_LABEL: Record<
  "engine" | "drivetrain" | "suspension" | "brake" | "electrical" | "body" | "other",
  string
> = {
  engine: "エンジン系",
  drivetrain: "動力伝達系",
  suspension: "足回り・ステアリング",
  brake: "ブレーキ系",
  electrical: "電気系",
  body: "ボディ・外装",
  other: "その他",
};

const MAINTENANCE_ENUM_TO_PURPOSE_LABEL: Record<
  | "legal_inspection_3month"
  | "legal_inspection_12month"
  | "vehicle_inspection"
  | "general_repair"
  | "scheduled_maintenance"
  | "accident_repair"
  | "roadside_repair"
  | "other",
  string
> = {
  legal_inspection_3month: "3カ月法定点検",
  legal_inspection_12month: "12カ月法定点検",
  vehicle_inspection: "車検整備",
  general_repair: "一般修理",
  scheduled_maintenance: "定期整備",
  accident_repair: "事故修理",
  roadside_repair: "路上修理（緊急）",
  other: "その他",
};

const PART_MASTER_CATEGORY_OPTIONS = [
  { value: "oil_fluid", label: "油脂類" },
  { value: "consumable", label: "消耗品" },
  { value: "misc", label: "雑材" },
  { value: "repair_work", label: "修理作業" },
  { value: "exterior", label: "外注" },
] as const;

// 拠点・車番
const VEHICLE_BASE_OPTIONS = ["関東", "本社", "東大阪", "名古屋", "静岡"] as const;
const VEHICLE_BASE_DEFAULT = "関東";
const VEHICLE_NUMBER_PREFIX_OPTIONS = ["大宮", "大阪", "一宮", "静岡"] as const;
const VEHICLE_NUMBER_PREFIX_DEFAULT = "大宮";

// 車種
const VEHICLE_TYPE_OPTIONS = [
  { value: "2t", label: "2t" },
  { value: "4t", label: "4t" },
  { value: "8t", label: "8t" },
  { value: "10t", label: "10t" },
  { value: "trailer_head", label: "トレーラーヘッド" },
  { value: "chassis", label: "シャーシ" },
  { value: "other", label: "その他" },
] as const;

// 入庫目的グループ
const MAINTENANCE_PURPOSE_GROUPS = [
  {
    label: "法定点検",
    items: ["3カ月法定点検", "6カ月法定点検", "12カ月法定点検", "車検整備"],
  },
  {
    label: "定期メンテナンス",
    items: [
      "定期オイルフィルター交換",
      "定期タイヤ交換・ローテーション",
      "定期ブレーキ点検・調整",
      "クーラント交換",
      "エアフィルター交換",
      "バッテリー点検・交換",
      "ベルト類点検・交換",
    ],
  },
  {
    label: "修理・緊急対応",
    items: ["一般修理", "事故修理", "路上修理（緊急）", "部品交換（故障）"],
  },
  {
    label: "その他",
    items: ["その他"],
  },
] as const;

const MAINTENANCE_PURPOSES: string[] = MAINTENANCE_PURPOSE_GROUPS.flatMap((g) => [...g.items]);

// 入庫目的 → enum マッピング
const MAINTENANCE_PURPOSE_TO_ENUM: Record<
  string,
  | "legal_inspection_3month"
  | "legal_inspection_12month"
  | "vehicle_inspection"
  | "general_repair"
  | "scheduled_maintenance"
  | "accident_repair"
  | "roadside_repair"
  | "other"
> = {
  "3カ月法定点検": "legal_inspection_3month",
  "6カ月法定点検": "legal_inspection_3month",
  "12カ月法定点検": "legal_inspection_12month",
  "車検整備": "vehicle_inspection",
  "定期オイルフィルター交換": "scheduled_maintenance",
  "定期タイヤ交換・ローテーション": "scheduled_maintenance",
  "定期ブレーキ点検・調整": "scheduled_maintenance",
  "クーラント交換": "scheduled_maintenance",
  "エアフィルター交換": "scheduled_maintenance",
  "バッテリー点検・交換": "scheduled_maintenance",
  "ベルト類点検・交換": "scheduled_maintenance",
  "一般修理": "general_repair",
  "事故修理": "accident_repair",
  "路上修理（緊急）": "roadside_repair",
  "部品交換（故障）": "general_repair",
  "その他": "other",
};

// タイヤ位置
const TIRE_POSITIONS = ["FL", "FR", "RL-内", "RL-外", "RR-内", "RR-外", "スペア", "全輪"] as const;
const TIRE_PART_NAMES = ["タイヤ", "ブレーキパッド", "ブレーキライニング", "ハブベアリング"];

// 点検項目ごとの部品サジェスト
const INSPECTION_ITEM_PART_SUGGESTIONS: Record<
  string,
  { masterCategory: "oil_fluid" | "consumable" | "misc" | "repair_work" | "exterior"; partName: string; unit: string }[]
> = {
  "エンジンオイル": [
    { masterCategory: "oil_fluid", partName: "エンジンオイル", unit: "L" },
    { masterCategory: "consumable", partName: "オイルフィルター", unit: "個" },
  ],
  "オイル漏れ": [{ masterCategory: "repair_work", partName: "オイルシール", unit: "個" }],
  "冷却水": [{ masterCategory: "oil_fluid", partName: "LLC（クーラント）", unit: "L" }],
  "ファンベルト": [{ masterCategory: "consumable", partName: "ファンベルト", unit: "本" }],
  "クラッチ": [{ masterCategory: "consumable", partName: "クラッチディスク", unit: "枚" }],
  "タイヤ摩耗": [{ masterCategory: "consumable", partName: "タイヤ", unit: "本" }],
  "空気圧": [],
  "ブレーキパッド": [{ masterCategory: "consumable", partName: "ブレーキパッド", unit: "枚" }],
  "ブレーキライニング": [{ masterCategory: "consumable", partName: "ブレーキライニング", unit: "枚" }],
  "ブレーキ液": [{ masterCategory: "oil_fluid", partName: "ブレーキフルード", unit: "L" }],
  "バッテリー": [
    { masterCategory: "consumable", partName: "バッテリー", unit: "個" },
    { masterCategory: "oil_fluid", partName: "バッテリー補充液", unit: "L" },
  ],
  "灯火類": [{ masterCategory: "consumable", partName: "バルブ", unit: "個" }],
  "エアフィルター": [{ masterCategory: "consumable", partName: "エアフィルター", unit: "個" }],
  "ボディ損傷": [{ masterCategory: "exterior", partName: "板金・塗装", unit: "式" }],
  "グリスアップ": [{ masterCategory: "oil_fluid", partName: "グリス", unit: "g" }],
  "タイヤローテーション": [],
};

// 点検項目ごとの測定値定義
const INSPECTION_ITEM_MEASUREMENTS: Record<string, { label: string; unit: string }> = {
  "ブレーキパッド": { label: "残厚", unit: "mm" },
  "ブレーキライニング": { label: "残厚", unit: "mm" },
  "タイヤ摩耗": { label: "残溝", unit: "mm" },
  "空気圧": { label: "空気圧", unit: "kPa" },
  "バッテリー": { label: "電圧", unit: "V" },
};

// 点検項目ごとのデフォルト状態
const INSPECTION_ITEM_CONDITION: Record<
  string,
  "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other"
> = {
  "エンジンオイル": "normal",
  "オイル漏れ": "leaking",
  "冷却水": "normal",
  "タイヤ摩耗": "worn",
  "ブレーキパッド": "worn",
  "ブレーキライニング": "worn",
  "ボディ損傷": "damaged",
  "灯火類": "bulb_out",
};

const CONDITION_SEVERITY: Record<string, number> = {
  normal: 0,
  worn: 1,
  damaged: 2,
  cracked: 2,
  leaking: 3,
  bulb_out: 1,
  other: 1,
};

// 入庫目的ごとのデフォルト整備明細設定
const PURPOSE_DETAIL_DEFAULTS: Record<
  string,
  {
    noIssue: boolean;
    category?: string;
    detailInspectionItems?: string[];
    condition?: "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other";
    action?: "inspection_only" | "cleaning" | "adjustment" | "lubrication" | "parts_replacement" | "repair" | "observation" | "other";
    emergency?: boolean;
    requiresAttention?: boolean;
  }
> = {
  "3カ月法定点検": { noIssue: true, condition: "normal", action: "inspection_only" },
  "6カ月法定点検": { noIssue: true, condition: "normal", action: "inspection_only" },
  "12カ月法定点検": { noIssue: true, condition: "normal", action: "inspection_only" },
  "車検整備": { noIssue: true, condition: "normal", action: "inspection_only" },
  "定期オイルフィルター交換": { noIssue: false, category: "エンジン系", detailInspectionItems: ["エンジンオイル"], condition: "normal", action: "parts_replacement" },
  "定期タイヤ交換・ローテーション": { noIssue: false, category: "足回り・ステアリング", detailInspectionItems: ["タイヤ摩耗"], condition: "worn", action: "parts_replacement" },
  "定期ブレーキ点検・調整": { noIssue: false, category: "ブレーキ系", detailInspectionItems: ["ブレーキパッド"], condition: "worn", action: "adjustment" },
  "クーラント交換": { noIssue: false, category: "エンジン系", detailInspectionItems: ["冷却水"], condition: "normal", action: "parts_replacement" },
  "エアフィルター交換": { noIssue: false, category: "エンジン系", detailInspectionItems: ["エアフィルター"], condition: "worn", action: "parts_replacement" },
  "バッテリー点検・交換": { noIssue: false, category: "電気系", detailInspectionItems: ["バッテリー"], condition: "worn", action: "parts_replacement" },
  "ベルト類点検・交換": { noIssue: false, category: "エンジン系", detailInspectionItems: ["ファンベルト"], condition: "worn", action: "parts_replacement" },
  "一般修理": { noIssue: false, condition: "damaged", action: "repair" },
  "事故修理": { noIssue: false, condition: "damaged", action: "repair", emergency: true },
  "路上修理（緊急）": { noIssue: false, condition: "damaged", action: "repair", emergency: true, requiresAttention: true },
  "部品交換（故障）": { noIssue: false, condition: "damaged", action: "parts_replacement" },
};

const OVERALL_JUDGMENT_OPTIONS = [
  { value: "good" as const, label: "良好", activeClass: "bg-emerald-500 text-white border-emerald-500", inactiveClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
  { value: "caution" as const, label: "要注意", activeClass: "bg-yellow-400 text-white border-yellow-400", inactiveClass: "border-yellow-200 text-yellow-700 hover:bg-yellow-50" },
  { value: "next_service" as const, label: "次回要整備", activeClass: "bg-orange-500 text-white border-orange-500", inactiveClass: "border-orange-200 text-orange-700 hover:bg-orange-50" },
  { value: "no_drive" as const, label: "運行不可", activeClass: "bg-red-600 text-white border-red-600", inactiveClass: "border-red-200 text-red-700 hover:bg-red-50" },
];

interface TaskForm {
  vehicleNumber: string;
  taskType: string;
  content: string;
  isCompleted: boolean;
}

interface WorkBlockForm {
  department: string;
  start: string;
  end: string;
}

interface MaintenanceDetailForm {
  category: string;
  categoryOther: string;
  inspectionItems: string[];
  inspectionItemOther: string;
  note: string;
  noIssue: boolean;
  noIssueItems: string[];
  itemDetails: Record<string, { condition: MaintenanceDetailForm["condition"]; action: MaintenanceDetailForm["action"] }>;
  requiresAttention: boolean;
  measurements: Record<string, string>;
  condition: "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other";
  action: "inspection_only" | "cleaning" | "adjustment" | "lubrication" | "parts_replacement" | "repair" | "observation" | "other";
  parts: {
    masterCategory: "oil_fluid" | "consumable" | "misc" | "repair_work" | "exterior";
    partName: string;
    quantity: string;
    unit: string;
    position: string;
    linkedItem?: string;
  }[];
  photos: {
    fileName: string;
    fileType: string;
    fileBase64: string;
  }[];
}

interface MaintenanceVehicleForm {
  vehicleType: string;
  vehicleTypeOther: string;
  vehicleBase: string;
  vehicleNumberPrefix: string;
  vehicleName: string;
  purpose: string;
  purposeOther: string;
  mileageKm: string;
  workStart: string;
  workEnd: string;
  emergency: boolean;
  overallJudgment: "" | "good" | "caution" | "next_service" | "no_drive";
  completionChecks: {
    engineStart: boolean;
    testDrive: boolean;
    noLeaks: boolean;
    lights: boolean;
  };
  outsourceVendor: string;
  outsourceStatus: "" | "pending" | "completed";
  details: MaintenanceDetailForm[];
}

interface ReportDraftSnapshot {
  formData: ReturnType<typeof initialFormData>;
  tasks: TaskForm[];
  workBlocks: WorkBlockForm[];
  maintenanceVehicles: MaintenanceVehicleForm[];
  maintenanceMemo: string;
}

const initialFormData = (today: string, department?: string) => ({
  workDate: today,
  department: department ?? "maintenance",
  status: "draft" as "draft" | "submitted",
  sharedInfo: "",
  orderInfo: "",
  isShared: false,
  breakStart: "12:00",
  breakEnd: "13:00",
});

const emptyDetail = (): MaintenanceDetailForm => ({
  category: "",
  categoryOther: "",
  inspectionItems: [],
  inspectionItemOther: "",
  note: "",
  noIssue: true,
  noIssueItems: [],
  itemDetails: {},
  requiresAttention: false,
  measurements: {},
  condition: "normal",
  action: "inspection_only",
  parts: [],
  photos: [],
});

const emptyVehicle = (): MaintenanceVehicleForm => ({
  vehicleType: "",
  vehicleTypeOther: "",
  vehicleBase: VEHICLE_BASE_DEFAULT,
  vehicleNumberPrefix: VEHICLE_NUMBER_PREFIX_DEFAULT,
  vehicleName: "",
  purpose: "",
  purposeOther: "",
  mileageKm: "",
  workStart: "",
  workEnd: "",
  emergency: false,
  overallJudgment: "",
  completionChecks: { engineStart: false, testDrive: false, noLeaks: false, lights: false },
  outsourceVendor: "",
  outsourceStatus: "",
  details: [emptyDetail()],
});

const calcWorkDuration = (start: string, end: string): string => {
  if (!start || !end) return "--";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const total = eh * 60 + em - (sh * 60 + sm);
  if (total <= 0) return "--";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
};

const getAutoConditionForItems = (
  inspectionItems: string[]
): "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other" | null => {
  let worst: "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other" | null = null;
  let worstSev = -1;
  for (const item of inspectionItems) {
    const cond = INSPECTION_ITEM_CONDITION[item];
    if (cond && (CONDITION_SEVERITY[cond] ?? 0) > worstSev) {
      worstSev = CONDITION_SEVERITY[cond] ?? 0;
      worst = cond;
    }
  }
  return worst;
};

export default function ReportNew() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isMaintenanceFlow = location.startsWith("/maintenance");

  const today = new Date().toISOString().split("T")[0];

  const [formData, setFormData] = useState(
    initialFormData(today, isMaintenanceFlow ? "maintenance" : user?.department ?? undefined)
  );

  const [tasks, setTasks] = useState<TaskForm[]>([
    { vehicleNumber: "", taskType: "", content: "", isCompleted: false },
  ]);
  const [workBlocks, setWorkBlocks] = useState<WorkBlockForm[]>([
    { department: user?.department ?? "maintenance", start: "08:00", end: "17:00" },
  ]);
  const [maintenanceVehicles, setMaintenanceVehicles] = useState<MaintenanceVehicleForm[]>([
    emptyVehicle(),
  ]);
  const [maintenanceMemo, setMaintenanceMemo] = useState("");
  const draftStorageKey = user?.id ? `reportNewDraft:${user.id}` : null;

  const monthStart = useMemo(() => {
    const d = new Date(formData.workDate);
    d.setDate(1);
    return d.toISOString().split("T")[0];
  }, [formData.workDate]);

  const { data: thisMonthReports } = trpc.reports.list.useQuery({
    myOnly: true,
    startDate: monthStart,
    endDate: formData.workDate,
    limit: 200,
  });
  const { data: lastMaintenanceReport, isFetching: isLoadingLastMaintenance } =
    trpc.maintenance.getLastReport.useQuery(undefined, {
      enabled: formData.department === "maintenance" || isMaintenanceFlow,
    });

  const thisMonthMaintenanceCount = useMemo(
    () => (thisMonthReports ?? []).filter((r) => r.report.department === "maintenance").length,
    [thisMonthReports]
  );

  const applyLastMaintenanceReport = async () => {
    if (!lastMaintenanceReport) {
      toast.error("前回の整備日報が見つかりません");
      return;
    }
    try {
      const report = lastMaintenanceReport.report;
      const vehicles: MaintenanceVehicleForm[] = [
        {
          vehicleType: report.vehicleType ?? "",
          vehicleTypeOther: "",
          vehicleBase: VEHICLE_BASE_DEFAULT,
          vehicleNumberPrefix: VEHICLE_NUMBER_PREFIX_DEFAULT,
          vehicleName: report.vehicleNumber ?? "",
          purpose: MAINTENANCE_ENUM_TO_PURPOSE_LABEL[report.workCategory] ?? "その他",
          purposeOther: "",
          mileageKm: report.odometer ? String(report.odometer) : "",
          workStart: "",
          workEnd: "",
          emergency: Boolean(report.isAccident),
          overallJudgment: "",
          completionChecks: { engineStart: false, testDrive: false, noLeaks: false, lights: false },
          outsourceVendor: "",
          outsourceStatus: "",
          details: (lastMaintenanceReport.details ?? []).map((detail) => ({
            category: MAINTENANCE_ENUM_TO_CATEGORY_LABEL[detail.partCategory] ?? "その他",
            categoryOther: "",
            inspectionItems: [],
            inspectionItemOther: "",
            note: detail.notes ?? detail.actionNote ?? detail.conditionNote ?? "",
            noIssue: detail.condition === "normal" && detail.action === "inspection_only",
            noIssueItems: [],
            itemDetails: {},
            requiresAttention: false,
            measurements: {},
            condition: detail.condition,
            action: detail.action,
            parts: (detail.parts ?? []).map((p) => ({
              masterCategory: p.masterCategory,
              partName: p.partName ?? "",
              quantity: String(p.quantity ?? 1),
              unit: p.unit ?? "個",
              position: p.position ?? "",
            })),
            photos: [],
          })),
        },
      ];

      setMaintenanceVehicles(
        vehicles[0].details.length > 0
          ? vehicles
          : [{ ...vehicles[0], details: [emptyDetail()] }]
      );
      setWorkBlocks([
        {
          department: "maintenance",
          start: report.workStartTime ?? "08:00",
          end: report.workEndTime ?? "17:00",
        },
      ]);
      setMaintenanceMemo(report.notes ?? "");
      toast.success("前回の整備日報を反映しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "前回日報の反映に失敗しました");
    }
  };

  const createMutation = trpc.reports.create.useMutation({
    onSuccess: (data) => {
      if (draftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      utils.reports.list.invalidate();
      toast.success("日報を保存しました");
      navigate(`/reports/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const createMaintenanceReportMutation = trpc.maintenance.createReport.useMutation();
  const addMaintenanceDetailMutation = trpc.maintenance.addDetail.useMutation();
  const addMaintenancePartMutation = trpc.maintenance.addPart.useMutation();
  const uploadMaintenancePhotoMutation = trpc.maintenance.uploadPhoto.useMutation();

  const addTask = () => {
    setTasks((prev) => [...prev, { vehicleNumber: "", taskType: "", content: "", isCompleted: false }]);
  };

  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: keyof TaskForm, value: string | boolean) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const updateWorkBlock = (index: number, field: keyof WorkBlockForm, value: string) => {
    setWorkBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
    if (index === 0 && field === "department") {
      setFormData((p) => ({ ...p, department: value }));
    }
  };

  const addWorkBlock = () => {
    setWorkBlocks((prev) => [...prev, { department: "maintenance", start: "", end: "" }]);
  };

  const removeWorkBlock = (index: number) => {
    setWorkBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVehicle = (
    index: number,
    field: keyof MaintenanceVehicleForm,
    value: string | boolean | MaintenanceVehicleForm["completionChecks"]
  ) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) => (i === index ? ({ ...v, [field]: value } as MaintenanceVehicleForm) : v))
    );
  };

  const addVehicle = () => {
    setMaintenanceVehicles((prev) => [...prev, emptyVehicle()]);
  };

  const removeVehicle = (index: number) => {
    setMaintenanceVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVehicleDetail = (
    vehicleIndex: number,
    detailIndex: number,
    field: keyof MaintenanceDetailForm,
    value: string | boolean | string[] | Record<string, string>
  ) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === detailIndex ? ({ ...d, [field]: value } as MaintenanceDetailForm) : d
              ),
            }
          : v
      )
    );
  };

  const addVehicleDetail = (vehicleIndex: number) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: [
                ...v.details,
                {
                  category: "",
                  categoryOther: "",
                  inspectionItems: [],
                  inspectionItemOther: "",
                  note: "",
                  noIssue: false,
                  noIssueItems: [],
                  itemDetails: {},
                  requiresAttention: false,
                  measurements: {},
                  condition: "other" as const,
                  action: "repair" as const,
                  parts: [],
                  photos: [],
                },
              ],
            }
          : v
      )
    );
  };

  const removeVehicleDetail = (vehicleIndex: number, detailIndex: number) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? { ...v, details: v.details.filter((_, j) => j !== detailIndex) }
          : v
      )
    );
  };

  const addDetailPart = (vehicleIndex: number, detailIndex: number) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === detailIndex
                  ? {
                      ...d,
                      parts: [
                        ...(d.parts ?? []),
                        { masterCategory: "consumable" as const, partName: "", quantity: "1", unit: "個", position: "" },
                      ],
                    }
                  : d
              ),
            }
          : v
      )
    );
  };

  const updateDetailPart = (
    vehicleIndex: number,
    detailIndex: number,
    partIndex: number,
    field: "masterCategory" | "partName" | "quantity" | "unit" | "position",
    value: string
  ) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === detailIndex
                  ? {
                      ...d,
                      parts: (d.parts ?? []).map((p, k) => (k === partIndex ? { ...p, [field]: value } : p)),
                    }
                  : d
              ),
            }
          : v
      )
    );
  };

  const removeDetailPart = (vehicleIndex: number, detailIndex: number, partIndex: number) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === detailIndex ? { ...d, parts: (d.parts ?? []).filter((_, k) => k !== partIndex) } : d
              ),
            }
          : v
      )
    );
  };

  const removeDetailPhoto = (vehicleIndex: number, detailIndex: number, photoIndex: number) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === detailIndex ? { ...d, photos: (d.photos ?? []).filter((_, k) => k !== photoIndex) } : d
              ),
            }
          : v
      )
    );
  };

  const handleSelectDetailPhoto = (vehicleIndex: number, detailIndex: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const maxSize = 1 * 1024 * 1024;
    const maxPerDetail = 3;
    const maxPerSelect = 2;
    const currentPhotoCount = maintenanceVehicles[vehicleIndex]?.details?.[detailIndex]?.photos?.length ?? 0;
    const remainSlots = Math.max(0, maxPerDetail - currentPhotoCount);
    if (remainSlots === 0) {
      toast.error("写真は明細ごとに最大3枚までです");
      return;
    }
    const files = Array.from(fileList).slice(0, Math.min(maxPerSelect, remainSlots));
    const readJobs = files.map(
      (file) =>
        new Promise<{ fileName: string; fileType: string; fileBase64: string }>((resolve, reject) => {
          if (!file.type.startsWith("image/")) {
            reject(new Error(`${file.name} は画像ファイルのみ添付できます`));
            return;
          }
          if (file.size > maxSize) {
            reject(new Error(`${file.name} は1MB以下にしてください`));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve({ fileName: file.name, fileType: file.type || "application/octet-stream", fileBase64: base64 });
          };
          reader.onerror = () => reject(new Error(`${file.name} の読み込みに失敗しました`));
          reader.readAsDataURL(file);
        })
    );

    Promise.all(readJobs)
      .then((photos) => {
        setMaintenanceVehicles((prev) =>
          prev.map((v, i) =>
            i === vehicleIndex
              ? {
                  ...v,
                  details: v.details.map((d, j) =>
                    j === detailIndex ? { ...d, photos: [...(d.photos ?? []), ...photos].slice(0, maxPerDetail) } : d
                  ),
                }
              : v
          )
        );
      })
      .catch((e: Error) => toast.error(e.message));
  };

  const syncSuggestedPartsByInspectionItems = (vi: number, di: number, inspectionItems: string[]) => {
    const allSuggestions = inspectionItems.flatMap((item) =>
      (INSPECTION_ITEM_PART_SUGGESTIONS[item] ?? []).map((s) => ({ ...s, linkedItem: item }))
    );
    const seen = new Set<string>();
    const parts = allSuggestions
      .filter((s) => {
        if (seen.has(s.partName)) return false;
        seen.add(s.partName);
        return true;
      })
      .map((s) => ({
        masterCategory: s.masterCategory,
        partName: s.partName,
        quantity: "1",
        unit: s.unit,
        position: "",
        linkedItem: s.linkedItem,
      }));

    const autoCondition = getAutoConditionForItems(inspectionItems);

    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vi
          ? {
              ...v,
              details: v.details.map((d, j) =>
                j === di
                  ? {
                      ...d,
                      inspectionItems,
                      noIssue: inspectionItems.length > 0 ? false : d.noIssue,
                      parts: parts.length > 0
                        ? [
                            ...parts,
                            // preserve manually added parts (no linkedItem)
                            ...d.parts.filter((p) => !p.linkedItem),
                          ]
                        : d.parts,
                      condition: autoCondition !== null ? autoCondition : d.condition,
                    }
                  : d
              ),
            }
          : v
      )
    );
  };

  const selectPurposeWithDefaults = (vi: number, purpose: string) => {
    const defaults = PURPOSE_DETAIL_DEFAULTS[purpose];
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) => {
        if (i !== vi) return v;
        const updatedVehicle: MaintenanceVehicleForm = {
          ...v,
          purpose,
          emergency: defaults?.emergency ?? v.emergency,
        };
        if (defaults) {
          updatedVehicle.details = v.details.map((d) => ({
            ...d,
            noIssue: defaults.noIssue,
            condition: defaults.condition ?? d.condition,
            action: defaults.action ?? d.action,
            ...(defaults.category ? { category: defaults.category } : {}),
            ...(defaults.detailInspectionItems ? { inspectionItems: [...defaults.detailInspectionItems] } : {}),
            ...(defaults.requiresAttention !== undefined ? { requiresAttention: defaults.requiresAttention } : {}),
          }));
        }
        return updatedVehicle;
      })
    );
  };

  const validateBeforeSubmit = (): string | null => {
    if (!formData.workDate) return "作業日を入力してください";
    if (!formData.department) return "部署を選択してください";

    if (formData.department === "maintenance" || isMaintenanceFlow) {
      if (maintenanceVehicles.length === 0) return "車両を1件以上追加してください";

      const firstInvalidVehicle = maintenanceVehicles.findIndex(
        (v) => !v.vehicleType || !v.vehicleName.trim() || !v.purpose
      );
      if (firstInvalidVehicle >= 0) {
        return `車両 ${firstInvalidVehicle + 1} の必須項目（車種・車番車名・入庫目的）を入力してください`;
      }

      const hasNoDetail = maintenanceVehicles.some((v) => (v.details ?? []).length === 0);
      if (hasNoDetail) {
        return "各車両に整備明細を1件以上追加してください";
      }

      const hasTooManyPhotos = maintenanceVehicles.some((v) =>
        (v.details ?? []).some((d) => (d.photos ?? []).length > 3)
      );
      if (hasTooManyPhotos) {
        return "写真は整備明細ごとに3枚までです";
      }

      const hasOversizePhoto = maintenanceVehicles.some((v) =>
        (v.details ?? []).some((d) => (d.photos ?? []).some((p) => p.fileBase64.length > 1_400_000))
      );
      if (hasOversizePhoto) {
        return "1MBを超える写真は添付できません";
      }

    } else {
      const hasTaskContent = tasks.some((t) => t.content.trim());
      if (!hasTaskContent) return "作業内容を1件以上入力してください";
    }

    return null;
  };

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as Partial<ReportDraftSnapshot>;
      if (snapshot.formData) setFormData(snapshot.formData);
      if (snapshot.tasks) setTasks(snapshot.tasks);
      if (snapshot.workBlocks) setWorkBlocks(snapshot.workBlocks);
      if (snapshot.maintenanceVehicles) {
        setMaintenanceVehicles(
          snapshot.maintenanceVehicles.map((v) => ({
            vehicleType: v.vehicleType ?? "",
            vehicleTypeOther: v.vehicleTypeOther ?? "",
            vehicleBase: v.vehicleBase ?? VEHICLE_BASE_DEFAULT,
            vehicleNumberPrefix: v.vehicleNumberPrefix ?? VEHICLE_NUMBER_PREFIX_DEFAULT,
            vehicleName: v.vehicleName ?? "",
            purpose: v.purpose ?? "",
            purposeOther: v.purposeOther ?? "",
            mileageKm: v.mileageKm ?? "",
            workStart: v.workStart ?? "",
            workEnd: v.workEnd ?? "",
            emergency: v.emergency ?? false,
            overallJudgment: v.overallJudgment ?? "",
            completionChecks: v.completionChecks ?? {
              engineStart: false,
              testDrive: false,
              noLeaks: false,
              lights: false,
            },
            outsourceVendor: v.outsourceVendor ?? "",
            outsourceStatus: v.outsourceStatus ?? "",
            details: (v.details ?? []).map((d) => ({
              category: d.category ?? "",
              categoryOther: d.categoryOther ?? "",
              inspectionItems: d.inspectionItems ?? [],
              inspectionItemOther: d.inspectionItemOther ?? "",
              note: d.note ?? "",
              noIssue: d.noIssue ?? true,
              noIssueItems: d.noIssueItems ?? [],
              itemDetails: d.itemDetails ?? {},
              requiresAttention: d.requiresAttention ?? false,
              measurements: d.measurements ?? {},
              condition: d.condition ?? (d.noIssue ? "normal" : "other"),
              action: d.action ?? (d.noIssue ? "inspection_only" : "repair"),
              parts: d.parts ?? [],
              photos: [],
            })),
          }))
        );
      }
      if (typeof snapshot.maintenanceMemo === "string") setMaintenanceMemo(snapshot.maintenanceMemo);
    } catch {
      // ignore invalid local draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    const snapshot: ReportDraftSnapshot = {
      formData,
      tasks,
      workBlocks,
      maintenanceVehicles: maintenanceVehicles.map((v) => ({
        ...v,
        details: v.details.map((d) => ({ ...d, photos: [] })),
      })),
      maintenanceMemo,
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(snapshot));
  }, [draftStorageKey, formData, tasks, workBlocks, maintenanceVehicles, maintenanceMemo]);

  const nowTime = () =>
    new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });

  const handleSubmit = (status: "draft" | "submitted") => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      if (validationError !== "__cancelled__") toast.error(validationError);
      return;
    }

    if (formData.department === "maintenance" || isMaintenanceFlow) {
      const saveMaintenance = async () => {
        const firstVehicle = maintenanceVehicles[0];

        const vehicleNotes = maintenanceVehicles
          .map((v, idx) => {
            const lines: string[] = [];
            const judgmentLabel = OVERALL_JUDGMENT_OPTIONS.find((o) => o.value === v.overallJudgment)?.label;
            if (judgmentLabel) lines.push(`総合判定: ${judgmentLabel}`);
            // 要運行管理連絡フラグ
            const attentionItems = v.details
              .filter((d) => d.requiresAttention)
              .map((d) => d.category || "不明");
            if (attentionItems.length > 0) {
              lines.push(`⚠ 要運行管理連絡: ${attentionItems.join(", ")}`);
            }
            const completedChecks = [
              v.completionChecks.engineStart ? "エンジン始動OK" : null,
              v.completionChecks.testDrive ? "試走OK" : null,
              v.completionChecks.noLeaks ? "漏れなし確認OK" : null,
              v.completionChecks.lights ? "灯火確認OK" : null,
            ].filter((x): x is string => x !== null);
            if (completedChecks.length > 0) lines.push(`完了確認: ${completedChecks.join(", ")}`);
            if (v.outsourceVendor.trim()) {
              lines.push(`外注: ${v.outsourceVendor}（${v.outsourceStatus === "completed" ? "完了" : "依頼中"}）`);
            }
            return lines.length > 0 ? `【車両${idx + 1}】${lines.join(" | ")}` : "";
          })
          .filter(Boolean)
          .join("\n");

        const fullNotes = [maintenanceMemo, vehicleNotes].filter(Boolean).join("\n") || null;

        const report = await createMaintenanceReportMutation.mutateAsync({
          vehicleType: firstVehicle?.vehicleType || null,
          vehicleNumber: firstVehicle
            ? [firstVehicle.vehicleNumberPrefix, firstVehicle.vehicleName].filter(Boolean).join("") || null
            : null,
          workCategory: MAINTENANCE_PURPOSE_TO_ENUM[firstVehicle?.purpose || "その他"] ?? "other",
          workCategoryNote:
            firstVehicle?.purpose === "その他" ? firstVehicle?.purposeOther || null : null,
          odometer: firstVehicle?.mileageKm ? Number(firstVehicle.mileageKm) : null,
          workStartTime: firstVehicle?.workStart || null,
          workEndTime: firstVehicle?.workEnd || null,
          workDate: formData.workDate,
          isAccident: maintenanceVehicles.some((v) => v.emergency),
          notes: fullNotes,
        });

        for (const vehicle of maintenanceVehicles) {
          for (let i = 0; i < vehicle.details.length; i++) {
            const detail = vehicle.details[i];
            const createdDetail = await addMaintenanceDetailMutation.mutateAsync({
              reportId: report.id,
              partCategory: MAINTENANCE_CATEGORY_TO_ENUM[detail.category] ?? "other",
              condition: detail.condition,
              conditionNote: detail.condition === "other" ? detail.note || null : null,
              action: detail.action,
              actionNote: detail.action === "other" ? detail.note || null : null,
              notes:
                [
                  detail.inspectionItems?.length ? `点検項目: ${detail.inspectionItems.join(" / ")}` : "",
                  detail.note,
                ]
                  .filter(Boolean)
                  .join("\n") || null,
              sortOrder: i,
            });

            for (let pi = 0; pi < (detail.parts ?? []).length; pi++) {
              const part = detail.parts[pi];
              if (!part.partName.trim()) continue;
              await addMaintenancePartMutation.mutateAsync({
                detailId: createdDetail.id,
                masterCategory: part.masterCategory,
                partName: part.partName.trim(),
                quantity: Number(part.quantity) > 0 ? Number(part.quantity) : 1,
                unit: part.unit.trim() || "個",
                position: part.position.trim() || null,
                sortOrder: pi,
              });
            }

            for (const photo of detail.photos ?? []) {
              await uploadMaintenancePhotoMutation.mutateAsync({
                detailId: createdDetail.id,
                fileName: photo.fileName,
                fileType: photo.fileType,
                fileBase64: photo.fileBase64,
              });
            }
          }
        }

        await utils.reports.list.invalidate();
        await utils.maintenance.listReports.invalidate();
        if (draftStorageKey && typeof window !== "undefined") {
          window.localStorage.removeItem(draftStorageKey);
        }
        toast.success(status === "submitted" ? "整備日報を提出しました" : "整備日報を保存しました");
        navigate(`/maintenance/${report.id}`);
      };

      saveMaintenance().catch((e) => toast.error(e.message || "整備日報の保存に失敗しました"));
      return;
    }

    const baseTasks = tasks
      .filter((t) => t.content.trim())
      .map((t, i) => ({
        vehicleNumber: t.vehicleNumber || null,
        taskType: t.taskType || null,
        content: t.content,
        isCompleted: t.isCompleted,
        sortOrder: i,
      }));

    const maintenanceTasks =
      formData.department === "maintenance" || isMaintenanceFlow
        ? maintenanceVehicles
            .filter((v) => v.vehicleName.trim() || v.details.some((d) => d.note.trim()))
            .map((v, i) => {
              const detailLines = v.details
                .filter((d) => d.category || d.note.trim() || d.noIssue)
                .map((d) => {
                  if (d.noIssue) return `- ${d.category || "点検"}: 異常なし`;
                  return `- ${d.category || "分類未設定"}: ${d.note || "（記載なし）"}`;
                })
                .join("\n");
              const title = `${v.vehicleName || "車名未入力"} / ${v.purpose || "目的未設定"}`;
              const mileage = v.mileageKm ? `走行距離: ${v.mileageKm}km` : "走行距離: -";
              const workTime =
                v.workStart || v.workEnd
                  ? `作業時間: ${v.workStart || "--:--"}〜${v.workEnd || "--:--"}`
                  : "";
              return {
                vehicleNumber: v.vehicleName || null,
                taskType: "整備",
                content: `${title}\n${mileage}${workTime ? `\n${workTime}` : ""}${v.emergency ? "\n緊急修理: あり" : ""}${detailLines ? `\n${detailLines}` : ""}`,
                isCompleted: true,
                sortOrder: baseTasks.length + i,
              };
            })
        : [];

    const workBlockLines = workBlocks
      .filter((b) => b.start || b.end)
      .map((b) => {
        const dept = DEPARTMENT_OPTIONS.find((d) => d.value === b.department)?.label ?? b.department;
        return `${dept}: ${b.start || "--:--"}〜${b.end || "--:--"}`;
      });

    const composedOrderInfo = [
      workBlockLines.length > 0 ? `【業務時間帯】\n${workBlockLines.join("\n")}` : "",
      formData.department === "maintenance" && maintenanceMemo.trim()
        ? `【作業実績・全体備考】\n${maintenanceMemo.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    createMutation.mutate({
      ...formData,
      status,
      sharedInfo: formData.sharedInfo || null,
      orderInfo: composedOrderInfo || formData.orderInfo || null,
      tasks: [...baseTasks, ...maintenanceTasks],
    });
  };

  const isMaintenance = formData.department === "maintenance" || isMaintenanceFlow;

  return (
    <div className="space-y-5 max-w-[860px] mx-auto pb-32">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/reports")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">日報作成</h1>
          <p className="text-muted-foreground text-sm mt-1">本日の業務内容を記録します</p>
        </div>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`grid ${isMaintenanceFlow ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2"} gap-3`}>
            <div>
              <Label htmlFor="workDate">作業日</Label>
              <Input
                id="workDate"
                type="date"
                value={formData.workDate}
                onChange={(e) => setFormData((p) => ({ ...p, workDate: e.target.value }))}
                className="mt-1"
              />
            </div>
            {isMaintenanceFlow && (
              <div>
                <Label>休憩時間</Label>
                <div className="mt-1 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  <Input
                    id="breakStart"
                    type="time"
                    value={formData.breakStart}
                    onChange={(e) => setFormData((p) => ({ ...p, breakStart: e.target.value }))}
                  />
                  <span className="text-muted-foreground">〜</span>
                  <Input
                    id="breakEnd"
                    type="time"
                    value={formData.breakEnd}
                    onChange={(e) => setFormData((p) => ({ ...p, breakEnd: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
          {!isMaintenanceFlow && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="breakStart">休憩開始</Label>
                <Input
                  id="breakStart"
                  type="time"
                  value={formData.breakStart}
                  onChange={(e) => setFormData((p) => ({ ...p, breakStart: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="breakEnd">休憩終了</Label>
                <Input
                  id="breakEnd"
                  type="time"
                  value={formData.breakEnd}
                  onChange={(e) => setFormData((p) => ({ ...p, breakEnd: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          {isMaintenance && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground font-medium mb-2">実績サマリー（自動集計）</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xl font-bold text-blue-700">{maintenanceVehicles.length}</p>
                  <p className="text-xs text-muted-foreground">本日の整備台数</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-blue-700">{thisMonthMaintenanceCount}</p>
                  <p className="text-xs text-muted-foreground">今月の整備日数（本日含む）</p>
                </div>
              </div>
            </div>
          )}
          {formData.department !== "maintenance" && !isMaintenanceFlow && (
            <div>
              <Label htmlFor="sharedInfo">共有事項</Label>
              <textarea
                id="sharedInfo"
                value={formData.sharedInfo}
                onChange={(e) => setFormData((p) => ({ ...p, sharedInfo: e.target.value }))}
                placeholder="全員に共有したい情報を入力"
                rows={3}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 業務内容 */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">業務内容</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              複数の時間帯・部署にまたがる業務を追加できます
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addWorkBlock} className="gap-1">
            <Plus className="w-4 h-4" />
            業務を追加
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {workBlocks.map((block, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">業務 {i + 1}</p>
                {workBlocks.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeWorkBlock(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={block.department}
                  onChange={(e) => updateWorkBlock(i, "department", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <Input
                  type="time"
                  value={block.start}
                  onChange={(e) => updateWorkBlock(i, "start", e.target.value)}
                />
                <Input
                  type="time"
                  value={block.end}
                  onChange={(e) => updateWorkBlock(i, "end", e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {isMaintenance ? (
        <>
          {/* 車両別整備記録 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">🚚 車両別整備記録</CardTitle>
            </CardHeader>
            <CardContent
              className="space-y-3"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const target = e.target as HTMLElement;
                if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
                if (target.tagName === "INPUT") {
                  e.preventDefault();
                  const focusable = Array.from(
                    e.currentTarget.querySelectorAll<HTMLElement>(
                      "input:not([disabled]):not([type='checkbox']), select:not([disabled]), textarea:not([disabled])"
                    )
                  );
                  const idx = focusable.indexOf(target);
                  if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus();
                }
              }}
            >
              {maintenanceVehicles.map((vehicle, vi) => (
                <div key={vi} className="border border-sky-200 rounded-xl p-3.5 space-y-3 bg-sky-50/20">
                  {/* A) 車両ヘッダー */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-sky-900">🚚 車両 {vi + 1}</p>
                    <div className="flex items-center gap-2">
                      {maintenanceVehicles.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeVehicle(vi)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* B) 車種 */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-16 text-right shrink-0">車種 *</Label>
                    <select
                      value={vehicle.vehicleType}
                      onChange={(e) => updateVehicle(vi, "vehicleType", e.target.value)}
                      className="flex h-9 w-44 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="">選択</option>
                      {VEHICLE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {vehicle.vehicleType === "other" && (
                      <Input
                        placeholder="車種を入力"
                        value={vehicle.vehicleTypeOther}
                        onChange={(e) => updateVehicle(vi, "vehicleTypeOther", e.target.value)}
                        className="h-9 text-sm flex-1"
                      />
                    )}
                  </div>

                  {/* C) 拠点・車番 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs w-16 text-right shrink-0">拠点</Label>
                    <select
                      value={vehicle.vehicleBase}
                      onChange={(e) => updateVehicle(vi, "vehicleBase", e.target.value)}
                      className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      {VEHICLE_BASE_OPTIONS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                    <Label className="text-xs shrink-0">車番 *</Label>
                    <select
                      value={vehicle.vehicleNumberPrefix}
                      onChange={(e) => updateVehicle(vi, "vehicleNumberPrefix", e.target.value)}
                      className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      {VEHICLE_NUMBER_PREFIX_OPTIONS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <Input
                      placeholder="番号"
                      value={vehicle.vehicleName}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\x21-\x7E]/g, "");
                        updateVehicle(vi, "vehicleName", val);
                      }}
                      className="h-9 text-sm w-24"
                    />
                  </div>

                  {/* D) 走行距離 */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs w-16 text-right shrink-0">走行距離</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={vehicle.mileageKm ? Number(vehicle.mileageKm).toLocaleString("ja-JP") : ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        updateVehicle(vi, "mileageKm", raw);
                      }}
                      className="h-9 text-sm w-32"
                    />
                    <span className="text-sm text-muted-foreground">km</span>
                  </div>

                  {/* E) 作業時間 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">作業時間</Label>
                    {!vehicle.workStart && !vehicle.workEnd ? (
                      <Button
                        type="button"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => updateVehicle(vi, "workStart", nowTime())}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        作業開始
                      </Button>
                    ) : vehicle.workStart && !vehicle.workEnd ? (
                      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 font-medium">
                        開始済み {vehicle.workStart}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {vehicle.workStart} 〜 {vehicle.workEnd}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => {
                            updateVehicle(vi, "workStart", "");
                            updateVehicle(vi, "workEnd", "");
                          }}
                        >
                          リセット
                        </button>
                      </div>
                    )}
                  </div>

                  {/* F) 入庫目的 */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">入庫目的 *</p>
                    {MAINTENANCE_PURPOSE_GROUPS.map((group) => {
                      const hasLinked = group.label === "定期メンテナンス" || group.label === "修理・緊急対応";
                      return (
                        <div key={group.label} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-600">{group.label}</span>
                            {hasLinked && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5">
                                明細連動
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[...group.items].map((purpose) => (
                              <button
                                key={purpose}
                                type="button"
                                onClick={() => selectPurposeWithDefaults(vi, purpose)}
                                className={`h-9 rounded-lg border text-sm transition-colors ${
                                  vehicle.purpose === purpose
                                    ? "border-blue-300 bg-blue-50 text-blue-700"
                                    : "border-input hover:bg-muted/40"
                                }`}
                              >
                                {purpose}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {vehicle.purpose === "その他" && (
                      <Input
                        placeholder="入庫目的を入力"
                        value={vehicle.purposeOther}
                        onChange={(e) => updateVehicle(vi, "purposeOther", e.target.value)}
                        className="h-9 text-sm"
                      />
                    )}
                  </div>

                  {/* G) 整備明細 */}
                  <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">🔧 整備明細 {vehicle.details.length}件</p>

                    {vehicle.details.map((detail, di) => {
                      const allItems = MAINTENANCE_CATEGORY_ITEMS[detail.category] ?? [];

                      return (
                        <div
                          key={di}
                          className="rounded-md border border-amber-200/80 bg-white p-3 space-y-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                        >
                          {/* 明細ヘッダー */}
                          <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-100/60 px-2.5 py-1.5">
                            <p className="text-xs font-semibold text-amber-800">整備明細 {di + 1}</p>
                            {vehicle.details.length > 1 && (
                              <button
                                type="button"
                                className="text-xs text-destructive underline"
                                onClick={() => removeVehicleDetail(vi, di)}
                              >
                                削除
                              </button>
                            )}
                          </div>

                          {/* 問題なし / 要注意 */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-1.5 text-sm border border-emerald-100 bg-emerald-50/50 text-emerald-700 rounded-md px-2.5 py-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={detail.noIssue}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateVehicleDetail(vi, di, "noIssue", checked);
                                  updateVehicleDetail(vi, di, "condition", checked ? "normal" : "other");
                                  updateVehicleDetail(vi, di, "action", checked ? "inspection_only" : "repair");
                                }}
                              />
                              問題なし
                            </label>
                            <label className="flex items-center gap-1.5 text-sm border border-orange-100 bg-orange-50/50 text-orange-700 rounded-md px-2.5 py-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={detail.requiresAttention}
                                onChange={(e) => updateVehicleDetail(vi, di, "requiresAttention", e.target.checked)}
                              />
                              ⚠ 要運行管理連絡
                            </label>
                          </div>

                          {/* カテゴリ */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">整備部位カテゴリ *</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {MAINTENANCE_CATEGORIES.map((cat) => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => {
                                    updateVehicleDetail(vi, di, "category", cat);
                                    updateVehicleDetail(vi, di, "inspectionItems", []);
                                  }}
                                  className={`h-9 rounded-lg border text-xs transition-colors ${
                                    detail.category === cat
                                      ? "border-blue-300 bg-blue-50 text-blue-700 font-medium"
                                      : "border-input hover:bg-muted/40"
                                  }`}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                            {detail.category === "その他" && (
                              <Input
                                placeholder="カテゴリを入力"
                                value={detail.categoryOther}
                                onChange={(e) => updateVehicleDetail(vi, di, "categoryOther", e.target.value)}
                                className="h-8 text-xs"
                              />
                            )}
                          </div>

                          {/* 点検項目 */}
                          {detail.category && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">点検項目</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {allItems.map((item) => {
                                  const selected = (detail.inspectionItems ?? []).includes(item);
                                  return (
                                    <button
                                      key={item}
                                      type="button"
                                      onClick={() => {
                                        const current = detail.inspectionItems ?? [];
                                        const next = selected
                                          ? current.filter((v) => v !== item)
                                          : [...current, item];
                                        syncSuggestedPartsByInspectionItems(vi, di, next);
                                      }}
                                      className={`h-8 rounded-md border text-xs ${
                                        selected
                                          ? "border-sky-300 bg-sky-100 text-sky-900"
                                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      {item}
                                    </button>
                                  );
                                })}
                                {/* その他ボタン */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = detail.inspectionItems ?? [];
                                    const hasOther = current.includes("その他");
                                    const next = hasOther
                                      ? current.filter((v) => v !== "その他")
                                      : [...current, "その他"];
                                    syncSuggestedPartsByInspectionItems(vi, di, next);
                                  }}
                                  className={`h-8 rounded-md border text-xs ${
                                    (detail.inspectionItems ?? []).includes("その他")
                                      ? "border-sky-300 bg-sky-100 text-sky-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  その他
                                </button>
                              </div>
                              {(detail.inspectionItems ?? []).includes("その他") && (
                                <Input
                                  placeholder="その他点検項目を入力"
                                  value={detail.inspectionItemOther}
                                  onChange={(e) => updateVehicleDetail(vi, di, "inspectionItemOther", e.target.value)}
                                  className="h-8 text-xs"
                                />
                              )}
                            </div>
                          )}

                          {/* 整備内容（状態・処置 + 測定値 + 交換・補充内容インライン） */}
                          {!detail.noIssue && detail.inspectionItems.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">整備内容</p>
                              <div className="space-y-1.5">
                                {detail.inspectionItems.map((item) => {
                                  const measurement = INSPECTION_ITEM_MEASUREMENTS[item];
                                  const linkedParts = (detail.parts ?? [])
                                    .map((p, idx) => ({ ...p, idx }))
                                    .filter((p) => p.linkedItem === item);
                                  const isItemNoIssue = (detail.noIssueItems ?? []).includes(item);
                                  const itemCondition =
                                    (detail.itemDetails ?? {})[item]?.condition ?? detail.condition;
                                  const itemAction =
                                    (detail.itemDetails ?? {})[item]?.action ?? detail.action;
                                  const isRotationItem = item === "タイヤローテーション";
                                  const isRotationMode =
                                    !isRotationItem &&
                                    TIRE_PART_NAMES.some((n) =>
                                      linkedParts.some((p) => p.partName === n)
                                    ) && itemAction === "adjustment";
                                  // フィルタ済みの選択肢リスト（状態・処置）を作成し、現在値が含まれない場合は先頭を使う
                                  const condOpts = ITEM_CONDITION_MAP[item]
                                    ? MAINTENANCE_CONDITIONS.filter((o) =>
                                        ITEM_CONDITION_MAP[item].includes(o.value)
                                      )
                                    : MAINTENANCE_CONDITIONS;
                                  const actOpts = ITEM_ACTION_MAP[item]
                                    ? MAINTENANCE_ACTIONS.filter((o) =>
                                        ITEM_ACTION_MAP[item].includes(o.value)
                                      )
                                    : MAINTENANCE_ACTIONS;
                                  const effectiveCondition = condOpts.some((o) => o.value === itemCondition)
                                    ? itemCondition
                                    : (condOpts[0]?.value ?? itemCondition);
                                  const effectiveAction = actOpts.some((o) => o.value === itemAction)
                                    ? itemAction
                                    : (actOpts[0]?.value ?? itemAction);
                                  return (
                                    <div
                                      key={item}
                                      className={`rounded-md border px-2.5 py-2 space-y-2 ${
                                        isItemNoIssue
                                          ? "border-slate-200 bg-slate-50 opacity-60"
                                          : "border-amber-200 bg-amber-50/50"
                                      }`}
                                    >
                                      <p
                                        className={`text-xs font-semibold ${
                                          isItemNoIssue ? "text-slate-400 line-through" : "text-amber-800"
                                        }`}
                                      >
                                        {item}
                                      </p>
                                      <label className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-500 select-none w-fit">
                                        <input
                                          type="checkbox"
                                          checked={isItemNoIssue}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...(detail.noIssueItems ?? []), item]
                                              : (detail.noIssueItems ?? []).filter((i) => i !== item);
                                            updateVehicleDetail(vi, di, "noIssueItems", next);
                                          }}
                                        />
                                        異常なし
                                      </label>
                                      {!isItemNoIssue && (
                                        <>
                                          {measurement && (
                                            <div className="flex items-center gap-2">
                                              <Ruler className="w-3.5 h-3.5 text-slate-400" />
                                              <span className="text-xs text-slate-600">{measurement.label}:</span>
                                              <Input
                                                type="text"
                                                inputMode="numeric"
                                                className="h-6 w-16 text-xs px-2"
                                                value={detail.measurements[item] ?? ""}
                                                onChange={(e) => {
                                                  const newMeasurements = {
                                                    ...detail.measurements,
                                                    [item]: e.target.value,
                                                  };
                                                  updateVehicleDetail(vi, di, "measurements", newMeasurements);
                                                }}
                                              />
                                              <span className="text-xs text-slate-500">{measurement.unit}</span>
                                            </div>
                                          )}
                                          {linkedParts.length > 0 && (
                                            <div className="space-y-1.5">
                                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Wrench className="w-3 h-3" />
                                                交換・補充内容
                                              </p>
                                              {linkedParts.map((part) => {
                                                const hasTirePos = TIRE_PART_NAMES.includes(part.partName);
                                                const [fromPos, toPos] = part.position.includes("→")
                                                  ? part.position.split("→")
                                                  : [part.position, ""];
                                                return (
                                                  <div key={part.idx} className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs text-slate-700 font-medium min-w-[80px]">
                                                      {part.partName}
                                                    </span>
                                                    <Input
                                                      type="number"
                                                      min={0}
                                                      step="0.1"
                                                      placeholder="数量"
                                                      value={part.quantity}
                                                      onChange={(e) =>
                                                        updateDetailPart(vi, di, part.idx, "quantity", e.target.value)
                                                      }
                                                      className="h-7 w-16 text-xs px-2"
                                                    />
                                                    <span className="text-xs text-slate-500">{part.unit}</span>
                                                    {hasTirePos && isRotationMode ? (
                                                      <div className="flex items-center gap-1">
                                                        <select
                                                          value={fromPos}
                                                          onChange={(e) =>
                                                            updateDetailPart(
                                                              vi,
                                                              di,
                                                              part.idx,
                                                              "position",
                                                              `${e.target.value}→${toPos}`
                                                            )
                                                          }
                                                          className="h-7 rounded border border-input bg-background px-1 text-xs"
                                                        >
                                                          <option value="">元位置</option>
                                                          {TIRE_POSITIONS.map((pos) => (
                                                            <option key={pos} value={pos}>
                                                              {pos}
                                                            </option>
                                                          ))}
                                                        </select>
                                                        <span className="text-xs text-slate-400">→</span>
                                                        <select
                                                          value={toPos}
                                                          onChange={(e) =>
                                                            updateDetailPart(
                                                              vi,
                                                              di,
                                                              part.idx,
                                                              "position",
                                                              `${fromPos}→${e.target.value}`
                                                            )
                                                          }
                                                          className="h-7 rounded border border-input bg-background px-1 text-xs"
                                                        >
                                                          <option value="">移動先</option>
                                                          {TIRE_POSITIONS.map((pos) => (
                                                            <option key={pos} value={pos}>
                                                              {pos}
                                                            </option>
                                                          ))}
                                                        </select>
                                                      </div>
                                                    ) : hasTirePos ? (
                                                      <select
                                                        value={part.position}
                                                        onChange={(e) =>
                                                          updateDetailPart(
                                                            vi,
                                                            di,
                                                            part.idx,
                                                            "position",
                                                            e.target.value
                                                          )
                                                        }
                                                        className="h-7 rounded border border-input bg-background px-1 text-xs"
                                                      >
                                                        <option value="">取付位置</option>
                                                        {TIRE_POSITIONS.map((pos) => (
                                                          <option key={pos} value={pos}>
                                                            {pos}
                                                          </option>
                                                        ))}
                                                      </select>
                                                    ) : (
                                                      <Input
                                                        placeholder="取付位置"
                                                        value={part.position}
                                                        onChange={(e) =>
                                                          updateDetailPart(
                                                            vi,
                                                            di,
                                                            part.idx,
                                                            "position",
                                                            e.target.value
                                                          )
                                                        }
                                                        className="h-7 w-20 text-xs px-2"
                                                      />
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                          {/* タイヤローテーション専用：位置マップ */}
                                          {isRotationItem && (
                                            <div className="space-y-1.5 pt-1">
                                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <RotateCcw className="w-3 h-3" />
                                                回転先（どこのタイヤをどこへ）
                                              </p>
                                              {["FL", "FR", "RL", "RR"].map((fromPos) => {
                                                const key = `${item}_${fromPos}`;
                                                return (
                                                  <div key={fromPos} className="flex items-center gap-2">
                                                    <span className="text-xs font-medium w-8 text-slate-600">{fromPos}</span>
                                                    <span className="text-xs text-slate-400">→</span>
                                                    <select
                                                      value={detail.measurements[key] ?? ""}
                                                      onChange={(e) =>
                                                        updateVehicleDetail(vi, di, "measurements", {
                                                          ...detail.measurements,
                                                          [key]: e.target.value,
                                                        })
                                                      }
                                                      className="h-7 rounded border border-input bg-background px-1 text-xs flex-1"
                                                    >
                                                      <option value="">移動先を選択</option>
                                                      {TIRE_POSITIONS.filter((p) => p !== fromPos && p !== "全輪").map((pos) => (
                                                        <option key={pos} value={pos}>{pos}</option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                          {/* 状態・処置（各項目ごと） */}
                                          <div className="grid grid-cols-2 gap-2 pt-1">
                                            <div>
                                              <p className="text-xs text-muted-foreground mb-1">状態</p>
                                              <select
                                                value={effectiveCondition}
                                                onChange={(e) =>
                                                  updateVehicleDetail(vi, di, "itemDetails", {
                                                    ...(detail.itemDetails ?? {}),
                                                    [item]: {
                                                      condition: e.target.value as MaintenanceDetailForm["condition"],
                                                      action: effectiveAction as MaintenanceDetailForm["action"],
                                                    },
                                                  })
                                                }
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                              >
                                                {condOpts.map((opt) => (
                                                  <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div>
                                              <p className="text-xs text-muted-foreground mb-1">処置</p>
                                              <select
                                                value={effectiveAction}
                                                onChange={(e) =>
                                                  updateVehicleDetail(vi, di, "itemDetails", {
                                                    ...(detail.itemDetails ?? {}),
                                                    [item]: {
                                                      condition: effectiveCondition as MaintenanceDetailForm["condition"],
                                                      action: e.target.value as MaintenanceDetailForm["action"],
                                                    },
                                                  })
                                                }
                                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                              >
                                                {actOpts.map((opt) => (
                                                  <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 追加部品（任意） */}
                          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">追加部品（任意）</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => addDetailPart(vi, di)}
                              >
                                + 部品追加
                              </Button>
                            </div>
                            {(detail.parts ?? []).filter((p) => !p.linkedItem).length === 0 ? (
                              <p className="text-xs text-muted-foreground">点検項目に紐づかない部品を手動追加できます</p>
                            ) : (
                              <div className="space-y-2">
                                {(detail.parts ?? []).map((part, partIndex) => {
                                  if (part.linkedItem) return null;
                                  return (
                                  <div key={partIndex} className="rounded-md border border-slate-200 bg-white p-2 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <select
                                        value={part.masterCategory}
                                        onChange={(e) =>
                                          updateDetailPart(
                                            vi,
                                            di,
                                            partIndex,
                                            "masterCategory",
                                            e.target.value as MaintenanceDetailForm["parts"][number]["masterCategory"]
                                          )
                                        }
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                                      >
                                        {PART_MASTER_CATEGORY_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <Input
                                        placeholder="部品名"
                                        value={part.partName}
                                        onChange={(e) => updateDetailPart(vi, di, partIndex, "partName", e.target.value)}
                                        className="h-9 text-xs"
                                      />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <Input
                                        type="number"
                                        min={1}
                                        placeholder="数量"
                                        value={part.quantity}
                                        onChange={(e) => updateDetailPart(vi, di, partIndex, "quantity", e.target.value)}
                                        className="h-9 text-xs"
                                      />
                                      <Input
                                        placeholder="単位"
                                        value={part.unit}
                                        onChange={(e) => updateDetailPart(vi, di, partIndex, "unit", e.target.value)}
                                        className="h-9 text-xs"
                                      />
                                      <Input
                                        placeholder="取付位置"
                                        value={part.position}
                                        onChange={(e) => updateDetailPart(vi, di, partIndex, "position", e.target.value)}
                                        className="h-9 text-xs"
                                      />
                                    </div>
                                    <div className="flex justify-end">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-destructive"
                                        onClick={() => removeDetailPart(vi, di, partIndex)}
                                      >
                                        削除
                                      </Button>
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* 写真 */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-medium text-muted-foreground">📷 写真添付</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1 border-slate-300 h-8"
                                onClick={() => {
                                  const input = document.getElementById(`detail-photo-${vi}-${di}`) as HTMLInputElement | null;
                                  input?.click();
                                }}
                              >
                                <Camera className="w-4 h-4" />
                                撮影・選択
                              </Button>
                            </div>
                            <input
                              id={`detail-photo-${vi}-${di}`}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                handleSelectDetailPhoto(vi, di, e.target.files);
                                e.currentTarget.value = "";
                              }}
                            />
                            {(detail.photos ?? []).length > 0 && (
                              <div className="space-y-1">
                                {(detail.photos ?? []).map((photo, photoIndex) => (
                                  <div
                                    key={`${photo.fileName}-${photoIndex}`}
                                    className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1"
                                  >
                                    <p className="text-xs text-slate-700 truncate pr-2">{photo.fileName}</p>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs text-destructive"
                                      onClick={() => removeDetailPhoto(vi, di, photoIndex)}
                                    >
                                      削除
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 特記事項 */}
                          <textarea
                            rows={2}
                            placeholder="特記事項（任意）"
                            value={detail.note}
                            onChange={(e) => updateVehicleDetail(vi, di, "note", e.target.value)}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                          />
                        </div>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addVehicleDetail(vi)}
                      className="w-full border-dashed border-amber-300 text-amber-700 hover:bg-amber-100/40"
                    >
                      ＋ 整備明細を追加
                    </Button>
                  </div>

                  {/* I) 完了後確認チェック */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">完了後確認チェック</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: "engineStart", label: "エンジン始動確認" },
                          { key: "testDrive", label: "試走確認" },
                          { key: "noLeaks", label: "漏れなし確認" },
                          { key: "lights", label: "灯火確認" },
                        ] as { key: keyof MaintenanceVehicleForm["completionChecks"]; label: string }[]
                      ).map(({ key, label }) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 text-xs rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${
                            vehicle.completionChecks[key]
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={vehicle.completionChecks[key]}
                            onChange={(e) =>
                              updateVehicle(vi, "completionChecks", {
                                ...vehicle.completionChecks,
                                [key]: e.target.checked,
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* J) 外注依頼（外装部品がある場合のみ表示） */}
                  {vehicle.details.some((d) =>
                    (d.parts ?? []).some((p) => p.masterCategory === "exterior")
                  ) && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-medium text-violet-800">外注依頼</p>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="外注先（例: ○○タイヤ、△△板金）"
                          value={vehicle.outsourceVendor}
                          onChange={(e) => updateVehicle(vi, "outsourceVendor", e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                        <select
                          value={vehicle.outsourceStatus}
                          onChange={(e) =>
                            updateVehicle(vi, "outsourceStatus", e.target.value as MaintenanceVehicleForm["outsourceStatus"])
                          }
                          className="flex h-8 w-24 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">状態</option>
                          <option value="pending">依頼中</option>
                          <option value="completed">完了</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* K) 車両総合判定 */}
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">車両総合判定</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {OVERALL_JUDGMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            updateVehicle(
                              vi,
                              "overallJudgment",
                              vehicle.overallJudgment === opt.value ? "" : opt.value
                            )
                          }
                          className={`h-9 rounded-lg border text-xs font-medium transition-colors ${
                            vehicle.overallJudgment === opt.value ? opt.activeClass : opt.inactiveClass
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 作業終了ボタン・合計作業時間 */}
                  {vehicle.workStart && !vehicle.workEnd && (
                    <Button
                      type="button"
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => updateVehicle(vi, "workEnd", nowTime())}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      作業終了
                    </Button>
                  )}
                  {vehicle.workStart && vehicle.workEnd && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 font-semibold flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        合計作業時間: {calcWorkDuration(vehicle.workStart, vehicle.workEnd)}
                      </div>
                      <button
                        type="button"
                        className="text-xs text-emerald-600 underline font-normal"
                        onClick={() => {
                          updateVehicle(vi, "workStart", "");
                          updateVehicle(vi, "workEnd", "");
                        }}
                      >
                        リセット
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <div className="pt-2 text-center text-sm text-slate-500">
                この車両は完了しました。次へ行く場合は
                <Button
                  type="button"
                  variant="outline"
                  onClick={addVehicle}
                  className="ml-2 border-dashed border-slate-400 text-slate-600 hover:bg-slate-50 gap-1 inline-flex"
                >
                  <Plus className="w-4 h-4" />
                  車両を追加
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 全車両 作業時間サマリー */}
          {maintenanceVehicles.some((v) => v.workStart || v.workEnd) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">作業時間サマリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {maintenanceVehicles.map((v, vi) => {
                  if (!v.workStart && !v.workEnd) return null;
                  return (
                    <div
                      key={vi}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700 font-medium">
                        {v.vehicleNumberPrefix ? `${v.vehicleNumberPrefix} ` : ""}
                        {v.vehicleName || `車両${vi + 1}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          {v.workStart || "--:--"} 〜 {v.workEnd || "--:--"}
                        </span>
                        {v.workStart && v.workEnd && (
                          <span className="text-emerald-600 font-semibold">
                            {calcWorkDuration(v.workStart, v.workEnd)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* 全車両の合計時間 */}
                {(() => {
                  const completedVehicles = maintenanceVehicles.filter((v) => v.workStart && v.workEnd);
                  if (completedVehicles.length < 2) return null;
                  const totalMin = completedVehicles.reduce((sum, v) => {
                    const [sh, sm] = v.workStart.split(":").map(Number);
                    const [eh, em] = v.workEnd.split(":").map(Number);
                    return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
                  }, 0);
                  if (totalMin <= 0) return null;
                  const h = Math.floor(totalMin / 60);
                  const m = totalMin % 60;
                  const label = h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
                  return (
                    <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm mt-1">
                      <span className="text-emerald-800 font-semibold">全車両 合計作業時間</span>
                      <span className="text-emerald-700 font-bold text-base">{label}</span>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">作業実績・全体備考</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                rows={4}
                value={maintenanceMemo}
                onChange={(e) => setMaintenanceMemo(e.target.value)}
                placeholder="本日の作業実績や全体的な備考を入力してください"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">共有事項</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={formData.sharedInfo}
                onChange={(e) => setFormData((p) => ({ ...p, sharedInfo: e.target.value }))}
                placeholder="チームへの共有事項を入力してください"
                rows={3}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </CardContent>
          </Card>

        </>
      ) : (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">タスク明細</CardTitle>
            <Button variant="outline" size="sm" onClick={addTask} className="gap-1">
              <Plus className="w-4 h-4" />
              追加
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.map((task, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">作業 {i + 1}</p>
                  {tasks.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeTask(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="車番"
                    value={task.vehicleNumber}
                    onChange={(e) => updateTask(i, "vehicleNumber", e.target.value)}
                  />
                  <Input
                    placeholder="作業種別"
                    value={task.taskType}
                    onChange={(e) => updateTask(i, "taskType", e.target.value)}
                  />
                </div>
                <textarea
                  placeholder="作業内容"
                  value={task.content}
                  onChange={(e) => updateTask(i, "content", e.target.value)}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={task.isCompleted}
                    onChange={(e) => updateTask(i, "isCompleted", e.target.checked)}
                    className="rounded"
                  />
                  完了
                </label>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 非整備部門の送信ボタン */}
      {!isMaintenance && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleSubmit("draft")}
            disabled={createMutation.isPending}
          >
            下書き保存
          </Button>
          <Button
            className="flex-1"
            onClick={() => handleSubmit("submitted")}
            disabled={createMutation.isPending}
          >
            提出
          </Button>
        </div>
      )}
    </div>
  );
}
