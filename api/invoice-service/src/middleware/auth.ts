import { Request, Response, NextFunction } from 'express';

const log = {
  info:  (...args: unknown[]) => console.log( `[${new Date().toISOString()}] [INV] [INFO] `, ...args),
  warn:  (...args: unknown[]) => console.warn(`[${new Date().toISOString()}] [INV] [WARN] `, ...args),
};

/** API 権限の型（API Gateway から注入） */
export type ApiPermission = {
  resource: string;
  action: string;
};

/**
 * Gateway 連携認証ミドルウェア
 *
 * API Gateway がトークン検証済みのユーザー情報・権限を
 * 内部ヘッダとして注入する想定:
 *   - x-user-id    : ユーザーの oid
 *   - x-user-name  : ユーザー名
 *   - x-user-email : メールアドレス
 *   - x-user-permissions : JSON化した ApiPermission[]
 *   - x-active-org-id    : アクティブ組織 ID
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.headers['x-user-id'] as string;

  if (!userId) {
    log.warn(`[authenticate] x-user-id ヘッダーなし (Gateway から注入されていない) path=${req.path}`);
    res.status(401).json({ error: 'Unauthorized: missing x-user-id header' });
    return;
  }

  // 権限を JSON からパース（Gateway が注入）
  const rawPerms = req.headers['x-user-permissions'] as string | undefined;
  let permissions: ApiPermission[] = [];
  if (rawPerms) {
    try {
      permissions = JSON.parse(rawPerms);
    } catch {
      res.status(400).json({ error: 'Invalid x-user-permissions header' });
      return;
    }
  }

  // リクエストにユーザー情報・権限を付与
  // Gateway 側で encodeURIComponent されているためデコードする
  const name  = decodeURIComponent(req.headers['x-user-name']  as string ?? '');
  const email = decodeURIComponent(req.headers['x-user-email'] as string ?? '');

  log.info(`[authenticate] 認証成功 user=${userId} name=${name} permissions=${permissions.length}件`);

  (req as any).currentUser = { oid: userId, name, email };
  (req as any).permissions = permissions;

  next();
};
