<template>
  <PopupFrame title="Choose a model to sketch" :closable="closable" @close="$emit('close')">
    <template #header>
      <span class="participant" title="Quote this code if you want to withdraw your data">
        Participant code: <code>{{ participant.id.slice(0, 8) }}</code>
      </span>
      <button
        v-if="STUDY_CONFIG.allowDownload"
        class="help"
        title="Testing: download everything recorded in this browser as JSON"
        @click="$emit('download')"
      >
        Download data
      </button>
      <button class="help" @click="$emit('tutorial')">Tutorial</button>
      <button class="help" @click="$emit('help')">Help</button>
    </template>

    <p v-if="notice" class="notice">{{ notice }}</p>
    <p class="intro">
      Pick any model. Look at it on the left, sketch your own version on the
      right, then split it into parts and show how the parts move. Do as many
      as you like; your work is saved as you go, so you can stop and come
      back at any time.
    </p>

    <p v-if="error" class="notice error">{{ error }}</p>

    <section v-if="practice.length" class="practice">
      <div class="practice-text">
        <h3>Practise first</h3>
        <p>
          New to the tools? Try them on this simple lamp before starting the
          study models. Practice work is saved too, but you can use it however
          you like.
        </p>
      </div>
      <button
        v-for="entry in practice"
        :key="entry.id"
        class="model-card"
        :class="{ current: entry.id === currentModelId }"
        @click="open(entry)"
      >
        <div class="thumb">
          <img v-if="entry.thumbnail" :src="resolve(entry.thumbnail)" :alt="entry.name" />
          <span v-else class="initial">{{ entry.name.charAt(0) }}</span>
        </div>
        <span class="name">{{ entry.name }}</span>
        <span class="state" :class="stateOf(entry.id).kind">{{ stateOf(entry.id).label }}</span>
      </button>
    </section>

    <h3 v-if="practice.length" class="models-heading">Study models</h3>
    <div class="grid">
      <button
        v-for="entry in study"
        :key="entry.id"
        class="model-card"
        :class="{ current: entry.id === currentModelId }"
        @click="open(entry)"
      >
        <div class="thumb">
          <img v-if="entry.thumbnail" :src="resolve(entry.thumbnail)" :alt="entry.name" />
          <span v-else class="initial">{{ entry.name.charAt(0) }}</span>
        </div>
        <span class="name">{{ entry.name }}</span>
        <span v-if="entry.description" class="description">{{ entry.description }}</span>
        <span class="state" :class="stateOf(entry.id).kind">{{ stateOf(entry.id).label }}</span>
      </button>
    </div>
  </PopupFrame>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PopupFrame from "./PopupFrame.vue";
import { STUDY_CONFIG } from "./studyConfig";
import type { ModelIndexEntry } from "../reference/model";
import type { ParticipantRecord, SessionRecord } from "../study/types";

const props = defineProps<{
  participant: ParticipantRecord;
  sessions: SessionRecord[];
  /** The model open behind the popup, if any. */
  currentModelId: string | null;
  closable: boolean;
  notice: string | null;
}>();

const emit = defineEmits<{
  open: [entry: ModelIndexEntry, url: string];
  help: [];
  tutorial: [];
  close: [];
  download: [];
}>();

const indexUrl = new URL("models/index.json", document.baseURI).href;
const entries = ref<ModelIndexEntry[]>([]);
const practice = computed(() => entries.value.filter((e) => e.practice));
const study = computed(() => entries.value.filter((e) => !e.practice));
const error = ref("");

onMounted(async () => {
  try {
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    entries.value = ((await response.json()) as { models: ModelIndexEntry[] }).models;
  } catch (e) {
    error.value = `Could not load the model list: ${e instanceof Error ? e.message : e}`;
  }
});

function resolve(path: string): string {
  return new URL(path, indexUrl).href;
}

function open(entry: ModelIndexEntry): void {
  emit("open", entry, resolve(entry.path));
}

function stateOf(modelId: string): { kind: string; label: string } {
  if (modelId === props.currentModelId) return { kind: "progress", label: "Open now" };
  const session = props.sessions.find((s) => s.modelId === modelId);
  if (!session) return { kind: "new", label: "Not started" };
  if (session.finishedAt) return { kind: "done", label: "Finished" };
  return { kind: "progress", label: "In progress" };
}
</script>

<style scoped>
.participant {
  font-size: 0.85em;
  color: #555;
  user-select: text;
}

.help {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 17px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

.help:hover {
  background: #ffe8b3;
}

.intro {
  margin-top: 0;
}

.notice {
  padding: 10px 14px;
  border-radius: 8px;
  background: #e3f5e1;
}

.notice.error {
  background: #ffe0e0;
}

.practice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 20px;
  align-items: center;
  padding: 16px;
  margin-bottom: 20px;
  border-radius: 12px;
  background: #fff3d6;
}

.practice h3,
.models-heading {
  margin: 0 0 6px;
}

.practice p {
  margin: 0;
}

.practice .model-card {
  background: #ffffff;
}

.models-heading {
  margin-bottom: 12px;
}

@media (max-width: 640px) {
  .practice {
    grid-template-columns: minmax(0, 1fr);
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.model-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: #f6f6f6;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.model-card:hover,
.model-card.current {
  outline: 3px solid #ffd16b;
}

.thumb {
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.initial {
  font-size: 3em;
  font-weight: 900;
  color: #bbbbbb;
}

.name {
  font-weight: 900;
}

.description {
  font-size: 0.85em;
  color: #555;
}

.state {
  align-self: flex-start;
  font-size: 0.75em;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 10px;
  background: #e6e6e6;
}

.state.progress {
  background: #fff3d6;
}

.state.done {
  background: #e3f5e1;
}
</style>
