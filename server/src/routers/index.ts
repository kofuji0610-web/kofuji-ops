import { router } from "../lib/trpc";
import { authRouter } from "./auth";
import { attendanceRouter } from "./attendance";
import { reportsRouter, reportTasksRouter } from "./reports";
import { usersRouter } from "./users";
import { schedulesRouter } from "./schedules";
import { maintenanceRouter } from "./maintenance";

export const appRouter = router({
  auth: authRouter,
  attendance: attendanceRouter,
  reports: reportsRouter,
  reportTasks: reportTasksRouter,
  users: usersRouter,
  schedules: schedulesRouter,
  maintenance: maintenanceRouter,
});

export type AppRouter = typeof appRouter;
