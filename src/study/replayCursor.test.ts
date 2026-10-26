import { describe, expect, it } from "vitest";
import { SketchDocument } from "../core/SketchDocument";
import { serializeDocument } from "../core/serialization";
import {
  UndoStack,
  addStrokeCommand,
  removeStrokeCommand,
  setStrokeTransformCommand,
  setStrokesPartCommand,
} from "../core/undo";
import type { Stroke } from "../core/types";
import { identityTransform, newStrokeId } from "../core/types";
import { OpRecorder, replayActions } from "./opLog";
import { DocumentMirror, ReplayCursor, actionsUntil, stateToDocument } from "./replayCursor";
import type { OpAction } from "./types";

function makeStroke(x = 0): Stroke {
  return {
    id: newStrokeId(),
    points: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 2, 1, 0]),
    pressure: new Float32Array([0, 0, 0]),
    style: { visible: true, color: "#1c1c1e", width: 0.016 },
    fill: { visible: false, color: "#1c1c1e" },
    transform: identityTransform(),
    surface: { shape: "plane", transform: identityTransform() },
  };
}

/** A session with 150 actions: strokes added, moved, parted, removed. */
function recordSession(): OpAction[] {
  const doc = new SketchDocument();
  const undo = new UndoStack(1000);
  const actions: OpAction[] = [];
  let t = 0;
  const recorder = new OpRecorder(doc, actions, () => "sketching", () => t++);
  undo.onAction = (kind, command) => recorder.flush(kind, command.label);
  const ids: string[] = [];
  for (let i = 0; i < 100; i++) {
    const stroke = makeStroke(i);
    ids.push(stroke.id);
    undo.push(addStrokeCommand(doc, stroke));
  }
  doc.addPart({ id: "p1", name: "Part 1" });
  recorder.flush("edit", "Add part");
  undo.push(
    setStrokesPartCommand(doc, ids.slice(0, 10).map((strokeId) => ({ strokeId, after: "p1" }))),
  );
  for (let i = 0; i < 30; i++) {
    const moved = identityTransform();
    moved.position.x = i;
    undo.push(setStrokeTransformCommand(doc, ids[i], moved));
  }
  for (let i = 0; i < 10; i++) undo.push(removeStrokeCommand(doc, ids[50 + i]));
  undo.undo();
  undo.undo();
  return actions;
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const byId = (doc: { strokes: { id: string }[] }) => ({
  ...doc,
  strokes: [...doc.strokes].sort((a, b) => a.id.localeCompare(b.id)),
});

describe("ReplayCursor", () => {
  it("matches replayActions at every count, seeking in any order", () => {
    const actions = recordSession();
    const cursor = new ReplayCursor(actions);
    const counts = [actions.length, 0, 7, 140, 64, 63, 65, 1, 130, actions.length, 100];
    for (const n of counts) {
      expect(byId(plain(cursor.document(n)))).toEqual(byId(plain(replayActions(actions, n))));
    }
  });

  it("finds how many actions happened by a time", () => {
    const actions = [{ t: 10 }, { t: 20 }, { t: 20 }, { t: 30 }] as OpAction[];
    expect(actionsUntil(actions, 5)).toBe(0);
    expect(actionsUntil(actions, 20)).toBe(3);
    expect(actionsUntil(actions, 99)).toBe(4);
  });
});

describe("DocumentMirror", () => {
  it("keeps a live document equal to the replay while scrubbing", () => {
    const actions = recordSession();
    const cursor = new ReplayCursor(actions);
    const doc = new SketchDocument();
    const mirror = new DocumentMirror(doc);
    for (const n of [actions.length, 50, 101, 102, 120, 140, 3, actions.length]) {
      mirror.show(cursor.seek(n));
      expect(byId(plain(serializeDocument(doc)))).toEqual(
        byId(plain(stateToDocument(cursor.seek(n)))),
      );
    }
  });

  it("rebuilds after the document was edited elsewhere", () => {
    const actions = recordSession();
    const cursor = new ReplayCursor(actions);
    const doc = new SketchDocument();
    const mirror = new DocumentMirror(doc);
    mirror.show(cursor.seek(20));
    doc.addStroke(makeStroke(99)); // a viewer edit
    mirror.show(cursor.seek(21));
    expect(doc.strokeCount).toBe(21);
  });
});
