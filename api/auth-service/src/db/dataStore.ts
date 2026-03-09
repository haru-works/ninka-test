import { pool } from './client';

// --- 型定義 ---

export type Organization = {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
};

export type JobTitle = {
  id: string;
  code: string;
  name: string;
  rank: number;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  scope: string;
};

export type RolePermission = {
  role_id: string;
  resource: string;
  action: string;
};

export type UiElement = {
  id: string;
  page: string;
  element: string;
  label: string;
  element_type: string;
};

export type UiPermission = {
  role_id: string;
  ui_element_id: string;
  visible: boolean;
  editable: boolean;
};

export type UserAssignment = {
  id: string;
  user_id: string;
  principal_type: string;
  org_id: string;
  job_title_id: string | null;
  role_id: string;
  scope_org_id: string | null;
  is_primary: boolean;
  valid_from: string | null;
  valid_until: string | null;
};

export type MockUser = {
  oid: string;
  name: string;
  email: string;
  password: string;
};

/** 起動時にDBからマスタデータを読み込み、リクエスト処理中は同期アクセス可能にするストア */
// キャッシュ更新: 2026-02-28
class DataStore {
  organizations: Organization[] = [];
  jobTitles: JobTitle[] = [];
  roles: Role[] = [];
  rolePermissions: RolePermission[] = [];
  uiElements: UiElement[] = [];
  uiPermissions: UiPermission[] = [];
  userAssignments: UserAssignment[] = [];
  mockUsers: MockUser[] = [];

  /** アプリ起動時に全マスタデータをDBから読み込む */
  async initialize(): Promise<void> {
    const [orgs, jts, roles, rps, uiElems, uiPerms, uas, users] =
      await Promise.all([
        pool.query<Organization>(
          'SELECT id, parent_id, code, name, level FROM organizations ORDER BY level',
        ),
        pool.query<JobTitle>('SELECT id, code, name, rank FROM job_titles'),
        pool.query<Role>('SELECT id, code, name, scope FROM roles'),
        pool.query<RolePermission>(
          'SELECT role_id, resource, action FROM role_permissions',
        ),
        pool.query<UiElement>(
          'SELECT id, page, element, label, element_type FROM ui_elements',
        ),
        pool.query<UiPermission>(
          'SELECT role_id, ui_element_id, visible, editable FROM ui_permissions',
        ),
        pool.query<UserAssignment>(
          `SELECT id, user_id, principal_type, org_id, job_title_id, role_id,
                  scope_org_id, is_primary,
                  to_char(valid_from,  'YYYY-MM-DD') AS valid_from,
                  to_char(valid_until, 'YYYY-MM-DD') AS valid_until
           FROM user_assignments`,
        ),
        pool.query<MockUser>('SELECT oid, name, email, password FROM mock_users'),
      ]);

    this.organizations  = orgs.rows;
    this.jobTitles      = jts.rows;
    this.roles          = roles.rows;
    this.rolePermissions = rps.rows;
    this.uiElements     = uiElems.rows;
    this.uiPermissions  = uiPerms.rows;
    this.userAssignments = uas.rows;
    this.mockUsers      = users.rows;

    console.log('DataStore initialized from PostgreSQL');
  }

  // --- ユーザー DB直接クエリ ---

  /** oid でユーザーを直接DBから取得 */
  async findUserByOid(oid: string): Promise<MockUser | null> {
    const result = await pool.query<MockUser>(
      'SELECT oid, name, email, password FROM mock_users WHERE oid = $1',
      [oid],
    );
    return result.rows[0] ?? null;
  }

  /** メールアドレスとパスワードでユーザーを直接DBから検索 */
  async findUserByEmailAndPassword(email: string, password: string): Promise<MockUser | null> {
    const result = await pool.query<MockUser>(
      'SELECT oid, name, email, password FROM mock_users WHERE email = $1 AND password = $2',
      [email, password],
    );
    return result.rows[0] ?? null;
  }

  /** 全ユーザーを直接DBから取得（割り当て情報付き） */
  async getAllUsersWithAssignments(): Promise<Array<MockUser & {
    assignments: Array<{
      id: string; org_id: string; job_title_id: string | null;
      role_id: string; is_primary: boolean; valid_until: string | null;
    }>;
  }>> {
    const users = await pool.query<MockUser>(
      'SELECT oid, name, email, password FROM mock_users ORDER BY name',
    );
    const assignments = await pool.query<{
      id: string; user_id: string; org_id: string; job_title_id: string | null;
      role_id: string; is_primary: boolean; valid_until: string | null;
    }>(
      `SELECT id, user_id, org_id, job_title_id, role_id, is_primary,
              to_char(valid_until, 'YYYY-MM-DD') AS valid_until
       FROM user_assignments`,
    );
    return users.rows.map((u) => ({
      ...u,
      assignments: assignments.rows.filter((a) => a.user_id === u.oid),
    }));
  }

