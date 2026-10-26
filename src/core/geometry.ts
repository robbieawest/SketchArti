import { rotateVec } from "./rigid";
import type { Stroke, Vec3 } from "./types";

/**
 * Rebase points (xyz triplets) so their bounding-box center becomes the
 * origin. Returns the shifted points and the center. Strokes are stored
 * local to their pivot; the pivot goes into `stroke.transform.position`
 * so selection/rotation later behaves sensibly.
 */
export function recenterPoints(points: Float32Array): {
  points: Float32Array;
  center: Vec3;
} {
  if (points.length === 0) {
    return { points, center: { x: 0, y: 0, z: 0 } };
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < points.length; i += 3) {
    min.x = Math.min(min.x, points[i]);
    min.y = Math.min(min.y, points[i + 1]);
    min.z = Math.min(min.z, points[i + 2]);
    max.x = Math.max(max.x, points[i]);
    max.y = Math.max(max.y, points[i + 1]);
    max.z = Math.max(max.z, points[i + 2]);
  }
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };

  const local = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    local[i] = points[i] - center.x;
    local[i + 1] = points[i + 1] - center.y;
    local[i + 2] = points[i + 2] - center.z;
  }
  return { points: local, center };
}

/** World-space bounding box of a set of strokes' actual points (every
 *  `stride`-th point, transforms applied). Undefined when there are none. */
export function strokesBounds(
  strokes: Stroke[],
  stride = 4,
): { min: Vec3; max: Vec3 } | undefined {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const stroke of strokes) {
    const { position: t, quaternion: q, scale: s } = stroke.transform;
    const n = stroke.points.length / 3;
    const indices: number[] = [];
    for (let i = 0; i < n; i += stride) indices.push(i);
    if (n > 0 && indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    for (const i of indices) {
      const p = rotateVec(q, {
        x: stroke.points[i * 3] * s.x,
        y: stroke.points[i * 3 + 1] * s.y,
        z: stroke.points[i * 3 + 2] * s.z,
      });
      const x = p.x + t.x;
      const y = p.y + t.y;
      const z = p.z + t.z;
      min.x = Math.min(min.x, x);
      min.y = Math.min(min.y, y);
      min.z = Math.min(min.z, z);
      max.x = Math.max(max.x, x);
      max.y = Math.max(max.y, y);
      max.z = Math.max(max.z, z);
    }
  }
  return min.x === Infinity ? undefined : { min, max };
}

/** Half the diagonal of the strokes' world bounding box (0 if empty). */
export function strokesRadius(strokes: Stroke[]): number {
  const bounds = strokesBounds(strokes);
  if (!bounds) return 0;
  const { min, max } = bounds;
  return Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
}
