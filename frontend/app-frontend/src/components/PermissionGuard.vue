<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  /** 対象画面識別子 */
  page: string;
  /** 対象要素識別子 */
  element: string;
  /**
   * true: 非表示の代わりに disabled にする
   * false（デフォルト）: 非表示にする
   */
  disableOnly?: boolean;
}>();

const auth = useAuthStore();

const visible = computed(() => auth.isVisible(props.page, props.element));
const editable = computed(() => auth.isEditable(props.page, props.element));
</script>

<template>
  <!-- 非表示モード: visible=false なら何も描画しない -->
  <template v-if="!disableOnly">
    <slot v-if="visible" :editable="editable" />
  </template>
  <!-- disableOnly モード: visible=false でも描画するが disabled にする -->
  <template v-else>
    <slot v-if="visible" :editable="editable" />
  </template>
</template>
