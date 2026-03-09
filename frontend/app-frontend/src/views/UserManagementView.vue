<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import apiClient from '@/api/client';
import type { ManagedUser } from '@/types';

const auth = useAuthStore();
const users = ref<ManagedUser[]>([]);
const isLoading = ref(true);
const error = ref('');

/** システム管理者かどうか（user.read 権限で判定） */
const isAdmin = computed(() => auth.can('user', 'read'));

// --- パスワード変更モーダル ---
const pwModal = reactive({
  show: false,
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  error: '',
  success: '',
  loading: false,
});

const openPwModal = () => {
  pwModal.currentPassword = '';
  pwModal.newPassword = '';
  pwModal.confirmPassword = '';
  pwModal.error = '';
  pwModal.success = '';
  pwModal.show = true;
};

const submitPassword = async () => {
  pwModal.error = '';
  pwModal.success = '';

  if (!pwModal.currentPassword || !pwModal.newPassword || !pwModal.confirmPassword) {
    pwModal.error = '全ての項目を入力してください';
    return;
  }
  if (pwModal.newPassword !== pwModal.confirmPassword) {
    pwModal.error = '新しいパスワードが一致しません';
    return;
  }
  if (pwModal.newPassword.length < 6) {
    pwModal.error = 'パスワードは6文字以上にしてください';
    return;
  }

  pwModal.loading = true;
  try {
    await apiClient.patch(`/users/${auth.currentUserId}/password`, {
      currentPassword: pwModal.currentPassword,
      newPassword: pwModal.newPassword,
    });
    pwModal.success = 'パスワードを変更しました';
    pwModal.currentPassword = '';
    pwModal.newPassword = '';
    pwModal.confirmPassword = '';
  } catch (e: any) {
    pwModal.error = e.response?.data?.error ?? 'パスワードの変更に失敗しました';
  } finally {
    pwModal.loading = false;
  }
};

