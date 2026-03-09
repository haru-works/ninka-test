import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.GATEWAY_PORT ?? '3000', 10);
// 各マイクロサービスの URL
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001';
const INVOICE_SERVICE_URL = process.env.INVOICE_SERVICE_URL ?? 'http://localhost:3002';

/** タイムスタンプ付きログ出力 */
const log = {
  info:  (...args: unknown[]) => console.log( `[${new Date().toISOString()}] [GW] [INFO] `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [GW] [WARN] `, ...args),
  error: (...args: unknown[]) => console.error(`[${new Date().toISOString()}] [GW] [ERROR]`, ...args),
};

// フロントエンド（通常・管理者）からの CORS を許可
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

/** リクエスト/レスポンスのアクセスログ */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](`${req.method} ${req.path} → ${res.statusCode} (${ms}ms) user=${req.headers['x-mock-user-id'] ?? '-'}`);
  });
  next();
});

// ヘルスチェック
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// ── 認証不要ルート ─────────────────────────────────────────
// ログイン用ユーザー一覧（認証前に呼ばれるため素通し）
// ※ app.use('/api/auth', proxy) はパスプレフィックスを剥がしてしまうため
//    pathFilter を使いフルパスを保持して転送する
app.use(
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    // v3 ではグロブが動作しないため関数で判定する
    pathFilter: (pathname) => pathname.startsWith('/api/auth'),
  }),
);

// ── invoice-service 向け: 権限ヘッダー注入ミドルウェア ────────
/**
 * auth-service に問い合わせてユーザー情報・権限を取得し、
 * ダウンストリームの invoice-service が利用するヘッダーを注入する。
 */
async function injectPermissions(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const mockUserId = req.headers['x-mock-user-id'] as string | undefined;
  if (!mockUserId) {
    log.warn(`[injectPermissions] x-mock-user-id ヘッダーなし path=${req.path}`);
    res.status(401).json({ error: '認証が必要です (x-mock-user-id ヘッダーがありません)' });
    return;
  }

  // フロントエンドが送信したアクティブ組織 ID を転送
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;
  const authHeaders: Record<string, string> = { 'x-mock-user-id': mockUserId };
  if (activeOrgId) {
    authHeaders['x-active-org-id'] = activeOrgId;
  }

  log.info(`[injectPermissions] auth-service に権限を問い合わせ user=${mockUserId} org=${activeOrgId ?? '-'}`);

  try {
    // auth-service からユーザー情報と API 権限を並列取得
    const [meRes, permRes] = await Promise.all([
      fetch(`${AUTH_SERVICE_URL}/api/me`, { headers: authHeaders }),
      fetch(`${AUTH_SERVICE_URL}/api/me/permissions`, { headers: authHeaders }),
    ]);

    if (!meRes.ok || !permRes.ok) {
      log.warn(`[injectPermissions] auth-service 認証失敗 me=${meRes.status} perm=${permRes.status} user=${mockUserId}`);
      res.status(401).json({ error: '認証に失敗しました' });
      return;
    }

    const meData = (await meRes.json()) as {
      oid: string;
      name: string;
      email: string;
      activeOrg?: { orgId: string } | null;
    };
    const permData = (await permRes.json()) as { apiPermissions: unknown[] };

    log.info(`[injectPermissions] 権限取得成功 user=${meData.oid} name=${meData.name} permissions=${permData.apiPermissions.length}件 activeOrg=${meData.activeOrg?.orgId ?? '-'}`);

    // invoice-service が期待するヘッダーを注入
    // 名前・メールは日本語等のマルチバイト文字を含む可能性があるため URI エンコードする
    req.headers['x-user-id'] = meData.oid;
    req.headers['x-user-name'] = encodeURIComponent(meData.name ?? '');
    req.headers['x-user-email'] = encodeURIComponent(meData.email ?? '');
    req.headers['x-user-permissions'] = JSON.stringify(permData.apiPermissions ?? []);
    if (meData.activeOrg?.orgId) {
      req.headers['x-active-org-id'] = meData.activeOrg.orgId;
    }
  } catch (err) {
    log.error(`[injectPermissions] auth-service との通信エラー user=${mockUserId}`, err);
    res.status(502).json({ error: 'auth-service との通信に失敗しました' });
    return;
  }

  next();
}

// ── auth-service ルート群 ───────────────────────────────────
// auth-service が x-mock-user-id ヘッダーで自前認証するため、
// Gateway はそのまま転送するだけでよい。
// glob パターンは http-proxy-middleware v3 で動作しないため関数で判定する
app.use(
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathFilter: (pathname) =>
      pathname.startsWith('/api/me') ||
      pathname.startsWith('/api/users') ||
      pathname.startsWith('/api/user-assignments') ||
      pathname.startsWith('/api/master'),
  }),
);

// ── invoice-service ルート ─────────────────────────────────
// 権限ヘッダー注入後にプロキシ
// app.use('/api/invoices', ...) は Express がプレフィックスを剥がすため
// pathRewrite で /api/invoices を補完して転送する
app.use(
  '/api/invoices',
  injectPermissions,
  createProxyMiddleware({
    target: INVOICE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/invoices${path}`,
  }),
);

app.listen(PORT, () => {
  console.log(`API Gateway 起動: http://localhost:${PORT}`);
  console.log(`  → auth-service    : ${AUTH_SERVICE_URL}`);
  console.log(`  → invoice-service : ${INVOICE_SERVICE_URL}`);
});
