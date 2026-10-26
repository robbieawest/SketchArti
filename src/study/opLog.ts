import type { DocumentEvent, SketchDocument } from "../core/SketchDocument";
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  type DocumentJson,
} from "../core/serialization";
import { cloneJoint, cloneTransform, type Stroke } from "../core/types";
import type { DocOp, OpAction, StrokeJson, StudyMode } from "./types";

/**
 * Records the document deltas behind every edit, for session replay.
 *
 * Document events are buffered and flushed as one action: at each undo-stack
 * push/undo/redo (labelled with the command), or as an unlabelled "edit"
 * after a quiet spell for changes made outside the stack (adding a part,
 * saving a pose). Tools that move strokes live during a drag and push the
 * command at release therefore produce one action, not hundreds.
 *
 * Within a flush, entries are deduplicated and serialized from the
 * document's state *at flush time*. Every op carries absolute state, so
 * replaying them in order still lands exactly on the document as it stood.
 */
export class OpRecorder {
  private pending: { key: string; build: () => DocOp }[] = [];
  private pendingKeys = new Set<string>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly doc: SketchDocument,
    private readonly actions: OpAction[],
    private readonly mode: () => StudyMode,
    private readonly now: () => number = Date.now,
  ) {
    this.unsubscribe = doc.subscribe((event) => this.onEvent(event));
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Emit buffered changes as one action. Empty buffers record nothing,
   *  except for undo/redo, which are worth seeing even when they no-op. */
  flush(kind: OpAction["kind"], label: string): void {
    if (this.pending.length === 0 && kind !== "undo" && kind !== "redo") return;
    const ops = this.pending.map((entry) => entry.build());
    this.pending = [];
    this.pendingKeys.clear();
    this.actions.push({ t: this.now(), kind, label, mode: this.mode(), ops });
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onEvent(event: DocumentEvent): void {
    const doc = this.doc;
    switch (event.type) {
      case "strokeAdded": {
        const id = event.stroke.id;
        // a re-add after removal must come after that removal
        this.enqueue(`add:${id}:${this.pending.length}`, () => {
          const stroke = doc.getStroke(id) ?? event.stroke;
          return { op: "addStroke", stroke: strokeToJson(stroke) };
        });
        break;
      }
      case "strokeRemoved": {
        const id = event.stroke.id;
        this.enqueue(`remove:${id}:${this.pending.length}`, () => ({
          op: "removeStroke",
          id,
        }));
        break;
      }
      case "strokeChanged": {
        const id = event.stroke.id;
        this.enqueue(`set:${id}`, () => {
          const stroke = doc.getStroke(id) ?? event.stroke;
          return {
            op: "setStroke",
            id,
            transform: cloneTransform(stroke.transform),
            ...(stroke.partId !== undefined && { partId: stroke.partId }),
          };
        });
        break;
      }
      case "partsChanged":
        this.enqueue("parts", () => ({
          op: "parts",
          parts: doc.allParts().map((p) => ({
            ...p,
            ...(p.explodeOffset && { explodeOffset: { ...p.explodeOffset } }),
          })),
          exploded: doc.exploded,
        }));
        break;
      case "jointsChanged":
        this.enqueue("joints", () => ({
          op: "joints",
          joints: doc.allJoints().map(cloneJoint),
        }));
        break;
      case "posesChanged":
        this.enqueue("poses", () => ({
          op: "poses",
          poses: doc.allPoses().map((p) => ({ ...p, thumbnail: "" })),
        }));
        break;
      case "cleared":
        this.pending = [];
        this.pendingKeys.clear();
        this.enqueue("clear", () => ({ op: "clear" }));
        break;
    }
  }

  private enqueue(key: string, build: () => DocOp): void {
    if (this.pendingKeys.has(key)) return;
    this.pendingKeys.add(key);
    this.pending.push({ key, build });
  }
}

export function strokeToJson(stroke: Stroke): StrokeJson {
  return {
    id: stroke.id,
    points: Array.from(stroke.points),
    pressure: Array.from(stroke.pressure),
    style: { ...stroke.style },
    fill: { ...stroke.fill },
    transform: cloneTransform(stroke.transform),
    surface: {
      shape: stroke.surface.shape,
      transform: cloneTransform(stroke.surface.transform),
    },
    ...(stroke.partId !== undefined && { partId: stroke.partId }),
  };
}

/**
 * Rebuild the document after the first `count` actions (all by default).
 * Deliberately lenient — it works on plain JSON rather than through
 * SketchDocument, whose validation (e.g. a stroke's part must exist) would
 * reject the transient orderings a flush can contain.
 */
export function replayActions(
  actions: OpAction[],
  count = actions.length,
): DocumentJson {
  const strokes = new Map<string, StrokeJson>();
  let parts: DocumentJson["parts"] = [];
  let joints: DocumentJson["joints"] = [];
  let poses: DocumentJson["poses"] = [];
  let exploded = false;

  for (const action of actions.slice(0, count)) {
    for (const op of action.ops) {
      switch (op.op) {
        case "addStroke":
          strokes.set(op.stroke.id, structuredClone(op.stroke));
          break;
        case "removeStroke":
          strokes.delete(op.id);
          break;
        case "setStroke": {
          const stroke = strokes.get(op.id);
          if (!stroke) break;
          stroke.transform = structuredClone(op.transform);
          if (op.partId === undefined) delete stroke.partId;
          else stroke.partId = op.partId;
          break;
        }
        case "parts":
          parts = structuredClone(op.parts);
          exploded = op.exploded;
          break;
        case "joints":
          joints = structuredClone(op.joints);
          break;
        case "poses":
          poses = structuredClone(op.poses);
          break;
        case "clear":
          strokes.clear();
          parts = [];
          joints = [];
          poses = [];
          exploded = false;
          break;
      }
    }
  }

  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    parts,
    poses,
    joints,
    exploded,
    strokes: [...strokes.values()],
  };
}
