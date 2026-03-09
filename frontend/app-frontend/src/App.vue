<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();

/** ログイン画面ではヘッダーを表示しない */
const showHeader = computed(() => auth.isLoggedIn && route.path !== '/login');
</script>

<template>
  <AppHeader v-if="showHeader" />
  <main :class="['main-content', { 'with-header': showHeader }]">
    <router-view />
  </main>
</template>

<style>
.main-content { padding: 24px; }
.main-content.with-header { padding-top: 32px; }
</style>
