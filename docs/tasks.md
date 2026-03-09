# 実装計画

## フェーズ 1: ユーザー割り当て管理API（auth-service）

**概要：** 認証認可マスタデータを管理するマイクロサービス

### 1-1. ユーザー割り当て CRUD API

#### エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/user-assignments` | 全ユーザー割り当て一覧（admin のみ） |
| GET | `/api/user-assignments/:id` | 割り当て詳細 |
| POST | `/api/user-assignments` | 新規作成 |
| PATCH | `/api/user-assignments/:id` | 更新（有効期限・役職等） |
| DELETE | `/api/user-assignments/:id` | 削除（論理削除） |

#### リクエスト例（POST/PATCH）

```json
{
  "user_id": "aaa-111",
  "principal_type": "user",
  "org_id": "org-003",
  "job_title_id": "jt-001",
  "role_id": "role-002",
  "scope_org_id": "org-003",
  "is_primary": true,
  "valid_from": "2026-03-01",
  "valid_until": "2026-06-30"
}
```

#### バリデーション

- `is_primary = true` の場合、同一ユーザーで既存の `is_primary=true` があれば自動的に false に変更
- `valid_until` < `valid_from` ならエラー
- 主所属と兼務は同時に存在可能（フラグで区別）

---

## フェーズ 2: マイクロサービスアーキテクチャへの移行

### 2-1. サービス分割設計

```
現状（単一API）:
  backend/
  ├── GET /api/invoices
  ├── POST /api/invoices
  ├── GET /api/me
  └── GET /api/users

↓

目標（マイクロサービス）:

┌─────────────────────────────────────────────────────┐
│              API Gateway (Express)                  │
│  (トークン検証・ルーティング・認可チェック)          │
└──────────────────────┬──────────────────────────────┘
           │
    ┌──────┴──────────────────┬─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
┌─────────────┐      ┌──────────────────┐    ┌──────────────┐
│ auth-service│      │invoice-service   │    │(将来) 他のservice
│ :3001       │      │:3002             │    │
├─────────────┤      ├──────────────────┤    │
│ POST /      │      │GET /invoices     │    │
│   user-     │      │POST /invoices    │    │
│ assignments │      │PATCH /invoices   │    │
│             │      │DELETE /invoices  │    │
│ GET /me     │      │                  │    │
│ GET /user-  │      │共通DBスキーマ:   │    │
│ assignments │      │ organizations    │    │
│             │      │ user_assignments │    │
│共通DB:      │      │(参照のみ)        │    │
│ orgs        │      │ invoices         │    │
│ roles       │      │                  │    │
│ job_titles  │      │                  │    │
│ user_assign │      │                  │    │
│ments(CRUD)  │      │                  │    │
└─────────────┘      └──────────────────┘    └──────────────┘
```

### 2-2. 実装詳細

#### auth-service（認証認可・マスタ管理）

**ポート:** `3001`

**責務:**
- ユーザー割り当て(CRUD)
- 自分の情報取得 (`GET /api/me`)
- 自分の権限取得 (`GET /api/me/permissions`)
- 自分の所属組織一覧 (`GET /api/me/organizations`)

**DB:** 共通 PostgreSQL（`mockdb`）
- 読み取り: `organizations`, `roles`, `job_titles`, `role_permissions`, `ui_elements`, `ui_permissions`
- 読み書き: `user_assignments`, `mock_users`

**環境変数:**
```
AUTH_SERVICE_PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mockdb
DB_USER=postgres
DB_PASSWORD=postgres
```

---

#### invoice-service（請求書管理）

**ポート:** `3002`

**責務:**
- 請求書 CRUD
- 権限チェック（auth-service から取得した権限キャッシュを使用）

**DB:** 共通 PostgreSQL（`mockdb`）
- 読み取り: `organizations`, `user_assignments`（権限チェック用）
- 読み書き: `invoices`

**環境変数:**
```
INVOICE_SERVICE_PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mockdb
DB_USER=postgres
DB_PASSWORD=postgres
AUTH_SERVICE_URL=http://localhost:3001
```

---

#### API Gateway（ルーティング・トークン検証）

**ポート:** `3000` (メインエントリポイント)

**責務:**
- auth-service, invoice-service へのルーティング
- リクエストモニタリング
- 将来：レート制限、ロードバランシング

**ルーティング例:**

```
GET  /api/me              → auth-service:3001/api/me
POST /api/user-assignments → auth-service:3001/api/user-assignments
GET  /api/invoices        → invoice-service:3002/api/invoices
POST /api/invoices        → invoice-service:3002/api/invoices
```

---

### 2-3. サービス間通信

#### 1. クライアント → API Gateway → 各サービス

通常のHTTP呼び出し

```
Client (localhost:5173)
  ↓
API Gateway (localhost:3000)  ← トークン検証
  ↓
  ├─→ auth-service (localhost:3001)
  └─→ invoice-service (localhost:3002)
```

#### 2. サービス → サービス間

**invoice-service が権限チェックする場合:**

```typescript
// 1. クライアントから送られてきたトークンを使い、auth-service から権限取得
const permissions = await fetch(
  'http://localhost:3001/api/me/permissions',
  {
    headers: { Authorization: `Bearer ${token}` }
  }
);

// 2. 権限チェック後、処理実行
```

また は

```typescript
// キャッシュ戦略：
// - X-User-Permissions ヘッダで API Gateway が権限を埋め込む
// - 各サービスは信頼済みヘッダから権限を読む（内部通信のみ）
```

---

### 2-4. 実装ステップ

#### Step 1: 既存 backend/ をベースに auth-service を抽出

