import { pool } from './client';

// --- 型定義 ---

export type Organization = {
  id: string;
  name: string;
};

export type MockUser = {
  oid: string;
  name: string;
};

export type Invoice = {
  id: string;
  title: string;
  amount: number;
  unit_price: number;
  quantity: number;
  status: string;
  assignee_id: string;
  org_id: string;
  created_at: string;
};

/** 起動時に表示用マスタ（組織・ユーザー名）を読み込むストア */
class DataStore {
  organizations: Organization[] = [];
  mockUsers: MockUser[] = [];

  /** アプリ起動時に表示用マスタをDBから読み込む */
  async initialize(): Promise<void> {
    const [orgs, users] = await Promise.all([
      pool.query<Organization>('SELECT id, name FROM organizations'),
      pool.query<MockUser>('SELECT oid, name FROM mock_users'),
    ]);

    this.organizations = orgs.rows;
    this.mockUsers     = users.rows;

    console.log('Invoice DataStore initialized from PostgreSQL');
  }

  // --- 請求書 CRUD ---

  /** 請求書一覧を取得 */
  async getInvoices(): Promise<Invoice[]> {
    const result = await pool.query<Invoice>(
      `SELECT id, title, amount, unit_price, quantity, status, assignee_id, org_id,
              to_char(created_at, 'YYYY-MM-DD') AS created_at
       FROM invoices
       ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  /** 組織 ID（配下含む）で請求書を絞り込み取得 */
  async getInvoicesByOrgId(orgId: string): Promise<Invoice[]> {
    // WITH RECURSIVE で配下組織を再帰的に展開してからフィルタする
    const result = await pool.query<Invoice>(
      `WITH RECURSIVE org_tree AS (
         SELECT id FROM organizations WHERE id = $1
         UNION ALL
         SELECT o.id FROM organizations o
         JOIN org_tree ot ON o.parent_id = ot.id
       )
       SELECT i.id, i.title, i.amount, i.unit_price, i.quantity, i.status, i.assignee_id, i.org_id,
              to_char(i.created_at, 'YYYY-MM-DD') AS created_at
       FROM invoices i
       WHERE i.org_id IN (SELECT id FROM org_tree)
       ORDER BY i.created_at DESC`,
      [orgId],
    );
    return result.rows;
  }

  /** 請求書を1件取得 */
  async getInvoiceById(id: string): Promise<Invoice | null> {
    const result = await pool.query<Invoice>(
      `SELECT id, title, amount, unit_price, quantity, status, assignee_id, org_id,
              to_char(created_at, 'YYYY-MM-DD') AS created_at
       FROM invoices
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** 請求書を作成 */
  async createInvoice(data: {
    title: string;
    amount: number;
    unit_price: number;
    quantity: number;
    assignee_id: string;
    org_id: string;
  }): Promise<Invoice> {
    const newId = `inv-${Date.now()}`;
    const result = await pool.query<Invoice>(
      `INSERT INTO invoices (id, title, amount, unit_price, quantity, status, assignee_id, org_id)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
       RETURNING id, title, amount, unit_price, quantity, status, assignee_id, org_id,
                 to_char(created_at, 'YYYY-MM-DD') AS created_at`,
      [newId, data.title, data.amount, data.unit_price, data.quantity, data.assignee_id, data.org_id],
    );
    return result.rows[0];
  }

  /** 請求書ステータスを更新 */
  async updateInvoiceStatus(id: string, status: string): Promise<Invoice | null> {
    const result = await pool.query<Invoice>(
      `UPDATE invoices SET status = $1
       WHERE id = $2
       RETURNING id, title, amount, unit_price, quantity, status, assignee_id, org_id,
                 to_char(created_at, 'YYYY-MM-DD') AS created_at`,
      [status, id],
    );
    return result.rows[0] ?? null;
  }

  /** 請求書を削除 */
  async deleteInvoice(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * ユーザー名を解決する
   * キャッシュに存在しない場合（新規ユーザー等）はDBを直接参照する
   */
  async resolveUserName(oid: string): Promise<string> {
    const cached = this.mockUsers.find((u) => u.oid === oid);
    if (cached) return cached.name;

    // キャッシュになければDBから取得してキャッシュを更新
    const result = await pool.query<MockUser>(
      'SELECT oid, name FROM mock_users WHERE oid = $1',
      [oid],
    );
    if (result.rows[0]) {
      this.mockUsers.push(result.rows[0]);
      return result.rows[0].name;
    }
    return '不明';
  }
}

export const dataStore = new DataStore();
