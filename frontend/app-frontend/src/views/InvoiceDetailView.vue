<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PermissionGuard from '@/components/PermissionGuard.vue';
import apiClient from '@/api/client';
import type { Invoice } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const invoice = ref<Invoice | null>(null);
const isLoading = ref(true);

// 現在のページ識別子
const PAGE = 'invoice_detail';

const statusLabel: Record<string, string> = {
  draft: '下書き',
  pending: '承認待ち',
  approved: '承認済み',
};

const fetchInvoice = async () => {
  isLoading.value = true;
  try {
    const res = await apiClient.get<Invoice>(`/invoices/${route.params.id}`);
    invoice.value = res.data;
  } catch {
    // 組織切り替えにより閲覧不可になった場合は一覧へ戻る
    router.push('/invoices');
  } finally {
    isLoading.value = false;
  }
};

const handleApprove = async () => {
  if (!confirm('この請求書を承認しますか？')) return;
  await apiClient.patch(`/invoices/${route.params.id}/approve`);
  await fetchInvoice();
};

const handleDelete = async () => {
  if (!confirm('この請求書を削除しますか？この操作は元に戻せません。')) return;
  await apiClient.delete(`/invoices/${route.params.id}`);
  router.push('/invoices');
};

onMounted(fetchInvoice);

// 組織切り替え時に再取得（アクセス不可なら一覧へ戻る）
watch(() => auth.activeOrgId, fetchInvoice);
// 組織切り替え時に再取得（アクセス不可なら一覧へ戻る）
watch(() => auth.activeOrgId, fetchInvoice);

// 組織切り替え時に再取得（アクセス不可なら一覧へ戻る）
watch(() => auth.activeOrgId, fetchInvoice);
</script>

<template>
  <div class="page">
    <button class="back-btn" @click="router.push('/invoices')">← 一覧に戻る</button>

    <div v-if="isLoading" class="loading">読み込み中...</div>

    <template v-else-if="invoice">
      <div class="detail-header">
        <h1 class="page-title">{{ invoice.title }}</h1>
        <div class="action-buttons">
          <!-- 承認ボタン: viewer には非表示 -->
          <PermissionGuard :page="PAGE" element="btn_approve">
            <template #default>
              <button
                class="btn-approve"
                :disabled="invoice.status === 'approved'"
                @click="handleApprove"
              >
                ✓ 承認
              </button>
            </template>
          </PermissionGuard>

          <!-- 削除ボタン: admin のみ表示 -->
          <PermissionGuard :page="PAGE" element="btn_delete">
            <template #default>
              <button class="btn-delete" @click="handleDelete">🗑 削除</button>
            </template>
          </PermissionGuard>
        </div>
      </div>

      <!-- 権限による表示内容の違いをバナーで明示 -->
      <div class="permission-info">
        <span>現在の権限:
          <strong>{{ auth.activeOrg?.roleName }}</strong>
          ／ {{ auth.activeOrg?.orgName }}
        </span>
        <span class="perm-tags">
          <span v-if="auth.isVisible(PAGE, 'btn_approve')" class="tag green">承認ボタン: 表示</span>
          <span v-else class="tag gray">承認ボタン: 非表示</span>
          <span v-if="auth.isVisible(PAGE, 'btn_delete')" class="tag green">削除ボタン: 表示</span>
          <span v-else class="tag gray">削除ボタン: 非表示</span>
          <span v-if="auth.isVisible(PAGE, 'field_unit_price')" class="tag green">単価: 表示</span>
          <span v-else class="tag gray">単価: 非表示</span>
        </span>
      </div>

      <div class="detail-card">
        <div class="field-row">
          <span class="field-label">ステータス</span>
          <span :class="['badge', `badge-${invoice.status}`]">
            {{ statusLabel[invoice.status] }}
          </span>
        </div>

        <div class="field-row">
          <span class="field-label">組織</span>
          <span>{{ invoice.org_name }}</span>
        </div>

        <!-- 担当者フィールド: viewer も表示可（閲覧のみ） -->
        <PermissionGuard :page="PAGE" element="field_assignee">
          <template #default="{ editable }">
            <div class="field-row">
              <span class="field-label">担当者</span>
              <span>
                {{ invoice.assignee_name }}
                <span v-if="!editable" class="readonly-badge">閲覧のみ</span>
              </span>
            </div>
          </template>
        </PermissionGuard>

        <!-- 単価フィールド: viewer には非表示 -->
        <PermissionGuard :page="PAGE" element="field_unit_price">
          <template #default="{ editable }">
            <div class="field-row">
              <span class="field-label">単価</span>
              <span>
                ¥{{ invoice.unit_price.toLocaleString() }}
                <span v-if="!editable" class="readonly-badge">閲覧のみ</span>
              </span>
            </div>
          </template>
        </PermissionGuard>

        <div class="field-row">
          <span class="field-label">数量</span>
          <span>{{ invoice.quantity }}</span>
        </div>

        <div class="field-row highlight">
          <span class="field-label">合計金額</span>
          <span class="amount">¥{{ invoice.amount.toLocaleString() }}</span>
        </div>

        <div class="field-row">
          <span class="field-label">作成日</span>
          <span>{{ invoice.created_at }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 720px; margin: 0 auto; }
.back-btn {
  background: none; border: none; color: #1a56db;
  font-size: 14px; cursor: pointer; margin-bottom: 16px; padding: 0;
}
.back-btn:hover { text-decoration: underline; }
.loading { text-align: center; color: #888; padding: 40px; }
.detail-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.page-title { font-size: 22px; font-weight: 700; flex: 1; }
.action-buttons { display: flex; gap: 8px; }
.btn-approve {
  padding: 8px 16px; background: #43a047; color: #fff;
  border: none; border-radius: 6px; font-size: 14px; transition: background .15s;
}
.btn-approve:hover:not(:disabled) { background: #388e3c; }
.btn-approve:disabled { background: #aaa; cursor: not-allowed; }
.btn-delete {
  padding: 8px 16px; background: #e53935; color: #fff;
  border: none; border-radius: 6px; font-size: 14px;
}
.btn-delete:hover { background: #c62828; }
.permission-info {
  background: #f5f6fa; border: 1px solid #e0e0e0;
  border-radius: 8px; padding: 10px 14px;
  font-size: 13px; margin-bottom: 16px;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.perm-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tag {
  padding: 2px 8px; border-radius: 10px; font-size: 12px;
}
.tag.green { background: #e8f5e9; color: #2e7d32; }
.tag.gray  { background: #eee; color: #777; }
.detail-card {
  background: #fff; border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden;
}
.field-row {
  display: flex; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid #f0f0f0;
}
.field-row:last-child { border-bottom: none; }
.field-row.highlight { background: #f5f8ff; }
.field-label { width: 100px; font-size: 13px; color: #777; }
.amount { font-size: 20px; font-weight: 700; color: #1a56db; }
.readonly-badge {
  margin-left: 8px; font-size: 11px; background: #fff3e0;
  color: #e65100; padding: 2px 6px; border-radius: 4px;
}
.badge { padding: 3px 10px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.badge-draft { background: #eee; color: #555; }
.badge-pending { background: #fff3e0; color: #e65100; }
.badge-approved { background: #e8f5e9; color: #2e7d32; }
</style>
