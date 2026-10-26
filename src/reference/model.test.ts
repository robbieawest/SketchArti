import { describe, expect, it } from "vitest";
import { rigidApplyPoint } from "../core/rigid";
import {
  animatedValue,
  jointRange,
  partTransforms,
  validateModel,
  type ReferenceModel,
} from "./model";

// base → arm (revolute about +z at x=1) → slider (prismatic along the arm)
const model: ReferenceModel = {
  name: "test",
  parts: [
    { id: "base", name: "Base", primitive: { type: "box", size: [1, 1, 1] } },
    { id: "arm", name: "Arm", primitive: { type: "box", size: [2, 0.2, 0.2] } },
    { id: "slider", name: "Slider", primitive: { type: "box", size: [0.3, 0.3, 0.3] } },
  ],
  joints: [
    {
      id: "hinge",
      type: "revolute",
      parent: "base",
      child: "arm",
      origin: [1, 0, 0],
      axis: [0, 0, 2], // normalized on use
      limit: [0, Math.PI / 2],
    },
    {
      id: "slide",
      type: "prismatic",
      parent: "arm",
      child: "slider",
      origin: [2, 0, 0],
      axis: [1, 0, 0],
      limit: [0, 0.5],
    },
  ],
};

const close = (a: { x: number; y: number; z: number }, b: number[]) => {
  expect(a.x).toBeCloseTo(b[0]);
  expect(a.y).toBeCloseTo(b[1]);
  expect(a.z).toBeCloseTo(b[2]);
};

describe("reference model kinematics", () => {
  it("leaves everything at rest for an empty pose", () => {
    const transforms = partTransforms(model, {});
    close(rigidApplyPoint(transforms.get("slider")!, { x: 3, y: 0, z: 0 }), [3, 0, 0]);
  });

  it("composes child motion on top of the parent's", () => {
    const transforms = partTransforms(model, { hinge: Math.PI / 2, slide: 0.5 });
    // the arm's tip (x=3) swings about (1,0,0) to (1,2,0)
    close(rigidApplyPoint(transforms.get("arm")!, { x: 3, y: 0, z: 0 }), [1, 2, 0]);
    // the slider slides 0.5 along the arm first, then swings with it
    close(rigidApplyPoint(transforms.get("slider")!, { x: 3, y: 0, z: 0 }), [1, 2.5, 0]);
    close(rigidApplyPoint(transforms.get("base")!, { x: 0, y: 0, z: 0 }), [0, 0, 0]);
  });

  it("survives cycles", () => {
    const cyclic: ReferenceModel = {
      ...model,
      joints: [
        ...model.joints,
        { id: "back", type: "revolute", parent: "slider", child: "base", origin: [0, 0, 0], axis: [0, 1, 0] },
      ],
    };
    expect(partTransforms(cyclic, { hinge: 1, slide: 0.1, back: 1 }).size).toBe(3);
  });

  it("animates within range", () => {
    const hinge = model.joints[0];
    for (let t = 0; t < 8; t += 0.37) {
      const v = animatedValue(hinge, 0, t);
      const [lo, hi] = jointRange(hinge);
      expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(v).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it("validates references", () => {
    expect(() => validateModel({ parts: [], joints: [] })).not.toThrow();
    expect(() =>
      validateModel({ ...model, joints: [{ ...model.joints[0], child: "nope" }] }),
    ).toThrow(/missing part/);
  });
});

describe("bundled models", () => {
  it("every model in public/models validates", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "../../public/models");
    const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
    expect(index.models.length).toBeGreaterThan(0);
    for (const entry of index.models) {
      const model = JSON.parse(readFileSync(join(root, entry.path), "utf8"));
      expect(() => validateModel(model)).not.toThrow();
    }
  });
});
