import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import {
  maintenanceDetails,
  maintenanceParts,
  maintenancePhotos,
  maintenanceReports,
} from "../db/schema";
import {
  addMaintenancePhoto,
  createMaintenanceDetail,
  createMaintenancePart,
  createMaintenanceReport,
  deleteMaintenanceDetail,
  deleteMaintenancePart,
  deleteMaintenancePhoto,
  getDetailsByReportId,
  getFullMaintenanceReport,
  getMaintenanceReportById,
  getPartsByDetailId,
  getPhotosByDetailId,
  listMaintenanceReports,
  updateMaintenanceDetail,
  updateMaintenancePart,
  updateMaintenanceReport,
} from "../maintenanceDb";

const workCategoryEnum = z.enum([
  "legal_inspection_3month",
  "legal_inspection_12month",
  "vehicle_inspection",
  "general_repair",
  "scheduled_maintenance",
  "accident_repair",
  "roadside_repair",
  "other",
]);

const partCategoryEnum = z.enum([
  "engine",
  "drivetrain",
  "suspension",
  "brake",
  "electrical",
  "body",
  "other",
]);

const conditionEnum = z.enum([
  "normal",
  "worn",
  "damaged",
  "cracked",
  "leaking",
  "bulb_out",
  "other",
]);

const actionEnum = z.enum([
  "inspection_only",
  "cleaning",
  "adjustment",
  "lubrication",
  "parts_replacement",
  "repair",
  "observation",
  "other",
]);

const masterCategoryEnum = z.enum([
  "oil_fluid",
  "consumable",
  "misc",
  "repair_work",
  "exterior",
]);

function canViewReport(viewer: { id: number; role: string }, ownerUserId: number) {
  if (viewer.id === ownerUserId) return true;
  return viewer.role === "admin" || viewer.role === "manager";
}

function canManageOthers(viewerRole: string) {
  return viewerRole === "admin" || viewerRole === "manager";
}

