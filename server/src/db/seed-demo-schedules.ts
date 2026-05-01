/**
 * Local-only demo schedules for UI verification.
 * Env is loaded by ./client (repo-root .env). Run:
 * ALLOW_DEMO_SCHEDULE_SEED=1 npm run db:seed:demo
 *
 * Removes only rows whose title starts with "[DEMO]", then inserts demo data.
 * Not wired into db:seed; must never run against production.
 */

import { eq, like } from "drizzle-orm";
import { db } from "./client";
import { schedules, users } from "./schema";

const DEMO_TITLE_PREFIX = "[DEMO]";

const DEPT_TITLES = [
  `${DEMO_TITLE_PREFIX} Vehicle Check`,
  `${DEMO_TITLE_PREFIX} Paint Prep`,
  `${DEMO_TITLE_PREFIX} Slitter Work`,
  `${DEMO_TITLE_PREFIX} Drone Check`,
  `${DEMO_TITLE_PREFIX} Team Meeting`,
  `${DEMO_TITLE_PREFIX} Site Review`,
  `${DEMO_TITLE_PREFIX} Training`,
  `${DEMO_TITLE_PREFIX} Material Check`,
] as const;

const PERSONAL_TITLES = [
  `${DEMO_TITLE_PREFIX} Personal Task`,
  `${DEMO_TITLE_PREFIX} Follow Up`,
  `${DEMO_TITLE_PREFIX} Training`,
  `${DEMO_TITLE_PREFIX} Team Meeting`,
  `${DEMO_TITLE_PREFIX} Site Review`,
] as const;

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180] as const;

const DEMO_BUSINESS_DEPTS = ["maintenance", "painting", "slitter", "drone"] as const;

type DemoBusinessDept = (typeof DEMO_BUSINESS_DEPTS)[number];

type ScheduleDepartment = "maintenance" | "painting" | "slitter" | "drone" | "all" | "personal";

function assertSafeToRun(): void {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV is production.");
    process.exit(1);
  }
  if (process.env.ALLOW_DEMO_SCHEDULE_SEED !== "1") {
    console.error("Refusing to run: set ALLOW_DEMO_SCHEDULE_SEED=1");
    process.exit(1);
  }
  const rawHost = process.env.DB_HOST ?? "localhost";
  const host = rawHost.trim().toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error("Refusing to run: DB_HOST must be localhost or 127.0.0.1 (got:", rawHost, ")");
    process.exit(1);
  }
}

function parseTargetMonth(): { year: number; month: number; label: string } {
  const env = process.env.DEMO_SCHEDULE_MONTH?.trim();
  if (env && /^\d{4}-\d{2}$/.test(env)) {
    const [y, m] = env.split("-").map((x) => parseInt(x, 10));
    if (m >= 1 && m <= 12) {
      return { year: y, month: m, label: `${env} (from DEMO_SCHEDULE_MONTH)` };
    }
  }
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { year: y, month: mo, label: `${y}-${pad(mo)} (default: current month)` };
}

/** Department demo rows: concrete dept only (no scheduleDepartment=all). */
function demoDepartmentKeyForUser(userDept: string | null, day: number, userId: number): DemoBusinessDept {
  const d = userDept?.trim().toLowerCase() ?? "";
  if (d === "maintenance" || d === "painting" || d === "slitter" || d === "drone") {
    return d;
  }
  const idx = (day + userId * 3) % DEMO_BUSINESS_DEPTS.length;
  return DEMO_BUSINESS_DEPTS[idx];
}

function durationMins(seed: number): number {
  return DURATION_OPTIONS[Math.abs(seed) % DURATION_OPTIONS.length];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function main() {
  assertSafeToRun();

  const { year, month, label: monthLabel } = parseTargetMonth();
  const dbHost = process.env.DB_HOST ?? "localhost";
  const dbName = process.env.DB_NAME ?? "kofuji_ops";

  console.log("DB_HOST:", dbHost);
  console.log("DB_NAME:", dbName);
  console.log("DEMO_SCHEDULE_MONTH:", monthLabel);

  const daysInMonth = new Date(year, month, 0).getDate();

  const teamUsers = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true));

  if (teamUsers.length === 0) {
    console.error("No active users found; aborting.");
    process.exit(1);
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.username, "admin"))
    .limit(1);

  if (!admin) {
    console.error("User with username=admin not found; cannot set createdBy.");
    process.exit(1);
  }

  const createdBy = admin.id;
  const dedup = new Set<string>();
  const rows: Array<{
    userId: number;
    title: string;
    description: null;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    color: null;
    scheduleType: "department" | "personal";
    scheduleDepartment: ScheduleDepartment;
    resourceName: null;
    createdBy: number;
    isDeleted: boolean;
  }> = [];

  function tryPush(payload: {
    userId: number;
    title: string;
    startAt: Date;
    endAt: Date;
    scheduleType: "department" | "personal";
    scheduleDepartment: ScheduleDepartment;
  }): void {
    const d = payload.startAt;
    const dateKey = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const key = `${payload.userId}|${dateKey}|${payload.startAt.getTime()}|${payload.title}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    rows.push({
      userId: payload.userId,
      title: payload.title,
      description: null,
      startAt: payload.startAt,
      endAt: payload.endAt,
      allDay: false,
      color: null,
      scheduleType: payload.scheduleType,
      scheduleDepartment: payload.scheduleDepartment,
      resourceName: null,
      createdBy,
      isDeleted: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    for (const user of teamUsers) {
      const seed = day + user.id;
      const deptKey = demoDepartmentKeyForUser(user.department ?? null, day, user.id);

      if (seed % 2 === 0) {
        const h = 8 + (day % 5);
        const minute = (user.id * 3 + day * 11) % 60;
        const startAt = new Date(year, month - 1, day, h, minute, 0);
        const dur = durationMins(seed * 7 + user.id);
        const endAt = new Date(startAt.getTime() + dur * 60 * 1000);
        const title = DEPT_TITLES[(day * 17 + user.id * 3) % DEPT_TITLES.length];
        tryPush({
          userId: user.id,
          title,
          startAt,
          endAt,
          scheduleType: "department",
          scheduleDepartment: deptKey,
        });
      }

      if (seed % 3 !== 0) {
        const h = 13 + ((day + user.id) % 5);
        const minute = (user.id * 5 + day * 13 + 17) % 60;
        const startAt = new Date(year, month - 1, day, h, minute, 0);
        const dur = durationMins(seed * 11 + user.id * 5);
        const endAt = new Date(startAt.getTime() + dur * 60 * 1000);
        const title = PERSONAL_TITLES[(day * 19 + user.id * 7) % PERSONAL_TITLES.length];
        tryPush({
          userId: user.id,
          title,
          startAt,
          endAt,
          scheduleType: "personal",
          scheduleDepartment: "personal",
        });
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(schedules).where(like(schedules.title, `${DEMO_TITLE_PREFIX}%`));
    if (rows.length > 0) {
      await tx.insert(schedules).values(rows);
    }
  });

  console.log(
    `Demo schedules applied for ${year}-${pad2(month)}: removed prior [DEMO] rows, inserted ${rows.length} rows for ${teamUsers.length} user(s).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("Demo schedule seed failed:", e);
  process.exit(1);
});
