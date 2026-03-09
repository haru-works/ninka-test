import { Router, Request, Response } from 'express';
import { dataStore } from '../db/dataStore';
import { resolveApiPermissions } from '../services/permissionService';

const router = Router();

/** 権限チェックヘルパー */
const can = async (userId: string, action: string): Promise<boolean> => {
  const perms = await resolveApiPermissions(userId, undefined);
  return perms.some((p) => p.resource === 'master' && p.action === action);
};

/** GET /api/master - マスターデータ一括取得 */
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  if (!await can(user.oid, 'read')) {
    res.status(403).json({ error: 'マスターデータの閲覧権限がありません' });
    return;
  }
  res.json(dataStore.getMasterData());
});

// POST/PUT は master.write、DELETE は master.delete が必要
router.use(async (req: Request, res: Response, next) => {
  const user = (req as any).currentUser;
  if (!user) { res.status(401).json({ error: '認証が必要です' }); return; }
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!await can(user.oid, 'write')) {
      res.status(403).json({ error: 'マスターデータの編集権限がありません' });
      return;
    }
  } else if (req.method === 'DELETE') {
    if (!await can(user.oid, 'delete')) {
      res.status(403).json({ error: 'マスターデータの削除権限がありません' });
      return;
    }
  }
  next();
});

/** POST /api/master/organizations - 組織を新規作成 */
router.post('/organizations', async (req: Request, res: Response) => {
  const { code, name, level, parent_id } = req.body as {
    code?: string; name?: string; level?: number; parent_id?: string | null;
  };
  if (!code || !name || level === undefined) {
    res.status(400).json({ error: 'code, name, level は必須です' });
    return;
  }
  try {
    const created = await dataStore.createOrganization({
      code, name, level: Number(level), parent_id: parent_id ?? null,
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/master/organizations/:id - 組織を更新 */
router.put('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const updated = await dataStore.updateOrganization(req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: '組織が見つかりません' }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/master/organizations/:id - 組織を削除 */
router.delete('/organizations/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await dataStore.deleteOrganization(req.params.id);
    if (!deleted) { res.status(404).json({ error: '組織が見つかりません' }); return; }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ロール ──────────────────────────────────────────────

/** POST /api/master/roles - ロールを新規作成 */
router.post('/roles', async (req: Request, res: Response) => {
  const { code, name, scope } = req.body as { code?: string; name?: string; scope?: string };
  if (!code || !name || !scope) {
    res.status(400).json({ error: 'code, name, scope は必須です' });
    return;
  }
  try {
    const created = await dataStore.createRole({ code, name, scope });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/master/roles/:id - ロールを更新 */
router.put('/roles/:id', async (req: Request, res: Response) => {
  try {
    const updated = await dataStore.updateRole(req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: 'ロールが見つかりません' }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/master/roles/:id - ロールを削除（関連するロール権限も削除） */
router.delete('/roles/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await dataStore.deleteRole(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'ロールが見つかりません' }); return; }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 役職 ────────────────────────────────────────────────

/** POST /api/master/job-titles - 役職を新規作成 */
router.post('/job-titles', async (req: Request, res: Response) => {
  const { code, name, rank } = req.body as { code?: string; name?: string; rank?: number };
  if (!code || !name || rank === undefined) {
    res.status(400).json({ error: 'code, name, rank は必須です' });
    return;
  }
  try {
    const created = await dataStore.createJobTitle({ code, name, rank: Number(rank) });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/master/job-titles/:id - 役職を更新 */
router.put('/job-titles/:id', async (req: Request, res: Response) => {
  try {
    const updated = await dataStore.updateJobTitle(req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: '役職が見つかりません' }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/master/job-titles/:id - 役職を削除 */
router.delete('/job-titles/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await dataStore.deleteJobTitle(req.params.id);
    if (!deleted) { res.status(404).json({ error: '役職が見つかりません' }); return; }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ロール権限 ──────────────────────────────────────────

/** POST /api/master/role-permissions - ロール権限を追加 */
router.post('/role-permissions', async (req: Request, res: Response) => {
  const { role_id, resource, action } = req.body as {
    role_id?: string; resource?: string; action?: string;
  };
  if (!role_id || !resource || !action) {
    res.status(400).json({ error: 'role_id, resource, action は必須です' });
    return;
  }
  try {
    const created = await dataStore.createRolePermission({ role_id, resource, action });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/master/role-permissions - ロール権限を削除 */
router.delete('/role-permissions', async (req: Request, res: Response) => {
  const { role_id, resource, action } = req.body as {
    role_id?: string; resource?: string; action?: string;
  };
  if (!role_id || !resource || !action) {
    res.status(400).json({ error: 'role_id, resource, action は必須です' });
    return;
  }
  try {
    const deleted = await dataStore.deleteRolePermission({ role_id, resource, action });
    if (!deleted) { res.status(404).json({ error: 'ロール権限が見つかりません' }); return; }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
