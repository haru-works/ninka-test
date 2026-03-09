import express from 'express';
import cors from 'cors';
import { authenticate } from './middleware/auth';
import invoicesRouter from './routes/invoices';
import { dataStore } from './db/dataStore';

const app = express();
const PORT = parseInt(process.env.INVOICE_SERVICE_PORT ?? '3002', 10);

/** タイムスタンプ付きログ出力 */
const log = {
  info:  (...args: unknown[]) => console.log( `[${new Date().toISOString()}] [INV] [INFO] `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [INV] [WARN] `, ...args),
  error: (...args: unknown[]) => console.error(`[${new Date().toISOString()}] [INV] [ERROR]`, ...args),
};

// 内部通信のみ想定。Gateway からのアクセスに限定
app.use(cors({ origin: '*' }));
app.use(express.json());

/** リクエスト/レスポンスのアクセスログ */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[level](`${req.method} ${req.path} → ${res.statusCode} (${ms}ms) user=${req.headers['x-user-id'] ?? '-'}`);
  });
  next();
});

// 認証ミドルウェア（Gateway 注入ヘッダーを検証）
app.use('/api/invoices', authenticate, invoicesRouter);

/** DBから表示用マスタを読み込んでからサーバーを起動 */
dataStore.initialize()
  .then(() => {
    log.info(`DataStore 初期化完了 orgs=${dataStore.organizations.length}件`);
    app.listen(PORT, () => {
      log.info(`Invoice service 起動: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    log.error('DataStore 初期化失敗:', err);
    process.exit(1);
  });
