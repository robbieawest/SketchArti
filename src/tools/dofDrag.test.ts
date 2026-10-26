import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DofDrag } from "./dofDrag";

const size = new THREE.Vector2(800, 600);

function camera(position: THREE.Vector3) {
  const cam = new THREE.PerspectiveCamera(45, size.x / size.y, 0.1, 100);
  cam.position.copy(position);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/** Ray + pixel position for a world point, as the tool would see a cursor
 *  hovering over it. */
function cursorAt(cam: THREE.Camera, world: THREE.Vector3) {
  const ndc = world.clone().project(cam);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
  const px = new THREE.Vector2(((ndc.x + 1) / 2) * size.x, ((1 - ndc.y) / 2) * size.y);
  return { ray: raycaster.ray.clone(), px };
}

/** Circle the cursor around the pivot on screen; returns the values seen. */
function circle(drag: DofDrag, cam: THREE.Camera, turns: number, ccw = true) {
  const center = cursorAt(cam, new THREE.Vector3()).px;
  const at = (a: number) => {
    const px = new THREE.Vector2(center.x + 80 * Math.cos(a), center.y - 80 * Math.sin(a));
    return { ray: new THREE.Ray(), px };
  };
  const start = at(0);
  drag.begin(start.ray, start.px);
  const values: number[] = [];
  const steps = Math.round(32 * turns);
  for (let i = 1; i <= steps; i++) {
    const a = ((ccw ? 1 : -1) * i * 2 * Math.PI) / 32;
    const c = at(a);
    values.push(drag.update(c.ray, c.px));
  }
  return values;
}

describe("DofDrag knob", () => {
  it("turns once per screen circle, smoothly, when the axis faces the viewer", () => {
    const cam = camera(new THREE.Vector3(0, 0, 10));
    const drag = new DofDrag("rotate", new THREE.Vector3(), new THREE.Vector3(0, 0, 1), cam, size);
    const values = circle(drag, cam, 2);
    expect(values[7]).toBeCloseTo(Math.PI / 2, 5); // quarter circle
    expect(values[values.length - 1]).toBeCloseTo(4 * Math.PI, 5); // two turns
    // monotonic: no chopping back and forth
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it("reverses when the axis points away from the viewer", () => {
    const cam = camera(new THREE.Vector3(0, 0, 10));
    const drag = new DofDrag("rotate", new THREE.Vector3(), new THREE.Vector3(0, 0, -1), cam, size);
    const values = circle(drag, cam, 1);
    expect(values[values.length - 1]).toBeCloseTo(-2 * Math.PI, 5);
  });

  it("stays monotonic for an oblique axis", () => {
    const cam = camera(new THREE.Vector3(6, 4, 7));
    const drag = new DofDrag("rotate", new THREE.Vector3(), new THREE.Vector3(1, 0, 0), cam, size);
    const values = circle(drag, cam, 1, false);
    for (let i = 1; i < values.length; i++) {
      expect(Math.sign(values[i] - values[i - 1])).toBe(Math.sign(values[1] - values[0]));
    }
    expect(Math.abs(values[values.length - 1])).toBeCloseTo(2 * Math.PI, 5);
  });

  it("holds still while the cursor crosses the pivot", () => {
    const cam = camera(new THREE.Vector3(0, 0, 10));
    const drag = new DofDrag("rotate", new THREE.Vector3(), new THREE.Vector3(0, 0, 1), cam, size);
    const center = cursorAt(cam, new THREE.Vector3()).px;
    drag.begin(new THREE.Ray(), center.clone().add(new THREE.Vector2(50, 0)));
    expect(drag.update(new THREE.Ray(), center.clone().add(new THREE.Vector2(2, 1)))).toBe(0);
  });
});

describe("DofDrag slide", () => {
  it("keeps the axis point under the cursor", () => {
    const cam = camera(new THREE.Vector3(3, 4, 10));
    const drag = new DofDrag("translate", new THREE.Vector3(), new THREE.Vector3(1, 0, 0), cam, size);
    const start = cursorAt(cam, new THREE.Vector3(0, 0, 0));
    drag.begin(start.ray, start.px);
    const c = cursorAt(cam, new THREE.Vector3(0.7, 0, 0));
    expect(drag.update(c.ray, c.px)).toBeCloseTo(0.7, 5);
  });

  it("falls back to screen motion when the axis points at the camera", () => {
    const cam = camera(new THREE.Vector3(0, 0, 10));
    const drag = new DofDrag("translate", new THREE.Vector3(), new THREE.Vector3(0, 0, 1), cam, size);
    const start = cursorAt(cam, new THREE.Vector3());
    drag.begin(start.ray, start.px);
    const c = cursorAt(cam, new THREE.Vector3(0, 0.5, 0));
    expect(Number.isFinite(drag.update(c.ray, c.px))).toBe(true);
  });
});
