// Plain-data shapes for everything the study records. Persisted to
// IndexedDB as-is and submitted as JSON, so nothing here may hold class
// instances, typed arrays or functions.

import type { DocumentJson } from "../core/serialization";
import type { Joint, Part, Pose, Transform } from "../core/types";
import type { SyncCursor } from "./sync";

/** What the participant is doing, SketchLab-chronology style. `idle` is the
 *  sketch pane with no tool; `away` is a hidden tab or a long input pause. */
export type StudyMode =
  | "inspecting"
  | "sketching"
  | "segmenting"
  | "rigging"
  | "posing"
  | "idle"
  | "away";

/** A contiguous stretch of one mode, wall-clock epoch milliseconds. */
export interface ModeSegment {
  mode: StudyMode;
  start: number;
  end: number;
}

/** One thing that happened. `type` is a free-form tag ("tool", "panel",
 *  "camera", …); `data` carries its details. */
export interface LogEvent {
  t: number;
  type: string;
  data?: Record<string, unknown>;
}

/** A stroke as it appears in the operation log (same shape as the document
 *  JSON's strokes). */
export type StrokeJson = DocumentJson["strokes"][number];

/** One document delta. Snapshots of parts/joints/poses are whole lists —
 *  they are small — while strokes are addressed individually. */
export type DocOp =
  | { op: "addStroke"; stroke: StrokeJson }
  | { op: "removeStroke"; id: string }
  | { op: "setStroke"; id: string; transform: Transform; partId?: string }
  | { op: "parts"; parts: Part[]; exploded: boolean }
  | { op: "joints"; joints: Joint[] }
  /** Pose thumbnails are dropped here; the final document keeps them. */
  | { op: "poses"; poses: Pose[] }
  | { op: "clear" };

/** One undo-stack step (or a direct edit outside it, `kind: "edit"`) and
 *  the document delta it produced. Replaying every action's ops in order
 *  from an empty document reproduces the sketch at that point. */
export interface OpAction {
  t: number;
  kind: "push" | "undo" | "redo" | "edit";
  label: string;
  /** The study mode the action happened in. */
  mode: StudyMode;
  ops: DocOp[];
}

export interface ParticipantRecord {
  id: string;
  createdAt: number;
  /** Answers from the start screen, keyed by question id. */
  profile: Record<string, string>;
  consent: { given: boolean; at: number; statements: string[] };
  /** Every time the tutorial was open. */
  tutorial?: TutorialView[];
}

export interface TutorialView {
  openedAt: number;
  /** Unset while open (or if the page closed with it open). */
  closedAt?: number;
  /** The first-launch showing, which only Start closes. */
  first: boolean;
  /** Where it was opened from. */
  from: "start" | "workspace" | "picker";
  /** Furthest point scrolled to, 0–1. */
  maxScroll?: number;
  closedBy?: "start" | "close";
}

export interface SessionRecord {
  modelId: string;
  participantId: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  /** How far the session has been cut into upload chunks. */
  sync?: SyncCursor;
  /** Reference-model → sketch-space mapping of the proportion guides:
   *  sketch = model · scale + offset. */
  guideFrame?: { scale: number; offset: [number, number, number] };
  document: DocumentJson;
  events: LogEvent[];
  timeline: ModeSegment[];
  actions: OpAction[];
}
