<template>
  <figure class="clip">
    <video
      v-if="src"
      ref="video"
      :src="resolved"
      muted
      loop
      playsinline
      preload="metadata"
    />
    <div v-else class="placeholder">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="20" fill="none" stroke="#e8e8e8" stroke-width="2" />
        <path d="M18 14 L31 22 L18 30 Z" fill="#e8e8e8" />
      </svg>
      <span class="label">CLIP {{ label }}</span>
      <!-- what the clip will show -->
      <span class="what"><slot /></span>
    </div>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from "vue";

const props = defineProps<{
  /** Clip path relative to the page, or null for a placeholder. */
  src: string | null;
  label: string;
  caption: string;
}>();

const resolved = computed(() =>
  props.src ? new URL(props.src, document.baseURI).href : "",
);
const video = useTemplateRef<HTMLVideoElement>("video");
let observer: IntersectionObserver | undefined;

// play only while on screen: several looping clips at once is distracting
onMounted(() => {
  const el = video.value;
  if (!el) return;
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) void el.play().catch(() => {});
      else el.pause();
    },
    { threshold: 0.5 },
  );
  observer.observe(el);
});

onUnmounted(() => observer?.disconnect());
</script>

<style scoped>
.clip {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

video,
.placeholder {
  width: 100%;
  border-radius: 10px;
  background: #2a2a2c;
}

/* clips keep their own shape (screen recordings are rarely 16:9) */
video {
  display: block;
  box-sizing: border-box;
  border: 1px solid #d0d0d0;
  background: #dddddd;
}

.placeholder {
  aspect-ratio: 16 / 9;
}

.placeholder {
  box-sizing: border-box;
  color: #e8e8e8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
}

.label {
  font-size: 0.8em;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.what {
  font-size: 0.8em;
}

figcaption {
  font-size: 0.88em;
  color: #4a4a4c;
}
</style>
