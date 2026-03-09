import { Router, Request, Response } from 'express';
import { dataStore } from '../db/dataStore';
import type { ApiPermission } from '../middleware/auth';

const router = Router();

/** 権限チェックヘルパー（Gateway 注入の権限を使用） */
const canDo = (permissions: ApiPermission[], resource: string, action: string): boolean =>
  permissions.some((p) => p.resource === resource && p.action === action);

/** GET /api/invoices - 請求書一覧（スコープ組織でフィルタ） */
router.get('/', async (req: Request, res: Response) => {
  const permissions = (req as any).permissions as ApiPermission[];
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!canDo(permissions, 'invoice', 'read')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const isAdmin = canDo(permissions, 'user', 'delete');
  const allInvoices = isAdmin
    ? await dataStore.getInvoices()
    : await dataStore.getInvoicesByOrgId(activeOrgId ?? 'org-003');

  const result = await Promise.all(
    allInvoices.map(async (inv) => ({
      ...inv,
      assignee_name: await dataStore.resolveUserName(inv.assignee_id),
      org_name:      dataStore.organizations.find((o) => o.id === inv.org_id)?.name ?? '不明',
    })),
  );

  res.json(result);
});

/** GET /api/invoices/:id - 請求書詳細 */
router.get('/:id', async (req: Request, res: Response) => {
  const permissions = (req as any).permissions as ApiPermission[];

  if (!canDo(permissions, 'invoice', 'read')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const invoice = await dataStore.getInvoiceById(req.params.id);
  if (!invoice) { res.status(404).json({ error: 'Not Found' }); return; }

  res.json({
    ...invoice,
    assignee_name: await dataStore.resolveUserName(invoice.assignee_id),
    org_name:      dataStore.organizations.find((o) => o.id === invoice.org_id)?.name ?? '不明',
  });
});

/** POST /api/invoices - 請求書作成 */
router.post('/', async (req: Request, res: Response) => {
  const user        = (req as any).currentUser;
  const permissions = (req as any).permissions as ApiPermission[];
  const activeOrgId = req.headers['x-active-org-id'] as string | undefined;

  if (!canDo(permissions, 'invoice', 'write')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const newInvoice = await dataStore.createInvoice({
    title:       req.body.title,
    amount:      req.body.amount,
    unit_price:  req.body.unit_price,
    quantity:    req.body.quantity,
    assignee_id: user.oid,
    org_id:      activeOrgId ?? 'org-003',
  });

  res.status(201).json(newInvoice);
});

/** PATCH /api/invoices/:id/approve - 請求書承認 */
router.patch('/:id/approve', async (req: Request, res: Response) => {
  const permissions = (req as any).permissions as ApiPermission[];

  if (!canDo(permissions, 'invoice', 'approve')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const updated = await dataStore.updateInvoiceStatus(req.params.id, 'approved');
  if (!updated) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json(updated);
});

/** DELETE /api/invoices/:id - 請求書削除 */
router.delete('/:id', async (req: Request, res: Response) => {
  const permissions = (req as any).permissions as ApiPermission[];

  if (!canDo(permissions, 'invoice', 'delete')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const deleted = await dataStore.deleteInvoice(req.params.id);
  if (!deleted) { res.status(404).json({ error: 'Not Found' }); return; }
  res.status(204).send();
});

export default router;
