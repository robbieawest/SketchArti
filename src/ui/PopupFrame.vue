<template>
  <div class="backdrop" @click.self="closable && $emit('close')">
    <div class="popup" role="dialog" :aria-label="title">
      <header>
        <h2>{{ title }}</h2>
        <span class="spacer" />
        <slot name="header" />
        <button v-if="closable" class="close" title="Close" @click="$emit('close')">
          ✕
        </button>
      </header>
      <div ref="contentEl" class="content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from "vue";

/** The scrolling content area, for popups that track or restore scroll. */
const contentEl = useTemplateRef<HTMLElement>("contentEl");
defineExpose({ contentEl });

defineProps<{
  title: string;
  /** Whether the popup can be dismissed (✕, backdrop click). */
  closable: boolean;
}>();
defineEmits<{ close: [] }>();
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(30, 30, 30, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.popup {
  display: flex;
  flex-direction: column;
  width: min(980px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid #eeeeee;
}

h2 {
  margin: 0;
  font-size: 1.25em;
}

.spacer {
  flex: 1;
}

.close {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 17px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

.close:hover {
  background: #ffe8b3;
}

.content {
  overflow-y: auto;
  padding: 18px 24px 24px;
  line-height: 1.5;
  user-select: text;
}
</style>
