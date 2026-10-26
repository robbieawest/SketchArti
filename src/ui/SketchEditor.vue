<template>
  <div class="editor">
    <div ref="viewportEl" class="viewport"></div>

    <!-- One overlay grid over the canvas, so regions can never overlap:
         tool palette (left column) · options bar (top row) · panels (right
         column) · hint (bottom of the free area). The grid itself lets
         pointer events through to the canvas; only its contents take them. -->
    <div class="overlay">
      <nav class="palette" aria-label="Tools">
        <button
          v-for="tool in TOOL_BUTTONS"
          :key="tool.name"
          class="tool"
          :class="{ active: activeTool === tool.name }"
          :title="tool.title"
          @click="toggleTool(tool.name)"
        >
          <span class="tool-label">{{ tool.label }}</span>
          <kbd>{{ tool.key }}</kbd>
        </button>
      </nav>

      <div class="topbar">
        <!-- options for the active tool -->
        <div class="options">
          <template v-if="activeTool === 'draw'">
            <div class="group">
              <span class="caption">Plane</span>
              <button
                v-for="o in ORIENTATIONS"
                :key="o.name"
                :title="o.title"
                @click="orientPlane(o.name)"
              >
                {{ o.label }}
              </button>
              <button
                title="Put the drawing plane back at the origin (position, rotation and scale)"
                @click="surface?.resetTransform()"
              >
                Reset
              </button>
              <button
                :class="{ active: !canvasVisible }"
                title="Hide the drawing plane (drawing still works while hidden)"
                @click="toggleCanvasVisible"
              >
                {{ canvasVisible ? "Hide" : "Show" }}
              </button>
            </div>
            <div class="group">
              <span class="caption">Gizmo</span>
              <button
                title="What the plane's gizmo does — press T (move), R (rotate) or S (scale), or click to cycle"
                @click="cycleGizmoMode"
              >
                {{ GIZMO_LABELS[gizmoMode] }}
              </button>
              <select v-model="snap" title="Snapping for the plane gizmo">
                <option v-for="(label, level) in SNAP_LABELS" :key="level" :value="level">
                  {{ label }}
                </option>
              </select>
            </div>
            <button
              v-if="selectedPart"
              class="part-chip"
              title="New strokes join this part automatically (they preview purple). Click or press Esc to stop."
              @click="selectTool?.deselect()"
            >
              Into {{ doc.getPart(selectedPart)?.name ?? "part" }} ✕
            </button>
          </template>

          <template v-else-if="activeTool === 'select'">
            <div class="group">
              <span class="caption">Gizmo</span>
              <button
                title="Gizmo mode — press T (move), R (rotate) or S (scale), or click to cycle"
                @click="cycleGizmoMode"
              >
                {{ GIZMO_LABELS[gizmoMode] }}
              </button>
              <button
                title="Deselect everything (Esc) — tip: ctrl+click adds/removes strokes from the selection, double-click selects a whole part"
                @click="selectTool?.deselect()"
              >
                Deselect
              </button>
            </div>
          </template>

          <template v-else-if="activeTool === 'segment'">
            <div class="group">
              <span class="caption">Pen</span>
              <select
                v-model="segmentMode"
                title="Whether the pen adds strokes to the active part or removes them from it"
              >
                <option value="add">Adds to part</option>
                <option value="remove">Removes from part</option>
              </select>
            </div>
          </template>

          <template v-else-if="activeTool === 'joint' && editingJointId && !armedDof">
            <div class="group">
              <span class="caption">Axis</span>
              <button
                v-for="a in AXIS_PRESETS"
                :key="a.label"
                :title="`Point the joint axis along world ${a.label}`"
                @click="setJointAxis(a.label, a.axis)"
              >
                {{ a.label }}
              </button>
              <button title="Reverse the joint axis" @click="setJointAxis('flip', 'flip')">
                Flip
              </button>
            </div>
            <div class="group">
              <span class="caption">Snap</span>
              <select v-model="snap" title="Snapping for the joint axis gizmo">
                <option v-for="(label, level) in SNAP_LABELS" :key="level" :value="level">
                  {{ label }}
                </option>
              </select>
            </div>
          </template>
        </div>

        <!-- always available -->
        <div class="globals">
          <div class="group">
            <button :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undoStack.undo()">
              Undo
            </button>
            <button
              :disabled="!canRedo"
              title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
              @click="undoStack.redo()"
            >
              Redo
            </button>
          </div>
          <div class="group">
            <span class="caption">View</span>
            <select
              v-if="STUDY_CONFIG.guides.length > 1"
              v-model="guideKind"
              :disabled="!guideReady"
              title="Show a faint trace of the reference model to help with proportions"
            >
              <option v-for="kind in STUDY_CONFIG.guides" :key="kind" :value="kind">
                {{ GUIDE_LABELS[kind] }}
              </option>
            </select>
            <button
              :class="{ active: !sketchVisible }"
              title="Show or hide all sketch strokes (drawing and selection still work)"
              @click="toggleSketchVisible"
            >
              {{ sketchVisible ? "Hide sketch" : "Show sketch" }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="hint" class="hint">{{ hint }}</p>

      <div class="side">
    <bottom-panels
      :expanded="expandedPanel"
      :parts="partsList"
      :poses="posesList"
      :joints="jointsList"
      :ik="ikEnabled"
      :selected-joint-id="selectedJointId"
      :editing-joint-id="editingJointId"
      :armed-dof="armedDof"
      :mirror="mirrorRange"
      :active-part-id="activePartId"
      :stroke-counts="strokeCounts"
      :exploding="explodeMode"
      :part-colors="partColors"
      @set-expanded="setExpanded"
      @set-active-part="setActivePart"
      @add-part="addPart"
      @remove-part="removePart"
      @toggle-explode="toggleExplode"
      @save-pose="savePose"
      @apply-pose="applyPose"
      @remove-pose="removePose"
      @toggle-ik="toggleIk"
      @reset-articulation="resetArticulation"
      @select-joint="selectJoint"
      @edit-joint="editJoint"
      @delete-joint="deleteJoint"
      @new-joint="newJoint"
      @arm-dof="armDof"
      @toggle-mirror="toggleMirror"
    />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { Viewport } from "../engine/Viewport";
import { StrokeRenderer, partColor } from "../engine/StrokeRenderer";
import { JointLines } from "../engine/JointLines";
import {
  CanvasSurface,
  type GizmoMode,
  type PlaneOrientation,
  type SnapLevel,
} from "../engine/CanvasSurface";
import { ReferenceGuide, type GuideFrame, type GuideKind } from "../engine/ReferenceGuide";
import type { ReferenceModel } from "../reference/model";
import { GUIDE_LABELS, STUDY_CONFIG } from "./studyConfig";
import { DrawTool } from "../tools/DrawTool";
import { EraseTool } from "../tools/EraseTool";
import { SelectTool } from "../tools/SelectTool";
import { SegmentTool, type SegmentMode } from "../tools/SegmentTool";
import { ArticulateTool } from "../tools/ArticulateTool";
import { JointTool } from "../tools/JointTool";
import { ExplodeTool } from "../tools/ExplodeTool";
import BottomPanels, { type PanelName } from "./BottomPanels.vue";
import type { SketchDocument } from "../core/SketchDocument";
import {
  applyPoseCommand,
  collapseCommand,
  resetArticulationCommand,
  type UndoStack,
} from "../core/undo";
import type { JointDofName, Transform, Vec3 } from "../core/types";
import { jointPosed } from "../core/types";
import type { StudyMode } from "../study/types";
import type { ToolName } from "../study/timeline";

const props = defineProps<{
  doc: SketchDocument;
  undoStack: UndoStack;
  /** The reference model, for proportion guides (null until loaded). */
  reference: ReferenceModel | null;
  referenceUrl: string;
}>();

const emit = defineEmits<{
  /** The active tool changed (including back to "none"). */
  tool: [tool: ToolName];
  /** A panel action, after it has been applied; `mode` is the study mode
   *  it implies. */
  panel: [mode: StudyMode | null, action: string, data?: Record<string, unknown>];
  /** The editor's viewport, for camera-activity logging. */
  ready: [viewport: Viewport];
  /** How the guides map the reference model into sketch space. */
  "guide-frame": [frame: GuideFrame];
}>();

const doc = props.doc;
const undoStack = props.undoStack;

const TOOL_BUTTONS: { name: Exclude<ToolName, "none">; label: string; key: string; title: string }[] = [
  {
    name: "draw",
    label: "Draw",
    key: "D",
    title: "Draw (D) — left-drag on the drawing plane to sketch; move the plane with its gizmo",
  },
  {
    name: "erase",
    label: "Erase",
    key: "E",
    title: "Erase (E) — left-drag over strokes to delete them",
  },
  {
    name: "select",
    label: "Select",
    key: "V",
    title: "Select (V) — click a stroke, double-click a part; T/R/S set the gizmo, Delete removes, Esc deselects",
  },
  {
    name: "segment",
    label: "Segment",
    key: "G",
    title: "Segment (G) — drag a pen through strokes to add/remove them from the active part (see Parts panel)",
  },
  {
    name: "joint",
    label: "Joint",
    key: "J",
    title: "Joint (J) — drag from a parent part to a child part to create a joint; click a part to edit the joint that drives it",
  },
  {
    name: "articulate",
    label: "Articulate",
    key: "A",
    title: "Articulate (A) — grab a part and drag it: turn it like a knob around its joint, or slide it; R/T switch motion when a joint has several. IK (Articulations panel) drags parts freely. Turn explode off first.",
  },
];

const ORIENTATIONS: { name: PlaneOrientation; label: string; title: string }[] = [
  { name: "front", label: "Front", title: "Turn the drawing plane to face the front (upright, facing +Z)" },
  { name: "side", label: "Side", title: "Turn the drawing plane to face the side (upright, facing +X)" },
  { name: "top", label: "Top", title: "Lay the drawing plane flat (facing up)" },
];

const AXIS_PRESETS: { label: string; axis: Vec3 }[] = [
  { label: "X", axis: { x: 1, y: 0, z: 0 } },
  { label: "Y", axis: { x: 0, y: 1, z: 0 } },
  { label: "Z", axis: { x: 0, y: 0, z: 1 } },
];

const SNAP_LABELS: Record<SnapLevel, string> = {
  off: "Snap off",
  fine: "Snap 5° · 0.05",
  coarse: "Snap 15° · 0.25",
};

const GIZMO_LABELS: Record<GizmoMode, string> = {
  translate: "move",
  rotate: "rotate",
  scale: "scale",
};

const viewportEl = useTemplateRef("viewportEl");

let viewport: Viewport | undefined;
let strokeRenderer: StrokeRenderer | undefined;
let surface: CanvasSurface | undefined;
interface ToolHandler {
  attach(): void;
  detach(): void;
}
let tools: Record<Exclude<ToolName, "none">, ToolHandler> | undefined;
let attachedHandler: ToolHandler | null = null;
let explodeTool: ExplodeTool | undefined;
let drawTool: DrawTool | undefined;
let selectTool: SelectTool | undefined;
let segmentTool: SegmentTool | undefined;
let articulateTool: ArticulateTool | undefined;
let jointTool: JointTool | undefined;
let jointLines: JointLines | undefined;
let guide: ReferenceGuide | undefined;

const activeTool = ref<ToolName>("none");
/** Explode mode persists across tool switches so you can draw, select, etc.
 *  on the exploded model; turning it off restores the original pose. */
const explodeMode = ref(false);
const gizmoMode = ref<GizmoMode>("translate");
const canvasVisible = ref(true);
const sketchVisible = ref(true);
const snap = ref<SnapLevel>(STUDY_CONFIG.snap);
const guideKind = ref<GuideKind>(STUDY_CONFIG.defaultGuide);
const guideReady = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);

