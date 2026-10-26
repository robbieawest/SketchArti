<template>
  <div class="backdrop">
    <div class="popup" role="dialog" aria-label="Choose how to run">
      <button class="primary" @click="$emit('choose', 'study')">User study</button>
      <button @click="$emit('choose', 'test')">Test</button>
      <button @click="$emit('choose', 'viewer')">Data viewer</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Temporary entry point: "Test" skips the start form and never uploads;
// "Data viewer" opens results.
defineEmits<{ choose: [mode: "study" | "test" | "viewer"] }>();
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
  gap: 16px;
  padding: 24px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
}

button {
  min-width: 140px;
  height: 48px;
  padding: 0 20px;
  border: none;
  border-radius: 24px;
  background: #eeeeee;
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

button.primary {
  background: #ffd16b;
}

button:hover {
  outline: 3px solid #ffd16b;
}
</style>
