<template>
  <div class="panels">
    <div v-for="panel in panels" :key="panel" class="panel">
      <div v-if="expanded === panel" class="panel-body">
        <!-- Parts -->
        <template v-if="panel === 'parts'">
          <div v-if="parts.length === 0" class="empty">
            No parts yet. Create one, then paint strokes into it with the
            Segment tool.
          </div>
          <div
            v-for="part in parts"
            :key="part.id"
            class="row"
            :class="{ active: part.id === activePartId }"
            :title="'Click to make this the active part for the segmentation pen'"
            @click="$emit('set-active-part', part.id)"
          >
            <span
              class="swatch"
              :style="{ background: partColors[part.id] ?? '#1c1c1e' }"
            />
            <span class="row-label">{{ part.name }}</span>
            <span class="count">{{ strokeCounts[part.id] ?? 0 }}</span>
            <button
              class="mini danger"
              title="Delete the part (strokes stay, but are unassigned)"
              @click.stop="$emit('remove-part', part.id)"
            >
              ×
            </button>
          </div>
          <div class="panel-actions">
            <button @click="$emit('add-part')">New part</button>
            <button
              :disabled="parts.length === 0"
              :class="{ active: exploding }"
              :title="
                exploding
                  ? 'Turn explode off — every part returns to its original placement'
                  : 'Explode — with no tool active, left-drag away from the model center to spread the parts apart; other tools keep working on the exploded model'
              "
              @click="$emit('toggle-explode')"
            >
              {{ exploding ? "Turn off explode" : "Explode" }}
            </button>
          </div>
        </template>

        <!-- Poses -->
        <template v-else-if="panel === 'poses'">
          <div v-if="poses.length === 0" class="empty">
            No poses yet. Arrange your parts, then save the pose.
          </div>
          <div class="pose-grid">
            <div
              v-for="pose in poses"
              :key="pose.id"
              class="pose"
              :title="'Click to apply ' + pose.name"
              @click="$emit('apply-pose', pose.id)"
            >
              <img :src="pose.thumbnail" :alt="pose.name" />
              <span class="pose-name">{{ pose.name }}</span>
              <button
                class="mini danger pose-delete"
                title="Delete this pose"
                @click.stop="$emit('remove-pose', pose.id)"
              >
                ×
              </button>
            </div>
          </div>
          <div class="panel-actions">
            <button @click="$emit('save-pose')">Save pose</button>
          </div>
        </template>

        <!-- Articulations -->
        <template v-else>
          <div v-if="selectedJointId" class="axis-guide-key">
            <span class="axis-arrow">↗</span> Joint axis
            <span class="pivot-dot">●</span> Pivot
          </div>
          <div v-if="joints.length === 0" class="empty">
            No joints yet. Click "New joint" and drag from one part to
            another.
          </div>
          <template v-for="joint in joints" :key="joint.id">
            <div
              class="row"
              :class="{ active: joint.id === selectedJointId || joint.id === editingJointId }"
              :title="jointTooltip(joint)"
              @click="$emit('select-joint', joint.id)"
            >
              <span class="row-label">{{ joint.name }}</span>
              <span class="count">{{ jointKindLabel(joint) }}</span>
              <span class="count value">{{ jointValueLabel(joint) }}</span>
              <button
                class="mini"
                title="Edit this joint (Joint tool): place its axis, demonstrate its ranges"
                @click.stop="$emit('edit-joint', joint.id)"
              >
                ✎
              </button>
              <button
                class="mini danger"
                title="Delete this joint (the parts stay)"
                @click.stop="$emit('delete-joint', joint.id)"
              >
                ×
              </button>
            </div>
            <template v-if="joint.id === editingJointId">
              <div
                v-for="dof in JOINT_DOF_NAMES"
                :key="dof"
                class="row dof-row"
                :class="{ active: dof === armedDof }"
                :title="'Click to arm this motion, then drag the part through it in the view — how far you move it becomes its range. Click again to disarm.'"
                @click="$emit('arm-dof', dof)"
              >
                <span class="row-label">{{ DOF_LABELS[dof] }}</span>
                <span class="count value">{{ dofRangeLabel(joint, dof) }}</span>
                <span v-if="dof === armedDof" class="count recording">●</span>
              </div>
              <label
                class="row dof-row mirror-toggle"
                title="Commit demonstrated ranges symmetrically (± the largest extreme)"
              >
                <input
                  type="checkbox"
                  :checked="mirror"
                  @change="$emit('toggle-mirror')"
                />
                Mirror range
              </label>
            </template>
          </template>
          <div class="panel-actions">
            <button
              title="Create a joint (Joint tool): drag from the parent part to the child part in the viewport"
              @click="$emit('new-joint')"
            >
              New joint
            </button>
            <label
              v-if="joints.length > 0"
              class="ik-toggle"
              title="Inverse kinematics — drag a part freely with the Articulate tool and the joint chain solves to follow"
            >
              <input
                type="checkbox"
                :checked="ik"
                @change="$emit('toggle-ik')"
              />
              IK
            </label>
            <button
              v-if="joints.length > 0"
              title="Return every joint to its rest pose (undoable)"
              @click="$emit('reset-articulation')"
            >
              Reset pose
            </button>
          </div>
        </template>
      </div>

      <button
        class="panel-header"
        :title="headerTooltips[panel]"
        @click="$emit('set-expanded', expanded === panel ? null : panel)"
      >
        <span>{{ panelLabels[panel] }}</span>
        <span class="chevron">{{ expanded === panel ? "v" : "^" }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Joint, JointDofName, Part, Pose } from "../core/types";
import { JOINT_DOF_NAMES, dofUnlocked, jointKindLabel } from "../core/types";

export type PanelName = "parts" | "poses" | "articulations";

