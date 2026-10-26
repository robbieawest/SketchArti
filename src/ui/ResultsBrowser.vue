<template>
  <div class="browser">
    <header class="topbar">
      <span class="title">Data viewer</span>
      <span v-if="sourceName" class="source">{{ sourceName }}</span>
      <span class="spacer" />
      <label class="button primary" title="A results folder: one folder per participant">
        Open folder
        <input type="file" webkitdirectory multiple hidden @change="openFolder" />
      </label>
      <label class="button" title="A single 'Download data' file from this app">
        Open download
        <input type="file" accept=".json,application/json" hidden @change="openDownload" />
      </label>
    </header>

    <div class="list">
      <p v-if="error" class="notice error">{{ error }}</p>
      <p v-else-if="loading" class="notice">Reading {{ loading }}…</p>
      <p v-else-if="!participants" class="empty">
        Open a results folder, or a single download file.
      </p>
      <p v-else-if="participants.length === 0" class="empty">No sessions found there.</p>

      <section
        v-for="p in participants ?? []"
        :key="p.code"
        class="participant"
        :class="{ open: expanded.has(p.code) }"
      >
        <button class="row" @click="toggle(p)">
          <span class="chevron">{{ expanded.has(p.code) ? "▾" : "▸" }}</span>
          <code class="code">{{ p.code }}</code>
          <span class="stat">
            <strong>{{ totals(p).finished }}</strong> / {{ totals(p).models }} models finished
          </span>
          <span class="stat"><strong>{{ formatDuration(totals(p).activeMs) }}</strong> active</span>
          <span class="stat"><strong>{{ totals(p).strokes }}</strong> strokes</span>
        </button>

        <div v-if="expanded.has(p.code)" class="models">
          <button
            v-for="s in p.sessions"
            :key="s.modelId"
            class="model-card"
            :title="`Open ${modelName(s.modelId)} in the viewer`"
            @click="$emit('open', p, s)"
          >
            <div class="thumb">
              <img v-if="thumbnails.get(s)" :src="thumbnails.get(s)" alt="" />
              <span v-else class="pending">…</span>
            </div>
            <span class="name">{{ modelName(s.modelId) }}</span>
            <span class="state" :class="s.finished ? 'done' : 'progress'">
              {{ s.finished ? "Finished" : "Not finished" }}
            </span>
            <span class="details">
              {{ formatDuration(s.activeMs) }} · {{ s.strokes }} strokes ·
              {{ s.parts }} parts · {{ s.joints }} joints
            </span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, shallowReactive } from "vue";
import {
  formatDuration,
  loadDownload,
  loadResultsFolder,
  participantTotals,
  type FileReaders,
  type ResultParticipant,
  type ResultSession,
} from "../study/results";
import { thumbnailRenderer } from "../engine/ThumbnailRenderer";

const props = defineProps<{
  participants: ResultParticipant[] | null;
  modelNames: Map<string, string>;
}>();

const emit = defineEmits<{
  loaded: [participants: ResultParticipant[]];
  open: [participant: ResultParticipant, session: ResultSession];
}>();

const sourceName = ref("");
const loading = ref("");
const error = ref("");
const expanded = reactive(new Set<string>());
const thumbnails = shallowReactive(new Map<ResultSession, string>());

const totals = participantTotals;

function modelName(id: string): string {
  return props.modelNames.get(id) ?? id;
}

async function openFolder(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (files.length === 0) return;
  const readers: FileReaders = new Map(
    files
      .filter((f) => f.name.endsWith(".json"))
      .map((f) => [f.webkitRelativePath || f.name, () => f.text()]),
  );
  await load(files[0].webkitRelativePath.split("/")[0] || "folder", () =>
    loadResultsFolder(readers),
  );
}

async function openDownload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  await load(file.name, async () => loadDownload(await file.text()));
}

async function load(name: string, read: () => Promise<ResultParticipant[]>): Promise<void> {
  error.value = "";
  loading.value = name;
  try {
    const participants = await read();
    sourceName.value = name;
    expanded.clear();
    thumbnails.clear();
    emit("loaded", participants);
  } catch (e) {
    error.value = `Could not read ${name}: ${e instanceof Error ? e.message : e}`;
  } finally {
    loading.value = "";
  }
}

async function toggle(p: ResultParticipant): Promise<void> {
  if (expanded.has(p.code)) {
    expanded.delete(p.code);
    return;
  }
  expanded.add(p.code);
  // finished-state thumbnails, one per frame so the list stays responsive
  for (const session of p.sessions) {
    if (thumbnails.has(session)) continue;
    try {
      const sketch = await session.loadSketch();
      await new Promise(requestAnimationFrame);
      thumbnails.set(session, thumbnailRenderer().render(sketch));
    } catch (e) {
      console.error("thumbnail:", e);
    }
  }
}
</script>

<style scoped>
.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #dddddd;
}

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 12px;
  background: #ffffff;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.1);
}

.title {
  font-weight: 900;
  font-size: 1.1em;
}

.source {
  font-size: 0.85em;
  color: #666;
}

.spacer {
  flex: 1;
}

.button {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 17px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

.button.primary {
  background: #ffd16b;
}

.button:hover {
  background: #ffe8b3;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice,
.empty {
  align-self: center;
  margin-top: 40px;
  color: #555;
  font-weight: 900;
}

.notice.error {
  color: #a01818;
}

.participant {
  flex: none;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
}

.participant.open {
  outline: 2px solid #ffd16b;
}

.row {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
  padding: 14px 18px;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row:hover {
  background: #fff8e6;
}

.chevron {
  width: 12px;
  color: #888;
}

.code {
  font-size: 1.05em;
  font-weight: 900;
  min-width: 90px;
}

.stat {
  color: #555;
  white-space: nowrap;
}

.stat strong {
  color: #1c1c1e;
}

.models {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  padding: 4px 18px 18px;
}

.model-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: #f6f6f6;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.model-card:hover {
  outline: 3px solid #ffd16b;
}

.thumb {
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pending {
  color: #bbb;
  font-weight: 900;
}

.name {
  font-weight: 900;
}

.state {
  align-self: flex-start;
  font-size: 0.75em;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 10px;
}

.state.progress {
  background: #fff3d6;
}

.state.done {
  background: #e3f5e1;
}

.details {
  font-size: 0.8em;
  color: #555;
}
</style>
