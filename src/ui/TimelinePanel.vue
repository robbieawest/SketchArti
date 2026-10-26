<template>
  <div class="timeline-panel" tabindex="-1" @keydown="onKey">
    <header>
      <button title="Back to the participant list" @click="$emit('back')">← Back</button>
      <span class="title">{{ title }}</span>
      <span class="info">{{ cursorInfo }}</span>
      <span class="spacer" />
      <button title="Hide the timeline to look around the sketch" @click="$emit('close')">
        Hide timeline
      </button>
    </header>

    <div class="body">
      <!-- thumbnails, each above the moment it shows -->
      <div class="thumb-row">
        <div class="label-col" />
        <div class="thumbs">
          <button
            v-for="thumb in thumbnails"
            :key="thumb.letter"
            class="thumb"
            :title="`Jump to (${thumb.letter})`"
            @click="seek(thumb.real)"
          >
            <img v-if="thumb.url" :src="thumb.url" alt="" />
            <span class="letter">({{ thumb.letter }})</span>
          </button>
        </div>
      </div>

      <div class="plot-row">
        <div class="label-col rows">
          <span v-for="mode in ROWS" :key="mode" :class="{ faint: FAINT.has(mode) }">
            {{ MODE_LABELS[mode] }}
          </span>
        </div>
        <div ref="plotEl" class="plot" @pointerdown="startScrub">
          <svg
            class="bars"
            :viewBox="`0 0 ${Math.max(axis.length, 1)} ${ROWS.length}`"
            preserveAspectRatio="none"
          >
            <rect
              v-for="(bar, i) in bars"
              :key="i"
              :x="bar.x"
              :y="bar.row + 0.15"
              :width="bar.width"
              height="0.7"
              :class="{ faint: FAINT.has(bar.mode) }"
            />
          </svg>
          <div
            v-for="(piece, i) in axis.breaks"
            :key="`b${i}`"
            class="break"
            :style="span(piece.axisStart, piece.axisEnd)"
            :title="`Break: ${formatDuration(piece.realEnd - piece.realStart)}`"
          >
            <span>+{{ formatDuration(piece.realEnd - piece.realStart) }}</span>
          </div>
          <div
            v-for="thumb in thumbnails"
            :key="`m${thumb.letter}`"
            class="marker"
            :style="{ left: pct(axis.toAxis(thumb.real)) }"
          >
            <span>{{ thumb.letter }}</span>
          </div>
          <div class="cursor" :style="{ left: pct(axis.toAxis(cursor)) }" />
        </div>
      </div>

      <div class="axis-row">
        <div class="label-col" />
        <div class="ticks">
          <span v-for="tick in ticks" :key="tick.minutes" :style="{ left: pct(tick.axis) }">
            {{ tick.minutes }}
          </span>
          <span class="unit">min</span>
        </div>
      </div>

      <!-- the scrubber: drag the knob, or anywhere on the plot -->
      <div class="scrub-row">
        <div class="label-col" />
        <div class="track" @pointerdown="startScrub">
          <div class="line" />
          <div class="knob" :style="{ left: pct(axis.toAxis(cursor)) }" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import type { TimelineAxis } from "../study/timelineAxis";
import type { ModeSegment, OpAction, StudyMode } from "../study/types";
import { actionsUntil } from "../study/replayCursor";
import { formatDuration } from "../study/results";

export interface TimelineThumbnail {
  letter: string;
  real: number;
  url?: string;
}

const props = defineProps<{
  title: string;
  axis: TimelineAxis;
  timeline: ModeSegment[];
  actions: OpAction[];
  /** Real (epoch ms) time shown in the editor. */
  cursor: number;
  thumbnails: TimelineThumbnail[];
}>();

const emit = defineEmits<{
  seek: [real: number];
  close: [];
  back: [];
}>();

// top to bottom, as in SketchLab's chronology
const ROWS: StudyMode[] = ["posing", "rigging", "segmenting", "sketching", "inspecting", "idle", "away"];
const FAINT = new Set<StudyMode>(["idle", "away"]);
const MODE_LABELS: Record<StudyMode, string> = {
  posing: "Posing",
  rigging: "Rigging",
  segmenting: "Segmenting",
  sketching: "Sketching",
  inspecting: "Inspecting",
  idle: "Idle",
  away: "Away",
};

const plotEl = useTemplateRef("plotEl");

const bars = computed(() =>
  props.timeline.map((s) => {
    const x = props.axis.toAxis(s.start);
    return {
      mode: s.mode,
      row: ROWS.indexOf(s.mode),
      x,
      width: Math.max(props.axis.toAxis(s.end) - x, 0),
    };
  }),
);

