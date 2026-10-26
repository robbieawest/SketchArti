import { describe, expect, it } from "vitest";
import { recenterPoints } from "./geometry";

describe("recenterPoints", () => {
  it("moves the bounding-box center to the origin", () => {
    const { points, center } = recenterPoints(
      new Float32Array([1, 2, 3, 3, 6, 5]),
    );
    expect(center).toEqual({ x: 2, y: 4, z: 4 });
    expect(Array.from(points)).toEqual([-1, -2, -1, 1, 2, 1]);
  });

  it("handles empty input", () => {
    const { points, center } = recenterPoints(new Float32Array([]));
    expect(points.length).toBe(0);
    expect(center).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("strokesBounds", () => {
  it("applies stroke transforms to the points", async () => {
    const { strokesBounds, strokesRadius } = await import("./geometry");
    const { identityTransform } = await import("./types");
    const transform = identityTransform();
    transform.position = { x: 10, y: 0, z: 0 };
    transform.scale = { x: 2, y: 2, z: 2 };
    const stroke = {
      id: "s",
      points: new Float32Array([-1, 0, 0, 0, 0, 0, 1, 0, 0]),
      pressure: new Float32Array(3),
      style: { visible: true, color: "#000", width: 0.01 },
      fill: { visible: false, color: "#000" },
      transform,
      surface: { shape: "plane" as const, transform: identityTransform() },
    };
    const bounds = strokesBounds([stroke], 1)!;
    expect(bounds.min.x).toBeCloseTo(8);
    expect(bounds.max.x).toBeCloseTo(12);
    expect(strokesRadius([stroke])).toBeCloseTo(2);
    expect(strokesBounds([])).toBeUndefined();
  });
});
