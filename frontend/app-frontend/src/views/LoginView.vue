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
    router.push('/invoices');
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
      <div class="login-logo">■ 社内システム</div>
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
  background: #f0f2f5;
}
.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 400px;
  box-shadow: 0 4px 24px rgba(0,0,0,.1);
}
.login-logo {
  font-size: 20px;
  font-weight: 700;
  color: #1a56db;
  margin-bottom: 8px;
}
.login-title {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 24px;
  color: #111;
}
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
  border-color: #1a56db;
  box-shadow: 0 0 0 3px rgba(26,86,219,.15);
}
.error-msg { color: #ef4444; font-size: 13px; margin-bottom: 12px; }
.login-btn {
  width: 100%;
  background: #1a56db;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  transition: background .15s;
}
.login-btn:hover:not(:disabled) { background: #1648c4; }
.login-btn:disabled { background: #9ca3af; cursor: not-allowed; }
</style>
