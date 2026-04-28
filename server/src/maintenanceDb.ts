import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  maintenanceDetails,
  maintenanceParts,
  maintenancePhotos,
  maintenanceReports,
} from "./db/schema";

type InsertResult = { insertId: number };

export async function createMaintenanceReport(
  data: typeof maintenanceReports.$inferInsert
): Promise<number> {
  const [result] = await db.insert(maintenanceReports).values(data);
  return (result as InsertResult).insertId;
}

export async function updateMaintenanceReport(
  id: number,
  data: Partial<typeof maintenanceReports.$inferInsert>
) {
  await db.update(maintenanceReports).set(data).where(eq(maintenanceReports.id, id));
}

export async function getMaintenanceReportById(id: number) {
  const [row] = await db.select().from(maintenanceReports).where(eq(maintenanceReports.id, id)).limit(1);
  return row ?? null;
}

export async function listMaintenanceReports(userId?: number) {
  const rows = userId
    ? await db
        .select()
        .from(maintenanceReports)
        .where(eq(maintenanceReports.userId, userId))
        .orderBy(desc(maintenanceReports.workDate), desc(maintenanceReports.id))
    : await db
        .select()
        .from(maintenanceReports)
        .orderBy(desc(maintenanceReports.workDate), desc(maintenanceReports.id));
  return rows;
}

export async function createMaintenanceDetail(
  data: typeof maintenanceDetails.$inferInsert
): Promise<number> {
  const [result] = await db.insert(maintenanceDetails).values(data);
  return (result as InsertResult).insertId;
}

export async function updateMaintenanceDetail(
  id: number,
  data: Partial<typeof maintenanceDetails.$inferInsert>
) {
  await db.update(maintenanceDetails).set(data).where(eq(maintenanceDetails.id, id));
}

export async function deleteMaintenanceDetail(id: number) {
  await db.delete(maintenancePhotos).where(eq(maintenancePhotos.detailId, id));
  await db.delete(maintenanceParts).where(eq(maintenanceParts.detailId, id));
  await db.delete(maintenanceDetails).where(eq(maintenanceDetails.id, id));
}

export async function getDetailsByReportId(reportId: number) {
  return db
    .select()
    .from(maintenanceDetails)
    .where(eq(maintenanceDetails.reportId, reportId))
    .orderBy(maintenanceDetails.sortOrder, maintenanceDetails.id);
}

export async function addMaintenancePhoto(
  data: typeof maintenancePhotos.$inferInsert
): Promise<number> {
  const [result] = await db.insert(maintenancePhotos).values(data);
  return (result as InsertResult).insertId;
}

export async function deleteMaintenancePhoto(id: number) {
  await db.delete(maintenancePhotos).where(eq(maintenancePhotos.id, id));
}

export async function getPhotosByDetailId(detailId: number) {
  return db
    .select()
    .from(maintenancePhotos)
    .where(eq(maintenancePhotos.detailId, detailId))
    .orderBy(maintenancePhotos.sortOrder, maintenancePhotos.id);
}

export async function createMaintenancePart(
  data: typeof maintenanceParts.$inferInsert
): Promise<number> {
  const [result] = await db.insert(maintenanceParts).values(data);
  return (result as InsertResult).insertId;
}

export async function updateMaintenancePart(
  id: number,
  data: Partial<typeof maintenanceParts.$inferInsert>
) {
  await db.update(maintenanceParts).set(data).where(eq(maintenanceParts.id, id));
}

export async function deleteMaintenancePart(id: number) {
  await db.delete(maintenanceParts).where(eq(maintenanceParts.id, id));
}

export async function getPartsByDetailId(detailId: number) {
  return db
    .select()
    .from(maintenanceParts)
    .where(eq(maintenanceParts.detailId, detailId))
    .orderBy(maintenanceParts.sortOrder, maintenanceParts.id);
}

export async function getFullMaintenanceReport(reportId: number) {
  const report = await getMaintenanceReportById(reportId);
  if (!report) return null;

  const details = await getDetailsByReportId(reportId);
  const detailIds = details.map((d) => d.id);
  if (detailIds.length === 0) return { report, details: [] };

  const photosByDetail = new Map<number, Awaited<ReturnType<typeof getPhotosByDetailId>>>();
  const partsByDetail = new Map<number, Awaited<ReturnType<typeof getPartsByDetailId>>>();
  for (const detailId of detailIds) {
    photosByDetail.set(detailId, await getPhotosByDetailId(detailId));
    partsByDetail.set(detailId, await getPartsByDetailId(detailId));
  }

  return {
    report,
    details: details.map((d) => ({
      ...d,
      photos: photosByDetail.get(d.id) ?? [],
      parts: partsByDetail.get(d.id) ?? [],
    })),
  };
}