const expandedPanel = ref<PanelName | null>(null);
const activePartId = ref<string | null>(null);
/** The part selected via double-click in select mode; drawing joins it. */
const selectedPart = ref<string | null>(null);
const segmentMode = ref<SegmentMode>("add");
const ikEnabled = ref(false);
const selectedJointId = ref<string | null>(null);
const editingJointId = ref<string | null>(null);
const armedDof = ref<JointDofName | null>(null);
const mirrorRange = ref(false);
const docVersion = ref(0);
const unsubscribeDoc = doc.subscribe(() => docVersion.value++);

const partsList = computed(() => {
  void docVersion.value;
  return doc.allParts();
});
const posesList = computed(() => {
  void docVersion.value;
  return doc.allPoses();
});
const jointsList = computed(() => {
  void docVersion.value;
  return doc.allJoints();
});
const strokeCounts = computed(() => {
  void docVersion.value;
  const counts: Record<string, number> = {};
  for (const stroke of doc.allStrokes()) {
    if (stroke.partId) counts[stroke.partId] = (counts[stroke.partId] ?? 0) + 1;
  }
  return counts;
});
// same derivation as StrokeRenderer, so swatches match the strokes
const partColors = computed(() =>
  Object.fromEntries(partsList.value.map((part, i) => [part.id, partColor(i)])),
);
const activePart = computed(() =>
  activePartId.value ? doc.getPart(activePartId.value) : undefined,
);
let partCounter = doc.allParts().length;