  // --- ユーザー CRUD ---

  /** ユーザーを新規作成してキャッシュを更新 */
  async createUser(data: { name: string; email: string }): Promise<MockUser> {
    const oid = `user-${Date.now()}`;
    const result = await pool.query<MockUser>(
      'INSERT INTO mock_users (oid, name, email) VALUES ($1, $2, $3) RETURNING oid, name, email, password',
      [oid, data.name, data.email],
    );
    const created = result.rows[0];
    this.mockUsers.push(created);
    return created;
  }

  /** ユーザーを更新してキャッシュを更新 */
  async updateUser(oid: string, data: Partial<{ name: string; email: string }>): Promise<MockUser | null> {
    const updates: string[] = [];
    const values: unknown[] = [oid];
    let idx = 2;
    if (data.name  !== undefined) { updates.push(`name  = $${idx++}`); values.push(data.name); }
    if (data.email !== undefined) { updates.push(`email = $${idx++}`); values.push(data.email); }
    if (updates.length === 0) return null;

    const result = await pool.query<MockUser>(
      `UPDATE mock_users SET ${updates.join(', ')} WHERE oid = $1 RETURNING oid, name, email`,
      values,
    );
    if (!result.rows[0]) return null;
    const updated = result.rows[0];
    const i = this.mockUsers.findIndex((u) => u.oid === oid);
    if (i !== -1) this.mockUsers[i] = updated;
    return updated;
  }

  /** パスワードを変更する */
  async updateUserPassword(oid: string, newPassword: string): Promise<void> {
    await pool.query(
      'UPDATE mock_users SET password = $2 WHERE oid = $1',
      [oid, newPassword],
    );
  }

