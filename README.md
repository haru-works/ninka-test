# ninka-test

Microsoft Entra ID を認証基盤とした、マイクロサービス構成の認証・認可システムのデモ実装。
多層ロールモデル・組織階層・兼務対応・AIエージェント対応を含む。

---

## 概要

| 項目 | 内容 |
|------|------|
| 認証基盤 | Microsoft Entra ID（OAuth 2.0 + OIDC） |
| 認可モデル | 多層ロール（グローバル / 組織スコープ / 機能） |
| 組織管理 | 階層構造（会社 → 本部 → 部 → 課） |
| 兼務対応 | `X-Active-Org-Id` ヘッダーによるアクティブコンテキスト切り替え |
| AIエージェント | `service_principals` テーブル + Client Credentials フロー |
| DB | PostgreSQL |

---

## アーキテクチャ

```
[app-frontend :5173]   [admin-frontend :5174]
         ↓                       ↓
    ┌────────────────────────────────┐
    │       api-gateway  :3000       │  CORSハンドリング・権限ヘッダー注入
    └──────────┬─────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
 auth-service :3001   invoice-service :3002
 (ユーザー・権限管理)   (請求書管理)
       ↓
   PostgreSQL
```

---

## サービス構成

### バックエンド

| サービス | ポート | 役割 |
|---------|-------|------|
| `api-gateway` | 3000 | リバースプロキシ・CORS制御・権限ヘッダー注入 |
| `auth-service` | 3001 | ユーザー認証・権限解決・マスタデータ管理 |
| `invoice-service` | 3002 | 請求書 CRUD（権限スコープ付き） |

### フロントエンド

| アプリ | ポート | 役割 |
|-------|-------|------|
| `app-frontend` | 5173 | 一般ユーザー向け（請求書・ユーザー管理） |
| `admin-frontend` | 5174 | 管理者向け（マスタ管理・ユーザー割り当て） |

---

## 技術スタック

| 層 | 使用技術 |
|----|---------|
| バックエンド | Node.js / TypeScript / Express |
| フロントエンド | Vue 3 / TypeScript / Pinia / Vue Router / Vite |
| データベース | PostgreSQL |
| 認証ライブラリ | `@azure/msal-browser`（フロントエンド）, `@azure/msal-node`（バックエンド） |

---

## 認証フロー

- **SPA / Webアプリ**: Authorization Code + PKCE
- **サービス間通信**: Client Credentials
- **ユーザー識別子**: Entra ID の `oid` クレーム（メールアドレスは使用しない）
- トークンはメモリ上で管理（`localStorage` への保存禁止）

---

## 認可モデル

有効権限は以下の和集合として決定される。

```
有効権限 = グローバルロール ∪ 組織スコープロール ∪ 役職ロール
```

| ロールスコープ | 説明 |
|--------------|------|
| `global` | 全組織・全機能に適用（システム管理者など） |
| `org` | 特定組織およびその配下に適用（部長など） |
| `feature` | 特定機能のみに適用（請求書承認者など） |

- **Deny by Default**: 明示的に許可されていないアクセスはすべて拒否
- **最小権限の原則**: 必要最小限の権限のみ付与
- **認可の最終判定はバックエンドで実施**（フロントエンドはUI制御のみ）

---

## 兼務対応

1ユーザーが複数組織に所属できる。操作時は `X-Active-Org-Id` ヘッダーで対象組織を指定する。

```http
X-Active-Org-Id: <organizations.id>
```

- 未指定時は `is_primary = true` の主所属組織を自動適用
- バックエンドはヘッダー値をDBで所属確認してから使用（ヘッダー値を直接信用しない）
- 兼務には開始日・終了日を設定可能（期限切れは自動的に権限消滅）

---

## データ構造（主要テーブル）

```
organizations       … 組織マスタ（自己参照で階層構造）
job_titles          … 役職マスタ
roles               … ロールマスタ
role_permissions    … ロール × リソース × アクション の API 権限
ui_elements         … 画面要素マスタ
ui_permissions      … ロール × 画面要素 の UI 権限
user_assignments    … ユーザーの組織・役職・ロール割り当て
service_principals  … AIエージェント・サービスアカウント
service_principal_assignments … エージェントのロール割り当て
```

詳細は [docs/schema.md](docs/schema.md) を参照。

---

## 開発環境セットアップ

### 前提条件

- Node.js 20+
- PostgreSQL

### 起動方法

各サービスのディレクトリで依存パッケージをインストール後、開発サーバーを起動する。

```bash
# 依存インストール（各サービスで実行）
cd api/api-gateway    && npm install
cd api/auth-service   && npm install
cd api/invoice-service && npm install
cd frontend/app-frontend   && npm install
cd frontend/admin-frontend && npm install
```

```bash
# 開発サーバー起動（各サービスで実行）
npm run dev
```

VS Code タスクを利用してすべてのサービスを一括起動することもできる（`dev: all` タスク）。

### 環境変数

各サービスのルートに `.env` を配置する。

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `GATEWAY_PORT` | api-gateway のポート | `3000` |
| `AUTH_SERVICE_PORT` | auth-service のポート | `3001` |
| `INVOICE_SERVICE_PORT` | invoice-service のポート | `3002` |
| `AUTH_SERVICE_URL` | api-gateway から見た auth-service の URL | `http://localhost:3001` |
| `INVOICE_SERVICE_URL` | api-gateway から見た invoice-service の URL | `http://localhost:3002` |

---

## ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/requirements.md](docs/requirements.md) | 認証・認可 要件定義 |
| [docs/schema.md](docs/schema.md) | 権限DBスキーマ |
| [docs/tasks.md](docs/tasks.md) | 開発タスク |
