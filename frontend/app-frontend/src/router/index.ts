import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/invoices',
    },
    {
      path: '/login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/invoices',
      component: () => import('@/views/InvoiceListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/:id',
      component: () => import('@/views/InvoiceDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/users',
      component: () => import('@/views/UserManagementView.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

// 未ログイン時はログイン画面へリダイレクト
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login' };
  }
});

export default router;
