import { Router, Request, Response } from 'express';
import { dataStore } from '../db/dataStore';
import { resolveApiPermissions } from '../services/permissionService';

const router = Router();

/** 権限チェックヘルパー */
const can = async (userId: string, resource: string, action: string, orgId?: string) => {
  const perms = await resolveApiPermissions(userId, orgId);
  return perms.some((p) => p.resource === resource && p.action === action);
};

/**
 * GET /api/users - ユーザー一覧
 * - user.read 権限あり → 全ユーザー返す
 * - user.read 権限なし → 自分のみ返す
 */
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;
  const canReadAll = await can(user.oid, 'user', 'read', activeOrgId);

  // DBから直接取得（新規追加ユーザーも反映）
  const allUsers = await dataStore.getAllUsersWithAssignments();
  // 権限なしの場合は自分のみに絞り込む
  const targetUsers = canReadAll
    ? allUsers
    : allUsers.filter((u) => u.oid === user.oid);

  const result = targetUsers.map((u) => ({
    oid: u.oid,
    name: u.name,
    email: u.email,
    assignments: u.assignments.map((ua) => ({
      id: ua.id,
      orgName: dataStore.organizations.find((o) => o.id === ua.org_id)?.name,
      jobTitle: dataStore.jobTitles.find((j) => j.id === ua.job_title_id)?.name ?? '-',
      role: dataStore.roles.find((r) => r.id === ua.role_id)?.name,
      isPrimary: ua.is_primary,
      validUntil: ua.valid_until,
    })),
  }));

  res.json(result);
});

/** POST /api/users - ユーザー新規作成（admin のみ） */
router.post('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await can(user.oid, 'user', 'write', activeOrgId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { name, email } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: 'name と email は必須です' });
    return;
  }

  try {
    const created = await dataStore.createUser({ name, email });
    res.status(201).json(created);
  } catch (err: any) {
    // email 重複エラー（PostgreSQL unique violation code: 23505）
    if (err.code === '23505') {
      res.status(409).json({ error: 'このメールアドレスはすでに使用されています' });
    } else {
      res.status(500).json({ error: 'ユーザーの作成に失敗しました' });
    }
  }
});

/** PATCH /api/users/:oid - ユーザー更新（admin のみ） */
router.patch('/:oid', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await can(user.oid, 'user', 'write', activeOrgId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { name, email } = req.body;
  try {
    const updated = await dataStore.updateUser(req.params.oid, { name, email });
    if (!updated) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'このメールアドレスはすでに使用されています' });
    } else {
      res.status(500).json({ error: 'ユーザーの更新に失敗しました' });
    }
  }
});

/** DELETE /api/users/:oid - ユーザー削除（admin のみ） */
router.delete('/:oid', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!await can(user.oid, 'user', 'delete', activeOrgId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const deleted = await dataStore.deleteUser(req.params.oid);
    if (!deleted) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'ユーザーの削除に失敗しました' });
  }
});

/**
 * PATCH /api/users/:oid/password - パスワード変更（自分のみ）
 * リクエスト: { currentPassword: string, newPassword: string }
 */
router.patch('/:oid/password', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  // 他人のパスワードは変更不可
  if (req.params.oid !== user.oid) {
    res.status(403).json({ error: '他のユーザーのパスワードは変更できません' });
    return;
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword と newPassword は必須です' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
    return;
  }

  // 現在のパスワードを確認
  const matched = await dataStore.findUserByEmailAndPassword(user.email, currentPassword);
  if (!matched) {
    res.status(401).json({ error: '現在のパスワードが正しくありません' });
    return;
  }

  try {
    await dataStore.updateUserPassword(user.oid, newPassword);
    res.json({ message: 'パスワードを変更しました' });
  } catch {
    res.status(500).json({ error: 'パスワードの変更に失敗しました' });
  }
});

export default router;
