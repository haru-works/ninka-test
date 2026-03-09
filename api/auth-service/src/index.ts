// auth-service エントリーポイント
import express from 'express';
import cors from 'cors';
import { authenticate } from './middleware/auth';
import meRouter from './routes/me';
import usersRouter from './routes/users';
import userAssignmentsRouter from './routes/user-assignments';
import masterRouter from './routes/master';
import { dataStore } from './db/dataStore';
import { pool } from './db/client';

const app = express();
const PORT = parseInt(process.env.AUTH_SERVICE_PORT ?? '3001', 10);

/** タイムスタンプ付きログ出力 */
const log = {
  info:  (...args: unknown[]) => console.log( `[${new Date().toISOString()}] [AUTH] [INFO] `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [AUTH] [WARN] `, ...args),
  error: (...args: unknown[]) => console.error(`[${new Date().toISOString()}] [AUTH] [ERROR]`, ...args),
};

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

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

/** GET /api/auth/users - ユーザー一覧（認証不要） */
app.get('/api/auth/users', async (_req, res) => {
  const result = await pool.query<{ oid: string; name: string; email: string }>(
    'SELECT oid, name, email FROM mock_users ORDER BY name',
  );
  res.json(result.rows);
});

/**
 * POST /api/auth/login - メールアドレス・パスワードで認証（認証不要）
 * リクエスト: { email: string, password: string }
 * レスポンス: { oid: string } or 401
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email と password は必須です' });
    return;
  }
  // キャッシュを使わずDBから直接照合（新規追加ユーザーにも対応）
  const user = await dataStore.findUserByEmailAndPassword(email, password);
  if (!user) {
    log.warn(`[login] 認証失敗 email=${email}`);
    res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    return;
  }
  log.info(`[login] 認証成功 user=${user.oid} email=${email}`);
  res.json({ oid: user.oid });
});

// 認証が必要なルート
app.use('/api/me',               authenticate, meRouter);
app.use('/api/users',            authenticate, usersRouter);
app.use('/api/user-assignments', authenticate, userAssignmentsRouter);
app.use('/api/master',           authenticate, masterRouter);

/** DBからマスタデータを読み込んでからサーバーを起動 */
dataStore.initialize()
  .then(() => {
    log.info('DataStore 初期化完了（マスターデータをキャッシュに読み込み済み）');
    app.listen(PORT, () => {
      log.info(`Auth service 起動: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    log.error('DataStore 初期化失敗:', err);
    process.exit(1);
  });
