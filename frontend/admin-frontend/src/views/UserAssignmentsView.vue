<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import apiClient from '@/api/client';
import type { UserAssignment, ManagedUser, MasterData } from '@/types';

// --- 状態 ---
const assignments = ref<UserAssignment[]>([]);
const users = ref<ManagedUser[]>([]);
const master = ref<MasterData | null>(null);
const isLoading = ref(true);
const error = ref('');

// フィルター
const filterUserId = ref('');

// フォーム
const showForm = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formData = ref<Partial<UserAssignment>>({});
const formError = ref('');
const formLoading = ref(false);

// 削除確認
const deleteTarget = ref<UserAssignment | null>(null);
const deleteLoading = ref(false);

// --- データ取得 ---
/** axios エラーからメッセージを取り出すヘルパー */
const extractError = (e: unknown): string => {
  const ax = e as { response?: { status?: number; data?: { error?: string } } };
  if (ax.response?.status === 403) return '権限がありません';
  return ax.response?.data?.error ?? 'データの取得に失敗しました';
};

const fetchAll = async () => {
  isLoading.value = true;
  error.value = '';
  // 各 API が独立して失敗してもほかのデータは表示できるよう allSettled を使用
  const [uaResult, usersResult, masterResult] = await Promise.allSettled([
    apiClient.get<UserAssignment[]>('/user-assignments'),
    apiClient.get<ManagedUser[]>('/users'),
    apiClient.get<MasterData>('/master'),
  ]);

  const errors: string[] = [];
  if (uaResult.status === 'fulfilled') {
    assignments.value = uaResult.value.data;
  } else {
    errors.push(`割り当て: ${extractError(uaResult.reason)}`);
  }
  if (usersResult.status === 'fulfilled') {
    users.value = usersResult.value.data;
  } else {
    errors.push(`ユーザー: ${extractError(usersResult.reason)}`);
  }
  if (masterResult.status === 'fulfilled') {
    master.value = masterResult.value.data;
  } else {
    errors.push(`マスターデータ: ${extractError(masterResult.reason)}`);
  }

  if (errors.length > 0) error.value = errors.join(' / ');
  isLoading.value = false;
};

onMounted(fetchAll);

// --- フィルタリング ---
const filteredAssignments = computed(() =>
  filterUserId.value
    ? assignments.value.filter((a) => a.user_id === filterUserId.value)
    : assignments.value,
);

// --- 表示名ヘルパー ---
const userName = (oid: string) => users.value.find((u) => u.oid === oid)?.name ?? oid;
const orgName = (id: string) => master.value?.organizations.find((o) => o.id === id)?.name ?? id;
const roleName = (id: string) => master.value?.roles.find((r) => r.id === id)?.name ?? id;
const jobTitleName = (id: string | null) =>
  id ? (master.value?.jobTitles.find((j) => j.id === id)?.name ?? id) : '-';

// --- フォーム操作 ---
const openCreate = () => {
  formMode.value = 'create';
  formData.value = { principal_type: 'user', is_primary: false };
  formError.value = '';
  showForm.value = true;
};

const openEdit = (ua: UserAssignment) => {
  formMode.value = 'edit';
  formData.value = { ...ua };
  formError.value = '';
  showForm.value = true;
};

const submitForm = async () => {
  if (!formData.value.user_id || !formData.value.org_id || !formData.value.role_id) {
    formError.value = 'ユーザー・組織・ロールは必須です';
    return;
  }
  formLoading.value = true;
  formError.value = '';
  try {
    if (formMode.value === 'create') {
      await apiClient.post('/user-assignments', formData.value);
    } else {
      await apiClient.patch(`/user-assignments/${formData.value.id}`, {
        role_id:      formData.value.role_id,
        job_title_id: formData.value.job_title_id ?? null,
        is_primary:   formData.value.is_primary,
        valid_from:   formData.value.valid_from ?? null,
        valid_until:  formData.value.valid_until ?? null,
      });
    }
    showForm.value = false;
    await fetchAll();
  } catch (e: any) {
    formError.value = e.response?.data?.error ?? '保存に失敗しました';
  } finally {
    formLoading.value = false;
  }
};

