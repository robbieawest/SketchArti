<template>
  <div class="workspace">
    <header class="topbar">
      <span class="model-name">{{ model.name }}</span>
      <span class="save-state" :title="savedTitle">{{ saveLabel }}</span>
      <span class="spacer" />
      <button
        v-if="STUDY_CONFIG.allowDownload"
        title="Testing: download everything recorded in this browser as JSON"
        @click="downloadNow"
      >
        Download data
      </button>
      <button title="The step-by-step tutorial: sketch, segment, rig, pose" @click="$emit('tutorial')">
        Tutorial
      </button>
      <button title="Controls and how the tools work" @click="$emit('help')">
        Help
      </button>
      <button
        title="Pick a different model — this sketch is saved and you can come back to it any time"
        @click="$emit('models')"
      >
        Models
      </button>
      <button class="primary" title="Mark this model as finished" @click="confirmFinish = true">
        Finish
      </button>
    </header>

    <div ref="splitEl" class="split">
      <section
        class="pane"
        :style="{ flex: `0 0 calc(${leftPercent}% - 3px)` }"
        @pointerdown.capture="tracker?.setPane('reference')"
        @wheel.capture.passive="tracker?.setPane('reference')"
      >
        <ReferencePane
          v-if="reference"
          :model="reference"
          :model-url="model.url"
          @log="onReferenceLog"
          @ready="watchCamera('reference', $event)"
        />
      </section>
      <div
        class="divider"
        title="Drag to resize the two views"
        @pointerdown="startResize"
      />
      <section
        class="pane right"
        @pointerdown.capture="tracker?.setPane('sketch')"
        @wheel.capture.passive="tracker?.setPane('sketch')"
      >
        <SketchEditor
          v-if="doc && undoStack"
          :doc="doc"
          :undo-stack="undoStack"
          :reference="reference ?? null"
          :reference-url="model.url"
          @guide-frame="onGuideFrame"
          @tool="onTool"
          @panel="onPanel"
          @ready="watchCamera('sketch', $event)"
        />
        <div v-else class="loading">{{ loadError || "Loading your sketch…" }}</div>
      </section>
    </div>

    <div v-if="confirmFinish" class="modal-backdrop" @click.self="confirmFinish = false">
      <div class="modal">
        <p>
          Are you finished with <strong>{{ model.name }}</strong>? You can still
          reopen it from the model list afterwards.
        </p>
        <div class="modal-buttons">
          <button @click="confirmFinish = false">Keep working</button>
          <button class="primary" @click="finish">Yes, finished</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import ReferencePane from "./ReferencePane.vue";
import SketchEditor from "./SketchEditor.vue";
import { SketchDocument } from "../core/SketchDocument";
import { UndoStack } from "../core/undo";
import { deserializeDocument, serializeDocument } from "../core/serialization";
import type { Viewport } from "../engine/Viewport";
import { ModeTracker, type Pane, type ToolName } from "../study/timeline";
import { OpRecorder } from "../study/opLog";
import { loadSession, saveSessionWithChunk } from "../study/storage";
import { nextSessionChunk } from "../study/sync";
import { kickUploader } from "../study/uploader";
import { validateModel, type ReferenceModel } from "../reference/model";
import type { GuideFrame } from "../engine/ReferenceGuide";
import { STUDY_CONFIG } from "./studyConfig";
import type { ParticipantRecord, SessionRecord, StudyMode } from "../study/types";

export interface WorkspaceModel {
  id: string;
  name: string;
  /** Absolute URL of model.json. */
  url: string;
}

const props = defineProps<{
  participant: ParticipantRecord;
  model: WorkspaceModel;
  /** A popup covering the workspace: the picker and the tutorial pause the
   *  session (logged as away), help is just logged. */
  overlay: "picker" | "tutorial" | "help" | null;
}>();

const emit = defineEmits<{
  help: [];
  tutorial: [];
  models: [];
  /** Testing: download all data (after this session is saved). */
  download: [];
  /** The participant marked this model finished. */
  finished: [name: string];
}>();

/** No input anywhere for this long counts as away. */
const IDLE_MS = 60_000;
/** Direct (non-undo) edits are flushed after this much quiet. */
const EDIT_QUIET_MS = 1500;
const AUTOSAVE_MS = 3000;
/** Narrowest either view may be dragged to. */
const MIN_PANE_PX = 380;
/** Cut an upload chunk at most this often while working. */
const CHUNK_EVERY_MS = 20_000;

const doc = shallowRef<SketchDocument>();
const undoStack = shallowRef<UndoStack>();
const tracker = shallowRef<ModeTracker>();
let recorder: OpRecorder | undefined;
const reference = shallowRef<ReferenceModel>();
let lastChunkAt = 0;
let session: SessionRecord | undefined;
const loadError = ref("");
const confirmFinish = ref(false);
const leftPercent = ref(50);
const splitEl = ref<HTMLElement>();

