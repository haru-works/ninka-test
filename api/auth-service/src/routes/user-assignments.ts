import { Router, Request, Response } from 'express';
import { dataStore } from '../db/dataStore';
import { resolveApiPermissions } from '../services/permissionService';

const router = Router();

/** 権限チェック: admin のみ */
const requireAdmin = async (userId: string, activeOrgId?: string): Promise<boolean> => {
  const perms = await resolveApiPermissions(userId, activeOrgId);
  return perms.some((p) => p.resource === 'user' && p.action === 'delete');
};

/** バリデーション: 有効期限チェック */
const validateDateRange = (valid_from: string | null, valid_until: string | null): string | null => {
  if (!valid_from || !valid_until) return null;
  if (new Date(valid_until) < new Date(valid_from)) {
    return 'valid_until must be >= valid_from';
  }
  return null;
};

/** GET /api/user-assignments - 全件取得 (admin only) */
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await requireAdmin(user.oid, activeOrgId)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }

  try {
    const assignments = await dataStore.getAllUserAssignments();
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

/** GET /api/user-assignments/:id - 詳細取得 (admin only) */
router.get('/:id', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await requireAdmin(user.oid, activeOrgId)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }

  try {
    const assignment = await dataStore.getUserAssignmentById(req.params.id);
    if (!assignment) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

/** POST /api/user-assignments - 新規作成 (admin only) */
router.post('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await requireAdmin(user.oid, activeOrgId)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }

  const { user_id, principal_type, org_id, job_title_id, role_id, scope_org_id, is_primary, valid_from, valid_until } = req.body;

  if (!user_id || !principal_type || !org_id || !role_id) {
    res.status(400).json({ error: 'Missing required fields: user_id, principal_type, org_id, role_id' });
    return;
  }

  const dateError = validateDateRange(valid_from, valid_until);
  if (dateError) { res.status(400).json({ error: dateError }); return; }

  if (!['user', 'service_principal'].includes(principal_type)) {
    res.status(400).json({ error: 'principal_type must be "user" or "service_principal"' });
    return;
  }

  try {
    const newAssignment = await dataStore.createUserAssignment({
      user_id, principal_type, org_id,
      job_title_id: job_title_id || null,
      role_id,
      scope_org_id: scope_org_id || null,
      is_primary: is_primary ?? false,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
    });
    res.status(201).json(newAssignment);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create assignment', details: err.message });
  }
});

/** PATCH /api/user-assignments/:id - 更新 (admin only) */
router.patch('/:id', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await requireAdmin(user.oid, activeOrgId)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }

  const { job_title_id, role_id, is_primary, valid_from, valid_until } = req.body;

  if (valid_from !== undefined || valid_until !== undefined) {
    const dateError = validateDateRange(valid_from ?? null, valid_until ?? null);
    if (dateError) { res.status(400).json({ error: dateError }); return; }
  }

  try {
    const updated = await dataStore.updateUserAssignment(req.params.id, {
      job_title_id, role_id, is_primary, valid_from, valid_until,
    });
    if (!updated) { res.status(404).json({ error: 'Not Found' }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update assignment', details: err.message });
  }
});

/** DELETE /api/user-assignments/:id - 削除 (admin only) */
router.delete('/:id', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await requireAdmin(user.oid, activeOrgId)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }

  try {
    const deleted = await dataStore.deleteUserAssignment(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Not Found' }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

export default router;