const hint = computed(() => {
  switch (activeTool.value) {
    case "joint":
      if (!editingJointId.value) {
        return "Drag from a parent part to a child part to create a joint; click a part to edit its joint";
      }
      if (armedDof.value) {
        return "Drag the part through its motion — how far you move it becomes the range; release to snap back";
      }
      return "T moves the pivot, R aims the arrow; arm a motion in the panel to demonstrate its range";
    case "segment":
      return activePart.value ? `Painting: ${activePart.value.name}` : "No active part";
    case "none":
      return explodeMode.value
        ? "Drag away from the model's center to explode it; turn explode off in the Parts panel to restore it"
        : "";
    default:
      return "";
  }
});

undoStack.onChange = () => {
  canUndo.value = undoStack.canUndo;
  canRedo.value = undoStack.canRedo;
};

onMounted(() => {
  viewport = new Viewport(viewportEl.value!);
  strokeRenderer = new StrokeRenderer(doc, viewport);
  surface = new CanvasSurface(viewport);
  drawTool = new DrawTool(viewport, surface, doc, undoStack);
  selectTool = new SelectTool(viewport, doc, undoStack, strokeRenderer);
  selectTool.onPartSelectionChanged = (partId) => {
    selectedPart.value = partId;
  };
  segmentTool = new SegmentTool(viewport, doc, undoStack, strokeRenderer);
  articulateTool = new ArticulateTool(viewport, doc, undoStack, strokeRenderer);
  articulateTool.onJointSelected = (jointId) => {
    selectedJointId.value = jointId;
  };
  jointTool = new JointTool(viewport, doc, undoStack, strokeRenderer);
  jointTool.onStateChanged = (state) => {
    editingJointId.value = state.jointId;
    armedDof.value = state.armedDof;
    mirrorRange.value = state.mirror;
  };
  jointLines = new JointLines(doc, viewport);
  explodeTool = new ExplodeTool(viewport, doc, undoStack);
  tools = {
    draw: drawTool,
    erase: new EraseTool(viewport, doc, undoStack, strokeRenderer),
    select: selectTool,
    segment: segmentTool,
    articulate: articulateTool,
    joint: jointTool,
  };
  explodeMode.value = doc.exploded;
  surface.setSnap(snap.value);
  jointTool.setSnap(snap.value);
  guide = new ReferenceGuide(viewport);
  void loadGuide();
  activate(activeTool.value);

  // gizmos get out of the way while the camera is being driven
  viewport.onCameraActivity((active) => {
    surface?.suppressGizmo("camera", active);
    selectTool?.suppressGizmo(active);
    articulateTool?.suppressGizmo(active);
    jointTool?.suppressGizmo(active);
  });

  window.addEventListener("keydown", onKeyDown);
  emit("ready", viewport);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  unsubscribeDoc();
  undoStack.onChange = undefined;
  attachedHandler?.detach();
  attachedHandler = null;
  jointLines?.dispose();
  guide?.dispose();
  surface?.dispose();
  strokeRenderer?.dispose();
  viewport?.dispose();
});

