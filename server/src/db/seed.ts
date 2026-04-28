/**
 * データベース初期データ投入スクリプト
 * 実行: npm run db:seed
 *
 * 初期ユーザーを作成します。
 * パスワードは .env の PASSWORD_SALT と組み合わせてハッシュ化されます。
 */

import { users } from "./schema";
import { createHash } from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function hashPassword(password: string): Promise<string> {
  return createHash("sha256")
    .update(password + (process.env.PASSWORD_SALT ?? "default_salt"))
    .digest("hex");
}

async function seed() {
  const { db } = await import("./index");

  console.log("🌱 Seeding database...");

  const adminPassword = await hashPassword("admin123");
  const userPassword = await hashPassword("user123");

  await db
    .insert(users)
    .values([
      {
        username: "admin",
        passwordHash: adminPassword,
        name: "管理者",
        displayName: "管理者",
        role: "admin",
        department: "admin",
        isActive: true,
      },
      {
        username: "maintenance_user",
        passwordHash: userPassword,
        name: "整備太郎",
        displayName: "整備太郎",
        role: "user",
        department: "maintenance",
        isActive: true,
      },
      {
        username: "painting_user",
        passwordHash: userPassword,
        name: "塗装花子",
        displayName: "塗装花子",
        role: "user",
        department: "painting",
        isActive: true,
      },
      {
        username: "manager_user",
        passwordHash: userPassword,
        name: "マネージャー花子",
        displayName: "マネージャー花子",
        role: "manager",
        department: "admin",
        isActive: true,
      },
      {
        username: "guest",
        passwordHash: userPassword,
        name: "ゲストユーザー",
        displayName: "ゲスト",
        role: "user",
        department: null,
        isActive: true,
      },
    ])
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  console.log("✅ Seed completed!");
  console.log("");
  console.log("初期ユーザー:");
  console.log("  管理者:   username=admin       password=admin123");
  console.log("  整備:     username=maintenance_user  password=user123");
  console.log("  塗装:     username=painting_user     password=user123");
  console.log("  マネージャー: username=manager_user      password=user123");
  console.log("  ゲスト:   username=guest        password=user123");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
