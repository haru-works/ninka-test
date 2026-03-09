<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import apiClient from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import type { MasterData, Organization, Role, JobTitle, RolePermission } from '@/types';

const auth = useAuthStore();
/** マスターデータの編集権限 */
const canWrite  = computed(() => auth.can('master', 'write'));
/** マスターデータの削除権限 */
const canDelete = computed(() => auth.can('master', 'delete'));

// --- 状態 ---
const master = ref<MasterData | null>(null);
const isLoading = ref(true);
const pageError = ref('');
const activeTab = ref<'organizations' | 'roles' | 'jobTitles' | 'rolePermissions'>('organizations');

// モーダル共通
const modal = reactive({
  show: false,
  mode: 'create' as 'create' | 'edit',
  entity: '' as 'org' | 'role' | 'jobTitle' | 'rolePermission',
  error: '',
  loading: false,
});

// 各エンティティのフォームデータ
const orgForm = reactive({ id: '', code: '', name: '', level: 1, parent_id: '' });
const roleForm = reactive({ id: '', code: '', name: '', scope: 'org' });
const jtForm = reactive({ id: '', code: '', name: '', rank: 1 });
const rpForm = reactive({ role_id: '', resource: '', action: '' });

// 削除確認
const deleteConfirm = reactive({ show: false, label: '', onConfirm: () => {} });

