<template>
  <div class="session-viewer">
    <div class="split">
      <section class="pane">
        <ReferencePane v-if="reference" :model="reference" :model-url="modelUrl" />
        <div v-else class="loading">{{ referenceNote }}</div>
      </section>
      <div class="divider" />
      <section class="pane">
        <SketchEditor
          v-if="ready"
          :doc="doc"
          :undo-stack="undoStack"
          :reference="reference ?? null"
          :reference-url="modelUrl"
        />
        <div v-else class="loading">{{ loadError || "Loading the session…" }}</div>
      </section>
    </div>

    <TimelinePanel
      v-if="ready && axis && log && timelineOpen"
      class="timeline"
      :title="`${participant.code} · ${modelName}`"
      :axis="axis"
      :timeline="log.timeline"
      :actions="log.actions"
      :cursor="cursor"
      :thumbnails="thumbnails"
      @seek="seek"
      @close="timelineOpen = false"
      @back="$emit('back')"
    />
    <button
      v-else-if="ready"
      class="show-timeline"
      title="Back to the timeline"
      @click="timelineOpen = true"
    >
      Timeline
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from "vue";
import ReferencePane from "./ReferencePane.vue";
import SketchEditor from "./SketchEditor.vue";
import TimelinePanel, { type TimelineThumbnail } from "./TimelinePanel.vue";
import { SketchDocument } from "../core/SketchDocument";
import type { DocumentJson } from "../core/serialization";
import { UndoStack } from "../core/undo";
import { validateModel, type ReferenceModel } from "../reference/model";
import type { ResultLog, ResultParticipant, ResultSession } from "../study/results";
import {
  DocumentMirror,
  ReplayCursor,
  actionsUntil,
  documentToState,
} from "../study/replayCursor";
import { TimelineAxis } from "../study/timelineAxis";
import { frameDocument, thumbnailRenderer } from "../engine/ThumbnailRenderer";

const props = defineProps<{
  participant: ResultParticipant;
  session: ResultSession;
  modelName: string;
  /** Absolute model.json URL, or "" when the model isn't in this build. */
  modelUrl: string;
}>();

defineEmits<{ back: [] }>();

const THUMBNAIL_COUNT = 8;

// the editor works on this one document throughout; scrubbing rewrites it
const doc = new SketchDocument();
const undoStack = new UndoStack();
const mirror = new DocumentMirror(doc);
let replay: ReplayCursor | undefined;
let finalSketch: DocumentJson | undefined;

const ready = ref(false);
const loadError = ref("");
const log = shallowRef<ResultLog>();
const axis = shallowRef<TimelineAxis>();
const cursor = ref(0);
const timelineOpen = ref(true);
const thumbnails = ref<TimelineThumbnail[]>([]);
const reference = shallowRef<ReferenceModel>();
const referenceNote = ref(props.modelUrl ? "Loading the reference…" : "Model not in this build");
let pendingSeek: number | undefined;
let seekFrame = 0;
let disposed = false;

onMounted(async () => {
  if (props.modelUrl) {
    fetch(props.modelUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => (reference.value = validateModel(data)))
      .catch((e) => (referenceNote.value = `Could not load the reference: ${e.message ?? e}`));
  }
  try {
    const [sketch, sessionLog] = await Promise.all([
      props.session.loadSketch(),
      props.session.loadLog(),
    ]);
    finalSketch = sketch;
    replay = new ReplayCursor(sessionLog.actions);
    log.value = sessionLog;
    axis.value = new TimelineAxis(sessionLog.timeline);
    // open on the finished state
    cursor.value = endTime();
    mirror.show(documentToState(sketch));
    ready.value = true;
    void renderThumbnails();
  } catch (e) {
    loadError.value = `Could not open this session: ${e instanceof Error ? e.message : e}`;
  }
});

onUnmounted(() => {
  disposed = true;
  cancelAnimationFrame(seekFrame);
  mirror.dispose();
});

/** The last moment of the session (the axis may end before the final
 *  flushed action). */
function endTime(): number {
  const actions = log.value?.actions ?? [];
  return Math.max(axis.value?.end ?? 0, actions[actions.length - 1]?.t ?? 0);
}

function stateAt(real: number) {
  // the end shows the saved sketch itself, the rest is replayed
  if (real >= endTime() && finalSketch) return documentToState(finalSketch);
  return replay!.seek(actionsUntil(log.value!.actions, real));
}

/** Scrub: coalesced to one document update per frame. */
function seek(real: number): void {
  cursor.value = real;
  pendingSeek = real;
  if (seekFrame) return;
  seekFrame = requestAnimationFrame(() => {
    seekFrame = 0;
    if (pendingSeek === undefined || !replay) return;
    undoStack.clear(); // viewer edits don't survive a scrub
    mirror.show(stateAt(pendingSeek));
    pendingSeek = undefined;
  });
}

async function renderThumbnails(): Promise<void> {
  const a = axis.value;
  if (!a || !replay || !finalSketch) return;
  // one camera for every thumbnail, framed on the finished sketch
  const frame = frameDocument(finalSketch);
  const length = a.length;
  const letters = "abcdefghijklmnopqrstuvwxyz";
  thumbnails.value = Array.from({ length: THUMBNAIL_COUNT }, (_, i) => ({
    letter: letters[i],
    real: i === THUMBNAIL_COUNT - 1 ? endTime() : a.toReal(((i + 1) / THUMBNAIL_COUNT) * length),
  }));
  // a separate cursor, so rendering never disturbs the scrub position
  const thumbReplay = new ReplayCursor(log.value!.actions);
  for (const thumb of thumbnails.value) {
    await new Promise(requestAnimationFrame);
    if (disposed) return;
    const json =
      thumb.real >= endTime()
        ? finalSketch
        : thumbReplay.document(actionsUntil(log.value!.actions, thumb.real));
    thumb.url = thumbnailRenderer().render(json, frame);
  }
}
</script>

<style scoped>
.session-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  background: #dddddd;
}

.split {
  display: flex;
  width: 100%;
  height: 100%;
}

.pane {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.divider {
  flex: none;
  width: 6px;
  background: #bdbdbd;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-weight: 900;
  color: #555;
}

.timeline {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  z-index: 20;
}

.show-timeline {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 20;
  height: 52px;
  padding: 0 36px;
  border: none;
  border-radius: 26px;
  background: #2f6fde;
  color: #ffffff;
  font-size: 1.1em;
  font-weight: 900;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.show-timeline:hover {
  background: #2459b8;
}
</style>
