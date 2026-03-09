/** ユーザーが所属する組織情報 */
export interface UserOrganization {
  orgId: string;
  orgName: string;
  orgCode: string;
  jobTitle: string | null;
  role: string;
  roleName: string;
  isPrimary: boolean;
  validUntil: string | null;
}

/** ログイン中ユーザー情報 */
export interface CurrentUser {
  oid: string;
  name: string;
  email: string;
  activeOrg: UserOrganization | null;
}

/** API権限 */
export interface ApiPermission {
  resource: string;
  action: string;
}

/** UI要素の権限 */
export interface UiElementPermission {
  visible: boolean;
  editable: boolean;
}

/** 権限レスポンス */
export interface PermissionsResponse {
  apiPermissions: ApiPermission[];
  uiPermissions: Record<string, Record<string, UiElementPermission>>;
}

/** 請求書 */
export interface Invoice {
  id: string;
  title: string;
  amount: number;
  unit_price: number;
  quantity: number;
  status: 'draft' | 'pending' | 'approved';
  assignee_id: string;
  assignee_name: string;
  org_id: string;
  org_name: string;
  created_at: string;
}

/** ユーザー（管理画面用） */
export interface ManagedUser {
  oid: string;
  name: string;
  email: string;
  assignments: {
    orgName: string;
    jobTitle: string;
    role: string;
    isPrimary: boolean;
    validUntil: string | null;
  }[];
}

/** モックログイン選択用ユーザー */
export interface MockLoginUser {
  oid: string;
  name: string;
  email: string;
}
