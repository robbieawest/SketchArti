import * as THREE from "three";

/** Cursor positions closer than this to the pivot on screen give an
 *  unreliable angle, so knob updates pause there. */
const KNOB_DEADZONE_PX = 12;

/**
 * Maps a pointer drag onto one joint degree of freedom, for grabbing a part
 * and moving it through its motion directly.
 *
 * - Rotation is a knob: the cursor's angle around the pivot *as seen on
 *   screen*. Circling the pivot once turns the part once, whatever the view;
 *   the angle is unwrapped frame to frame so it keeps counting past half a
 *   turn. Whether clockwise on screen is a positive or negative turn depends
 *   on whether the axis points toward or away from the viewer, decided once
 *   at the start of the drag so it can't flip mid-gesture.
 * - Translation is the point on the axis line closest to the cursor ray —
 *   the part stays under the cursor. When the axis points almost straight at
 *   the camera, cursor travel along the axis's projected direction is used
 *   instead.
 */
export class DofDrag {
  private value = 0;
  private prevAngle = 0;
  private angleValid = false;
  private sign = 1;
  private startT = 0;
  private mode: "knob" | "line" | "screen" = "knob";
  private readonly pivotPx = new THREE.Vector2();
  private readonly downPx = new THREE.Vector2();
  /** Screen pixels moved per unit of value (screen mode). */
  private readonly pxPerUnit = new THREE.Vector2();

  constructor(
    private readonly kind: "rotate" | "translate",
    private readonly pivot: THREE.Vector3,
    private readonly axis: THREE.Vector3,
    private readonly camera: THREE.Camera,
    /** Canvas size in CSS pixels. */
    private readonly viewSize: THREE.Vector2,
  ) {
    this.axis.normalize();
  }

  /** Start at the cursor; the value is 0 here. */
  begin(ray: THREE.Ray, cursorPx: THREE.Vector2): void {
    this.value = 0;
    this.downPx.copy(cursorPx);
    if (this.kind === "rotate") {
      this.mode = "knob";
      this.pivotPx.copy(this.toPx(this.pivot));
      // axis toward the viewer: counterclockwise on screen is a positive
      // (right-handed) turn; axis away from the viewer: clockwise is
      const forward = this.camera.getWorldDirection(new THREE.Vector3());
      this.sign = this.axis.dot(forward) <= 0 ? 1 : -1;
      const angle = this.knobAngle(cursorPx);
      this.angleValid = angle !== undefined;
      this.prevAngle = angle ?? 0;
      return;
    }
    const facing = Math.abs(ray.direction.dot(this.axis));
    if (1 - facing * facing > 0.05) {
      this.mode = "line";
      this.startT = this.lineParameter(ray);
      return;
    }
    this.mode = "screen";
    const a = this.toPx(this.pivot);
    const step = 0.01;
    const b = this.toPx(this.pivot.clone().addScaledVector(this.axis, step));
    this.pxPerUnit.subVectors(b, a).divideScalar(step);
  }

  /** The DoF value for the cursor now, relative to `begin`. */
  update(ray: THREE.Ray, cursorPx: THREE.Vector2): number {
    switch (this.mode) {
      case "knob": {
        const angle = this.knobAngle(cursorPx);
        if (angle === undefined) break; // in the deadzone: hold
        if (!this.angleValid) {
          // started on the pivot: begin counting from here
          this.prevAngle = angle;
          this.angleValid = true;
          break;
        }
        let delta = angle - this.prevAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        this.value += this.sign * delta;
        this.prevAngle = angle;
        break;
      }
      case "line":
        this.value = this.lineParameter(ray) - this.startT;
        break;
      case "screen": {
        const moved = new THREE.Vector2().subVectors(cursorPx, this.downPx);
        const rate = this.pxPerUnit.lengthSq();
        this.value = rate > 1e-9 ? moved.dot(this.pxPerUnit) / rate : 0;
        break;
      }
    }
    return this.value;
  }

  /** Counterclockwise screen angle of the cursor around the pivot. */
  private knobAngle(cursorPx: THREE.Vector2): number | undefined {
    const dx = cursorPx.x - this.pivotPx.x;
    const dy = cursorPx.y - this.pivotPx.y;
    if (Math.hypot(dx, dy) < KNOB_DEADZONE_PX) return undefined;
    return Math.atan2(-dy, dx); // screen y grows downward
  }

  /** Parameter t of the point pivot + t·axis closest to the ray. */
  private lineParameter(ray: THREE.Ray): number {
    const w = new THREE.Vector3().subVectors(ray.origin, this.pivot);
    const ad = this.axis.dot(ray.direction);
    const denom = 1 - ad * ad;
    if (denom < 1e-9) return 0;
    return (w.dot(this.axis) - w.dot(ray.direction) * ad) / denom;
  }

  private toPx(point: THREE.Vector3): THREE.Vector2 {
    const ndc = point.clone().project(this.camera);
    return new THREE.Vector2(
      ((ndc.x + 1) / 2) * this.viewSize.x,
      ((1 - ndc.y) / 2) * this.viewSize.y,
    );
  }
}