  /** ユーザーを削除してキャッシュから除去（割り当ても連動削除） */
  async deleteUser(oid: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_assignments WHERE user_id = $1', [oid]);
      const result = await client.query('DELETE FROM mock_users WHERE oid = $1', [oid]);
      await client.query('COMMIT');

      this.mockUsers = this.mockUsers.filter((u) => u.oid !== oid);
      this.userAssignments = this.userAssignments.filter((ua) => ua.user_id !== oid);
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** マスターデータを一括返却（管理画面向け） */
  getMasterData() {
    return {
      organizations:  this.organizations,
      roles:          this.roles,
      jobTitles:      this.jobTitles,
      rolePermissions: this.rolePermissions,
    };
  }

  // --- ユーザー割り当て CRUD（リアルタイムDB操作） ---

  /** ユーザー割り当て全件取得 */
  async getAllUserAssignments(): Promise<UserAssignment[]> {
    const result = await pool.query<UserAssignment>(
      `SELECT id, user_id, principal_type, org_id, job_title_id, role_id,
              scope_org_id, is_primary,
              to_char(valid_from,  'YYYY-MM-DD') AS valid_from,
              to_char(valid_until, 'YYYY-MM-DD') AS valid_until
       FROM user_assignments
       ORDER BY user_id, is_primary DESC, created_at DESC`,
    );
    return result.rows;
  }

  /** ユーザー割り当てを1件取得 */
  async getUserAssignmentById(id: string): Promise<UserAssignment | null> {
    const result = await pool.query<UserAssignment>(
      `SELECT id, user_id, principal_type, org_id, job_title_id, role_id,
              scope_org_id, is_primary,
              to_char(valid_from,  'YYYY-MM-DD') AS valid_from,
              to_char(valid_until, 'YYYY-MM-DD') AS valid_until
       FROM user_assignments
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** ユーザー割り当てを作成（主所属フラグの自動調整） */
  async createUserAssignment(data: {
    user_id: string;
    principal_type: string;
    org_id: string;
    job_title_id: string | null;
    role_id: string;
    scope_org_id: string | null;
    is_primary: boolean;
    valid_from: string | null;
    valid_until: string | null;
  }): Promise<UserAssignment> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // is_primary=true の場合、同一ユーザーの既存主所属をfalseに
      if (data.is_primary) {
        await client.query(
          'UPDATE user_assignments SET is_primary = false WHERE user_id = $1 AND is_primary = true',
          [data.user_id],
        );
      }

      // 新規割り当て挿入
      const newId = `ua-${Date.now()}`;
      const result = await client.query<UserAssignment>(
        `INSERT INTO user_assignments
         (id, user_id, principal_type, org_id, job_title_id, role_id, scope_org_id, is_primary, valid_from, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, user_id, principal_type, org_id, job_title_id, role_id,
                   scope_org_id, is_primary,
                   to_char(valid_from,  'YYYY-MM-DD') AS valid_from,
                   to_char(valid_until, 'YYYY-MM-DD') AS valid_until`,
        [
          newId,
          data.user_id,
          data.principal_type,
          data.org_id,
          data.job_title_id,
          data.role_id,
          data.scope_org_id,
          data.is_primary,
          data.valid_from,
          data.valid_until,
        ],
      );

      await client.query('COMMIT');

      const created = result.rows[0];
      // is_primary=true にした場合、キャッシュ上の既存主所属も更新
      if (data.is_primary) {
        this.userAssignments = this.userAssignments.map((ua) =>
          ua.user_id === data.user_id ? { ...ua, is_primary: false } : ua,
        );
      }
      // 新規割り当てをキャッシュに追加
      this.userAssignments.push(created);
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** ユーザー割り当てを更新 */
  async updateUserAssignment(
    id: string,
    data: Partial<{
      job_title_id: string | null;
      role_id: string;
      is_primary: boolean;
      valid_from: string | null;
      valid_until: string | null;
    }>,
  ): Promise<UserAssignment | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 更新前に現在の割り当て取得
      const current = await client.query<{ user_id: string }>(
        `SELECT user_id FROM user_assignments WHERE id = $1`,
        [id],
      );

      if (!current.rows[0]) {
        throw new Error('Assignment not found');
      }

      const userId = current.rows[0].user_id;

      // is_primary を true に変更する場合、同一ユーザーの既存主所属をfalseに
      if (data.is_primary === true) {
        await client.query(
          'UPDATE user_assignments SET is_primary = false WHERE user_id = $1 AND id != $2 AND is_primary = true',
          [userId, id],
        );
      }

      // 更新実行
      const updates: string[] = [];
      const values: any[] = [id];
      let paramIndex = 2;

      if (data.job_title_id !== undefined) {
        updates.push(`job_title_id = $${paramIndex++}`);
        values.push(data.job_title_id);
      }
      if (data.role_id !== undefined) {
        updates.push(`role_id = $${paramIndex++}`);
        values.push(data.role_id);
      }
      if (data.is_primary !== undefined) {
        updates.push(`is_primary = $${paramIndex++}`);
        values.push(data.is_primary);
      }
      if (data.valid_from !== undefined) {
        updates.push(`valid_from = $${paramIndex++}`);
        values.push(data.valid_from);
      }
      if (data.valid_until !== undefined) {
        updates.push(`valid_until = $${paramIndex++}`);
        values.push(data.valid_until);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      updates.push(`updated_at = now()`);

      const result = await client.query<UserAssignment>(
        `UPDATE user_assignments
         SET ${updates.join(', ')}
         WHERE id = $1
         RETURNING id, user_id, principal_type, org_id, job_title_id, role_id,
                   scope_org_id, is_primary,
                   to_char(valid_from,  'YYYY-MM-DD') AS valid_from,
                   to_char(valid_until, 'YYYY-MM-DD') AS valid_until`,
        values,
      );

      await client.query('COMMIT');

      const updated = result.rows[0] ?? null;
      if (updated) {
        // is_primary=true にした場合、キャッシュ上の他の主所属も更新
        if (data.is_primary === true) {
          this.userAssignments = this.userAssignments.map((ua) =>
            ua.user_id === updated.user_id && ua.id !== id ? { ...ua, is_primary: false } : ua,
          );
        }
        // 更新した割り当てをキャッシュに反映
        const idx = this.userAssignments.findIndex((ua) => ua.id === id);
        if (idx !== -1) this.userAssignments[idx] = updated;
      }
      return updated;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** ユーザー割り当てを削除 */
  async deleteUserAssignment(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM user_assignments WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    // キャッシュからも削除
    if (deleted) {
      this.userAssignments = this.userAssignments.filter((ua) => ua.id !== id);
    }
    return deleted;
  }

  // --- 組織 CRUD ---

  /** 組織を新規作成 */
  async createOrganization(data: { code: string; name: string; level: number; parent_id: string | null }): Promise<Organization> {
    const id = `org-${Date.now()}`;
    const result = await pool.query<Organization>(
      `INSERT INTO organizations (id, parent_id, code, name, level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parent_id, code, name, level`,
      [id, data.parent_id, data.code, data.name, data.level],
    );
    const created = result.rows[0];
    this.organizations.push(created);
    return created;
  }

  /** 組織を更新 */
  async updateOrganization(id: string, data: Partial<{ code: string; name: string; level: number; parent_id: string | null }>): Promise<Organization | null> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;
    if (data.code      !== undefined) { updates.push(`code = $${idx++}`);      values.push(data.code); }
    if (data.name      !== undefined) { updates.push(`name = $${idx++}`);      values.push(data.name); }
    if (data.level     !== undefined) { updates.push(`level = $${idx++}`);     values.push(data.level); }
    if (data.parent_id !== undefined) { updates.push(`parent_id = $${idx++}`); values.push(data.parent_id); }
    if (updates.length === 0) return null;
    const result = await pool.query<Organization>(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $1 RETURNING id, parent_id, code, name, level`,
      values,
    );
    const updated = result.rows[0] ?? null;
    if (updated) {
      const i = this.organizations.findIndex((o) => o.id === id);
      if (i !== -1) this.organizations[i] = updated;
    }
    return updated;
  }

  /** 組織を削除 */
  async deleteOrganization(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM organizations WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) this.organizations = this.organizations.filter((o) => o.id !== id);
    return deleted;
  }

  // --- ロール CRUD ---

  /** ロールを新規作成 */
  async createRole(data: { code: string; name: string; scope: string }): Promise<Role> {
    const id = `role-${Date.now()}`;
    const result = await pool.query<Role>(
      `INSERT INTO roles (id, code, name, scope) VALUES ($1, $2, $3, $4) RETURNING id, code, name, scope`,
      [id, data.code, data.name, data.scope],
    );
    const created = result.rows[0];
    this.roles.push(created);
    return created;
  }

  /** ロールを更新 */
  async updateRole(id: string, data: Partial<{ code: string; name: string; scope: string }>): Promise<Role | null> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;
    if (data.code  !== undefined) { updates.push(`code = $${idx++}`);  values.push(data.code); }
    if (data.name  !== undefined) { updates.push(`name = $${idx++}`);  values.push(data.name); }
    if (data.scope !== undefined) { updates.push(`scope = $${idx++}`); values.push(data.scope); }
    if (updates.length === 0) return null;
    const result = await pool.query<Role>(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = $1 RETURNING id, code, name, scope`,
      values,
    );
    const updated = result.rows[0] ?? null;
    if (updated) {
      const i = this.roles.findIndex((r) => r.id === id);
      if (i !== -1) this.roles[i] = updated;
    }
    return updated;
  }

  /** ロールを削除 */
  async deleteRole(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM roles WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      this.roles = this.roles.filter((r) => r.id !== id);
      this.rolePermissions = this.rolePermissions.filter((rp) => rp.role_id !== id);
    }
    return deleted;
  }

  // --- 役職 CRUD ---

  /** 役職を新規作成 */
  async createJobTitle(data: { code: string; name: string; rank: number }): Promise<JobTitle> {
    const id = `jt-${Date.now()}`;
    const result = await pool.query<JobTitle>(
      `INSERT INTO job_titles (id, code, name, rank) VALUES ($1, $2, $3, $4) RETURNING id, code, name, rank`,
      [id, data.code, data.name, data.rank],
    );
    const created = result.rows[0];
    this.jobTitles.push(created);
    return created;
  }

  /** 役職を更新 */
  async updateJobTitle(id: string, data: Partial<{ code: string; name: string; rank: number }>): Promise<JobTitle | null> {
    const updates: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;
    if (data.code !== undefined) { updates.push(`code = $${idx++}`); values.push(data.code); }
    if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
    if (data.rank !== undefined) { updates.push(`rank = $${idx++}`); values.push(data.rank); }
    if (updates.length === 0) return null;
    const result = await pool.query<JobTitle>(
      `UPDATE job_titles SET ${updates.join(', ')} WHERE id = $1 RETURNING id, code, name, rank`,
      values,
    );
    const updated = result.rows[0] ?? null;
    if (updated) {
      const i = this.jobTitles.findIndex((jt) => jt.id === id);
      if (i !== -1) this.jobTitles[i] = updated;
    }
    return updated;
  }

  /** 役職を削除 */
  async deleteJobTitle(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM job_titles WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) this.jobTitles = this.jobTitles.filter((jt) => jt.id !== id);
    return deleted;
  }

  // --- ロール権限 CRUD ---

  /** ロール権限を追加 */
  async createRolePermission(data: { role_id: string; resource: string; action: string }): Promise<RolePermission> {
    await pool.query(
      `INSERT INTO role_permissions (role_id, resource, action) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [data.role_id, data.resource, data.action],
    );
    const rp: RolePermission = { role_id: data.role_id, resource: data.resource, action: data.action };
    const exists = this.rolePermissions.some(
      (p) => p.role_id === rp.role_id && p.resource === rp.resource && p.action === rp.action,
    );
    if (!exists) this.rolePermissions.push(rp);
    return rp;
  }

  /** ロール権限を削除 */
  async deleteRolePermission(data: { role_id: string; resource: string; action: string }): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM role_permissions WHERE role_id = $1 AND resource = $2 AND action = $3',
      [data.role_id, data.resource, data.action],
    );
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      this.rolePermissions = this.rolePermissions.filter(
        (p) => !(p.role_id === data.role_id && p.resource === data.resource && p.action === data.action),
      );
    }
    return deleted;
  }
}

export const dataStore = new DataStore();
