import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Camera, Plus, Play, Square, Trash2 } from "lucide-react";
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

const MAINTENANCE_PURPOSES = [
  "3カ月法定点検",
  "12カ月法定点検",
  "車検整備",
  "一般修理",
  "定期整備",
  "事故修理",
  "路上修理",
  "その他",
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
  エンジン系: ["エンジンオイル", "オイル漏れ", "冷却水", "ファンベルト", "異音・振動"],
  動力伝達系: ["クラッチ", "ミッション", "プロペラシャフト", "デフ", "異音・振動"],
  "足回り・ステアリング": ["タイヤ摩耗", "空気圧", "ハブ・ベアリング", "ステアリング操作", "サスペンション"],
  ブレーキ系: ["ブレーキパッド", "ブレーキライニング", "ブレーキ液", "エア漏れ", "制動力"],
  電気系: ["バッテリー", "セルモーター", "オルタネータ", "灯火類", "配線・接触不良"],
  "ボディ・外装": ["ミラー", "ワイパー", "ガラス", "ボディ損傷", "荷台・架装"],
  その他: ["その他点検項目1", "その他点検項目2", "その他点検項目3"],
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

const MAINTENANCE_CATEGORY_TO_ENUM: Record<string, "engine" | "drivetrain" | "suspension" | "brake" | "electrical" | "body" | "other"> = {
  エンジン系: "engine",
  動力伝達系: "drivetrain",
  "足回り・ステアリング": "suspension",
  ブレーキ系: "brake",
  電気系: "electrical",
  "ボディ・外装": "body",
  その他: "other",
};

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
  "12カ月法定点検": "legal_inspection_12month",
  車検整備: "vehicle_inspection",
  一般修理: "general_repair",
  定期整備: "scheduled_maintenance",
  事故修理: "accident_repair",
  路上修理: "roadside_repair",
  その他: "other",
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
  roadside_repair: "路上修理",
  other: "その他",
};

const PART_MASTER_CATEGORY_OPTIONS = [
  { value: "oil_fluid", label: "油脂類" },
  { value: "consumable", label: "消耗品" },
  { value: "misc", label: "雑材" },
  { value: "repair_work", label: "修理作業" },
  { value: "exterior", label: "外注" },
] as const;

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
  inspectionItems: string[];
  note: string;
  noIssue: boolean;
  condition: "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other";
  action: "inspection_only" | "cleaning" | "adjustment" | "lubrication" | "parts_replacement" | "repair" | "observation" | "other";
  parts: {
    masterCategory: "oil_fluid" | "consumable" | "misc" | "repair_work" | "exterior";
    partName: string;
    quantity: string;
    unit: string;
    position: string;
  }[];
  photos: {
    fileName: string;
    fileType: string;
    fileBase64: string;
  }[];
}

