<script setup lang="ts">
import { ref, onMounted } from 'vue';
import apiClient from '@/api/client';
import type { ManagedUser } from '@/types';

// --- 状態 ---
const users = ref<ManagedUser[]>([]);
const isLoading = ref(true);
const error = ref('');

// 新規作成 / 編集フォーム
const showForm = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formData = ref({ oid: '', name: '', email: '' });
const formError = ref('');
const formLoading = ref(false);

// 削除確認
const deleteTarget = ref<ManagedUser | null>(null);
const deleteLoading = ref(false);

// --- データ取得 ---
const fetchUsers = async () => {
  isLoading.value = true;
  error.value = '';
  try {
    const res = await apiClient.get<ManagedUser[]>('/users');
    users.value = res.data;
  } catch {
    error.value = 'ユーザー一覧の取得に失敗しました';
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchUsers);

// --- フォーム操作 ---
const openCreate = () => {
  formMode.value = 'create';
  formData.value = { oid: '', name: '', email: '' };
  formError.value = '';
  showForm.value = true;
};

const openEdit = (user: ManagedUser) => {
  formMode.value = 'edit';
  formData.value = { oid: user.oid, name: user.name, email: user.email };
  formError.value = '';
  showForm.value = true;
};

const submitForm = async () => {
  if (!formData.value.name || !formData.value.email) {
    formError.value = '名前とメールアドレスは必須です';
    return;
  }
  formLoading.value = true;
  formError.value = '';
  try {
    if (formMode.value === 'create') {
      await apiClient.post('/users', { name: formData.value.name, email: formData.value.email });
    } else {
      await apiClient.patch(`/users/${formData.value.oid}`, {
        name: formData.value.name,
        email: formData.value.email,
      });
    }
    showForm.value = false;
    await fetchUsers();
  } catch (e: any) {
    formError.value = e.response?.data?.error ?? '保存に失敗しました';
  } finally {
    formLoading.value = false;
  }
};

// --- 削除 ---
const confirmDelete = (user: ManagedUser) => {
  deleteTarget.value = user;
};

const executeDelete = async () => {
  if (!deleteTarget.value) return;
  deleteLoading.value = true;
  try {
    await apiClient.delete(`/users/${deleteTarget.value.oid}`);
    deleteTarget.value = null;
    await fetchUsers();
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
      <h1>ユーザー管理</h1>
      <button class="btn-primary" @click="openCreate">＋ 新規ユーザー</button>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>OID</th>
            <th>名前</th>
            <th>メールアドレス</th>
            <th>割り当て数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.oid">
            <td class="mono">{{ user.oid }}</td>
            <td>{{ user.name }}</td>
            <td>{{ user.email }}</td>
            <td>
              <span class="badge">{{ user.assignments.length }} 件</span>
              <span v-if="user.assignments.some(a => a.isPrimary)" class="badge-primary">主</span>
            </td>
            <td class="actions">
              <button class="btn-sm btn-edit" @click="openEdit(user)">編集</button>
              <button class="btn-sm btn-danger" @click="confirmDelete(user)">削除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新規作成 / 編集モーダル -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="modal">
        <h2>{{ formMode === 'create' ? 'ユーザー新規作成' : 'ユーザー編集' }}</h2>
        <label class="form-label">
          名前 <span class="required">*</span>
          <input v-model="formData.name" type="text" class="form-input" placeholder="山田 太郎" />
        </label>
        <label class="form-label">
          メールアドレス <span class="required">*</span>
          <input v-model="formData.email" type="email" class="form-input" placeholder="taro@example.com" />
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

    <!-- 削除確認モーダル -->
    <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
      <div class="modal">
        <h2>ユーザー削除の確認</h2>
        <p>
          <strong>{{ deleteTarget.name }}</strong>（{{ deleteTarget.email }}）を削除します。<br />
          関連する割り当て（{{ deleteTarget.assignments.length }} 件）も削除されます。
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
.page { padding: 32px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.page-header h1 { font-size: 22px; font-weight: 700; }
.loading { color: #64748b; padding: 24px; text-align: center; }
.error-msg { color: #ef4444; font-size: 13px; margin-bottom: 8px; }
.warn-msg { color: #d97706; font-size: 13px; margin-top: 8px; }
.table-wrap { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { background: #f8fafc; padding: 12px 16px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
.table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.mono { font-family: monospace; color: #64748b; font-size: 12px; }
.badge { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px; }
.badge-primary { background: #dbeafe; color: #1d4ed8; padding: 2px 6px; border-radius: 12px; font-size: 11px; }
.actions { display: flex; gap: 6px; }
.btn-sm { padding: 4px 12px; border-radius: 5px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-edit  { background: #eff6ff; color: #3b82f6; }
.btn-edit:hover { background: #dbeafe; }
.btn-danger { background: #fef2f2; color: #ef4444; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; }
.btn-danger:hover { background: #fee2e2; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; font-weight: 600; font-size: 14px; }
.btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 600; font-size: 14px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; padding: 32px; width: 440px; }
.modal h2 { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.modal p { font-size: 14px; line-height: 1.6; color: #475569; }
.form-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 16px; }
.required { color: #ef4444; }
.form-input { padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 14px; outline: none; }
.form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
</style>
