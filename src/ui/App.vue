<template>
  <ResultsViewer v-if="runMode === 'viewer'" />
  <Workspace
    v-else-if="participant && model"
    :key="model.id"
    :participant="participant"
    :model="model"
    :overlay="overlay"
    @help="helpOpen = true"
    @tutorial="openTutorial(false, 'workspace')"
    @models="openPicker(null)"
    @download="downloadAll"
    @finished="onFinished"
  />
  <div v-else class="stage">
    <span v-if="!loading && participant">Choose a model to begin.</span>
  </div>

  <ModeChooser v-if="!runMode" @choose="onChooseMode" />
  <StartScreen v-else-if="!loading && !participant" @done="onConsent" />
  <ModelPicker
    v-else-if="participant && pickerOpen"
    :participant="participant"
    :sessions="sessions"
    :current-model-id="model?.id ?? null"
    :closable="!!model"
    :notice="notice"
    @open="openModel"
    @help="helpOpen = true"
    @tutorial="openTutorial(false, 'picker')"
    @close="pickerOpen = false"
    @download="downloadAll"
  />
  <TutorialOverlay
    v-if="tutorial"
    :first="tutorial.first"
    @start="closeTutorial('start', $event)"
    @close="closeTutorial('close', $event)"
  />
  <HelpOverlay v-if="helpOpen" @close="helpOpen = false" />
</template>

<script setup lang="ts">
import { computed, ref, toRaw } from "vue";
import ModeChooser from "./ModeChooser.vue";
import ResultsViewer from "./ResultsViewer.vue";
import StartScreen from "./StartScreen.vue";
import ModelPicker from "./ModelPicker.vue";
import Workspace, { type WorkspaceModel } from "./Workspace.vue";
import HelpOverlay from "./HelpOverlay.vue";
import TutorialOverlay, { type TutorialProgress } from "./TutorialOverlay.vue";
import type { ModelIndexEntry } from "../reference/model";
import {
  enterTestMode,
  loadAllSessions,
  loadParticipant,
  queueChunk,
  requestPersistence,
  saveParticipant,
} from "../study/storage";
import { participantChunk } from "../study/sync";
import { kickUploader, startUploader } from "../study/uploader";
import type { ParticipantRecord, SessionRecord, TutorialView } from "../study/types";
import { serializeDownload } from "../study/download";

const runMode = ref<"study" | "test" | "viewer">();
const loading = ref(true);
const participant = ref<ParticipantRecord>();
const sessions = ref<SessionRecord[]>([]);
const model = ref<WorkspaceModel>();
const pickerOpen = ref(false);
const helpOpen = ref(false);
/** The open tutorial and the view being recorded for it. */
const tutorial = ref<{ first: boolean; view: TutorialView } | null>(null);
const notice = ref<string | null>(null);

/** Which popup covers the workspace, so it can log/pause accordingly. */
const overlay = computed<"picker" | "tutorial" | "help" | null>(() =>
  tutorial.value
    ? "tutorial"
    : pickerOpen.value
      ? "picker"
      : helpOpen.value
        ? "help"
        : null,
);

async function onChooseMode(mode: "study" | "test" | "viewer"): Promise<void> {
  runMode.value = mode;
  if (mode === "viewer") return; // reads files only: no participant, no storage
  if (mode === "test") {
    // a separate local database with its own stand-in participant; nothing
    // is ever queued for upload
    enterTestMode();
    participant.value = (await loadParticipant()) ?? (await createTestParticipant());
    loading.value = false;
    await openPicker(null);
    return;
  }
  participant.value = await loadParticipant();
  loading.value = false;
  if (participant.value) {
    startUploader(); // drain anything left over from a previous visit
    await openPicker(null);
    // consented but left before finishing the first tutorial: show it again
    if (!tutorialDone(participant.value)) openTutorial(true, "start");
  }
}

function tutorialDone(record: ParticipantRecord): boolean {
  return record.tutorial?.some((v) => v.closedBy === "start") ?? false;
}

function openTutorial(first: boolean, from: TutorialView["from"]): void {
  const record = participant.value && toRaw(participant.value);
  if (!record) return;
  const view: TutorialView = { openedAt: Date.now(), first, from };
  (record.tutorial ??= []).push(view);
  tutorial.value = { first, view };
  void persistParticipant();
}

function closeTutorial(by: "start" | "close", progress: TutorialProgress): void {
  const open = tutorial.value;
  if (!open) return;
  Object.assign(toRaw(open).view, { closedAt: Date.now(), closedBy: by, ...progress });
  tutorial.value = null;
  void persistParticipant();
  if (open.first) helpOpen.value = true; // first visit: the controls next
}

/** Save the participant record and re-send it: the endpoint keeps one
 *  participant record, so this replaces the earlier copy. */
async function persistParticipant(): Promise<void> {
  const record = participant.value && structuredClone(toRaw(participant.value));
  if (!record) return;
  try {
    await saveParticipant(record);
    await queueChunk(participantChunk(record));
    kickUploader();
  } catch (error) {
    console.error("saving participant:", error);
  }
}

async function createTestParticipant(): Promise<ParticipantRecord> {
  const now = Date.now();
  const record: ParticipantRecord = {
    id: `test-${crypto.randomUUID()}`,
    createdAt: now,
    profile: {},
    consent: { given: false, at: now, statements: [] },
  };
  await saveParticipant(record);
  return record;
}

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
  openTutorial(true, "start"); // first visit: tutorial, then the controls
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
