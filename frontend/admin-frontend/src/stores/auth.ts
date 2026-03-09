import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';
import type { CurrentUser, ApiPermission, PermissionsResponse, MockLoginUser } from '@/types';

/** API Gateway の URL */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const useAuthStore = defineStore('auth', () => {
  // --- 状態 ---
  const currentUser = ref<CurrentUser | null>(null);
  const currentUserId = ref<string | null>(null);
  const apiPermissions = ref<ApiPermission[]>([]);
  const isLoading = ref(false);

  // --- 算出プロパティ ---
  const isLoggedIn = computed(() => currentUserId.value !== null);

  /** API 権限チェック */
  const can = (resource: string, action: string): boolean =>
    apiPermissions.value.some((p) => p.resource === resource && p.action === action);

  /** 管理者かどうか（user.read 権限で判定） */
  const isAdmin = computed(() => can('user', 'read'));

  // --- アクション ---
  /** ログイン */
  const login = async (userId: string): Promise<void> => {
    isLoading.value = true;
    try {
      currentUserId.value = userId;

      const headers = { 'X-Mock-User-Id': userId };

      // 権限取得
      const permRes = await axios.get<PermissionsResponse>(`${API_BASE}/me/permissions`, { headers });
      apiPermissions.value = permRes.data.apiPermissions;

      // ユーザー情報取得
      const meRes = await axios.get<CurrentUser>(`${API_BASE}/me`, { headers });
      currentUser.value = meRes.data;
    } finally {
      isLoading.value = false;
    }
  };

  /** ログアウト */
  const logout = () => {
    currentUserId.value = null;
    currentUser.value = null;
    apiPermissions.value = [];
  };

  return {
    currentUser,
    currentUserId,
    apiPermissions,
    isLoading,
    isLoggedIn,
    isAdmin,
    can,
    login,
    logout,
  };
});
