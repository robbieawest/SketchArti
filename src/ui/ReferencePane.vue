<template>
  <div class="reference">
    <div ref="viewportEl" class="viewport"></div>

    <div class="overlay top">
      <span class="title">Reference</span>
      <label title="Colour each part differently">
        <input v-model="partColors" type="checkbox" /> Part colours
      </label>
      <label title="Show each joint's axis: circular arrows rotate, straight arrows slide">
        <input v-model="showJoints" type="checkbox" /> Joints
      </label>
      <button title="Point the camera at the whole model again" @click="resetView">
        Reset view
      </button>
    </div>

    <div v-if="status" class="status">{{ status }}</div>

    <div v-if="joints.length > 0" class="overlay joints">
      <div class="joints-header">
        <span>Motion</span>
        <button
          :class="{ active: playing }"
          title="Move every joint through its range continuously"
          @click="togglePlay"
        >
          {{ playing ? "Stop" : "Play all" }}
        </button>
        <button title="Return every joint to its rest position" @click="resetPose">
          Rest
        </button>
      </div>
      <div
        v-for="joint in joints"
        :key="joint.id"
        class="joint-row"
        :title="`${joint.name ?? joint.id} (${joint.type})`"
      >
        <span class="joint-name">{{ joint.name ?? joint.id }}</span>
        <input
          type="range"
          :min="jointRange(joint)[0]"
          :max="jointRange(joint)[1]"
          :step="(jointRange(joint)[1] - jointRange(joint)[0]) / 200 || 0.01"
          :value="pose[joint.id] ?? 0"
          @pointerdown="onSliderStart(joint.id)"
          @pointerup="onSliderEnd(joint.id)"
          @input="onSlider(joint.id, $event)"
        />
      </div>
    </div>

    <div v-if="attribution" class="attribution">{{ attribution }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { Viewport } from "../engine/Viewport";
import { ReferenceViewer } from "../engine/ReferenceViewer";
import {
  jointRange,
  movableJoints,
  type ReferenceJoint,
  type ReferenceModel,
  type ReferencePose,
} from "../reference/model";

const props = defineProps<{
  model: ReferenceModel;
  /** Absolute URL of the model's model.json (meshes resolve against it). */
  modelUrl: string;
}>();

const emit = defineEmits<{
  /** Something worth logging happened in the reference pane. */
  log: [action: string, data?: Record<string, unknown>];
  ready: [viewport: Viewport];
}>();

const viewportEl = useTemplateRef("viewportEl");
let viewport: Viewport | undefined;
let viewer: ReferenceViewer | undefined;

const status = ref("Loading model…");
const attribution = ref("");
const joints = ref<ReferenceJoint[]>([]);
const pose = ref<ReferencePose>({});
const partColors = ref(true);
const showJoints = ref(true);
const playing = ref(false);

onMounted(async () => {
  viewport = new Viewport(viewportEl.value!);
  viewer = new ReferenceViewer(viewport);
  viewer.onAnimatedPose = (animated) => {
    pose.value = animated;
  };
  emit("ready", viewport);
  try {
    await viewer.load(props.model, props.modelUrl);
    joints.value = movableJoints(props.model);
    attribution.value = props.model.attribution ?? "";
    status.value = "";
  } catch (error) {
    status.value = `Could not load the model: ${
      error instanceof Error ? error.message : error
    }`;
  }
});

onUnmounted(() => {
  viewer?.dispose();
  viewport?.dispose();
});

watch(partColors, (on) => {
  viewer?.setPartColors(on);
  emit("log", "toggle-part-colours", { on });
});
watch(showJoints, (on) => {
  viewer?.setJointsVisible(on);
  emit("log", "toggle-joints", { on });
});

function togglePlay(): void {
  playing.value = !playing.value;
  viewer?.setPlaying(playing.value);
  emit("log", "play-all", { on: playing.value });
}

function stopPlaying(): void {
  if (!playing.value) return;
  playing.value = false;
  viewer?.setPlaying(false);
  emit("log", "play-all", { on: false });
}

function resetPose(): void {
  stopPlaying();
  pose.value = {};
  viewer?.setPose({});
  emit("log", "rest-pose");
}

function resetView(): void {
  viewer?.frame();
  emit("log", "reset-view");
}

function onSliderStart(jointId: string): void {
  stopPlaying();
  viewer?.highlightJoint(jointId);
  emit("log", "slider-start", { jointId, value: pose.value[jointId] ?? 0 });
}

function onSliderEnd(jointId: string): void {
  viewer?.highlightJoint(null);
  emit("log", "slider-end", { jointId, value: pose.value[jointId] ?? 0 });
}

function onSlider(jointId: string, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  pose.value = { ...pose.value, [jointId]: value };
  viewer?.setPose(pose.value);
}
</script>

<style scoped>
.reference {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.viewport {
  width: 100%;
  height: 100%;
  touch-action: none;
}

.overlay {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 900;
}

.overlay.top {
  top: 12px;
  left: 12px;
  right: 12px;
  flex-wrap: wrap;
}

.title {
  font-size: 1.05em;
  margin-right: 4px;
}

.overlay label,
.overlay button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 16px;
  background: #ffffff;
  font-weight: 900;
  cursor: pointer;
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.1));
  display: flex;
  align-items: center;
  gap: 6px;
}

.overlay button:hover,
.overlay label:hover {
  background: #ffe8b3;
}

.overlay button.active {
  background: #ffd16b;
}

.overlay.joints {
  left: 12px;
  bottom: 12px;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: min(280px, calc(100% - 24px));
  max-height: 45%;
  overflow-y: auto;
  padding: 10px;
  border-radius: 12px;
  background: #ffffff;
  filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.12));
}

.joints-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.joints-header span {
  flex: 1;
}

.overlay.joints button {
  height: 28px;
  background: #eeeeee;
  filter: none;
}

.joint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
}

.joint-name {
  flex: 0 0 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.joint-row input {
  flex: 1;
  min-width: 0;
}

.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: #555;
  pointer-events: none;
}

.attribution {
  position: absolute;
  right: 12px;
  bottom: 8px;
  max-width: 50%;
  font-size: 0.7em;
  color: #666;
  text-align: right;
}
</style>
