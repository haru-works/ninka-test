import { Request, Response, NextFunction } from 'express';
import { dataStore } from '../db/dataStore';

const log = {
  info:  (...args: unknown[]) => console.log( `[${new Date().toISOString()}] [AUTH] [INFO] `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [AUTH] [WARN] `, ...args),
};

/** モック認証ミドルウェア: X-Mock-User-Id ヘッダからユーザーを識別する（DB直接クエリ） */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.headers['x-mock-user-id'] as string;

  if (!userId) {
    log.warn(`[authenticate] x-mock-user-id ヘッダーなし path=${req.path}`);
    res.status(401).json({ error: 'Unauthorized: X-Mock-User-Id header required' });
    return;
  }

  // キャッシュを使わずDBから直接取得（新規追加ユーザーにも対応）
  const user = await dataStore.findUserByOid(userId);
  if (!user) {
    log.warn(`[authenticate] 不明なユーザー userId=${userId}`);
    res.status(401).json({ error: 'Unauthorized: unknown user' });
    return;
  }

  log.info(`[authenticate] 認証成功 user=${user.oid} name=${user.name} path=${req.path}`);
  // リクエストにユーザー情報を付与
  (req as any).currentUser = user;
  next();
};
