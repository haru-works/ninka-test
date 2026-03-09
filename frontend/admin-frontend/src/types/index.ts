/** ログイン選択用ユーザー */
export interface MockLoginUser {
  oid: string;
  name: string;
  email: string;
}

/** API権限 */
export interface ApiPermission {
  resource: string;
  action: string;
}

/** 権限レスポンス */
export interface PermissionsResponse {
  apiPermissions: ApiPermission[];
  uiPermissions: Record<string, Record<string, { visible: boolean; editable: boolean }>>;
}

/** ログイン中ユーザー */
export interface CurrentUser {
  oid: string;
  name: string;
  email: string;
}

/** 管理用ユーザー */
export interface ManagedUser {
  oid: string;
  name: string;
  email: string;
  assignments: UserAssignmentSummary[];
}

/** 割り当てサマリー（ユーザー一覧表示用） */
export interface UserAssignmentSummary {
  id: string;
  orgName: string;
  jobTitle: string;
  role: string;
  isPrimary: boolean;
  validUntil: string | null;
}

/** ユーザー割り当て */
export interface UserAssignment {
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
}

/** 組織 */
export interface Organization {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
}

/** ロール */
export interface Role {
  id: string;
  code: string;
  name: string;
  scope: string;
}

/** 役職 */
export interface JobTitle {
  id: string;
  code: string;
  name: string;
  rank: number;
}

/** ロール権限 */
export interface RolePermission {
  role_id: string;
  resource: string;
  action: string;
}

/** マスターデータレスポンス */
export interface MasterData {
  organizations: Organization[];
  roles: Role[];
  jobTitles: JobTitle[];
  rolePermissions: RolePermission[];
}