interface MaintenanceVehicleForm {
  vehicleType: string;
  vehicleName: string;
  purpose: string;
  mileageKm: string;
  workStart: string;
  workEnd: string;
  emergency: boolean;
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
    {
      vehicleType: "",
      vehicleName: "",
      purpose: "",
      mileageKm: "",
      workStart: "",
      workEnd: "",
      emergency: false,
      details: [{ category: "", inspectionItems: [], note: "", noIssue: true, condition: "normal", action: "inspection_only", parts: [], photos: [] }],
    },
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
          vehicleName: report.vehicleNumber ?? "",
          purpose: MAINTENANCE_ENUM_TO_PURPOSE_LABEL[report.workCategory] ?? "その他",
          mileageKm: report.odometer ? String(report.odometer) : "",
          workStart: report.workStartTime ?? "",
          workEnd: report.workEndTime ?? "",
          emergency: Boolean(report.isAccident),
          details: (lastMaintenanceReport.details ?? []).map((detail) => ({
            category: MAINTENANCE_ENUM_TO_CATEGORY_LABEL[detail.partCategory] ?? "その他",
            inspectionItems: [],
            note: detail.notes ?? detail.actionNote ?? detail.conditionNote ?? "",
            noIssue: detail.condition === "normal" && detail.action === "inspection_only",
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
          : [
              {
                ...vehicles[0],
                details: [{ category: "", inspectionItems: [], note: "", noIssue: true, condition: "normal", action: "inspection_only", parts: [], photos: [] }],
              },
            ]
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
  };

  const addWorkBlock = () => {
    setWorkBlocks((prev) => [...prev, { department: "maintenance", start: "", end: "" }]);
  };

  const removeWorkBlock = (index: number) => {
    setWorkBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVehicle = (index: number, field: keyof MaintenanceVehicleForm, value: string | boolean) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const addVehicle = () => {
    setMaintenanceVehicles((prev) => [
      ...prev,
      {
        vehicleType: "",
        vehicleName: "",
        purpose: "",
        mileageKm: "",
        workStart: "",
        workEnd: "",
        emergency: false,
        details: [{ category: "", inspectionItems: [], note: "", noIssue: true, condition: "normal", action: "inspection_only", parts: [], photos: [] }],
      },
    ]);
  };

  const removeVehicle = (index: number) => {
    setMaintenanceVehicles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVehicleDetail = (
    vehicleIndex: number,
    detailIndex: number,
    field: keyof MaintenanceDetailForm,
    value: string | boolean | string[]
  ) => {
    setMaintenanceVehicles((prev) =>
      prev.map((v, i) =>
        i === vehicleIndex
          ? {
              ...v,
              details: v.details.map((d, j) => (j === detailIndex ? { ...d, [field]: value } : d)),
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
                { category: "", inspectionItems: [], note: "", noIssue: false, condition: "other", action: "repair", parts: [], photos: [] },
              ],
            }
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
                        { masterCategory: "consumable", partName: "", quantity: "1", unit: "個", position: "" },
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
            ...v,
            details: (v.details ?? []).map((d) => ({
              ...d,
              inspectionItems: d.inspectionItems ?? [],
              parts: d.parts ?? [],
              condition: d.condition ?? (d.noIssue ? "normal" : "other"),
              action: d.action ?? (d.noIssue ? "inspection_only" : "repair"),
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
        details: v.details.map((d) => ({
          ...d,
          inspectionItems: d.inspectionItems ?? [],
          condition: d.condition ?? (d.noIssue ? "normal" : "other"),
          action: d.action ?? (d.noIssue ? "inspection_only" : "repair"),
          photos: [],
        })),
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
      toast.error(validationError);
      return;
    }

    if (formData.department === "maintenance") {
      const saveMaintenance = async () => {
        const firstVehicle = maintenanceVehicles[0];
        const report = await createMaintenanceReportMutation.mutateAsync({
          vehicleType: firstVehicle?.vehicleType || null,
          vehicleNumber: firstVehicle?.vehicleName || null,
          workCategory: MAINTENANCE_PURPOSE_TO_ENUM[firstVehicle?.purpose || "その他"] ?? "other",
          workCategoryNote:
            firstVehicle?.purpose && firstVehicle.purpose !== "その他" ? null : firstVehicle?.purpose || null,
          odometer: firstVehicle?.mileageKm ? Number(firstVehicle.mileageKm) : null,
          workStartTime: firstVehicle?.workStart || null,
          workEndTime: firstVehicle?.workEnd || null,
          workDate: formData.workDate,
          isAccident: maintenanceVehicles.some((v) => v.emergency),
          notes: maintenanceMemo || null,
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
                [detail.inspectionItems?.length ? `点検項目: ${detail.inspectionItems.join(" / ")}` : "", detail.note]
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
              const workTime = v.workStart || v.workEnd ? `作業時間: ${v.workStart || "--:--"}〜${v.workEnd || "--:--"}` : "";
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

  return (
    <div className="space-y-5 max-w-[860px] mx-auto">
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
            {!isMaintenanceFlow && (
              <div>
                <Label htmlFor="department">部署</Label>
                <select
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData((p) => ({ ...p, department: e.target.value }))}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
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
          {(formData.department === "maintenance" || isMaintenanceFlow) && (
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

      {formData.department === "maintenance" || isMaintenanceFlow ? (
        <>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">🚚 車両別整備記録</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void applyLastMaintenanceReport()}
                  disabled={isLoadingLastMaintenance}
                  className="gap-1"
                >
                  前回を反映
                </Button>
                <Button variant="outline" size="sm" onClick={addVehicle} className="gap-1">
                  <Plus className="w-4 h-4" />
                  車両を追加
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {maintenanceVehicles.map((vehicle, vi) => (
                <div key={vi} className="border border-sky-200 rounded-xl p-3.5 space-y-3 bg-sky-50/20">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-sky-900">🚚 車両 {vi + 1}</p>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">車種 *</Label>
                      <select
                        value={vehicle.vehicleType}
                        onChange={(e) => updateVehicle(vi, "vehicleType", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">車種を選択</option>
                        <option value="tractor">トラクタ</option>
                        <option value="trailer">トレーラー</option>
                        <option value="truck">トラック</option>
                        <option value="other">その他</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">作業時間</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 h-9"
                          onClick={() => updateVehicle(vi, "workStart", nowTime())}
                        >
                          <Play className="w-4 h-4 text-blue-600" />
                          作業開始{vehicle.workStart ? ` ${vehicle.workStart}` : ""}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-start gap-2 border-orange-200 text-orange-700 hover:bg-orange-50 h-9"
                          onClick={() => updateVehicle(vi, "workEnd", nowTime())}
                        >
                          <Square className="w-4 h-4 text-orange-600" />
                          作業終了{vehicle.workEnd ? ` ${vehicle.workEnd}` : ""}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">車番・車名 *</Label>
                    <Input
                      placeholder="例: 2154、○○号車"
                      value={vehicle.vehicleName}
                      onChange={(e) => updateVehicle(vi, "vehicleName", e.target.value)}
                    />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">入庫目的 *</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MAINTENANCE_PURPOSES.map((purpose) => (
                        <button
                          key={purpose}
                          type="button"
                          onClick={() => updateVehicle(vi, "purpose", purpose)}
                          className={`h-10 rounded-lg border text-sm ${
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="走行距離（km）"
                      value={vehicle.mileageKm}
                      onChange={(e) => updateVehicle(vi, "mileageKm", e.target.value)}
                    />
                  </div>
                  <label className="h-10 border border-rose-200 bg-rose-50 rounded-md px-3 flex items-center gap-2 text-sm text-rose-700">
                    <input
                      type="checkbox"
                      checked={vehicle.emergency}
                      onChange={(e) => updateVehicle(vi, "emergency", e.target.checked)}
                    />
                    ⚠ 事故・緊急修理フラグ
                  </label>
                  <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">🔧 整備明細</span>
                      <span>{vehicle.details.length}件</span>
                    </div>
                    {vehicle.details.map((detail, di) => (
                      <div key={di} className="rounded-md border border-amber-200/80 bg-white p-3 space-y-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-100/60 px-2.5 py-1.5">
                          <p className="text-xs font-semibold text-amber-800">整備明細 {di + 1}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm border border-emerald-100 bg-emerald-50/50 text-emerald-700 rounded-md px-2.5 py-2">
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
                          すべて異常なし（点検のみ）
                        </label>
                        <p className="text-xs font-medium text-muted-foreground">整備部位カテゴリ *</p>
                        <div className="grid grid-cols-2 gap-2">
                          {MAINTENANCE_CATEGORIES.map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => {
                                updateVehicleDetail(vi, di, "category", category);
                                updateVehicleDetail(vi, di, "inspectionItems", []);
                              }}
                              className={`h-10 rounded-lg border text-sm transition-colors ${
                                detail.category === category
                                  ? "border-amber-400 bg-amber-200 text-amber-950"
                                  : "border-amber-200 bg-amber-50/60 text-amber-900 hover:bg-amber-100"
                              }`}
                            >
                              {category}
                            </button>
                          ))}
                        </div>
                        {detail.category && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">点検項目</p>
                            <div className="grid grid-cols-2 gap-2">
                              {(MAINTENANCE_CATEGORY_ITEMS[detail.category] ?? []).map((item) => {
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
                                      updateVehicleDetail(vi, di, "inspectionItems", next);
                                    }}
                                    className={`h-9 rounded-md border text-xs ${
                                      selected
                                        ? "border-sky-300 bg-sky-100 text-sky-900"
                                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                  >
                                    {item}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">状態 *</p>
                            <select
                              value={detail.condition}
                              onChange={(e) =>
                                updateVehicleDetail(
                                  vi,
                                  di,
                                  "condition",
                                  e.target.value as "normal" | "worn" | "damaged" | "cracked" | "leaking" | "bulb_out" | "other"
                                )
                              }
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              {MAINTENANCE_CONDITIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">処置 *</p>
                            <select
                              value={detail.action}
                              onChange={(e) =>
                                updateVehicleDetail(
                                  vi,
                                  di,
                                  "action",
                                  e.target.value as
                                    | "inspection_only"
                                    | "cleaning"
                                    | "adjustment"
                                    | "lubrication"
                                    | "parts_replacement"
                                    | "repair"
                                    | "observation"
                                    | "other"
                                )
                              }
                              className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                            >
                              {MAINTENANCE_ACTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground">使用部品</p>
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
                          {(detail.parts ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">部品がある場合のみ追加してください</p>
                          ) : (
                            <div className="space-y-2">
                              {(detail.parts ?? []).map((part, partIndex) => (
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
                                          e.target.value as "oil_fluid" | "consumable" | "misc" | "repair_work" | "exterior"
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
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
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
                        <textarea
                          rows={2}
                          placeholder="特記事項（任意）"
                          value={detail.note}
                          onChange={(e) => updateVehicleDetail(vi, di, "note", e.target.value)}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addVehicleDetail(vi)}
                      className="w-full border-dashed border-amber-300 text-amber-700 hover:bg-amber-100/40"
                    >
                      + 整備明細を追加
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

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

      {/* 送信ボタン */}
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
    </div>
  );
}
