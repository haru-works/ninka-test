import { dataStore } from '../db/dataStore';

/** 組織IDの配下組織ID一覧を取得（自身を含む） */
const getDescendantOrgIds = (orgId: string): string[] => {
  const result: string[] = [orgId];
  const queue = [orgId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = dataStore.organizations
      .filter((o) => o.parent_id === current)
      .map((o) => o.id);
    result.push(...children);
    queue.push(...children);
  }
  return result;
};

/** 有効な割り当てかどうか確認（有効期限チェック） */
const isValidAssignment = (assignment: { valid_until: string | null }): boolean => {
  if (!assignment.valid_until) return true;
  return new Date(assignment.valid_until) >= new Date();
};

/**
 * ユーザーの有効な割り当て一覧を取得する（常にDBから最新を取得）
 * activeOrgId 未指定時は主所属（is_primary=true）を適用
 */
const getEffectiveAssignments = async (userId: string, activeOrgId?: string) => {
  // キャッシュではなく DB から最新データを取得する
  const rows = await dataStore.getAllUserAssignments();
  const allAssignments = rows.filter(
    (ua) => ua.user_id === userId && ua.principal_type === 'user' && isValidAssignment(ua),
  );

  return allAssignments.filter((ua) => {
    const role = dataStore.roles.find((r) => r.id === ua.role_id);
    if (!role) return false;

    // グローバルロールは常に有効
    if (role.scope === 'global') return true;

    // activeOrgId が指定されている場合、そのスコープに含まれるか確認
    const targetOrgId = activeOrgId ?? allAssignments.find((a) => a.is_primary)?.scope_org_id
      ?? allAssignments.find((a) => a.is_primary)?.org_id;
    if (!targetOrgId) return false;

    // scope_org_id 未設定の場合は org_id をスコープとして扱う
    const effectiveScopeOrgId = ua.scope_org_id ?? ua.org_id;

    // スコープ組織の配下に targetOrg が含まれるか
    return getDescendantOrgIds(effectiveScopeOrgId).includes(targetOrgId);
  });
};

/**
 * ユーザーのAPI権限一覧を取得する
 */
export const resolveApiPermissions = async (userId: string, activeOrgId?: string) => {
  const assignments = await getEffectiveAssignments(userId, activeOrgId);
  const permissions = assignments.flatMap((ua) =>
    dataStore.rolePermissions
      .filter((rp) => rp.role_id === ua.role_id)
      .map((rp) => ({ resource: rp.resource, action: rp.action })),
  );

  // 重複排除
  const unique = permissions.filter(
    (p, idx, arr) =>
      arr.findIndex((x) => x.resource === p.resource && x.action === p.action) === idx,
  );
  return unique;
};

/**
 * ユーザーのUI権限マトリクスを page 単位で取得する
 */
export const resolveUiPermissions = async (userId: string, activeOrgId?: string) => {
  const assignments = await getEffectiveAssignments(userId, activeOrgId);
  const roleIds = assignments.map((ua) => ua.role_id);

  // page → element → { visible, editable }
  const result: Record<string, Record<string, { visible: boolean; editable: boolean }>> = {};

  for (const elem of dataStore.uiElements) {
    if (!result[elem.page]) result[elem.page] = {};

    // 複数ロール: BOOL_OR（いずれかがtrueなら有効）
    const visible = roleIds.some(
      (rId) => dataStore.uiPermissions.find((p) => p.role_id === rId && p.ui_element_id === elem.id)?.visible,
    );
    const editable = roleIds.some(
      (rId) => dataStore.uiPermissions.find((p) => p.role_id === rId && p.ui_element_id === elem.id)?.editable,
    );

    result[elem.page][elem.element] = { visible, editable };
  }

  return result;
};

/**
 * ユーザーが所属する組織一覧を取得する（兼務含む・有効期限内のみ）
 */
export const getUserOrganizations = async (userId: string) => {
  // キャッシュではなく DB から最新データを取得する
  const rows = await dataStore.getAllUserAssignments();
  const assignments = rows.filter(
    (ua) => ua.user_id === userId && isValidAssignment(ua),
  );

  return assignments.map((ua) => {
    const org = dataStore.organizations.find((o) => o.id === ua.org_id)!;
    const jobTitle = dataStore.jobTitles.find((j) => j.id === ua.job_title_id);
    const role = dataStore.roles.find((r) => r.id === ua.role_id)!;
    // フロントエンドが activeOrgId として使う orgId は scope_org_id ?? org_id で統一する
    const effectiveOrgId = ua.scope_org_id ?? ua.org_id;
    const effectiveOrg = dataStore.organizations.find((o) => o.id === effectiveOrgId) ?? org;
    return {
      orgId: effectiveOrgId,
      orgName: effectiveOrg.name,
      orgCode: effectiveOrg.code,
      jobTitle: jobTitle?.name ?? null,
      role: role.code,
      roleName: role.name,
      isPrimary: ua.is_primary,
      validUntil: ua.valid_until,
    };
  });
};
