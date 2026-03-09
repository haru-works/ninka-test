<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PermissionGuard from '@/components/PermissionGuard.vue';
import apiClient from '@/api/client';
import type { Invoice } from '@/types';

const auth = useAuthStore();
const router = useRouter();

const invoices = ref<Invoice[]>([]);
const isLoading = ref(true);
const showCreateForm = ref(false);
const newTitle = ref('');
const newAmount = ref(0);

// ステータスの日本語ラベル
const statusLabel: Record<string, string> = {
  draft: '下書き',
  pending: '承認待ち',
  approved: '承認済み',
};
const statusClass: Record<string, string> = {
  draft: 'badge-gray',
  pending: 'badge-orange',
  approved: 'badge-green',
};

const error = ref('');

const fetchInvoices = async () => {
  isLoading.value = true;
  error.value = '';
  try {
    const res = await apiClient.get<Invoice[]>('/invoices');
    invoices.value = res.data;
  } catch (e: any) {
    error.value = e.response?.data?.error ?? '請求書一覧の取得に失敗しました';
  } finally {
    isLoading.value = false;
  }
};

const handleCreate = async () => {
  if (!newTitle.value) return;
  await apiClient.post('/invoices', { title: newTitle.value, amount: newAmount.value, unit_price: newAmount.value, quantity: 1 });
  newTitle.value = '';
  newAmount.value = 0;
  showCreateForm.value = false;
  await fetchInvoices();
};

onMounted(fetchInvoices);

// 組織切り替え時に請求書を再取得する
watch(() => auth.activeOrgId, fetchInvoices);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">請求書一覧</h1>
      <div class="header-actions">
        <span class="context-badge">
          📁 {{ auth.activeOrg?.orgName ?? '-' }}
          ／ {{ auth.activeOrg?.roleName ?? '-' }}
        </span>
        <!-- 新規作成ボタン: org_manager / admin のみ表示 -->
        <PermissionGuard page="invoice_list" element="btn_create">
          <button class="btn-primary" @click="showCreateForm = !showCreateForm">
            ＋ 新規作成
          </button>
        </PermissionGuard>
      </div>
    </div>

    <!-- 新規作成フォーム -->
    <div v-if="showCreateForm" class="create-form">
      <h3>新規請求書</h3>
      <div class="form-row">
        <label>タイトル</label>
        <input v-model="newTitle" type="text" placeholder="例: 2026年3月分 保守費" />
      </div>
      <div class="form-row">
        <label>金額</label>
        <input v-model.number="newAmount" type="number" placeholder="0" />
      </div>
      <div class="form-actions">
        <button class="btn-primary" @click="handleCreate">作成</button>
        <button class="btn-secondary" @click="showCreateForm = false">キャンセル</button>
      </div>
    </div>

    <!-- 読み込み中 -->
    <div v-if="isLoading" class="loading">読み込み中...</div>

    <!-- エラー表示 -->
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <!-- 請求書テーブル -->
    <div v-else class="table-wrap">
      <table class="invoice-table">
        <thead>
          <tr>
            <th>タイトル</th>
            <th>組織</th>
            <th>金額</th>
            <th>担当者</th>
            <th>ステータス</th>
            <th>作成日</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="inv in invoices"
            :key="inv.id"
            class="table-row"
            @click="router.push(`/invoices/${inv.id}`)"
          >
            <td>{{ inv.title }}</td>
            <td>{{ inv.org_name }}</td>
            <td class="amount">¥{{ inv.amount.toLocaleString() }}</td>
            <td>{{ inv.assignee_name }}</td>
            <td>
              <span :class="['badge', statusClass[inv.status]]">
                {{ statusLabel[inv.status] }}
              </span>
            </td>
            <td>{{ inv.created_at }}</td>
            <td class="arrow">›</td>
          </tr>
          <tr v-if="invoices.length === 0">
            <td colspan="7" class="empty">表示できる請求書がありません</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1000px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 22px; font-weight: 700; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.context-badge {
  font-size: 13px; background: #e8f0fe; color: #1a56db;
  padding: 4px 10px; border-radius: 12px;
}
.btn-primary {
  padding: 8px 16px; background: #1a56db; color: #fff;
  border: none; border-radius: 6px; font-size: 14px; transition: background .15s;
}
.btn-primary:hover { background: #1648c4; }
.btn-secondary {
  padding: 8px 16px; background: #e0e0e0; color: #333;
  border: none; border-radius: 6px; font-size: 14px;
}
.create-form {
  background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;
  padding: 20px; margin-bottom: 20px;
}
.create-form h3 { margin-bottom: 12px; font-size: 16px; }
.form-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.form-row label { width: 60px; font-size: 14px; }
.form-row input {
  border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px;
  font-size: 14px; flex: 1;
}
.form-actions { display: flex; gap: 8px; margin-top: 12px; }
.loading { text-align: center; color: #888; padding: 40px; }
.table-wrap { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.invoice-table { width: 100%; border-collapse: collapse; }
.invoice-table th {
  text-align: left; padding: 12px 16px; background: #f5f6fa;
  font-size: 13px; color: #555; border-bottom: 1px solid #e0e0e0;
}
.table-row { cursor: pointer; transition: background .1s; }
.table-row:hover { background: #f5f8ff; }
.table-row td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
.amount { font-weight: 600; }
.arrow { color: #aaa; text-align: center; }
.badge {
  padding: 3px 8px; border-radius: 10px; font-size: 12px; font-weight: 600;
}
.badge-gray { background: #eee; color: #555; }
.badge-orange { background: #fff3e0; color: #e65100; }
.badge-green { background: #e8f5e9; color: #2e7d32; }
.empty { text-align: center; color: #aaa; padding: 32px; }
</style>
