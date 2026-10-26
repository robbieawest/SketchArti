<template>
  <Workspace
    v-if="participant && model"
    :key="model.id"
    :participant="participant"
    :model="model"
    :overlay="overlay"
    @help="helpOpen = true"
    @models="openPicker(null)"
    @download="downloadAll"
    @finished="onFinished"
  />
  <div v-else class="stage">
    <span v-if="!loading">Choose a model to begin.</span>
  </div>

  <StartScreen v-if="!loading && !participant" @done="onConsent" />
  <ModelPicker
    v-else-if="participant && pickerOpen"
    :participant="participant"
    :sessions="sessions"
    :current-model-id="model?.id ?? null"
    :closable="!!model"
    :notice="notice"
    @open="openModel"
    @help="helpOpen = true"
    @close="pickerOpen = false"
    @download="downloadAll"
  />
  <HelpOverlay v-if="helpOpen" @close="helpOpen = false" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StartScreen from "./StartScreen.vue";
import ModelPicker from "./ModelPicker.vue";
import Workspace, { type WorkspaceModel } from "./Workspace.vue";
import HelpOverlay from "./HelpOverlay.vue";
import type { ModelIndexEntry } from "../reference/model";
import {
  loadAllSessions,
  loadParticipant,
  queueChunk,
  requestPersistence,
  saveParticipant,
} from "../study/storage";
import { participantChunk } from "../study/sync";
import { kickUploader, startUploader } from "../study/uploader";
import type { ParticipantRecord, SessionRecord } from "../study/types";
import { serializeDownload } from "../study/download";

const loading = ref(true);
const participant = ref<ParticipantRecord>();
const sessions = ref<SessionRecord[]>([]);
const model = ref<WorkspaceModel>();
const pickerOpen = ref(false);
const helpOpen = ref(false);
const notice = ref<string | null>(null);

/** Which popup covers the workspace, so it can log/pause accordingly. */
const overlay = computed<"picker" | "help" | null>(() =>
  pickerOpen.value ? "picker" : helpOpen.value ? "help" : null,
);

onMounted(async () => {
  participant.value = await loadParticipant();
  loading.value = false;
  if (participant.value) {
    startUploader(); // drain anything left over from a previous visit
    await openPicker(null);
  }
});

async function openPicker(message: string | null): Promise<void> {
  notice.value = message;
  sessions.value = await loadAllSessions();
  pickerOpen.value = true;
}

async function onConsent(record: ParticipantRecord): Promise<void> {
  await saveParticipant(record);
  await queueChunk(participantChunk(record));
  participant.value = record;
  void requestPersistence();
  startUploader();
  kickUploader();
  await openPicker(null);
  helpOpen.value = true; // first visit: show the controls once
}

function openModel(entry: ModelIndexEntry, url: string): void {
  pickerOpen.value = false;
  notice.value = null;
  // reopening the model that is already open just closes the popup
  if (model.value?.id !== entry.id) {
    model.value = { id: entry.id, name: entry.name, url };
  }
}

/** Testing: everything in this browser as one JSON file. */
async function downloadAll(): Promise<void> {
  if (!participant.value) return;
  const all = await loadAllSessions();
  const blob = new Blob([serializeDownload(participant.value, all)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sketcharti-${participant.value.id.slice(0, 8)}-${new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[:T]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function onFinished(name: string): void {
  void openPicker(
    `Thank you — ${name} is finished. Pick another model, or close this page if you are done.`,
  );
}
</script>

<style scoped>
.stage {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #dddddd;
  font-weight: 900;
  color: #777;
}
</style>