let dirty = false;
let closed = false;
let pointerDown = false;
let lastInput = Date.now();
let editTimer: ReturnType<typeof setTimeout> | undefined;
let autosaveTimer: ReturnType<typeof setInterval> | undefined;
let idleTimer: ReturnType<typeof setInterval> | undefined;
let unsubscribeDoc: (() => void) | undefined;
const cameraUnsubscribes: (() => void)[] = [];

const lastSaved = ref<number | null>(null);
const saveLabel = computed(() =>
  lastSaved.value ? "Saved" : "Not saved yet",
);
const savedTitle = computed(() =>
  lastSaved.value
    ? `Your work is saved in this browser (last at ${new Date(lastSaved.value).toLocaleTimeString()})`
    : "",
);

onMounted(async () => {
  try {
    // the reference is optional for sketching: a failed fetch still lets the
    // participant draw, and the pane reports the problem
    void fetch(props.model.url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => (reference.value = validateModel(data)))
      .catch((error) => console.error("reference model:", error));
    const existing = await loadSession(props.model.id);
    const now = Date.now();
    session = existing ?? {
      modelId: props.model.id,
      participantId: props.participant.id,
      startedAt: now,
      updatedAt: now,
      document: serializeDocument(new SketchDocument()),
      events: [],
      timeline: [],
      actions: [],
    };
    const loaded = existing ? deserializeDocument(existing.document) : new SketchDocument();
    const t = new ModeTracker(Date.now, session.events, session.timeline);
    t.start(existing ? "resume" : "open");
    const stack = new UndoStack();
    recorder = new OpRecorder(loaded, session.actions, () => t.mode);
    stack.onAction = (kind, command) => {
      clearTimeout(editTimer);
      recorder?.flush(kind, command.label);
      dirty = true;
    };
    unsubscribeDoc = loaded.subscribe(() => {
      dirty = true;
      clearTimeout(editTimer);
      editTimer = setTimeout(flushEdits, EDIT_QUIET_MS);
    });
    tracker.value = t;
    undoStack.value = stack;
    doc.value = loaded;
    dirty = !existing; // a brand-new session is worth saving straight away
    await save(true);
  } catch (error) {
    loadError.value = `Could not open your sketch: ${
      error instanceof Error ? error.message : error
    }`;
    return;
  }

  autosaveTimer = setInterval(() => void save(), AUTOSAVE_MS);
  idleTimer = setInterval(checkIdle, 5000);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointermove", onInput, true);
  window.addEventListener("keydown", onKeyDownCapture, true);
  window.addEventListener("wheel", onInput, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
});

onUnmounted(() => {
  void close("leave");
  clearTimeout(editTimer);
  clearInterval(autosaveTimer);
  clearInterval(idleTimer);
  unsubscribeDoc?.();
  recorder?.dispose();
  for (const unsubscribe of cameraUnsubscribes) unsubscribe();
  window.removeEventListener("pointerdown", onPointerDown, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("pointermove", onInput, true);
  window.removeEventListener("keydown", onKeyDownCapture, true);
  window.removeEventListener("wheel", onInput, true);
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("pagehide", onPageHide);
});

function flushEdits(): void {
  // a drag in progress will end in an undo-stack push that claims these
  if (pointerDown || !recorder?.hasPending) return;
  recorder.flush("edit", "Edit");
}

/** Persist the session, cutting an upload chunk when one is due (or
 *  `forceChunk`). Session and chunk land in one transaction. */
async function save(forceChunk = false): Promise<void> {
  if (!session || !doc.value || !tracker.value || (!dirty && !forceChunk)) return;
  dirty = false;
  if (!pointerDown) flushEdits();
  tracker.value.touch();
  const now = Date.now();
  session.document = serializeDocument(doc.value);
  session.updatedAt = now;
  const previousCursor = session.sync;
  const chunk =
    forceChunk || now - lastChunkAt >= CHUNK_EVERY_MS
      ? nextSessionChunk(session, now, forceChunk)
      : null;
  try {
    await saveSessionWithChunk(session, chunk);
    lastSaved.value = now;
    if (chunk) {
      lastChunkAt = now;
      kickUploader();
    }
  } catch (error) {
    session.sync = previousCursor; // the chunk was not queued
    dirty = true; // try again next tick
    console.error("autosave failed:", error);
  }
}

/** Stop recording and persist everything (idempotent). */
async function close(reason: string): Promise<void> {
  if (closed || !tracker.value) return;
  closed = true;
  recorder?.flush("edit", "Edit");
  tracker.value.stop(reason);
  dirty = true;
  await save(true);
}

/** Mark the model finished. Recording carries on (the participant may
 *  keep the sketch open behind the picker or come back to it); the finish
 *  is streamed straight away. */
async function finish(): Promise<void> {
  confirmFinish.value = false;
  if (!session || !tracker.value) return;
  session.finishedAt = Date.now();
  tracker.value.log("session", { action: "finish" });
  dirty = true;
  await save(true);
  emit("finished", props.model.name);
}

async function downloadNow(): Promise<void> {
  dirty = true;
  await save();
  emit("download");
}

function onGuideFrame(frame: GuideFrame): void {
  if (!session) return;
  session.guideFrame = frame;
  dirty = true;
}

watch(
  () => props.overlay,
  (overlay, previous) => {
    const t = tracker.value;
    if (!t) return;
    if (overlay === "tutorial") t.log("tutorial", { open: true });
    else if (previous === "tutorial") t.log("tutorial", { open: false });
    if (isPausing(overlay)) t.setAway(true, overlay === "picker" ? "menu" : "tutorial");
    else if (isPausing(previous)) t.setAway(false, `${previous === "picker" ? "menu" : "tutorial"}-closed`);
    if (overlay === "help") t.log("help", { open: true });
    else if (previous === "help") t.log("help", { open: false });
    dirty = true;
    if (isPausing(overlay)) void save(true);
  },
);

/** Overlays that take the participant away from the sketch. */
function isPausing(overlay: typeof props.overlay | undefined): boolean {
  return overlay === "picker" || overlay === "tutorial";
}

function onTool(tool: ToolName): void {
  tracker.value?.setTool(tool);
  dirty = true;
}

function onPanel(
  mode: StudyMode | null,
  action: string,
  data?: Record<string, unknown>,
): void {
  const t = tracker.value;
  if (!t) return;
  if (mode) t.panelAction(mode, action, data);
  else t.log("panel", { action, ...data });
  // label direct edits (add part, save pose…) with the action that made them
  if (mode && !pointerDown) {
    clearTimeout(editTimer);
    recorder?.flush("edit", action);
  }
  dirty = true;
}

function onReferenceLog(action: string, data?: Record<string, unknown>): void {
  tracker.value?.setPane("reference");
  tracker.value?.log("reference", { action, ...data });
  dirty = true;
}

function watchCamera(pane: Pane, viewport: Viewport): void {
  cameraUnsubscribes.push(
    viewport.onCameraActivity((active) => {
      tracker.value?.log("camera", { pane, active });
      dirty = true;
    }),
  );
}

function onPointerDown(): void {
  pointerDown = true;
  onInput();
}

function onPointerUp(): void {
  pointerDown = false;
}

/** Space pans the camera; it must not also press whichever button or
 *  checkbox was clicked last. */
function onKeyDownCapture(event: KeyboardEvent): void {
  onInput();
  const target = event.target as HTMLElement | null;
  if (
    event.code === "Space" &&
    (target?.tagName === "BUTTON" ||
      (target instanceof HTMLInputElement && target.type !== "text"))
  ) {
    event.preventDefault();
  }
}

function onInput(): void {
  lastInput = Date.now();
  // input inside the model picker or tutorial is not work on this sketch
  if (isPausing(props.overlay)) return;
  if (tracker.value?.mode === "away" && !document.hidden) {
    tracker.value.setAway(false, "input");
    dirty = true;
  }
}

function checkIdle(): void {
  if (isPausing(props.overlay)) return;
  if (Date.now() - lastInput > IDLE_MS && tracker.value?.mode !== "away") {
    tracker.value?.setAway(true, "idle");
    dirty = true;
  }
}

function onVisibility(): void {
  if (document.hidden) {
    tracker.value?.setAway(true, "hidden");
    dirty = true;
    void save();
  } else {
    lastInput = Date.now();
    if (!isPausing(props.overlay)) tracker.value?.setAway(false, "visible");
    dirty = true;
  }
}

/** The tab is closing (or going into the back/forward cache): persist
 *  without ending the session, so a restored page keeps recording and a
 *  reload resumes with a fresh segment. */
function onPageHide(): void {
  if (!pointerDown) recorder?.flush("edit", "Edit");
  tracker.value?.log("session", { action: "pagehide" });
  dirty = true;
  void save(true);
}

function startResize(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  const move = (e: PointerEvent) => {
    const rect = splitEl.value?.getBoundingClientRect();
    if (!rect) return;
    // keep both views usable: neither side below MIN_PANE_PX (or 20%)
    const minPercent = Math.max(20, (MIN_PANE_PX / rect.width) * 100);
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    leftPercent.value = Math.min(100 - minPercent, Math.max(minPercent, percent));
  };
  const up = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    tracker.value?.log("layout", { leftPercent: Math.round(leftPercent.value) });
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
}
</script>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #dddddd;
}

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 12px;
  background: #ffffff;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.1);
  z-index: 5;
}

.model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 900;
  font-size: 1.1em;
}

.topbar button {
  flex: none;
  white-space: nowrap;
}

.save-state {
  font-size: 0.8em;
  color: #777;
}

.spacer {
  flex: 1;
}

.topbar button,
.modal-buttons button {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 17px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

.topbar button:hover,
.modal-buttons button:hover {
  background: #ffe8b3;
}

button.primary {
  background: #ffd16b;
}

.split {
  flex: 1;
  display: flex;
  min-height: 0;
}

.pane {
  position: relative;
  height: 100%;
  min-width: 0;
}

.pane.right {
  flex: 1;
}

.divider {
  flex: none;
  width: 6px;
  cursor: col-resize;
  background: #bdbdbd;
}

.divider:hover {
  background: #ffd16b;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-weight: 900;
  color: #555;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px 24px;
  max-width: 440px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.modal-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
