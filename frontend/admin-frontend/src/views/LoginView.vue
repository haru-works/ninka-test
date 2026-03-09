<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const isLoading = ref(false);
const error = ref('');

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = 'メールアドレスとパスワードを入力してください';
    return;
  }
  isLoading.value = true;
  error.value = '';
  try {
    // メールアドレス・パスワードで認証して oid を取得
    const res = await axios.post<{ oid: string }>('/api/auth/login', {
      email: email.value,
      password: password.value,
    });
    await auth.login(res.data.oid);
    if (!auth.isAdmin) {
      auth.logout();
      error.value = '管理者権限がありません。管理者アカウントでログインしてください。';
      return;
    }
    router.push('/users');
  } catch (e: any) {
    error.value = e.response?.data?.error ?? 'ログインに失敗しました';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">⚙️ 管理コンソール</div>
      <h1 class="login-title">ログイン</h1>

      <div class="form-group">
        <label class="form-label">メールアドレス</label>
        <input
          v-model="email"
          type="email"
          class="form-input"
          placeholder="example@xx.co.jp"
          autocomplete="email"
          @keyup.enter="handleLogin"
        />
      </div>

      <div class="form-group">
        <label class="form-label">パスワード</label>
        <input
          v-model="password"
          type="password"
          class="form-input"
          placeholder="パスワードを入力"
          autocomplete="current-password"
          @keyup.enter="handleLogin"
        />
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <button
        class="login-btn"
        :disabled="isLoading"
        @click="handleLogin"
      >
        {{ isLoading ? 'ログイン中...' : 'ログイン' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}
.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 400px;
  box-shadow: 0 4px 24px rgba(0,0,0,.08);
}
.login-logo { color: #3b82f6; font-weight: 700; margin-bottom: 8px; }
.login-title { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.form-group { margin-bottom: 16px; }
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color .15s;
}
.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,.15);
}
.error-msg { color: #ef4444; font-size: 13px; margin-bottom: 12px; }
.login-btn {
  width: 100%;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 15px;
  cursor: pointer;
  font-weight: 600;
  margin-top: 8px;
  transition: background .15s;
}
.login-btn:hover:not(:disabled) { background: #2563eb; }
.login-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
</style>
