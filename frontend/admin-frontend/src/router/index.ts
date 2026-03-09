import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/users',
    },
    {
      path: '/login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/users',
      component: () => import('@/views/UsersView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/user-assignments',
      component: () => import('@/views/UserAssignmentsView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/master',
      component: () => import('@/views/MasterDataView.vue'),
      meta: { requiresAdmin: true },
    },
  ],
});

// 未ログイン・権限なしのリダイレクト
router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAdmin && !auth.isLoggedIn) {
    next('/login');
  } else if (to.meta.requiresAdmin && !auth.isAdmin) {
    next('/login');
  } else {
    next();
  }
});

export default router;
