import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  int,
  float,
  timestamp,
  date,
  text,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 255 }).unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 100 }),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // role: "user" | "manager" | "admin"
  department: varchar("department", { length: 50 }),
  // department: "maintenance" | "painting" | "slitter" | "drone" | "admin"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  attendances: many(attendances),
  reports: many(reports),
  schedules: many(schedules),
}));

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: int("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Attendance ───────────────────────────────────────────────────────────────
//
// 1日に最大3回の出退勤に対応。
// clockIn/clockOut が 1回目、clockIn2/clockOut2 が 2回目、clockIn3/clockOut3 が 3回目。
//
// IMPORTANT: フロントエンドの状態判定ロジック（calcAttendanceStep）は
//            この 6 カラム構造を前提としている。
//            カラムを変更する場合は Home.tsx と Attendance.tsx の
//            calcAttendanceStep 関数も必ず合わせて修正すること。

export const attendances = mysqlTable(
  "attendances",
  {
    id: serial("id").primaryKey(),
    userId: int("user_id").notNull(),
    workDate: date("work_date").notNull(), // "YYYY-MM-DD"
    attendanceType: varchar("attendance_type", { length: 20 }).notNull().default("normal"),
    // attendanceType: "normal" | "paid_leave" | "absence" | "late" | "early_leave"
    clockIn: timestamp("clock_in"),
    clockOut: timestamp("clock_out"),
    clockIn2: timestamp("clock_in_2"),
    clockOut2: timestamp("clock_out_2"),
    clockIn3: timestamp("clock_in_3"),
    clockOut3: timestamp("clock_out_3"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    userDateIdx: index("user_date_idx").on(table.userId, table.workDate),
  })
);

export const attendancesRelations = relations(attendances, ({ one }) => ({
  user: one(users, { fields: [attendances.userId], references: [users.id] }),
}));

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reports = mysqlTable("reports", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  workDate: date("work_date").notNull(),
  department: varchar("department", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // status: "draft" | "submitted" | "approved" | "rejected"
  sharedInfo: text("shared_info"),
  orderInfo: text("order_info"),
  isShared: boolean("is_shared").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const reportsRelations = relations(reports, ({ one, many }) => ({
  user: one(users, { fields: [reports.userId], references: [users.id] }),
  tasks: many(reportTasks),
}));

// ─── Report Tasks ─────────────────────────────────────────────────────────────

export const reportTasks = mysqlTable("report_tasks", {
  id: serial("id").primaryKey(),
  reportId: int("report_id").notNull(),
  vehicleNumber: varchar("vehicle_number", { length: 50 }),
  taskType: varchar("task_type", { length: 50 }),
  content: text("content"),
  isCompleted: boolean("is_completed").notNull().default(false),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const reportTasksRelations = relations(reportTasks, ({ one }) => ({
  report: one(reports, { fields: [reportTasks.reportId], references: [reports.id] }),
}));

// ─── Schedules ────────────────────────────────────────────────────────────────

export const schedules = mysqlTable("schedules", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const schedulesRelations = relations(schedules, ({ one }) => ({
  user: one(users, { fields: [schedules.userId], references: [users.id] }),
}));

// ─── Maintenance Records ──────────────────────────────────────────────────────

export const maintenanceRecords = mysqlTable("maintenance_records", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  vehicleNumber: varchar("vehicle_number", { length: 50 }).notNull(),
  workDate: date("work_date").notNull(),
  workType: varchar("work_type", { length: 50 }),
  content: text("content"),
  parts: json("parts"),
  status: varchar("status", { length: 20 }).notNull().default("in_progress"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ─── Maintenance Reports (new normalized model) ───────────────────────────────

export const maintenanceReports = mysqlTable("maintenance_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  vehicleType: varchar("vehicleType", { length: 100 }),
  vehicleNumber: varchar("vehicleNumber", { length: 50 }),
  workCategory: mysqlEnum("workCategory", [
    "legal_inspection_3month",
    "legal_inspection_12month",
    "vehicle_inspection",
    "general_repair",
    "scheduled_maintenance",
    "accident_repair",
    "roadside_repair",
    "other",
  ]).notNull(),
  workCategoryNote: text("workCategoryNote"),
  odometer: int("odometer"),
  workStartTime: varchar("workStartTime", { length: 10 }),
  workEndTime: varchar("workEndTime", { length: 10 }),
  workMinutes: int("workMinutes"),
  workDate: date("workDate").notNull(),
  isAccident: boolean("isAccident").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
});

export const maintenanceDetails = mysqlTable("maintenance_details", {
  id: serial("id").primaryKey(),
  reportId: int("reportId").notNull(),
  partCategory: mysqlEnum("partCategory", [
    "engine",
    "drivetrain",
    "suspension",
    "brake",
    "electrical",
    "body",
    "other",
  ]).notNull(),
  partCategoryNote: text("partCategoryNote"),
  condition: mysqlEnum("condition", [
    "normal",
    "worn",
    "damaged",
    "cracked",
    "leaking",
    "bulb_out",
    "other",
  ]).notNull(),
  conditionNote: text("conditionNote"),
  action: mysqlEnum("action", [
    "inspection_only",
    "cleaning",
    "adjustment",
    "lubrication",
    "parts_replacement",
    "repair",
    "observation",
    "other",
  ]).notNull(),
  actionNote: text("actionNote"),
  notes: text("notes"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
});

export const maintenancePhotos = mysqlTable("maintenance_photos", {
  id: serial("id").primaryKey(),
  detailId: int("detailId").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const maintenanceParts = mysqlTable("maintenance_parts", {
  id: serial("id").primaryKey(),
  detailId: int("detailId").notNull(),
  masterCategory: mysqlEnum("masterCategory", [
    "oil_fluid",
    "consumable",
    "misc",
    "repair_work",
    "exterior",
  ]).notNull(),
  partName: varchar("partName", { length: 200 }).notNull(),
  partNameFree: text("partNameFree"),
  quantity: float("quantity").notNull().default(1),
  unit: varchar("unit", { length: 20 }).notNull().default("個"),
  position: varchar("position", { length: 50 }),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
});

// ─── Purchase Requests ────────────────────────────────────────────────────────

export const purchaseRequests = mysqlTable("purchase_requests", {
  id: serial("id").primaryKey(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: int("amount"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // status: "pending" | "approved" | "rejected" | "purchased"
  approvedBy: int("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Attendance = typeof attendances.$inferSelect;
export type NewAttendance = typeof attendances.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportTask = typeof reportTasks.$inferSelect;
export type NewReportTask = typeof reportTasks.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type MaintenanceRecord = typeof maintenanceRecords.$inferSelect;
export type MaintenanceReport = typeof maintenanceReports.$inferSelect;
export type NewMaintenanceReport = typeof maintenanceReports.$inferInsert;
export type MaintenanceDetail = typeof maintenanceDetails.$inferSelect;
export type NewMaintenanceDetail = typeof maintenanceDetails.$inferInsert;
export type MaintenancePhoto = typeof maintenancePhotos.$inferSelect;
export type NewMaintenancePhoto = typeof maintenancePhotos.$inferInsert;
export type MaintenancePart = typeof maintenanceParts.$inferSelect;
export type NewMaintenancePart = typeof maintenanceParts.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
