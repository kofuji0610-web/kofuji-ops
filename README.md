# コフジ物流株式会社 業務管理システム

本プロジェクトは、現在稼働中の業務管理Webアプリのソースコードを復元し、Cursorなどの開発環境で継続開発できるように再構築したものです。

## 1. 使用技術

### フロントエンド
- **React 19** + **Vite**
- **wouter** (軽量ルーティング)
- **Tailwind CSS** + **Radix UI** (shadcn/ui)
- **@tanstack/react-query** + **tRPC** (データフェッチ・状態管理)
- **react-hook-form** + **zod** (フォーム管理)

### バックエンド
- **Node.js** + **Express**
- **tRPC** (`@trpc/server`)
- **Drizzle ORM**
- **MySQL** (データベース)

## 2. 必要なNode.jsのバージョン

- **Node.js**: v20.x 以上推奨
- **npm**: v10.x 以上推奨
- **MySQL**: v8.0 以上推奨

## 3. インストールコマンド

プロジェクトのルートディレクトリで以下のコマンドを実行し、依存関係をインストールします。

```bash
# ルート、client、server すべての依存関係をインストール
npm run install:all
```

## 4. 起動コマンド

### 開発環境の起動
フロントエンド（Vite: 5173番ポート）とバックエンド（Express: 3000番ポート）を同時に起動します。

```bash
npm run dev
```

### データベースの初期化とマイグレーション
MySQLサーバーが起動していることを確認し、以下のコマンドを実行します。

```bash
# 1. .env ファイルを作成
cp .env.example .env
# (必要に応じて .env の DB_USER や DB_PASSWORD を編集)

# 2. データベーススキーマを反映
npm run db:push

# 3. 初期データを投入（管理者・テストユーザーの作成）
npm run db:seed
```

## 5. 環境変数の一覧

`.env` ファイルに設定する環境変数の一覧です。

| 変数名 | 説明 | デフォルト値 |
|---|---|---|
| `PORT` | バックエンドAPIのポート番号 | `3000` |
| `CLIENT_URL` | フロントエンドのURL（CORS用） | `http://localhost:5173` |
| `DB_HOST` | MySQLのホスト名 | `localhost` |
| `DB_PORT` | MySQLのポート番号 | `3306` |
| `DB_USER` | MySQLのユーザー名 | `root` |
| `DB_PASSWORD` | MySQLのパスワード | (空) |
| `DB_NAME` | データベース名 | `kofuji_ops` |
| `PASSWORD_SALT` | パスワードハッシュ用のソルト | (任意の文字列) |
| `VITE_APP_ID` | Manus OAuth連携用アプリID | (空) |

## 6. データベースの初期化方法

1. ローカル環境にMySQLをインストールし、起動します。
2. `kofuji_ops` という名前のデータベースを作成します。
   ```sql
   CREATE DATABASE kofuji_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. プロジェクトルートで `npm run db:push` を実行してテーブルを作成します。
4. `npm run db:seed` を実行して初期ユーザーを作成します。

**初期ユーザー情報:**
- 管理者: `admin` / `admin123`
- 整備担当: `maintenance_user` / `user123`
- 塗装担当: `painting_user` / `user123`
- マネージャー: `manager_user` / `user123`
- ゲスト: `guest` / `user123`

## 7. 現在分かっている不具合

### 勤怠状態の不整合（巻き戻り・上書き）
- **現象**: `Home.tsx` で2回目以降の出勤打刻を行った後、`Attendance.tsx` に遷移すると「退勤済み」と表示され、状態が巻き戻ったように見える。
- **原因**: 
  1. `Home.tsx` と `Attendance.tsx` で勤怠状態を判定するロジックが異なっている。`Home.tsx` は最大3回の打刻に対応しているが、`Attendance.tsx` は1回目の打刻しか見ていない。
  2. `Home.tsx` で打刻した際、`refetch()` を使用して自身のコンポーネントのデータのみを更新しており、`Attendance.tsx` が使用する `attendance.list` クエリのキャッシュが更新（`invalidate`）されていない。
- **対策**: 本プロジェクトでは、`Attendance.tsx` の状態判定ロジックを `Home.tsx` と同じもの（`calcAttendanceStep`）に修正し、打刻時のキャッシュ更新を `invalidate()` に統一する修正を適用済みです。

## 8. 勤怠機能の注意点

- **1日最大3回の打刻**: 本システムは、中抜けなどを考慮し、1日に最大3回（出勤・退勤のペアが3つ）の打刻ができる設計になっています。
- **データベース構造**: `attendances` テーブルには `clockIn`, `clockOut`, `clockIn2`, `clockOut2`, `clockIn3`, `clockOut3` の6つのカラムが存在します。
- **状態判定ロジック**: フロントエンドでは、これらのカラムの埋まり具合を見て `0`（未出勤）から `6`（3回目退勤完了）までのステップ（`AttendanceStep`）を計算し、UIの表示を切り替えています。このロジックを変更する場合は、必ず `Home.tsx` と `Attendance.tsx` の両方を修正するか、共通のカスタムフック（例: `useAttendanceState`）に切り出してください。