export const maintenanceRouter = router({
  createReport: protectedProcedure
    .input(
      z.object({
        userId: z.number().optional(),
        vehicleType: z.string().optional().nullable(),
        vehicleNumber: z.string().optional().nullable(),
        workCategory: workCategoryEnum,
        workCategoryNote: z.string().optional().nullable(),
        odometer: z.number().optional().nullable(),
        workStartTime: z.string().optional().nullable(),
        workEndTime: z.string().optional().nullable(),
        workMinutes: z.number().optional().nullable(),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isAccident: z.boolean().optional().default(false),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUserId =
        input.userId && canManageOthers(ctx.user.role) ? input.userId : ctx.user.id;

      const reportId = await createMaintenanceReport({
        userId: targetUserId,
        vehicleType: input.vehicleType ?? null,
        vehicleNumber: input.vehicleNumber ?? null,
        workCategory: input.workCategory,
        workCategoryNote: input.workCategoryNote ?? null,
        odometer: input.odometer ?? null,
        workStartTime: input.workStartTime ?? null,
        workEndTime: input.workEndTime ?? null,
        workMinutes: input.workMinutes ?? null,
        workDate: new Date(`${input.workDate}T00:00:00`),
        isAccident: input.isAccident ?? false,
        notes: input.notes ?? null,
      });

      return { id: reportId };
    }),

  updateReport: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        vehicleType: z.string().optional().nullable(),
        vehicleNumber: z.string().optional().nullable(),
        workCategory: workCategoryEnum.optional(),
        workCategoryNote: z.string().optional().nullable(),
        odometer: z.number().optional().nullable(),
        workStartTime: z.string().optional().nullable(),
        workEndTime: z.string().optional().nullable(),
        workMinutes: z.number().optional().nullable(),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        isAccident: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getMaintenanceReportById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, existing.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const { id, workDate, ...rest } = input;
      await updateMaintenanceReport(id, {
        ...rest,
        ...(workDate ? { workDate: new Date(`${workDate}T00:00:00`) } : {}),
      });
      return { success: true };
    }),

  getReport: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const full = await getFullMaintenanceReport(input.id);
      if (!full) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, full.report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }
      return full;
    }),

  listReports: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId
        ? canManageOthers(ctx.user.role)
          ? input.userId
          : ctx.user.id
        : canManageOthers(ctx.user.role)
        ? undefined
        : ctx.user.id;

      const rows = await listMaintenanceReports(targetUserId);
      return rows;
    }),

  addDetail: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        partCategory: partCategoryEnum,
        partCategoryNote: z.string().optional().nullable(),
        condition: conditionEnum,
        conditionNote: z.string().optional().nullable(),
        action: actionEnum,
        actionNote: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await getMaintenanceReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const id = await createMaintenanceDetail({
        reportId: input.reportId,
        partCategory: input.partCategory,
        partCategoryNote: input.partCategoryNote ?? null,
        condition: input.condition,
        conditionNote: input.conditionNote ?? null,
        action: input.action,
        actionNote: input.actionNote ?? null,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder ?? 0,
      });
      return { id };
    }),

  updateDetail: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        partCategory: partCategoryEnum.optional(),
        partCategoryNote: z.string().optional().nullable(),
        condition: conditionEnum.optional(),
        conditionNote: z.string().optional().nullable(),
        action: actionEnum.optional(),
        actionNote: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.id))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });

      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const { id, ...data } = input;
      await updateMaintenanceDetail(id, data);
      return { success: true };
    }),

  deleteDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.id))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });

      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "削除権限がありません" });
      }

      await deleteMaintenanceDetail(input.id);
      return { success: true };
    }),

  getDetails: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const report = await getMaintenanceReportById(input.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }
      return getDetailsByReportId(input.reportId);
    }),

  uploadPhoto: protectedProcedure
    .input(
      z.object({
        detailId: z.number(),
        fileName: z.string().min(1).max(200),
        fileType: z.string().min(1).max(100),
        fileBase64: z.string().min(1).max(1_400_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.detailId))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });
      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const normalizedType = input.fileType.toLowerCase();
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(normalizedType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "jpg/png/webp のみ添付できます" });
      }

      const existingPhotos = await getPhotosByDetailId(input.detailId);
      if (existingPhotos.length >= 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "写真は整備明細ごとに3枚までです" });
      }

      // NOTE: External file storage integration is intentionally deferred.
      const id = await addMaintenancePhoto({
        detailId: input.detailId,
        fileKey: `pending/${Date.now()}-${input.fileName}`,
        fileUrl: "",
        fileName: input.fileName,
      });
      return { id, pending: true };
    }),

  deletePhoto: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [photo] = await db
        .select({ photo: maintenancePhotos, detail: maintenanceDetails, report: maintenanceReports })
        .from(maintenancePhotos)
        .innerJoin(maintenanceDetails, eq(maintenancePhotos.detailId, maintenanceDetails.id))
        .innerJoin(maintenanceReports, eq(maintenanceDetails.reportId, maintenanceReports.id))
        .where(eq(maintenancePhotos.id, input.id))
        .limit(1);
      if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "写真が見つかりません" });
      if (!canViewReport(ctx.user, photo.report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "削除権限がありません" });
      }
      await deleteMaintenancePhoto(input.id);
      return { success: true };
    }),

  getPhotos: protectedProcedure
    .input(z.object({ detailId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.detailId))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });
      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }
      return getPhotosByDetailId(input.detailId);
    }),

  addPart: protectedProcedure
    .input(
      z.object({
        detailId: z.number(),
        masterCategory: masterCategoryEnum,
        partName: z.string().min(1).max(200),
        partNameFree: z.string().optional().nullable(),
        quantity: z.number().default(1),
        unit: z.string().min(1).max(20).default("個"),
        position: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.detailId))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });
      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }

      const id = await createMaintenancePart({
        detailId: input.detailId,
        masterCategory: input.masterCategory,
        partName: input.partName,
        partNameFree: input.partNameFree ?? null,
        quantity: input.quantity,
        unit: input.unit,
        position: input.position ?? null,
        sortOrder: input.sortOrder ?? 0,
      });
      return { id };
    }),

  updatePart: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        masterCategory: masterCategoryEnum.optional(),
        partName: z.string().min(1).max(200).optional(),
        partNameFree: z.string().optional().nullable(),
        quantity: z.number().optional(),
        unit: z.string().min(1).max(20).optional(),
        position: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({
          part: maintenanceParts,
          detail: maintenanceDetails,
          report: maintenanceReports,
        })
        .from(maintenanceParts)
        .innerJoin(maintenanceDetails, eq(maintenanceParts.detailId, maintenanceDetails.id))
        .innerJoin(maintenanceReports, eq(maintenanceDetails.reportId, maintenanceReports.id))
        .where(eq(maintenanceParts.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "部品が見つかりません" });
      if (!canViewReport(ctx.user, row.report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "更新権限がありません" });
      }
      const { id, ...data } = input;
      await updateMaintenancePart(id, data);
      return { success: true };
    }),

  deletePart: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({
          part: maintenanceParts,
          detail: maintenanceDetails,
          report: maintenanceReports,
        })
        .from(maintenanceParts)
        .innerJoin(maintenanceDetails, eq(maintenanceParts.detailId, maintenanceDetails.id))
        .innerJoin(maintenanceReports, eq(maintenanceDetails.reportId, maintenanceReports.id))
        .where(eq(maintenanceParts.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "部品が見つかりません" });
      if (!canViewReport(ctx.user, row.report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "削除権限がありません" });
      }
      await deleteMaintenancePart(input.id);
      return { success: true };
    }),

  getParts: protectedProcedure
    .input(z.object({ detailId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [detail] = await db
        .select()
        .from(maintenanceDetails)
        .where(eq(maintenanceDetails.id, input.detailId))
        .limit(1);
      if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "明細が見つかりません" });
      const report = await getMaintenanceReportById(detail.reportId);
      if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "日報が見つかりません" });
      if (!canViewReport(ctx.user, report.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "閲覧権限がありません" });
      }
      return getPartsByDetailId(input.detailId);
    }),

  getLastReport: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select()
      .from(maintenanceReports)
      .where(eq(maintenanceReports.userId, ctx.user.id))
      .orderBy(desc(maintenanceReports.workDate), desc(maintenanceReports.id))
      .limit(1);
    if (!row) return null;
    return getFullMaintenanceReport(row.id);
  }),
});

