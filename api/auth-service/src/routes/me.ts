import { Router, Request, Response } from 'express';
import {
  resolveApiPermissions,
  resolveUiPermissions,
  getUserOrganizations,
} from '../services/permissionService';

const router = Router();

/** GET /api/me - ログイン中ユーザー情報 */
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;
  const orgs = await getUserOrganizations(user.oid);
  const primaryOrg = orgs.find((o) => o.isPrimary);
  const activeOrg = activeOrgId
    ? orgs.find((o) => o.orgId === activeOrgId)
    : primaryOrg;

  res.json({
    oid: user.oid,
    name: user.name,
    email: user.email,
    activeOrg: activeOrg ?? primaryOrg ?? null,
  });
});

/** GET /api/me/permissions - 自分の権限一覧（API権限 + UI権限） */
router.get('/permissions', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  const apiPermissions = await resolveApiPermissions(user.oid, activeOrgId);
  const uiPermissions = await resolveUiPermissions(user.oid, activeOrgId);

  res.json({ apiPermissions, uiPermissions });
});

/** GET /api/me/organizations - 所属組織一覧（兼務含む） */
router.get('/organizations', async (req: Request, res: Response) => {
  const user = (req as any).currentUser;
  const orgs = await getUserOrganizations(user.oid);
  res.json(orgs);
});

export default router;