defineProps<{
  expanded: PanelName | null;
  parts: Part[];
  poses: Pose[];
  joints: Joint[];
  ik: boolean;
  selectedJointId: string | null;
  editingJointId: string | null;
  armedDof: JointDofName | null;
  mirror: boolean;
  activePartId: string | null;
  strokeCounts: Record<string, number>;
  exploding: boolean;
  /** Display colour of each part (matches the sketch view). */
  partColors: Record<string, string>;
}>();

const emit = defineEmits<{
  "set-expanded": [panel: PanelName | null];
  "set-active-part": [partId: string];
  "add-part": [];
  "remove-part": [partId: string];
  "toggle-explode": [];
  "save-pose": [];
  "apply-pose": [poseId: string];
  "remove-pose": [poseId: string];
  "toggle-ik": [];
  "reset-articulation": [];
  "select-joint": [jointId: string];
  "edit-joint": [jointId: string];
  "delete-joint": [jointId: string];
  "new-joint": [];
  "arm-dof": [dof: JointDofName];
  "toggle-mirror": [];
}>();

const DOF_LABELS: Record<JointDofName, string> = {
  translation: "Slide",
  twist: "Twist",
  swingU: "Swing U",
  swingV: "Swing V",
};

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const dofValueLabel = (dof: JointDofName, value: number) =>
  dof === "translation" ? value.toFixed(2) : `${toDegrees(value).toFixed(0)}°`;

/** Current values of the unlocked DoFs, compact. */
function jointValueLabel(joint: Joint): string {
  const parts = JOINT_DOF_NAMES.filter((d) => dofUnlocked(joint.dofs[d])).map(
    (d) => dofValueLabel(d, joint.dofs[d].value),
  );
  return parts.join(" ");
}

function dofRangeLabel(joint: Joint, dof: JointDofName): string {
  const [min, max] = joint.dofs[dof].range;
  if (min === 0 && max === 0) return "locked";
  return `${dofValueLabel(dof, min)} .. ${dofValueLabel(dof, max)}`;
}

function jointTooltip(joint: Joint): string {
  const ranges = JOINT_DOF_NAMES.filter((d) => dofUnlocked(joint.dofs[d]))
    .map((d) => `${DOF_LABELS[d]} ${dofRangeLabel(joint, d)}`)
    .join(", ");
  return `${jointKindLabel(joint)} joint${ranges ? ` — ${ranges}` : ""}. Click to drive it (Articulate tool); ✎ edits it.`;
}

const panels: PanelName[] = ["articulations", "poses", "parts"];
const panelLabels: Record<PanelName, string> = {
  parts: "Parts",
  poses: "Poses",
  articulations: "Articulations",
};
const headerTooltips: Record<PanelName, string> = {
  parts: "Part segmentation — group strokes into parts with the Segment tool",
  poses: "Saved poses — snapshots of every stroke's placement",
  articulations:
    "Joints between parts — articulate them with the Articulate tool (A), toggle IK here",
};
</script>

<style scoped>
.panels {
  /* fills the editor's side column (below the top bar), so a tall panel is
     clamped by it instead of running under the toolbars; the strip itself
     is click-through, only the panels take pointer events */
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  pointer-events: none;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0; /* let the stack shrink this panel when space runs out */
  pointer-events: auto;
}

.panel-header {
  flex: none;
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 18px;
  background: #ffffff;
  font-weight: 900;
  cursor: pointer;
  filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.12));
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header:hover {
  background: #ffe8b3;
}

.chevron {
  font-weight: 900;
}

.panel-body {
  background: #ffffff;
  border-radius: 12px;
  margin-bottom: 6px;
  padding: 10px;
  min-height: 0;
  overflow-y: auto;
  filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.12));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty {
  font-size: 0.85em;
  color: #666;
  padding: 4px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.row:hover {
  background: #fff3d6;
}

.row.active {
  background: #ffe8b3;
}

.row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 900;
}

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 6px;
  flex: none;
}

.count {
  font-size: 0.8em;
  color: #666;
}

.mini {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 11px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
  line-height: 1;
}

.mini.danger:hover {
  background: #ffb3b3;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.panel-actions button {
  flex: 1 1 auto;
  padding: 0 10px;
  white-space: nowrap;
  height: 32px;
  border: none;
  border-radius: 16px;
  background: #eeeeee;
  font-weight: 900;
  cursor: pointer;
}

.panel-actions button:hover:not(:disabled) {
  background: #ffe8b3;
}

.panel-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.pose-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pose {
  position: relative;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: #f4f4f4;
}

.pose:hover {
  outline: 2px solid #ffd16b;
}

.pose img {
  width: 100%;
  display: block;
}

.pose-name {
  display: block;
  font-size: 0.75em;
  font-weight: 900;
  padding: 2px 6px 4px;
}

.pose-delete {
  position: absolute;
  top: 4px;
  right: 4px;
}

.panel-actions button.active {
  background: #ffd16b;
}

.dof-row {
  margin-left: 16px;
  padding-top: 3px;
  padding-bottom: 3px;
  font-size: 0.9em;
}

.dof-row .row-label {
  font-weight: 700;
}

.recording {
  color: #d03030;
}

.mirror-toggle {
  gap: 6px;
  font-weight: 700;
}

.count.value {
  min-width: 38px;
  text-align: right;
}

.ik-toggle {
  flex: 1;
  height: 32px;
  border-radius: 16px;
  background: #eeeeee;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}

.ik-toggle:hover {
  background: #ffe8b3;
}

.axis-guide-key {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 6px;
  font-size: 0.8em;
  color: #555;
}

.axis-arrow {
  color: #e53935;
  font-weight: 700;
  font-size: 1.4em;
}

.pivot-dot {
  color: #d6a000;
  margin-left: 8px;
}

</style>