// while a part is selected, drawing targets it; keep its purple glow
// current in draw mode (including strokes just drawn into it)
watch([activeTool, selectedPart, docVersion], () => {
  if (drawTool) drawTool.targetPartId = selectedPart.value ?? undefined;
  if (activeTool.value !== "draw" || !strokeRenderer) return;
  if (selectedPart.value) {
    for (const stroke of doc.allStrokes()) {
      strokeRenderer.setHighlight(
        stroke.id,
        stroke.partId === selectedPart.value,
        "part",
      );
    }
  } else {
    strokeRenderer.clearHighlights();
  }
});
// undo/redo can re-explode the document while the mode toggle is off; pick
// the mode back up so the panel button and idle drag stay truthful
watch(docVersion, () => {
  if (doc.exploded && !explodeMode.value) {
    explodeMode.value = true;
    if (activeTool.value === "none") activate("none");
  }
});
watch(ikEnabled, (value) => articulateTool?.setIkMode(value));
watch(segmentMode, (value) => {
  if (segmentTool) segmentTool.mode = value;
  emit("panel", "segmenting", "segment-mode", { mode: value });
});

let guideLoading = false;

async function loadGuide(): Promise<void> {
  if (!guide || !props.reference || guideReady.value || guideLoading) return;
  guideLoading = true;
  try {
    const frame = await guide.load(props.reference, props.referenceUrl);
    guide.setKind(guideKind.value);
    guideReady.value = true;
    emit("guide-frame", frame);
  } catch (error) {
    console.error("proportion guide unavailable:", error);
  } finally {
    guideLoading = false;
  }
}
// the reference may arrive after the editor mounts
watch(() => props.reference, () => void loadGuide());
watch(guideKind, (kind) => {
  guide?.setKind(kind);
  emit("panel", null, "guide", { kind });
});