// --- マスターデータ取得 ---
const fetchMaster = async () => {
  isLoading.value = true;
  pageError.value = '';
  try {
    const res = await apiClient.get<MasterData>('/master');
    master.value = res.data;
  } catch (e: unknown) {
    const ax = e as { response?: { status?: number; data?: { error?: string } } };
    if (ax.response?.status === 403) {
      pageError.value = 'マスターデータの閲覧権限がありません';
    } else {
      pageError.value = ax.response?.data?.error ?? 'マスターデータの取得に失敗しました';
    }
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchMaster);

// --- ヘルパー ---
const roleName = (id: string) => master.value?.roles.find((r) => r.id === id)?.name ?? id;
const orgName  = (id: string | null) => id ? (master.value?.organizations.find((o) => o.id === id)?.name ?? id) : '-';

/** ロール権限をロール別にグループ化 */
const permsByRole = computed(() => {
  if (!master.value) return [];
  const map = new Map<string, { resource: string; action: string }[]>();
  for (const rp of master.value.rolePermissions) {
    if (!map.has(rp.role_id)) map.set(rp.role_id, []);
    map.get(rp.role_id)!.push({ resource: rp.resource, action: rp.action });
  }
  return Array.from(map.entries()).map(([role_id, perms]) => ({ role_id, perms }));
});

const tabs = [
  { key: 'organizations',   label: '組織' },
  { key: 'roles',           label: 'ロール' },
  { key: 'jobTitles',       label: '役職' },
  { key: 'rolePermissions', label: 'ロール権限' },
] as const;

// --- 削除確認ダイアログ ---
const confirmDelete = (label: string, fn: () => void) => {
  deleteConfirm.label = label;
  deleteConfirm.onConfirm = fn;
  deleteConfirm.show = true;
};

// --- モーダルオープン ---
const openOrgCreate = () => {
  Object.assign(orgForm, { id: '', code: '', name: '', level: 1, parent_id: '' });
  modal.entity = 'org'; modal.mode = 'create'; modal.error = ''; modal.show = true;
};
const openOrgEdit = (o: Organization) => {
  Object.assign(orgForm, { id: o.id, code: o.code, name: o.name, level: o.level, parent_id: o.parent_id ?? '' });
  modal.entity = 'org'; modal.mode = 'edit'; modal.error = ''; modal.show = true;
};
const openRoleCreate = () => {
  Object.assign(roleForm, { id: '', code: '', name: '', scope: 'org' });
  modal.entity = 'role'; modal.mode = 'create'; modal.error = ''; modal.show = true;
};
const openRoleEdit = (r: Role) => {
  Object.assign(roleForm, { id: r.id, code: r.code, name: r.name, scope: r.scope });
  modal.entity = 'role'; modal.mode = 'edit'; modal.error = ''; modal.show = true;
};
const openJtCreate = () => {
  Object.assign(jtForm, { id: '', code: '', name: '', rank: 1 });
  modal.entity = 'jobTitle'; modal.mode = 'create'; modal.error = ''; modal.show = true;
};
const openJtEdit = (jt: JobTitle) => {
  Object.assign(jtForm, { id: jt.id, code: jt.code, name: jt.name, rank: jt.rank });
  modal.entity = 'jobTitle'; modal.mode = 'edit'; modal.error = ''; modal.show = true;
};
const openRpCreate = () => {
  Object.assign(rpForm, { role_id: '', resource: '', action: '' });
  modal.entity = 'rolePermission'; modal.mode = 'create'; modal.error = ''; modal.show = true;
};

// --- フォーム送信 ---
const submitModal = async () => {
  modal.loading = true;
  modal.error = '';
  try {
    if (modal.entity === 'org') {
      if (!orgForm.code || !orgForm.name) throw new Error('コードと名前は必須です');
      if (modal.mode === 'create') {
        const res = await apiClient.post<Organization>('/master/organizations', {
          code: orgForm.code, name: orgForm.name, level: Number(orgForm.level),
          parent_id: orgForm.parent_id || null,
        });
        master.value!.organizations.push(res.data);
      } else {
        const res = await apiClient.put<Organization>(`/master/organizations/${orgForm.id}`, {
          code: orgForm.code, name: orgForm.name, level: Number(orgForm.level),
          parent_id: orgForm.parent_id || null,
        });
        const idx = master.value!.organizations.findIndex((o) => o.id === orgForm.id);
        if (idx !== -1) master.value!.organizations[idx] = res.data;
      }
    } else if (modal.entity === 'role') {
      if (!roleForm.code || !roleForm.name || !roleForm.scope) throw new Error('すべての項目は必須です');
      if (modal.mode === 'create') {
        const res = await apiClient.post<Role>('/master/roles', {
          code: roleForm.code, name: roleForm.name, scope: roleForm.scope,
        });
        master.value!.roles.push(res.data);
      } else {
        const res = await apiClient.put<Role>(`/master/roles/${roleForm.id}`, {
          code: roleForm.code, name: roleForm.name, scope: roleForm.scope,
        });
        const idx = master.value!.roles.findIndex((r) => r.id === roleForm.id);
        if (idx !== -1) master.value!.roles[idx] = res.data;
      }
    } else if (modal.entity === 'jobTitle') {
      if (!jtForm.code || !jtForm.name) throw new Error('コードと名前は必須です');
      if (modal.mode === 'create') {
        const res = await apiClient.post<JobTitle>('/master/job-titles', {
          code: jtForm.code, name: jtForm.name, rank: Number(jtForm.rank),
        });
        master.value!.jobTitles.push(res.data);
      } else {
        const res = await apiClient.put<JobTitle>(`/master/job-titles/${jtForm.id}`, {
          code: jtForm.code, name: jtForm.name, rank: Number(jtForm.rank),
        });
        const idx = master.value!.jobTitles.findIndex((jt) => jt.id === jtForm.id);
        if (idx !== -1) master.value!.jobTitles[idx] = res.data;
      }
    } else if (modal.entity === 'rolePermission') {
      if (!rpForm.role_id || !rpForm.resource || !rpForm.action) throw new Error('すべての項目は必須です');
      await apiClient.post('/master/role-permissions', {
        role_id: rpForm.role_id, resource: rpForm.resource, action: rpForm.action,
      });
      master.value!.rolePermissions.push({ ...rpForm });
    }
    modal.show = false;
  } catch (e: any) {
    modal.error = e.response?.data?.error ?? e.message ?? '保存に失敗しました';
  } finally {
    modal.loading = false;
  }
};

// --- 削除処理 ---
const deleteOrg = (id: string, name: string) => {
  confirmDelete(`組織「${name}」を削除しますか？`, async () => {
    deleteConfirm.show = false;
    try {
      await apiClient.delete(`/master/organizations/${id}`);
      master.value!.organizations = master.value!.organizations.filter((o) => o.id !== id);
    } catch (e: any) {
      pageError.value = e.response?.data?.error ?? '削除に失敗しました';
    }
  });
};
const deleteRole = (id: string, name: string) => {
  confirmDelete(`ロール「${name}」を削除しますか？（関連するロール権限も削除されます）`, async () => {
    deleteConfirm.show = false;
    try {
      await apiClient.delete(`/master/roles/${id}`);
      master.value!.roles = master.value!.roles.filter((r) => r.id !== id);
      master.value!.rolePermissions = master.value!.rolePermissions.filter((rp) => rp.role_id !== id);
    } catch (e: any) {
      pageError.value = e.response?.data?.error ?? '削除に失敗しました';
    }
  });
};
const deleteJt = (id: string, name: string) => {
  confirmDelete(`役職「${name}」を削除しますか？`, async () => {
    deleteConfirm.show = false;
    try {
      await apiClient.delete(`/master/job-titles/${id}`);
      master.value!.jobTitles = master.value!.jobTitles.filter((jt) => jt.id !== id);
    } catch (e: any) {
      pageError.value = e.response?.data?.error ?? '削除に失敗しました';
    }
  });
};
const deleteRp = (rp: RolePermission) => {
  confirmDelete(`権限「${roleName(rp.role_id)} / ${rp.resource}.${rp.action}」を削除しますか？`, async () => {
    deleteConfirm.show = false;
    try {
      await apiClient.delete('/master/role-permissions', {
        data: { role_id: rp.role_id, resource: rp.resource, action: rp.action },
      });
      master.value!.rolePermissions = master.value!.rolePermissions.filter(
        (p) => !(p.role_id === rp.role_id && p.resource === rp.resource && p.action === rp.action),
      );
    } catch (e: any) {
      pageError.value = e.response?.data?.error ?? '削除に失敗しました';
    }
  });
};
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>マスターデータ管理</h1>
    </div>

    <div v-if="isLoading" class="loading">読み込み中...</div>
    <div v-else-if="pageError" class="error-banner">{{ pageError }}</div>

    <div v-else>
      <!-- タブ -->
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>

      <!-- 組織タブ -->
      <div v-if="activeTab === 'organizations'">
        <div v-if="canWrite" class="tab-actions">
          <button class="btn-add" @click="openOrgCreate">＋ 組織を追加</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th><th>コード</th><th>名前</th><th>レベル</th><th>親組織</th>
                <th v-if="canWrite || canDelete">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="org in master?.organizations" :key="org.id">
                <td class="mono">{{ org.id }}</td>
                <td class="mono">{{ org.code }}</td>
                <td>{{ org.name }}</td>
                <td>{{ org.level }}</td>
                <td>{{ orgName(org.parent_id) }}</td>
                <td v-if="canWrite || canDelete" class="actions">
                  <button v-if="canWrite" class="btn-edit" @click="openOrgEdit(org)">編集</button>
                  <button v-if="canDelete" class="btn-del" @click="deleteOrg(org.id, org.name)">削除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ロールタブ -->
      <div v-else-if="activeTab === 'roles'">
        <div v-if="canWrite" class="tab-actions">
          <button class="btn-add" @click="openRoleCreate">＋ ロールを追加</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th><th>コード</th><th>名前</th><th>スコープ</th>
                <th v-if="canWrite || canDelete">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="role in master?.roles" :key="role.id">
                <td class="mono">{{ role.id }}</td>
                <td class="mono">{{ role.code }}</td>
                <td>{{ role.name }}</td>
                <td><span class="badge">{{ role.scope }}</span></td>
                <td v-if="canWrite || canDelete" class="actions">
                  <button v-if="canWrite" class="btn-edit" @click="openRoleEdit(role)">編集</button>
                  <button v-if="canDelete" class="btn-del" @click="deleteRole(role.id, role.name)">削除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 役職タブ -->
      <div v-else-if="activeTab === 'jobTitles'">
        <div v-if="canWrite" class="tab-actions">
          <button class="btn-add" @click="openJtCreate">＋ 役職を追加</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th><th>コード</th><th>名前</th><th>ランク</th>
                <th v-if="canWrite || canDelete">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="jt in master?.jobTitles" :key="jt.id">
                <td class="mono">{{ jt.id }}</td>
                <td class="mono">{{ jt.code }}</td>
                <td>{{ jt.name }}</td>
                <td>{{ jt.rank }}</td>
                <td v-if="canWrite || canDelete" class="actions">
                  <button v-if="canWrite" class="btn-edit" @click="openJtEdit(jt)">編集</button>
                  <button v-if="canDelete" class="btn-del" @click="deleteJt(jt.id, jt.name)">削除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ロール権限タブ -->
      <div v-else-if="activeTab === 'rolePermissions'">
        <div v-if="canWrite" class="tab-actions">
          <button class="btn-add" @click="openRpCreate">＋ 権限を追加</button>
        </div>
        <div v-for="group in permsByRole" :key="group.role_id" class="perm-group">
          <h3 class="perm-role">
            {{ roleName(group.role_id) }}
            <span class="mono muted">（{{ group.role_id }}）</span>
          </h3>
          <div class="perm-chips">
            <span
              v-for="(perm, i) in group.perms"
              :key="i"
              class="perm-chip"
              :class="`perm-${perm.action}`"
            >
              {{ perm.resource }}.{{ perm.action }}
              <button
                v-if="canDelete"
                class="perm-del-btn"
                title="削除"
                @click="deleteRp({ role_id: group.role_id, resource: perm.resource, action: perm.action })"
              >×</button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── モーダル ─────────────────────────────── -->
    <div v-if="modal.show" class="modal-overlay" @click.self="modal.show = false">
      <div class="modal">
        <!-- 組織フォーム -->
        <template v-if="modal.entity === 'org'">
          <h2 class="modal-title">{{ modal.mode === 'create' ? '組織を追加' : '組織を編集' }}</h2>
          <div class="form-group">
            <label class="form-label">コード <span class="req">*</span></label>
            <input v-model="orgForm.code" class="form-input" placeholder="例: dept-001" />
          </div>
          <div class="form-group">
            <label class="form-label">名前 <span class="req">*</span></label>
            <input v-model="orgForm.name" class="form-input" placeholder="例: 営業本部" />
          </div>
          <div class="form-group">
            <label class="form-label">レベル <span class="req">*</span></label>
            <input v-model.number="orgForm.level" type="number" min="1" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label">親組織</label>
            <select v-model="orgForm.parent_id" class="form-input">
              <option value="">（なし）</option>
              <option v-for="o in master?.organizations" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </div>
        </template>

        <!-- ロールフォーム -->
        <template v-else-if="modal.entity === 'role'">
          <h2 class="modal-title">{{ modal.mode === 'create' ? 'ロールを追加' : 'ロールを編集' }}</h2>
          <div class="form-group">
            <label class="form-label">コード <span class="req">*</span></label>
            <input v-model="roleForm.code" class="form-input" placeholder="例: manager" />
          </div>
          <div class="form-group">
            <label class="form-label">名前 <span class="req">*</span></label>
            <input v-model="roleForm.name" class="form-input" placeholder="例: 部門マネージャー" />
          </div>
          <div class="form-group">
            <label class="form-label">スコープ <span class="req">*</span></label>
            <select v-model="roleForm.scope" class="form-input">
              <option value="org">org（組織スコープ）</option>
              <option value="global">global（グローバル）</option>
            </select>
          </div>
        </template>

        <!-- 役職フォーム -->
        <template v-else-if="modal.entity === 'jobTitle'">
          <h2 class="modal-title">{{ modal.mode === 'create' ? '役職を追加' : '役職を編集' }}</h2>
          <div class="form-group">
            <label class="form-label">コード <span class="req">*</span></label>
            <input v-model="jtForm.code" class="form-input" placeholder="例: chief" />
          </div>
          <div class="form-group">
            <label class="form-label">名前 <span class="req">*</span></label>
            <input v-model="jtForm.name" class="form-input" placeholder="例: 課長" />
          </div>
          <div class="form-group">
            <label class="form-label">ランク <span class="req">*</span></label>
            <input v-model.number="jtForm.rank" type="number" min="1" class="form-input" />
          </div>
        </template>

        <!-- ロール権限フォーム -->
        <template v-else-if="modal.entity === 'rolePermission'">
          <h2 class="modal-title">ロール権限を追加</h2>
          <div class="form-group">
            <label class="form-label">ロール <span class="req">*</span></label>
            <select v-model="rpForm.role_id" class="form-input">
              <option value="">選択してください</option>
              <option v-for="r in master?.roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">リソース <span class="req">*</span></label>
            <input v-model="rpForm.resource" class="form-input" placeholder="例: invoice" />
          </div>
          <div class="form-group">
            <label class="form-label">アクション <span class="req">*</span></label>
            <select v-model="rpForm.action" class="form-input">
              <option value="">選択してください</option>
              <option value="read">read</option>
              <option value="write">write</option>
              <option value="delete">delete</option>
              <option value="approve">approve</option>
            </select>
          </div>
        </template>

        <p v-if="modal.error" class="modal-error">{{ modal.error }}</p>
        <div class="modal-footer">
          <button class="btn-cancel" @click="modal.show = false">キャンセル</button>
          <button class="btn-save" :disabled="modal.loading" @click="submitModal">
            {{ modal.loading ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── 削除確認ダイアログ ────────────────────── -->
    <div v-if="deleteConfirm.show" class="modal-overlay" @click.self="deleteConfirm.show = false">
      <div class="modal modal-sm">
        <h2 class="modal-title">削除の確認</h2>
        <p class="delete-msg">{{ deleteConfirm.label }}</p>
        <div class="modal-footer">
          <button class="btn-cancel" @click="deleteConfirm.show = false">キャンセル</button>
          <button class="btn-del btn-del-confirm" @click="deleteConfirm.onConfirm()">削除する</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 32px; max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.page-header h1 { font-size: 22px; font-weight: 700; }
.loading { color: #64748b; padding: 24px; text-align: center; }
.error-banner { color: #ef4444; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; }

.tabs { display: flex; gap: 4px; margin-bottom: 16px; }
.tab-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 18px; font-size: 14px; cursor: pointer; color: #475569; font-weight: 500; }
.tab-btn.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }

.tab-actions { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.btn-add { background: #3b82f6; color: #fff; border: none; border-radius: 7px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-add:hover { background: #2563eb; }

.table-wrap { background: #fff; border-radius: 10px; overflow-x: auto; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { background: #f8fafc; padding: 12px 16px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
.table td { padding: 11px 16px; border-bottom: 1px solid #f1f5f9; }
.actions { display: flex; gap: 6px; }
.btn-edit { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.btn-edit:hover { background: #e0f2fe; }
.btn-del  { background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.btn-del:hover { background: #ffe4e6; }

.mono { font-family: monospace; font-size: 12px; }
.muted { color: #94a3b8; }
.badge { background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

.perm-group { background: #fff; border-radius: 10px; padding: 20px 24px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
.perm-role { font-size: 15px; font-weight: 700; margin-bottom: 12px; color: #1e293b; }
.perm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.perm-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px 4px 10px; border-radius: 14px; font-size: 12px; font-family: monospace; background: #f1f5f9; color: #475569; }
.perm-read    { background: #dcfce7; color: #166534; }
.perm-write   { background: #dbeafe; color: #1d4ed8; }
.perm-delete  { background: #fee2e2; color: #991b1b; }
.perm-approve { background: #fef3c7; color: #92400e; }
.perm-del-btn { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 700; opacity: .6; padding: 0 2px; line-height: 1; }
.perm-del-btn:hover { opacity: 1; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 12px; padding: 28px 32px; width: 480px; max-width: 95vw; box-shadow: 0 8px 40px rgba(0,0,0,.15); }
.modal-sm { width: 380px; }
.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.form-group { margin-bottom: 14px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 5px; }
.req { color: #ef4444; }
.form-input { width: 100%; padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
.modal-error { color: #ef4444; font-size: 13px; margin: 8px 0 12px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.btn-cancel { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 7px; padding: 9px 18px; font-size: 14px; cursor: pointer; }
.btn-save { background: #3b82f6; color: #fff; border: none; border-radius: 7px; padding: 9px 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn-save:disabled { background: #cbd5e1; cursor: not-allowed; }
.btn-del-confirm { padding: 9px 18px; font-size: 14px; }
.delete-msg { font-size: 14px; color: #374151; margin-bottom: 8px; line-height: 1.6; }
</style>
