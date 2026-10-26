import type { SketchDocument } from "../core/SketchDocument";
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  migrateJoint,
  strokeFromJson,
  type DocumentJson,
} from "../core/serialization";
import { cloneJoint, type Joint } from "../core/types";
import type { OpAction, StrokeJson } from "./types";

/** The document after some number of actions. Treated as immutable: ops
 *  build new objects instead of editing old ones, so states can share
 *  strokes and checkpoints are cheap shallow copies. */
export interface ReplayState {
  strokes: Map<string, StrokeJson>;
  parts: NonNullable<DocumentJson["parts"]>;
  joints: Joint[];
  poses: NonNullable<DocumentJson["poses"]>;
  exploded: boolean;
}

/** Keep a checkpoint every this many actions, so seeking backwards replays
 *  at most this many. */
const CHECKPOINT_EVERY = 64;

function emptyState(): ReplayState {
  return { strokes: new Map(), parts: [], joints: [], poses: [], exploded: false };
}

function copyState(state: ReplayState): ReplayState {
  return { ...state, strokes: new Map(state.strokes) };
}

function applyAction(state: ReplayState, action: OpAction): void {
  for (const op of action.ops) {
    switch (op.op) {
      case "addStroke":
        state.strokes.set(op.stroke.id, op.stroke);
        break;
      case "removeStroke":
        state.strokes.delete(op.id);
        break;
      case "setStroke": {
        const stroke = state.strokes.get(op.id);
        if (!stroke) break;
        const { partId: _old, ...rest } = stroke;
        state.strokes.set(op.id, {
          ...rest,
          transform: op.transform,
          ...(op.partId !== undefined && { partId: op.partId }),
        });
        break;
      }
      case "parts":
        state.parts = op.parts;
        state.exploded = op.exploded;
        break;
      case "joints":
        state.joints = op.joints;
        break;
      case "poses":
        state.poses = op.poses;
        break;
      case "clear":
        Object.assign(state, emptyState());
        break;
    }
  }
}

/**
 * Random access into an op log: `seek(n)` gives the document after the
 * first n actions — the same result as `replayActions(actions, n)`, but
 * scrubbing back and forth only replays from the nearest checkpoint.
 */
export class ReplayCursor {
  private state = emptyState();
  private index = 0;
  /** checkpoints[k] = state after k·CHECKPOINT_EVERY actions. */
  private readonly checkpoints: ReplayState[] = [emptyState()];

  constructor(private readonly actions: OpAction[]) {}

  get length(): number {
    return this.actions.length;
  }

  seek(count: number): ReplayState {
    const target = Math.max(0, Math.min(count, this.actions.length));
    if (target < this.index) {
      const k = Math.min(
        Math.floor(target / CHECKPOINT_EVERY),
        this.checkpoints.length - 1,
      );
      this.state = copyState(this.checkpoints[k]);
      this.index = k * CHECKPOINT_EVERY;
    }
    while (this.index < target) {
      applyAction(this.state, this.actions[this.index]);
      this.index++;
      if (
        this.index % CHECKPOINT_EVERY === 0 &&
        this.checkpoints.length === this.index / CHECKPOINT_EVERY
      ) {
        this.checkpoints.push(copyState(this.state));
      }
    }
    return this.state;
  }

  document(count: number): DocumentJson {
    return stateToDocument(this.seek(count));
  }
}

export function stateToDocument(state: ReplayState): DocumentJson {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    parts: state.parts,
    poses: state.poses,
    joints: state.joints,
    exploded: state.exploded,
    strokes: [...state.strokes.values()],
  };
}

export function documentToState(json: DocumentJson): ReplayState {
  return {
    strokes: new Map(json.strokes.map((s) => [s.id, s])),
    parts: json.parts ?? [],
    joints: (json.joints ?? []).map(migrateJoint),
    poses: json.poses ?? [],
    exploded: json.exploded ?? false,
  };
}

/** Number of actions at or before time `t` (actions are in time order). */
export function actionsUntil(actions: OpAction[], t: number): number {
  let lo = 0;
  let hi = actions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (actions[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Keeps a live SketchDocument showing a ReplayState, changing only what
 * differs: scrubbing through a long session then touches a few strokes per
 * step instead of rebuilding the sketch. Edits made to the document by
 * anyone else are noticed, and the next `show` rebuilds from scratch.
 */
export class DocumentMirror {
  /** What each stroke in the document was built from. */
  private shown = new Map<string, StrokeJson>();
  private partsKey = "";
  private jointsKey = "";
  private posesKey = "";
  private applying = false;
  private stale = true;
  private readonly unsubscribe: () => void;

  constructor(private readonly doc: SketchDocument) {
    this.unsubscribe = doc.subscribe(() => {
      if (!this.applying) this.stale = true;
    });
  }

  show(state: ReplayState): void {
    this.applying = true;
    try {
      const partsKey = JSON.stringify([state.parts, state.exploded]);
      // parts constrain strokes and joints: a parts change rebuilds all
      if (this.stale || partsKey !== this.partsKey) this.rebuild(state, partsKey);
      else this.update(state);
    } finally {
      this.applying = false;
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private rebuild(state: ReplayState, partsKey: string): void {
    const doc = this.doc;
    doc.clear();
    for (const part of state.parts) doc.addPart(structuredClone(part));
    for (const pose of state.poses) doc.addPose(structuredClone(pose));
    for (const joint of state.joints) doc.addJoint(cloneJoint(joint));
    doc.exploded = state.exploded;
    this.shown = new Map();
    for (const stroke of state.strokes.values()) this.addStroke(stroke);
    this.partsKey = partsKey;
    this.jointsKey = JSON.stringify(state.joints);
    this.posesKey = JSON.stringify(state.poses);
    this.stale = false;
  }

  private update(state: ReplayState): void {
    const doc = this.doc;
    for (const id of [...this.shown.keys()]) {
      if (!state.strokes.has(id)) {
        doc.removeStroke(id);
        this.shown.delete(id);
      }
    }
    for (const [id, stroke] of state.strokes) {
      const before = this.shown.get(id);
      if (before === stroke) continue;
      if (before && before.points === stroke.points) {
        // moved or re-parted (setStroke ops keep the point data)
        doc.setStrokeTransform(id, stroke.transform);
        if (before.partId !== stroke.partId) doc.setStrokePart(id, stroke.partId);
        this.shown.set(id, stroke);
      } else {
        if (before) doc.removeStroke(id);
        this.addStroke(stroke);
      }
    }
    const jointsKey = JSON.stringify(state.joints);
    if (jointsKey !== this.jointsKey) {
      for (const joint of doc.allJoints()) doc.removeJoint(joint.id);
      for (const joint of state.joints) doc.addJoint(cloneJoint(joint));
      this.jointsKey = jointsKey;
    }
    const posesKey = JSON.stringify(state.poses);
    if (posesKey !== this.posesKey) {
      for (const pose of doc.allPoses()) doc.removePose(pose.id);
      for (const pose of state.poses) doc.addPose(structuredClone(pose));
      this.posesKey = posesKey;
    }
  }

  private addStroke(stroke: StrokeJson): void {
    // the document owns (and may mutate) its strokes: give it copies
    this.doc.addStroke(strokeFromJson(structuredClone(stroke)));
    this.shown.set(stroke.id, stroke);
  }
}