watch(snap, (level) => {
  surface?.setSnap(level);
  jointTool?.setSnap(level);
  emit("panel", null, "snap", { level });
});

function orientPlane(orientation: PlaneOrientation): void {
  surface?.setOrientation(orientation);
  emit("panel", null, "orient-plane", { orientation });
}

function setJointAxis(label: string, axis: Vec3 | "flip"): void {
  jointTool?.setAxis(axis);
  emit("panel", "rigging", "set-joint-axis", { axis: label });
}

function activate(tool: ToolName): void {
  if (!tools) return;
  attachedHandler?.detach();
  strokeRenderer?.clearHighlights(); // each tool re-applies its own
  const changed = tool !== activeTool.value;
  activeTool.value = tool;
  attachedHandler =
    tool === "none"
      ? explodeMode.value
        ? (explodeTool ?? null)
        : null
      : tools[tool];
  attachedHandler?.attach();
  // the drawing plane only participates in drawing; elsewhere it would
  // obstruct clicks on strokes
  surface?.setVisible(tool === "draw" && canvasVisible.value);

  if (tool === "joint" || tool === "articulate") {
    expandedPanel.value = "articulations";
  } else if (tool === "segment") {
    // segmentation needs a target part: create one if none exists yet, and
    // surface the parts panel for orientation
    if (!activePartId.value) {
      addPart();
    } else {
      segmentTool?.setActivePart(activePartId.value);
    }
    expandedPanel.value = "parts";
  }
  if (changed) emit("tool", tool);
}

/** Explicit switch (panel actions etc.) — never toggles off. */
function setTool(tool: ToolName): void {
  if (tool !== activeTool.value) activate(tool);
}

/** Toolbar buttons and keybinds: picking the active tool again turns it
 *  off, back to the idle state. */
function toggleTool(tool: ToolName): void {
  activate(tool === activeTool.value ? "none" : tool);
}

function setExpanded(panel: PanelName | null): void {
  expandedPanel.value = panel;
  emit("panel", null, panel ? "open-panel" : "close-panel", { panel });
}