// --- データ取得 ---
onMounted(async () => {
  try {
    // user.read 権限あり → API が全ユーザーを返す
    // user.read 権限なし → API が自分のみ返す
    const res = await apiClient.get<ManagedUser[]>('/users');
    users.value = res.data;
  } catch {
    error.value = 'ユーザー情報の取得に失敗しました';
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">ユーザー管理</h1>
      <span class="context-badge">
        📁 {{ auth.activeOrg?.orgName ?? '-' }}
        ／ {{ auth.activeOrg?.roleName ?? '-' }}
      </span>
    </div>

    <!-- 自分のみ表示の場合のインフォバナー -->
    <div v-if="!isAdmin" class="info-banner">
      🔒 自分のプロフィールのみ表示されています
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <div v-else-if="error" class="forbidden-card">
      <div class="forbidden-icon">⚠️</div>
      <p class="forbidden-msg">{{ error }}</p>
    </div>

    <!-- ユーザーカード一覧 -->
    <div v-else class="user-grid">
      <div v-for="user in users" :key="user.oid" class="user-card">
        <div class="user-card-header">
          <div class="avatar">{{ user.name[0] }}</div>
          <div class="user-info">
            <div class="user-name">{{ user.name }}</div>
            <div class="user-email">{{ user.email }}</div>
            <div class="user-oid">oid: {{ user.oid }}</div>
          </div>
          <!-- 自分のカードにのみパスワード変更ボタンを表示 -->
          <button
            v-if="user.oid === auth.currentUserId"
            class="btn-pw"
            title="パスワードを変更"
            @click="openPwModal"
          >
            🔑 PW変更
          </button>
        </div>
        <div class="assignment-list">
          <div
            v-for="(a, idx) in user.assignments"
            :key="idx"
            class="assignment-row"
          >
            <span :class="['primary-badge', a.isPrimary ? 'primary' : 'secondary']">
              {{ a.isPrimary ? '主' : '兼' }}
            </span>
            <span class="org-name">{{ a.orgName }}</span>
            <span class="job-title">{{ a.jobTitle }}</span>
            <span class="role-name">{{ a.role }}</span>
            <span v-if="a.validUntil" class="valid-until">
              ～ {{ a.validUntil }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- パスワード変更モーダル -->
    <div v-if="pwModal.show" class="modal-overlay" @click.self="pwModal.show = false">
      <div class="modal">
        <h2 class="modal-title">パスワードを変更</h2>

        <div class="form-group">
          <label class="form-label">現在のパスワード</label>
          <input
            v-model="pwModal.currentPassword"
            type="password"
            class="form-input"
            placeholder="現在のパスワード"
            autocomplete="current-password"
          />
        </div>
        <div class="form-group">
          <label class="form-label">新しいパスワード <span class="req">（6文字以上）</span></label>
          <input
            v-model="pwModal.newPassword"
            type="password"
            class="form-input"
            placeholder="新しいパスワード"
            autocomplete="new-password"
          />
        </div>
        <div class="form-group">
          <label class="form-label">新しいパスワード（確認）</label>
          <input
            v-model="pwModal.confirmPassword"
            type="password"
            class="form-input"
            placeholder="もう一度入力"
            autocomplete="new-password"
          />
        </div>

        <p v-if="pwModal.error" class="msg-error">{{ pwModal.error }}</p>
        <p v-if="pwModal.success" class="msg-success">{{ pwModal.success }}</p>

        <div class="modal-actions">
          <button class="btn-cancel" @click="pwModal.show = false">閉じる</button>
          <button
            class="btn-submit"
            :disabled="pwModal.loading"
            @click="submitPassword"
          >
            {{ pwModal.loading ? '変更中...' : '変更する' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 22px; font-weight: 700; }
.context-badge {
  font-size: 13px; background: #e8f0fe; color: #1a56db;
  padding: 4px 10px; border-radius: 12px;
}
.info-banner {
  background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
  border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;
  font-size: 13px;
}
.loading { text-align: center; color: #888; padding: 40px; }
.forbidden-card {
  background: #fff; border-radius: 8px; padding: 48px;
  text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
.forbidden-icon { font-size: 48px; margin-bottom: 16px; }
.forbidden-msg { font-size: 16px; color: #555; margin-bottom: 20px; }
.user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.user-card {
  background: #fff; border-radius: 8px; padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08);
}
.user-card-header { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
.avatar {
  width: 44px; height: 44px; border-radius: 50%;
  background: #1a56db; color: #fff; font-size: 20px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-weight: 600; font-size: 16px; }
.user-email { font-size: 13px; color: #555; }
.user-oid { font-size: 11px; color: #aaa; font-family: monospace; }
.btn-pw {
  flex-shrink: 0; padding: 5px 10px; background: #f0f9ff; color: #0369a1;
  border: 1px solid #bae6fd; border-radius: 6px; font-size: 12px;
  cursor: pointer; white-space: nowrap;
}
.btn-pw:hover { background: #e0f2fe; }
.assignment-list { display: flex; flex-direction: column; gap: 6px; }
.assignment-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: #f5f6fa; border-radius: 6px; font-size: 13px;
}
.primary-badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.primary-badge.primary { background: #e8f0fe; color: #1a56db; }
.primary-badge.secondary { background: #fce4ec; color: #c2185b; }
.org-name { font-weight: 600; flex: 1; }
.job-title { color: #777; }
.role-name { background: #e8f5e9; color: #2e7d32; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.valid-until { font-size: 11px; color: #e65100; }

/* モーダル */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: #fff; border-radius: 12px; padding: 28px 32px;
  width: 100%; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,.18);
}
.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.form-group { margin-bottom: 14px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px; }
.req { font-weight: 400; color: #6b7280; }
.form-input {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 14px; box-sizing: border-box;
}
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
.msg-error { color: #dc2626; font-size: 13px; margin-bottom: 12px; }
.msg-success { color: #16a34a; font-size: 13px; margin-bottom: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.btn-cancel {
  padding: 8px 18px; background: #f3f4f6; color: #374151;
  border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
}
.btn-submit {
  padding: 8px 18px; background: #1a56db; color: #fff;
  border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
