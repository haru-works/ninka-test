import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';
import type {
  CurrentUser,
  UserOrganization,
  ApiPermission,
  PermissionsResponse,
  MockLoginUser,
} from '@/types';

export const useAuthStore = defineStore('auth', () => {
  // --- 状態 ---
  const currentUser = ref<CurrentUser | null>(null);
  const currentUserId = ref<string | null>(null);
  const activeOrgId = ref<string | null>(null);
  const organizations = ref<UserOrganization[]>([]);
  const apiPermissions = ref<ApiPermission[]>([]);
  const uiPermissions = ref<Record<string, Record<string, { visible: boolean; editable: boolean }>>>({});
  const isLoading = ref(false);

  // --- 算出プロパティ ---
  const isLoggedIn = computed(() => currentUserId.value !== null);

  const activeOrg = computed(() =>
    organizations.value.find((o) => o.orgId === activeOrgId.value) ?? null,
  );

  /** API権限チェック */
  const can = (resource: string, action: string): boolean =>
    apiPermissions.value.some((p) => p.resource === resource && p.action === action);

  /** UI要素の表示チェック */
  const isVisible = (page: string, element: string): boolean =>
    uiPermissions.value[page]?.[element]?.visible ?? false;

  /** UI要素の編集可否チェック */
  const isEditable = (page: string, element: string): boolean =>
    uiPermissions.value[page]?.[element]?.editable ?? false;

  // --- アクション ---
  /** ログイン: ユーザーIDを選択して権限を取得する */
  const login = async (userId: string): Promise<void> => {
    isLoading.value = true;
    currentUserId.value = userId;

    // 所属組織一覧取得
    const orgsRes = await axios.get<UserOrganization[]>('/api/me/organizations', {
      headers: { 'X-Mock-User-Id': userId },
    });
    organizations.value = orgsRes.data;

    // 主所属をデフォルトのアクティブ組織に設定
    const primary = orgsRes.data.find((o) => o.isPrimary);
    activeOrgId.value = primary?.orgId ?? orgsRes.data[0]?.orgId ?? null;

    // 権限取得
    await fetchPermissions(userId, activeOrgId.value ?? undefined);

    // ユーザー情報取得
    const meRes = await axios.get<CurrentUser>('/api/me', {
      headers: {
        'X-Mock-User-Id': userId,
        ...(activeOrgId.value ? { 'X-Active-Org-Id': activeOrgId.value } : {}),
      },
    });
    currentUser.value = meRes.data;
    isLoading.value = false;
  };

  /** 組織切り替え: 権限を再取得する */
  const switchOrg = async (orgId: string): Promise<void> => {
    isLoading.value = true;
    activeOrgId.value = orgId;
    await fetchPermissions(currentUserId.value!, orgId);
    isLoading.value = false;
  };

  /** 権限取得（内部用） */
  const fetchPermissions = async (userId: string, orgId?: string): Promise<void> => {
    const res = await axios.get<PermissionsResponse>('/api/me/permissions', {
      headers: {
        'X-Mock-User-Id': userId,
        ...(orgId ? { 'X-Active-Org-Id': orgId } : {}),
      },
    });
    apiPermissions.value = res.data.apiPermissions;
    uiPermissions.value = res.data.uiPermissions;
  };

  /** ログアウト */
  const logout = (): void => {
    currentUser.value = null;
    currentUserId.value = null;
    activeOrgId.value = null;
    organizations.value = [];
    apiPermissions.value = [];
    uiPermissions.value = {};
  };

  return {
    currentUser, currentUserId, activeOrgId, organizations,
    apiPermissions, uiPermissions, isLoading,
    isLoggedIn, activeOrg,
    can, isVisible, isEditable,
    login, switchOrg, logout,
  };
});
