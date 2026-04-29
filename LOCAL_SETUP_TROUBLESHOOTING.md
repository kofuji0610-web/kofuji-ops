# Local Setup Troubleshooting (Windows)

This memo is for recovering local login when development setup breaks.

## 1) Start MySQL and check basics

PowerShell:

```powershell
Get-Service *mysql*
netstat -ano | findstr :3306
```

- MySQL service should be `Running`
- `3306` should be `LISTENING`

## 2) Prepare `.env`

From project root:

```powershell
copy .env.example .env
```

Set these values correctly in `.env`:

- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD="<your_mysql_root_password>"`
- `DB_NAME=kofuji_ops`
- `PASSWORD_SALT=<any_fixed_string_for_local>`

Important:

- Keep `DB_PASSWORD` quoted if it contains special characters.
- Do not change `PASSWORD_SALT` after seeding unless you reseed.

## 3) Recreate local DB (if login hash mismatch suspected)

Login to MySQL and recreate only local `kofuji_ops`:

```sql
DROP DATABASE IF EXISTS kofuji_ops;
CREATE DATABASE kofuji_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

## 4) Apply schema and seed initial users

From project root:

```powershell
npm run db:push
npm run db:seed
```

## 5) Start app

```powershell
npm run dev
```

Use the Vite URL shown in terminal (for example `http://localhost:5179/`).

## 6) If `EADDRINUSE :::3000` occurs

Find and stop stale process:

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Then run:

```powershell
npm run dev
```

## 7) Typical symptoms and fixes

- `Access denied for user 'root'@'localhost'`
  - `.env` DB credentials mismatch with MySQL account.
- `Unknown database 'kofuji_ops'`
  - Database not created yet.
- Login says username/password mismatch
  - Most likely seeded hashes do not match current `PASSWORD_SALT`; recreate DB and reseed.

