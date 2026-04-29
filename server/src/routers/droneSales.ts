import { z } from "zod";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../lib/trpc";
import { db } from "../db";
import { reports, users } from "../db/schema";

export const droneSalesRouter = router({
  getMonthlySummary: protectedProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input }) => {
      const { year, month } = input;
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const endStr = `${year}-${String(month).padStart(2, "0")}-31`;
      const rows = await db
        .select({ id: reports.id, workDate: reports.workDate, userId: reports.userId, droneDetails: reports.droneDetails })
        .from(reports)
        .where(
          and(
            eq(reports.department, "drone"),
            gte(reports.workDate, new Date(startStr)),
            lte(reports.workDate, new Date(endStr)),
            eq(reports.status, "submitted")
          )
        );

      const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const userRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
        for (const u of userRows) {
          userMap[u.id] = u.name ?? "不明";
        }
      }

      type DroneDetail = {
        trainingType?: string;
        trainingName?: string;
        salesAmount?: number;
        result?: string;
        note?: string;
        count?: number;
        attendees?: Array<{ type: string; company?: string; name: string }>;
      };

      const dailyMap: Record<string, { date: string; totalSales: number; lectureCount: number; attendeeCount: number }> = {};
      const trainingMap: Record<string, { trainingType: string; totalSales: number; lectureCount: number; attendeeCount: number }> = {};
      const details: Array<{
        reportId: number;
        workDate: string;
        userName: string;
        trainingType: string;
        trainingName: string;
        salesAmount: number;
        attendeeCount: number;
        result: string;
        note: string;
      }> = [];
      let totalSales = 0, totalLectures = 0, totalAttendees = 0;

      for (const row of rows) {
        const dateStr = typeof row.workDate === "string" ? row.workDate : (row.workDate as Date).toISOString().slice(0, 10);
        if (!dailyMap[dateStr]) dailyMap[dateStr] = { date: dateStr, totalSales: 0, lectureCount: 0, attendeeCount: 0 };
        if (row.droneDetails) {
          const droneDetails = JSON.parse(row.droneDetails) as DroneDetail[];
          for (const d of droneDetails) {
            const amount = d.salesAmount ?? 0;
            const attendeeCount = d.attendees?.length ?? d.count ?? 0;
            const tType = d.trainingType || "不明";
            dailyMap[dateStr].totalSales += amount;
            dailyMap[dateStr].lectureCount++;
            dailyMap[dateStr].attendeeCount += attendeeCount;
            totalSales += amount;
            totalLectures++;
            totalAttendees += attendeeCount;
            if (!trainingMap[tType]) trainingMap[tType] = { trainingType: tType, totalSales: 0, lectureCount: 0, attendeeCount: 0 };
            trainingMap[tType].totalSales += amount;
            trainingMap[tType].lectureCount++;
            trainingMap[tType].attendeeCount += attendeeCount;
            details.push({
              reportId: row.id,
              workDate: dateStr,
              userName: userMap[row.userId] ?? "不明",
              trainingType: tType,
              trainingName: d.trainingName ?? "",
              salesAmount: amount,
              attendeeCount,
              result: d.result ?? "",
              note: d.note ?? "",
            });
          }
        }
      }

      const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      const trainingData = Object.values(trainingMap).sort((a, b) => b.totalSales - a.totalSales);
      return { year, month, totalSales, totalLectures, totalAttendees, dailyData, trainingData, details };
    }),

  getYearlySummary: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const { year } = input;
      const rows = await db
        .select({ workDate: reports.workDate, droneDetails: reports.droneDetails })
        .from(reports)
        .where(
          and(
            eq(reports.department, "drone"),
            gte(reports.workDate, new Date(`${year}-01-01`)),
            lte(reports.workDate, new Date(`${year}-12-31`)),
            eq(reports.status, "submitted")
          )
        );

      type DroneDetail = { salesAmount?: number; attendees?: unknown[]; count?: number };
      const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, totalSales: 0, lectureCount: 0, attendeeCount: 0 }));
      for (const row of rows) {
        const dateStr = typeof row.workDate === "string" ? row.workDate : (row.workDate as Date).toISOString().slice(0, 10);
        const m = parseInt(dateStr.slice(5, 7)) - 1;
        if (row.droneDetails) {
          const details = JSON.parse(row.droneDetails) as DroneDetail[];
          for (const d of details) {
            monthly[m].totalSales += d.salesAmount ?? 0;
            monthly[m].lectureCount++;
            monthly[m].attendeeCount += (d.attendees?.length ?? d.count ?? 0);
          }
        }
      }
      return { year, monthly };
    }),
});