const ticks = computed(() => props.axis.ticks(10));

const cursorInfo = computed(() => {
  const count = actionsUntil(props.actions, props.cursor);
  const working = workingMinutes(props.cursor);
  const last = count > 0 ? props.actions[count - 1] : undefined;
  return (
    `${working.toFixed(1)} min · ${count} / ${props.actions.length} actions` +
    (last ? ` · last: ${last.label} (${last.mode})` : "")
  );
});

function workingMinutes(real: number): number {
  let ms = 0;
  for (const p of props.axis.pieces) {
    if (p.isBreak || p.realStart >= real) continue;
    ms += Math.min(real, p.realEnd) - p.realStart;
  }
  return ms / 60_000;
}

function pct(axisValue: number): string {
  return `${(axisValue / Math.max(props.axis.length, 1)) * 100}%`;
}

function span(from: number, to: number) {
  return { left: pct(from), width: pct(to - from) };
}

function seek(real: number): void {
  emit("seek", real);
}

function startScrub(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  const rect = (plotEl.value ?? target).getBoundingClientRect();
  const at = (e: PointerEvent) => {
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
    seek(props.axis.toReal(f * props.axis.length));
  };
  target.setPointerCapture(event.pointerId);
  at(event);
  const up = () => {
    target.removeEventListener("pointermove", at);
    target.removeEventListener("pointerup", up);
  };
  target.addEventListener("pointermove", at);
  target.addEventListener("pointerup", up);
}

/** Arrow keys step one action at a time. */
function onKey(event: KeyboardEvent): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const actions = props.actions;
  const count = actionsUntil(actions, props.cursor);
  if (event.key === "ArrowRight") {
    if (count < actions.length) seek(actions[count].t);
  } else if (count >= 2) {
    seek(actions[count - 2].t);
  } else {
    seek(props.axis.start);
  }
}
</script>

<style scoped>
.timeline-panel {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.18);
  border-radius: 14px 14px 0 0;
  outline: none;
  user-select: none;
}

header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px 4px;
}

header button {
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 16px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

header button:hover {
  background: #ffe8b3;
}

.title {
  font-weight: 900;
}

.info {
  font-size: 0.85em;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spacer {
  flex: 1;
}

.body {
  padding: 4px 24px 12px 16px;
}

.thumb-row,
.plot-row,
.axis-row,
.scrub-row {
  display: flex;
}

.label-col {
  flex: none;
  width: 96px;
}

.thumbs {
  flex: 1;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.thumb {
  position: relative;
  flex: 1;
  min-width: 0;
  aspect-ratio: 4 / 3;
  max-height: 96px;
  padding: 0;
  border: 1px solid #999;
  background: #f4f4f4;
  cursor: pointer;
  overflow: hidden;
}

.thumb:hover {
  outline: 3px solid #ffd16b;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.letter {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.8em;
}

.rows {
  display: flex;
  flex-direction: column;
  height: 140px;
  padding-top: 18px;
}

.rows span {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 0.85em;
}

.rows span.faint {
  color: #999;
}

.plot {
  position: relative;
  flex: 1;
  height: 140px;
  padding-top: 18px;
  cursor: col-resize;
  border-left: 1px solid #bbb;
}

.bars {
  display: block;
  width: 100%;
  height: 100%;
}

.bars rect {
  fill: #8a8a8a;
  shape-rendering: crispEdges;
}

.bars rect.faint {
  fill: #cfcfcf;
}

.break {
  position: absolute;
  top: 18px;
  bottom: 0;
  background: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0, 0.06) 0 4px,
    transparent 4px 8px
  );
  border-left: 1px dashed #aaa;
  border-right: 1px dashed #aaa;
  pointer-events: none;
}

.break span {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7em;
  color: #777;
  white-space: nowrap;
}

.marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1c1c1e;
  pointer-events: none;
}

.marker span {
  position: absolute;
  top: 0;
  left: 4px;
  font-size: 0.8em;
  font-weight: 900;
}

.cursor {
  position: absolute;
  top: 0;
  bottom: -40px;
  width: 2px;
  margin-left: -1px;
  background: #2f6fde;
  pointer-events: none;
}

.ticks {
  position: relative;
  flex: 1;
  height: 18px;
  font-size: 0.75em;
  color: #555;
}

.ticks span {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
}

.ticks .unit {
  right: -22px;
  transform: none;
}

.track {
  position: relative;
  flex: 1;
  height: 22px;
  cursor: col-resize;
}

.line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 2px;
  background: #2f6fde;
}

.knob {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border: 3px solid #ffffff;
  border-radius: 50%;
  background: #2f6fde;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
</style>