function resetArticulation(): void {
  if (doc.allJoints().some(jointPosed)) {
    undoStack.push(resetArticulationCommand(doc));
  }
  emit("panel", "posing", "reset-articulation");
}

function toggleIk(): void {
  ikEnabled.value = !ikEnabled.value;
  emit("panel", "posing", "toggle-ik", { on: ikEnabled.value });
}

function editJoint(jointId: string): void {
  setTool("joint");
  jointTool?.selectJoint(jointId);
  emit("panel", "rigging", "edit-joint", { jointId });
}

function newJoint(): void {
  setTool("joint");
  jointTool?.deselect();
  emit("panel", "rigging", "new-joint");
}

function deleteJoint(jointId: string): void {
  // the articulate gizmo may be sitting on this joint
  articulateTool?.deselect();
  jointTool?.deleteJoint(jointId);
  emit("panel", "rigging", "delete-joint", { jointId });
}

function armDof(dof: JointDofName): void {
  jointTool?.armDof(dof);
  emit("panel", "rigging", "arm-dof", { dof, armed: armedDof.value === dof });
}

function toggleMirror(): void {
  jointTool?.setMirror(!mirrorRange.value);
  emit("panel", "rigging", "toggle-mirror", { on: mirrorRange.value });
}

function setActivePart(partId: string): void {
  activePartId.value = partId;
  segmentTool?.setActivePart(partId);
  // clicking a part also selects it (purple): drawing now targets it, and
  // in select mode its strokes share a gizmo
  selectTool?.select(
    doc.strokesInPart(partId).map((s) => s.id),
    partId,
  );
  emit("panel", "segmenting", "set-active-part", { partId });
}

function addPart(): void {
  const part = {
    id: crypto.randomUUID(),
    name: `Part ${++partCounter}`,
  };
  doc.addPart(part);
  activePartId.value = part.id;
  segmentTool?.setActivePart(part.id);
  selectTool?.select([], part.id);
  emit("panel", "segmenting", "add-part", { partId: part.id });
}

function removePart(partId: string): void {
  if (selectedPart.value === partId) selectTool?.deselect();
  doc.removePart(partId);
  if (activePartId.value === partId) {
    activePartId.value = null;
    segmentTool?.setActivePart(undefined);
  }
  emit("panel", "segmenting", "remove-part", { partId });
}

function toggleExplode(): void {
  if (explodeMode.value) {
    explodeMode.value = false;
    // drop the drag handler if it was attached, then restore the pose
    if (activeTool.value === "none") activate("none");
    if (doc.allParts().some((p) => p.explodeOffset)) {
      undoStack.push(collapseCommand(doc));
    }
  } else {
    explodeMode.value = true;
    // enter the idle state, where dragging adjusts the explosion
    activate("none");
    // start with a small spread so toggling visibly does something
    if (!doc.exploded) explodeTool?.setFactor(0.5);
    expandedPanel.value = "parts";
  }
  emit("panel", "segmenting", "toggle-explode", { on: explodeMode.value });
}

function selectJoint(jointId: string): void {
  setTool("articulate");
  articulateTool?.selectJoint(jointId);
  emit("panel", "posing", "select-joint", { jointId });
}

function savePose(): void {
  if (!viewport) return;
  const transforms: Record<string, Transform> = {};
  for (const stroke of doc.allStrokes()) {
    transforms[stroke.id] = {
      position: { ...stroke.transform.position },
      quaternion: { ...stroke.transform.quaternion },
      scale: { ...stroke.transform.scale },
    };
  }
  const pose = {
    id: crypto.randomUUID(),
    name: `Pose ${doc.allPoses().length + 1}`,
    thumbnail: viewport.captureThumbnail(),
    transforms,
  };
  doc.addPose(pose);
  expandedPanel.value = "poses";
  emit("panel", "posing", "save-pose", { poseId: pose.id });
}

function applyPose(poseId: string): void {
  const pose = doc.getPose(poseId);
  if (pose) undoStack.push(applyPoseCommand(doc, pose));
  emit("panel", "posing", "apply-pose", { poseId });
}

