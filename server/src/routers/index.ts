import { router } from "../lib/trpc";
import { authRouter } from "./auth";
import { attendanceRouter } from "./attendance";
import { reportsRouter, reportTasksRouter } from "./reports";
import { usersRouter } from "./users";
import { schedulesRouter } from "./schedules";
import { maintenanceRouter } from "./maintenance";
import { droneSalesRouter } from "./droneSales";

export const appRouter = router({
  auth: authRouter,
  attendance: attendanceRouter,
  reports: reportsRouter,
  reportTasks: reportTasksRouter,
  users: usersRouter,
  schedules: schedulesRouter,
  maintenance: maintenanceRouter,
  droneSales: droneSalesRouter,
});

export type AppRouter = typeof appRouter;
