import { describe, expect, it } from "vitest";
import { SketchDocument } from "../core/SketchDocument";
import { serializeDocument } from "../core/serialization";
import {
  UndoStack,
  addJointCommand,
  addStrokeCommand,
  collapseCommand,
  removeStrokeCommand,
  setStrokeTransformCommand,
  setStrokesPartCommand,
} from "../core/undo";
import type { Joint, Stroke } from "../core/types";
import { identityTransform, lockedDofs, newStrokeId } from "../core/types";
import { OpRecorder, replayActions } from "./opLog";
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

/** Wire a document, undo stack and recorder the way the editor does. */
function setup() {
  const doc = new SketchDocument();
  const undo = new UndoStack();
  const actions: OpAction[] = [];
  const recorder = new OpRecorder(doc, actions, () => "sketching", () => 0);
  undo.onAction = (kind, command) => recorder.flush(kind, command.label);
  // after every action the replay must land exactly on the live document
  const check = () =>
    expect(replayActions(actions)).toEqual(
      JSON.parse(JSON.stringify(serializeDocument(doc))),
    );
  return { doc, undo, actions, recorder, check };
}

describe("OpRecorder + replayActions", () => {
  it("replays strokes, transforms, undo and redo exactly", () => {
    const { doc, undo, actions, check } = setup();
    const a = makeStroke(0);
    const b = makeStroke(5);
    undo.push(addStrokeCommand(doc, a));
    check();
    undo.push(addStrokeCommand(doc, b));
    const moved = identityTransform();
    moved.position.x = 3;
    undo.push(setStrokeTransformCommand(doc, a.id, moved));
    check();
    undo.undo();
    check();
    undo.redo();
    check();
    undo.push(removeStrokeCommand(doc, b.id));
    check();
    undo.undo(); // re-adds b
    check();
    expect(actions.map((x) => x.kind)).toEqual([
      "push",
      "push",
      "push",
      "undo",
      "redo",
      "push",
      "undo",
    ]);
    expect(actions[2].label).toBe("Transform stroke");
  });

  it("records direct edits, segmentation, joints and explode", () => {
    const { doc, undo, recorder, check } = setup();
    const a = makeStroke(0);
    const b = makeStroke(5);
    undo.push(addStrokeCommand(doc, a));
    undo.push(addStrokeCommand(doc, b));
    doc.addPart({ id: "p1", name: "Part 1" });
    doc.addPart({ id: "p2", name: "Part 2" });
    recorder.flush("edit", "Add parts");
    check();
    undo.push(
      setStrokesPartCommand(doc, [
        { strokeId: a.id, after: "p1" },
        { strokeId: b.id, after: "p2" },
      ]),
    );
    check();
    const joint: Joint = {
      id: "j1",
      name: "Joint 1",
      parentPartId: "p1",
      childPartId: "p2",
      pivot: { x: 1, y: 0, z: 0 },
      axis: { x: 0, y: 1, z: 0 },
      dofs: lockedDofs(),
    };
    undo.push(addJointCommand(doc, joint));
    check();
    // explode by hand the way the tool's command would, then collapse
    doc.setPartExplodeOffset("p2", { x: 2, y: 0, z: 0 });
    const shifted = identityTransform();
    shifted.position.x = 2;
    doc.setStrokeTransform(b.id, shifted);
    doc.setExploded(true);
    recorder.flush("edit", "Explode");
    check();
    undo.push(collapseCommand(doc));
    check();
    doc.removePart("p1"); // takes the joint with it
    recorder.flush("edit", "Remove part");
    check();
  });

  it("collapses a live drag into the command pushed at release", () => {
    const { doc, undo, actions, check } = setup();
    const a = makeStroke();
    undo.push(addStrokeCommand(doc, a));
    for (let i = 1; i <= 50; i++) {
      const t = identityTransform();
      t.position.y = i / 10;
      doc.setStrokeTransform(a.id, t); // live preview during the drag
    }
    const final = identityTransform();
    final.position.y = 5;
    undo.push(setStrokeTransformCommand(doc, a.id, final));
    expect(actions).toHaveLength(2);
    expect(actions[1].ops).toHaveLength(1);
    check();
  });

  it("replays partially to show the sketch mid-session", () => {
    const { doc, undo, actions } = setup();
    undo.push(addStrokeCommand(doc, makeStroke(0)));
    undo.push(addStrokeCommand(doc, makeStroke(5)));
    undo.push(addStrokeCommand(doc, makeStroke(9)));
    expect(replayActions(actions, 0).strokes).toHaveLength(0);
    expect(replayActions(actions, 2).strokes).toHaveLength(2);
  });

  it("resumes on top of a loaded document", () => {
    const { doc, undo, actions } = setup();
    undo.push(addStrokeCommand(doc, makeStroke(0)));
    // reload: a fresh document from the saved JSON, recorder appends to
    // the same action list
    const saved = serializeDocument(doc);
    const doc2 = new SketchDocument();
    for (const s of saved.strokes) {
      doc2.addStroke({
        ...s,
        points: new Float32Array(s.points),
        pressure: new Float32Array(s.pressure),
      });
    }
    const undo2 = new UndoStack();
    const recorder2 = new OpRecorder(doc2, actions, () => "sketching", () => 0);
    undo2.onAction = (kind, command) => recorder2.flush(kind, command.label);
    undo2.push(addStrokeCommand(doc2, makeStroke(5)));
    expect(replayActions(actions)).toEqual(
      JSON.parse(JSON.stringify(serializeDocument(doc2))),
    );
  });
});
