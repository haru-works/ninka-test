<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

/** 組織切り替え: アクティブ組織を変更して権限を再取得する */
const handleOrgChange = async (e: Event) => {
  const orgId = (e.target as HTMLSelectElement).value;
  if (confirm(`「${auth.organizations.find((o) => o.orgId === orgId)?.orgName}」に切り替えますか？`)) {
    await auth.switchOrg(orgId);
  } else {
    // キャンセル時は選択を元に戻す
    (e.target as HTMLSelectElement).value = auth.activeOrgId ?? '';
  }
};

const handleLogout = () => {
  auth.logout();
  router.push('/login');
};
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <span class="logo">■ 社内システム</span>
      <nav class="nav">
        <router-link to="/invoices" class="nav-link">請求書</router-link>
        <!-- 全ユーザーがアクセス可能: admin は「ユーザー管理」、それ以外は「マイプロフィール」 -->
        <router-link to="/users" class="nav-link">
          {{ auth.can('user', 'read') ? 'ユーザー管理' : 'マイプロフィール' }}
        </router-link>
      </nav>
    </div>

    <div class="header-right">
      <!-- 組織切り替えドロップダウン -->
      <select
        :value="auth.activeOrgId ?? ''"
        class="org-select"
        @change="handleOrgChange"
      >
        <option
          v-for="org in auth.organizations"
          :key="org.orgId"
          :value="org.orgId"
        >
          {{ org.orgName }}{{ org.isPrimary ? '（主）' : '（兼務）' }}
          ／ {{ org.roleName }}
        </option>
      </select>

      <span class="user-name">{{ auth.currentUser?.name }}</span>
      <button class="logout-btn" @click="handleLogout">ログアウト</button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: #1a56db;
  color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,.2);
}
.header-left { display: flex; align-items: center; gap: 24px; }
.logo { font-size: 16px; font-weight: 700; letter-spacing: .05em; }
.nav { display: flex; gap: 8px; }
.nav-link {
  color: rgba(255,255,255,.8);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  transition: background .15s;
}
.nav-link:hover, .nav-link.router-link-active {
  background: rgba(255,255,255,.15);
  color: #fff;
}
.header-right { display: flex; align-items: center; gap: 12px; }
.org-select {
  padding: 4px 8px;
  border: 1px solid rgba(255,255,255,.4);
  border-radius: 4px;
  background: rgba(255,255,255,.15);
  color: #fff;
  font-size: 13px;
  max-width: 260px;
}
.org-select option { background: #1a56db; color: #fff; }
.user-name { font-size: 14px; }
.logout-btn {
  padding: 5px 12px;
  border: 1px solid rgba(255,255,255,.6);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font-size: 13px;
  transition: background .15s;
}
.logout-btn:hover { background: rgba(255,255,255,.2); }
</style>
