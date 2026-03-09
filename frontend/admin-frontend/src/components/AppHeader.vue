<script setup lang="ts">
import { reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import apiClient from '@/api/client';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const navItems = [
  { path: '/users',            label: 'ユーザー管理' },
  { path: '/user-assignments', label: '割り当て管理' },
  { path: '/master',           label: 'マスター管理' },
];

const handleLogout = () => {
  auth.logout();
  router.push('/login');
};

// --- パスワード変更モーダル ---
const pw = reactive({
  show: false,
  current: '',
  next: '',
  confirm: '',
  error: '',
  success: '',
  loading: false,
});

const openPwModal = () => {
  pw.current = ''; pw.next = ''; pw.confirm = '';
  pw.error = ''; pw.success = '';
  pw.show = true;
};

const submitPassword = async () => {
  pw.error = ''; pw.success = '';
  if (!pw.current || !pw.next || !pw.confirm) {
    pw.error = '全ての項目を入力してください';
    return;
  }
  if (pw.next !== pw.confirm) {
    pw.error = '新しいパスワードが一致しません';
    return;
  }
  if (pw.next.length < 6) {
    pw.error = 'パスワードは6文字以上にしてください';
    return;
  }
  pw.loading = true;
  try {
    await apiClient.patch(`/users/${auth.currentUserId}/password`, {
      currentPassword: pw.current,
      newPassword: pw.next,
    });
    pw.success = 'パスワードを変更しました';
    pw.current = ''; pw.next = ''; pw.confirm = '';
  } catch (e: any) {
    pw.error = e.response?.data?.error ?? 'パスワードの変更に失敗しました';
  } finally {
    pw.loading = false;
  }
};
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <span class="logo">⚙️ 管理コンソール</span>
      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :class="{ active: route.path === item.path }"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="user-area">
        <span class="user-name">{{ auth.currentUser?.name }}</span>
        <button class="pw-btn" title="パスワードを変更" @click="openPwModal">🔑 PW変更</button>
        <button class="logout-btn" @click="handleLogout">ログアウト</button>
      </div>
    </div>
  </header>

  <!-- パスワード変更モーダル -->
  <div v-if="pw.show" class="modal-overlay" @click.self="pw.show = false">
    <div class="modal">
      <h2 class="modal-title">パスワードを変更</h2>
      <div class="form-group">
        <label class="form-label">現在のパスワード</label>
        <input v-model="pw.current" type="password" class="form-input" placeholder="現在のパスワード" autocomplete="current-password" />
      </div>
      <div class="form-group">
        <label class="form-label">新しいパスワード <span class="hint">（6文字以上）</span></label>
        <input v-model="pw.next" type="password" class="form-input" placeholder="新しいパスワード" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label class="form-label">新しいパスワード（確認）</label>
        <input v-model="pw.confirm" type="password" class="form-input" placeholder="もう一度入力" autocomplete="new-password" />
      </div>
      <p v-if="pw.error"   class="msg-error">{{ pw.error }}</p>
      <p v-if="pw.success" class="msg-success">{{ pw.success }}</p>
      <div class="modal-actions">
        <button class="btn-cancel" @click="pw.show = false">閉じる</button>
        <button class="btn-submit" :disabled="pw.loading" @click="submitPassword">
          {{ pw.loading ? '変更中...' : '変更する' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header {
  background: #1e293b;
  color: #f8fafc;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
}
.header-inner {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 24px;
}
.logo {
  font-weight: 700;
  font-size: 16px;
  white-space: nowrap;
}
.nav {
  display: flex;
  gap: 4px;
  flex: 1;
}
.nav-link {
  color: #94a3b8;
  text-decoration: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 14px;
  transition: background 0.15s;
}
.nav-link:hover  { background: #334155; color: #f8fafc; }
.nav-link.active { background: #3b82f6; color: #fff; }
.user-area {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-name { font-size: 14px; color: #cbd5e1; }
.pw-btn {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.pw-btn:hover { background: #334155; color: #f8fafc; }
.logout-btn {
  background: transparent;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.logout-btn:hover { background: #334155; color: #f8fafc; }

/* モーダル */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal {
  background: #fff; border-radius: 12px; padding: 28px 32px;
  width: 100%; max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,.25);
  color: #111;
}
.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1e293b; }
.form-group { margin-bottom: 14px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px; }
.hint { font-weight: 400; color: #6b7280; }
.form-input {
  width: 100%; padding: 8px 12px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 14px; box-sizing: border-box; color: #111;
}
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
.msg-error   { color: #dc2626; font-size: 13px; margin-bottom: 10px; }
.msg-success { color: #16a34a; font-size: 13px; margin-bottom: 10px; }
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