// --- 削除 ---
const executeDelete = async () => {
  if (!deleteTarget.value) return;
  deleteLoading.value = true;
  try {
    await apiClient.delete(`/user-assignments/${deleteTarget.value.id}`);
    deleteTarget.value = null;
    await fetchAll();
  } catch {
    error.value = '削除に失敗しました';
    deleteTarget.value = null;
  } finally {
    deleteLoading.value = false;
  }
};
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>割り当て管理</h1>
      <button class="btn-primary" @click="openCreate">＋ 新規割り当て</button>
    </div>

    <!-- フィルター -->
    <div class="filter-bar">
      <label>
        ユーザーで絞り込み:
        <select v-model="filterUserId" class="form-select">
          <option value="">すべて</option>
          <option v-for="u in users" :key="u.oid" :value="u.oid">{{ u.name }}</option>
        </select>
      </label>
      <span class="count">{{ filteredAssignments.length }} 件</span>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>
    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="!isLoading" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>ユーザー</th>
            <th>組織</th>
            <th>ロール</th>
            <th>役職</th>
            <th>主所属</th>
            <th>有効期限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ua in filteredAssignments" :key="ua.id">
            <td>{{ userName(ua.user_id) }}</td>
            <td>{{ orgName(ua.org_id) }}</td>
            <td>{{ roleName(ua.role_id) }}</td>
            <td>{{ jobTitleName(ua.job_title_id) }}</td>
            <td>
              <span v-if="ua.is_primary" class="badge-primary">主</span>
              <span v-else class="badge-gray">-</span>
            </td>
            <td class="mono">{{ ua.valid_until ?? '無期限' }}</td>
            <td class="actions">
              <button class="btn-sm btn-edit" @click="openEdit(ua)">編集</button>
              <button class="btn-sm btn-danger" @click="deleteTarget = ua">削除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新規作成 / 編集モーダル -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="modal modal-wide">
        <h2>{{ formMode === 'create' ? '割り当て新規作成' : '割り当て編集' }}</h2>

        <div class="form-grid">
          <!-- ユーザー（作成時のみ変更可） -->
          <label class="form-label">
            ユーザー <span class="required">*</span>
            <select
              v-model="formData.user_id"
              class="form-select"
              :disabled="formMode === 'edit'"
            >
              <option value="">選択してください</option>
              <option v-for="u in users" :key="u.oid" :value="u.oid">{{ u.name }}</option>
            </select>
          </label>

          <!-- 組織（作成時のみ変更可） -->
          <label class="form-label">
            組織 <span class="required">*</span>
            <select
              v-model="formData.org_id"
              class="form-select"
              :disabled="formMode === 'edit'"
            >
              <option value="">選択してください</option>
              <option
                v-for="org in master?.organizations"
                :key="org.id"
                :value="org.id"
              >{{ org.name }}</option>
            </select>
          </label>

          <!-- ロール -->
          <label class="form-label">
            ロール <span class="required">*</span>
            <select v-model="formData.role_id" class="form-select">
              <option value="">選択してください</option>
              <option
                v-for="role in master?.roles"
                :key="role.id"
                :value="role.id"
              >{{ role.name }}</option>
            </select>
          </label>

          <!-- 役職 -->
          <label class="form-label">
            役職
            <select v-model="formData.job_title_id" class="form-select">
              <option :value="null">なし</option>
              <option
                v-for="jt in master?.jobTitles"
                :key="jt.id"
                :value="jt.id"
              >{{ jt.name }}</option>
            </select>
          </label>

          <!-- 有効開始 -->
          <label class="form-label">
            有効開始日
            <input v-model="formData.valid_from" type="date" class="form-input" />
          </label>

          <!-- 有効終了 -->
          <label class="form-label">
            有効終了日
            <input v-model="formData.valid_until" type="date" class="form-input" />
          </label>
        </div>

        <!-- 主所属フラグ -->
        <label class="form-checkbox">
          <input v-model="formData.is_primary" type="checkbox" />
          主所属にする（既存の主所属は自動的に解除されます）
        </label>

        <p v-if="formError" class="error-msg">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showForm = false">キャンセル</button>
          <button class="btn-primary" :disabled="formLoading" @click="submitForm">
            {{ formLoading ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 削除確認 -->
    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal">
        <h2>割り当て削除の確認</h2>
        <p>
          <strong>{{ userName(deleteTarget.user_id) }}</strong> の
          <strong>{{ orgName(deleteTarget.org_id) }}</strong> への割り当てを削除します。
        </p>
        <p class="warn-msg">⚠️ この操作は取り消せません。</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="deleteTarget = null">キャンセル</button>
          <button class="btn-danger" :disabled="deleteLoading" @click="executeDelete">
            {{ deleteLoading ? '削除中...' : '削除する' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 32px; max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page-header h1 { font-size: 22px; font-weight: 700; }
.filter-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; font-size: 14px; }
.count { color: #64748b; font-size: 13px; }
.loading { color: #64748b; padding: 24px; text-align: center; }
.error-banner { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; }
.error-msg { color: #ef4444; font-size: 13px; margin-bottom: 8px; }
.warn-msg { color: #d97706; font-size: 13px; margin-top: 8px; }
.table-wrap { background: #fff; border-radius: 10px; overflow-x: auto; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { background: #f8fafc; padding: 12px 16px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
.table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.mono { font-family: monospace; font-size: 12px; color: #64748b; }
.badge-primary { background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
.badge-gray { color: #94a3b8; font-size: 12px; }
.actions { display: flex; gap: 6px; white-space: nowrap; }
.btn-sm { padding: 4px 12px; border-radius: 5px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-edit { background: #eff6ff; color: #3b82f6; }
.btn-danger { background: #fef2f2; color: #ef4444; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-primary { background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; font-size: 14px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; padding: 32px; width: 440px; }
.modal-wide { width: 640px; }
.modal h2 { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.modal p { font-size: 14px; line-height: 1.6; color: #475569; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
.form-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #374151; }
.required { color: #ef4444; }
.form-input, .form-select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 14px; outline: none; background: #fff; }
.form-input:focus, .form-select:focus { border-color: #3b82f6; }
.form-input:disabled, .form-select:disabled { background: #f8fafc; color: #94a3b8; }
.form-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; margin-bottom: 16px; cursor: pointer; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
</style>
