// The reference model format the left-hand viewer reads, and its forward
// kinematics. Pure TypeScript (no three.js), like core.
//
// Deliberately URDF-shaped so dataset converters (Artiverse, Arti10K…) are a
// straight mapping: part meshes are given in world space at rest, and each
// joint names a parent and child part, a type, an origin + axis (world space
// at rest) and a limit.
//
// Layout on disk, under public/models/:
//   index.json              { "models": ModelIndexEntry[] }
//   <id>/model.json         ReferenceModel (mesh/thumbnail paths relative
//                           to this file)
//   <id>/LICENSE.txt        licence + attribution, shipped with the model

import {
  identityRigid,
  rigidFromAxisAngleAt,
  rigidFromTranslation,
  rigidMultiply,
  type RigidTransform,
} from "../core/rigid";
import type { Vec3 } from "../core/types";

export type Vec3Tuple = [number, number, number];

export interface ModelIndexEntry {
  id: string;
  name: string;
  /** Path of model.json, relative to models/index.json. */
  path: string;
  /** Picker image, relative to models/index.json. */
  thumbnail?: string;
  description?: string;
  /** A model to try the tools on first, listed apart from the study ones. */
  practice?: boolean;
}

export type PartPrimitive =
  | { type: "box"; size: Vec3Tuple }
  | { type: "cylinder"; radius: number; height: number; axis?: "x" | "y" | "z" };

export interface ReferencePart {
  id: string;
  name: string;
  /** .glb/.gltf/.obj, relative to model.json, world space at rest. */
  mesh?: string;
  /** Placeholder geometry for models without meshes (development). With
   *  neither mesh nor primitive the part is an invisible connector. */
  primitive?: PartPrimitive;
  /** Offset applied to a primitive (meshes are already placed). */
  position?: Vec3Tuple;
  /** Overrides the palette colour. */
  color?: string;
}

export type ReferenceJointType = "revolute" | "continuous" | "prismatic" | "fixed";

export interface ReferenceJoint {
  id: string;
  name?: string;
  type: ReferenceJointType;
  parent: string;
  child: string;
  /** A point on the axis, world space at rest. */
  origin: Vec3Tuple;
  /** Axis direction (normalized on load), world space at rest. */
  axis: Vec3Tuple;
  /** [lower, upper]: radians for revolute, world units for prismatic. */
  limit?: [number, number];
}

export interface ReferenceModel {
  name: string;
  /** Licence file, relative to model.json. */
  license?: string;
  attribution?: string;
  parts: ReferencePart[];
  joints: ReferenceJoint[];
}

/** Joint values by joint id; missing joints sit at 0 (rest). */
export type ReferencePose = Record<string, number>;

export function toVec3([x, y, z]: Vec3Tuple): Vec3 {
  return { x, y, z };
}

function normalize(v: Vec3Tuple): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return { x: v[0] / length, y: v[1] / length, z: v[2] / length };
}

/** The value range a joint can be driven through by sliders/animation. */
export function jointRange(joint: ReferenceJoint): [number, number] {
  if (joint.type === "fixed") return [0, 0];
  if (joint.type === "continuous") return [-Math.PI, Math.PI];
  if (joint.limit) return [joint.limit[0], joint.limit[1]];
  // unlimited revolute/prismatic: a sensible display sweep
  return joint.type === "revolute" ? [-Math.PI / 2, Math.PI / 2] : [0, 0.1];
}

export function movableJoints(model: ReferenceModel): ReferenceJoint[] {
  return model.joints.filter((joint) => joint.type !== "fixed");
}

/** The motion a joint contributes in its parent's (rest) frame. */
export function jointMotion(joint: ReferenceJoint, value: number): RigidTransform {
  const axis = normalize(joint.axis);
  switch (joint.type) {
    case "revolute":
    case "continuous":
      return rigidFromAxisAngleAt(axis, value, toVec3(joint.origin));
    case "prismatic":
      return rigidFromTranslation({
        x: axis.x * value,
        y: axis.y * value,
        z: axis.z * value,
      });
    case "fixed":
      return identityRigid();
  }
}

/**
 * World transform of every part (relative to its rest placement) for a
 * pose: a child moves by its parent's transform composed with its own
 * joint's motion. Parts no joint drives are roots and stay put. A part
 * driven by more than one joint keeps the first; cycles are cut.
 */
export function partTransforms(
  model: ReferenceModel,
  pose: ReferencePose,
): Map<string, RigidTransform> {
  const driver = new Map<string, ReferenceJoint>();
  for (const joint of model.joints) {
    if (!driver.has(joint.child)) driver.set(joint.child, joint);
  }
  const result = new Map<string, RigidTransform>();
  const visiting = new Set<string>();

  const resolve = (partId: string): RigidTransform => {
    const known = result.get(partId);
    if (known) return known;
    const joint = driver.get(partId);
    let transform = identityRigid();
    if (joint && !visiting.has(partId)) {
      visiting.add(partId);
      transform = rigidMultiply(
        resolve(joint.parent),
        jointMotion(joint, pose[joint.id] ?? 0),
      );
      visiting.delete(partId);
    }
    result.set(partId, transform);
    return transform;
  };

  for (const part of model.parts) resolve(part.id);
  return result;
}

/** Joint value at time `seconds` of the play-all animation: limited joints
 *  ease back and forth across their range, continuous ones spin, all in
 *  step so the whole object moves at once. */
export function animatedValue(
  joint: ReferenceJoint,
  seconds: number,
  period = 4,
): number {
  if (joint.type === "fixed") return 0;
  const phase = seconds / period;
  if (joint.type === "continuous") {
    const angle = (phase % 1) * 2 * Math.PI;
    return angle > Math.PI ? angle - 2 * Math.PI : angle;
  }
  const [lo, hi] = jointRange(joint);
  return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase));
}

/** Light validation of a fetched model.json; throws with a readable
 *  message rather than failing later inside the renderer. */
export function validateModel(data: unknown): ReferenceModel {
  const model = data as ReferenceModel;
  if (!model || !Array.isArray(model.parts) || !Array.isArray(model.joints)) {
    throw new Error("model.json needs `parts` and `joints` arrays");
  }
  // parts need no geometry: one with neither mesh nor primitive is a bare
  // connector (a URDF link with no visual, e.g. the slide stage between a
  // chair base and its swivel) that moves its children but draws nothing
  const ids = new Set(model.parts.map((p) => p.id));
  for (const joint of model.joints) {
    if (!ids.has(joint.parent) || !ids.has(joint.child)) {
      throw new Error(`joint ${joint.id} references a missing part`);
    }
  }
  return model;
}
