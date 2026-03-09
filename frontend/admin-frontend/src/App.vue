<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppHeader from '@/components/AppHeader.vue';

const route = useRoute();
const auth = useAuthStore();
</script>

<template>
  <AppHeader v-if="auth.isLoggedIn && route.path !== '/login'" />
  <router-view />
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f1f5f9; color: #1e293b; }
</style>