```bash
backend/ → auth-service/
  ├── src/index.ts           # :3001 リスン
  ├── src/routes/
  │   ├── assignments.ts      # 新規: POST/PATCH/DELETE
  │   ├── me.ts              # 既存
  │   └── ...
  ├── db/client.ts           # 既存
  └── db/dataStore.ts        # 既存（読み取り強化）
```

**変更:**
- `index.ts`: ポート 3001 にハードコード
- `dataStore.ts`: `user_assignments` CRUD メソッド追加
- routes: `user-assignments.ts` の新規作成
- 既存の invoices ルートは削除

#### Step 2: invoice-service 新規作成

```bash
invoice-service/（新規プロジェクト）
  ├── src/index.ts           # :3002 リスン
  ├── src/routes/invoices.ts  # 既存ロジック
  ├── src/middleware/auth.ts  # 既存（ただしトークン検証のみ）
  ├── db/client.ts
  └── db/dataStore.ts        # invoices のみ
```

**変更:**
- DB 接続情報は invoice-service 用に独立
- 権限チェックロジックは簡略化（API Gateway または auth-service から権限を受け取る）

#### Step 3: API Gateway 新規作成

```bash
api-gateway/（新規プロジェクト）
  ├── src/index.ts           # :3000 リスン→各サービスへルーティング
  ├── src/middleware/
  │   ├── auth.ts           # トークン検証
  │   └── router.ts         # サービス選別ルーティング
  └── package.json          # http-proxy-middleware等
```

---

### 2-5. ディレクトリ構成（完成形）

```
test/
├── backend/                    # 不要になるため削除可
├── auth-service/               # 新規（既存backendから分割）
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── dataStore.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── routes/
│   │   │   ├── assignments.ts  （★新規）
│   │   │   ├── me.ts
│   │   │   └── users.ts
│   │   └── services/
│   │       └── permissionService.ts
│   ├── db/
│   │   ├── migrations/
│   │   └── seeds/
│   └── .env
│
├── invoice-service/            # 新規プロジェクト
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── dataStore.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── routes/
│   │   │   └── invoices.ts
│   │   └── services/
│   │       └── permissionService.ts
│   └── .env
│
├── api-gateway/               # 新規プロジェクト
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   └── middleware/
│   │       └── router.ts
│   └── .env
│
├── frontend/                   # 既存（変更最小限）
│   ├── package.json
│   ├── src/
│   │   └── api/
│   │       └── client.ts     # baseURL: localhost:3000 に統一
│   └── ...
│
├── docs/
│   ├── requirements.md
│   ├── schema.md
│   ├── tasks.md              （★このファイル）
│   └── architecture.md        （★追加: マイクロサービス設計図）
│
└── README.md
```

---

## フェーズ 3: フロントエンド連携

### 3-1. クライアント API 呼び出し先の変更

**現在:**
```typescript
// frontend/src/api/client.ts
export const api = axios.create({
  baseURL: 'http://localhost:3001',  // バックエンド
})
```

**変更後:**
```typescript
// frontend/src/api/client.ts
export const api = axios.create({
  baseURL: 'http://localhost:3000',  // API Gateway
})
```

### 3-2. ルーティング仕様（API Gateway）

| パス | 転送先 |
|------|--------|
| `/api/me/**` | http://localhost:3001（auth-service） |
| `/api/user-assignments/**` | http://localhost:3001（auth-service） |
| `/api/invoices/**` | http://localhost:3002（invoice-service） |

---

## フェーズ 4: 実装時の注意点

### 認可チェックの実装戦略

#### 方案 A: 各サービスが独立チェック

- 各サービスが auth-service を呼び出して権限取得
- 利点：各サービスが自律的、スケーラブル
- 欠点：サービス間呼び出し遅延

```typescript
// invoice-service
const permissions = await axios.get(
  'http://auth-service:3001/api/me/permissions',
  { headers: { 'x-mock-user-id': userId } }
);
```

#### 方案 B: API Gateway が権限を埋め込む

- API Gateway が `/api/me/permissions` を呼び出し
- `X-User-Permissions` カスタムヘッダに JSON基盤化
- 各サービスは信頼済みヘッダのみ読む
- 利点：高速、サービス間呼び出し なし
- 欠点：Gateway の責務増加

```typescript
// API Gateway middleware
const perms = await authService.getPermissions(userId);
req.headers['x-user-permissions'] = JSON.stringify(perms);

// invoice-service
const perms = JSON.parse(req.headers['x-user-permissions']);
```

**推奨:** 方案 B（キャッシュ + ヘッダ埋め込み）

---

## まとめ

| フェーズ | 作業 | 工数 | 優先度 |
|---------|------|------|--------|
| 1 | ユーザー割り当て CRUD API 実装 | 3h | High |
| 2 | マイクロサービス化（分割・Gateway） | 6h | High |
| 3 | フロントエンド API 呼び出し先変更 | 1h | High |
| 4 | E2E テスト・動作確認 | 2h | Medium |
| **合計** | | **12h** | |

---

## 技術スタック

- **リモートプロシージャコール:** 無し（HTTP REST API）
- **サービスディスカバリー:** 無し（ハードコード化＋env で制御）
- **メッセージング:** 無し（初期段階）
- **API Gateway 実装:** `http-proxy-middleware`（軽量）

---

## 次のステップ

**「実装」フェーズに進む場合:**

1. auth-service でユーザー割り当て CRUD API を実装
2. 既存 backend を auth-service と invoice-service に分割
3. API Gateway 作成してルーティング確立

ご了承ください。