function removePose(poseId: string): void {
  doc.removePose(poseId);
  emit("panel", "posing", "remove-pose", { poseId });
}

function toggleSketchVisible(): void {
  sketchVisible.value = !sketchVisible.value;
  strokeRenderer?.setVisible(sketchVisible.value);
  emit("panel", null, "toggle-sketch-visible", { on: sketchVisible.value });
}

function cycleGizmoMode(): void {
  const order: GizmoMode[] = ["translate", "rotate", "scale"];
  setGizmoMode(order[(order.indexOf(gizmoMode.value) + 1) % order.length]);
}

function setGizmoMode(mode: GizmoMode): void {
  gizmoMode.value = mode;
  surface?.setGizmoMode(mode);
  selectTool?.setGizmoMode(mode);
}

function toggleCanvasVisible(): void {
  canvasVisible.value = !canvasVisible.value;
  surface?.setVisible(canvasVisible.value);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey) {
    if (event.code === "KeyZ") {
      event.preventDefault();
      event.shiftKey ? undoStack.redo() : undoStack.undo();
    } else if (event.code === "KeyY") {
      event.preventDefault();
      undoStack.redo();
    }
    return;
  }
  // avoid hijacking typing in inputs/selects
  if (
    event.target instanceof HTMLElement &&
    ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
  ) {
    return;
  }
  if (event.code === "Escape") selectTool?.deselect();
  else if (event.code === "KeyT") setGizmoMode("translate");
  else if (event.code === "KeyR") setGizmoMode("rotate");
  else if (event.code === "KeyS") setGizmoMode("scale");
  else if (event.code === "KeyD") toggleTool("draw");
  else if (event.code === "KeyE") toggleTool("erase");
  else if (event.code === "KeyV") toggleTool("select");
  else if (event.code === "KeyG") toggleTool("segment");
  else if (event.code === "KeyA") toggleTool("articulate");
  else if (event.code === "KeyJ") toggleTool("joint");
}
</script>

<style scoped>
.editor {
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

/* the layout: fixed regions in a grid, so nothing can overlap whatever the
   pane size; the top row grows when the options wrap */
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) clamp(190px, 28%, 270px);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px;
  pointer-events: none;
}

.overlay > * {
  pointer-events: auto;
}

.palette {
  grid-column: 1;
  grid-row: 1 / 4;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  max-height: 100%;
  overflow-y: auto;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.12);
}

.tool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 108px;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-weight: 900;
  cursor: pointer;
}

.tool:hover {
  background: #fff3d6;
}

.tool.active {
  background: #ffd16b;
}

.topbar {
  grid-column: 2 / 4;
  grid-row: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  /* the bar itself is click-through; only its groups take clicks */
  pointer-events: none;
  min-width: 0;
}

.options,
.globals {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.globals {
  margin-left: auto;
  justify-content: flex-end;
}

.group,
.part-chip {
  pointer-events: auto;
}

.group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.12);
}

.caption {
  padding: 0 6px 0 4px;
  font-size: 0.72em;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #777;
}

.group button,
.group select,
.part-chip {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: #f1f1f1;
  font-weight: 900;
  cursor: pointer;
  white-space: nowrap;
}

.group button:hover:not(:disabled),
.group select:hover:not(:disabled) {
  background: #ffe8b3;
}

.group button.active {
  background: #ffd16b;
}

.group button:disabled,
.group select:disabled {
  opacity: 0.5;
  cursor: default;
}

.part-chip {
  align-self: center;
  background: #e3d1ff;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.12);
}

.part-chip:hover {
  background: #d0b3ff;
}

kbd {
  font-family: inherit;
  font-size: 0.72em;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.08);
}

.hint {
  grid-column: 2;
  grid-row: 3;
  justify-self: start;
  align-self: end;
  max-width: 100%;
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1.35;
  pointer-events: none;
}

.side {
  grid-column: 3;
  grid-row: 2 / 4;
  min-height: 0;
  /* the column is click-through around the panels themselves */
  pointer-events: none;
}
</style>
