import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

export default {
  schema: "./src/db/schema.ts",
  out: "../migrations",
  driver: "mysql2",
  dbCredentials: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "3306"),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "kofuji_ops",
  },
} satisfies Config;
