import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SketchDocument } from "../core/SketchDocument";
import type { UndoStack } from "../core/undo";
import {
  articulateCommand,
  type JointValueChange,
  type StrokeTransformChange,
} from "../core/undo";
import type { Joint, JointDofName, Transform, Vec3 } from "../core/types";
import { JOINT_DOF_NAMES, cloneTransform, dofUnlocked } from "../core/types";
import {
  computePartDeltas,
  jointBasis,
  jointChainTo,
  partsInSubtree,
  poseFrom,
  solveIK,
  valuesOfPose,
  type JointPose,
  type JointValues,
} from "../core/articulation";
import {
  applyRigidToTransform,
  identityRigid,
  rigidApplyPoint,
  rigidInvert,
  rigidMultiply,
  rotateVec,
} from "../core/rigid";
import type { Viewport } from "../engine/Viewport";
import type { StrokeRenderer } from "../engine/StrokeRenderer";
import { pickStrokeAtCursor } from "../engine/picking";
import { JointAxisGuide } from "../engine/JointAxisGuide";
import { MotionGuide } from "../engine/motionGuide";
import { DofDrag } from "./dofDrag";

const ROTATIONAL_DOFS: JointDofName[] = ["twist", "swingU", "swingV"];

/**
 * Grab a part and move it along the screw joint that drives it (the nearest
 * joint up its chain with a free DoF). The part is dragged directly: turning
 * works like a knob around the pivot, sliding keeps the part under the
 * cursor (`DofDrag`), clamped to the joint's range. A motion guide shows the
 * active DoF; R cycles the rotational DoFs and T picks the slide when the
 * joint has several. With IK enabled a free translation handle appears
 * instead and the whole joint chain from the root solves backwards (CCD) to
 * follow it.
 *
 * Strokes always hold absolute transforms; a drag re-derives every affected
 * stroke from its drag-start transform via Δ(values now) ∘ Δ(values at drag
 * start)⁻¹, so nothing accumulates across the drag, and one undoable
 * command records the whole motion at release.
 */
export class ArticulateTool {
  private partId: string | null = null;
  /** Joint driving the selected part (FK mode). */
  private joint: Joint | null = null;
  /** Root-first joint chain to the selected part (IK mode). */
  private chain: Joint[] = [];
  private ik = false;
  /** The DoF a direct drag drives (FK). */
  private activeDof: JointDofName | null = null;
  private guide?: MotionGuide;
  /** Direct FK drag in progress. */
  private knob: DofDrag | null = null;

  private proxy?: THREE.Object3D;
  private controls?: TransformControls;
  private axisGuide?: JointAxisGuide;
  private unsubscribe?: () => void;
  private guideFrame = 0;
  /** Joint values / affected stroke transforms captured at drag start. */
  private baselineValues: JointPose = new Map();
  private baselineTransforms = new Map<string, Transform>();
  /** Where the IK grab point rests in world rest space. */
  private ikRestPoint: Vec3 = { x: 0, y: 0, z: 0 };
  private dragging = false;
  /** Notified with the id of the joint whose gizmo is showing (null when
   *  nothing is selected), so the Articulations panel can highlight it. */
  onJointSelected?: (jointId: string | null) => void;

  constructor(
    private readonly viewport: Viewport,
    private readonly doc: SketchDocument,
    private readonly undo: UndoStack,
    private readonly strokeRenderer: StrokeRenderer,
  ) {}

  attach(): void {
    const dom = this.viewport.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    this.unsubscribe = this.doc.subscribe((event) => {
      if (event.type === "jointsChanged" || event.type === "partsChanged" || event.type === "cleared") {
        if (this.guideFrame) return;
        this.guideFrame = requestAnimationFrame(() => {
          this.guideFrame = 0;
          this.refreshAxisGuide();
        });
      }
    });
  }

  detach(): void {
    const dom = this.viewport.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    cancelAnimationFrame(this.guideFrame);
    this.guideFrame = 0;
    this.deselect();
  }

  setIkMode(on: boolean): void {
    if (this.ik === on) return;
    this.ik = on;
    // re-resolve the current selection under the new mode
    const partId = this.partId;
    this.deselect();
    if (partId) this.selectPart(partId);
  }

  suppressGizmo(on: boolean): void {
    if (this.guide) this.guide.visible = !on;
    if (!this.controls) return;
    this.controls.enabled = !on;
    this.controls.getHelper().visible = !on;
    this.viewport.invalidate();
  }

  deselect(): void {
    this.setHighlights(false);
    this.partId = null;
    this.joint = null;
    this.chain = [];
    this.destroyGizmo();
    this.onJointSelected?.(null);
    this.viewport.invalidate();
  }

  /** Select a joint from the Articulations panel: shows the gizmo on the
   *  part it drives, exactly as if that part had been clicked. */
  selectJoint(jointId: string): void {
    if (this.doc.exploded) return; // rest pivots don't apply while exploded
    const joint = this.doc.getJoint(jointId);
    if (!joint) return;
    this.deselect();
    this.selectPart(joint.childPartId);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.viewport.cameraOwnsPointer) return;
    if (this.controls && (this.controls.dragging || this.controls.axis)) {
      return; // IK handle
    }
    if (this.doc.exploded) return; // rest pivots don't apply while exploded
    const { ray, px, size } = this.cursor(event);
    const ndc = new THREE.Vector2((px.x / size.x) * 2 - 1, -(px.y / size.y) * 2 + 1);
    const hitId = pickStrokeAtCursor(ndc, this.viewport, this.doc, this.strokeRenderer);
    const partId = hitId ? this.doc.getStroke(hitId)?.partId : undefined;
    if (!partId) {
      this.deselect();
      return;
    }
    // FK: grabbing the selected part (or anything it carries) drags it
    // straight away; grabbing another part selects that one and drags it
    const carried =
      !this.ik &&
      this.joint &&
      partsInSubtree(this.doc.allJoints(), this.joint.childPartId).has(partId);
    if (!carried) {
      this.deselect();
      this.selectPart(partId);
    }
    if (!this.ik && this.joint && this.activeDof) this.beginKnob(event, ray, px, size);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.knob || !this.joint || !this.activeDof) return;
    const { ray, px } = this.cursor(event);
    const raw = this.knob.update(ray, px);
    const joint = this.joint;
    const dof = this.activeDof;
    const baseValue = this.baselineValues.get(joint.id)?.[dof] ?? 0;
    const value = Math.min(
      Math.max(baseValue + raw, joint.dofs[dof].range[0]),
      joint.dofs[dof].range[1],
    );
    const pose: JointPose = new Map();
    pose.set(joint.id, { ...this.baselineValues.get(joint.id)!, [dof]: value });
    this.applyPose(pose);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.knob) return;
    this.knob = null;
    this.viewport.renderer.domElement.releasePointerCapture?.(event.pointerId);
    this.onDragEnd();
  };

  private cursor(event: PointerEvent): {
    ray: THREE.Ray;
    px: THREE.Vector2;
    size: THREE.Vector2;
  } {
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    const px = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2((px.x / rect.width) * 2 - 1, -(px.y / rect.height) * 2 + 1),
      this.viewport.camera,
    );
    return { ray: raycaster.ray.clone(), px, size: new THREE.Vector2(rect.width, rect.height) };
  }

  /** Start a direct drag of the active DoF, measured about the joint as
   *  posed by its parent (pivot and axes ride on the parent part). */
  private beginKnob(
    event: PointerEvent,
    ray: THREE.Ray,
    px: THREE.Vector2,
    size: THREE.Vector2,
  ): void {
    const joint = this.joint!;
    const dof = this.activeDof!;
    const parentDelta =
      computePartDeltas(this.doc.allJoints()).get(joint.parentPartId) ?? identityRigid();
    const pivot = rigidApplyPoint(parentDelta, joint.pivot);
    const { u, v } = jointBasis(joint.axis);
    const restAxis = dof === "swingU" ? u : dof === "swingV" ? v : joint.axis;
    const axis = rotateVec(parentDelta.q, restAxis);
    this.knob = new DofDrag(
      dof === "translation" ? "translate" : "rotate",
      new THREE.Vector3(pivot.x, pivot.y, pivot.z),
      new THREE.Vector3(axis.x, axis.y, axis.z),
      this.viewport.camera,
      size,
    );
    this.knob.begin(ray, px);
    this.viewport.renderer.domElement.setPointerCapture?.(event.pointerId);
    this.captureBaseline();
    this.dragging = true;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName))
      return;
    if (event.code === "Escape") {
      this.deselect();
    } else if (!this.ik && this.joint && !this.dragging) {
      // T picks the slide, R cycles through the free rotations
      const joint = this.joint;
      if (event.code === "KeyT" && dofUnlocked(joint.dofs.translation)) {
        this.setActiveDof("translation");
      } else if (event.code === "KeyR") {
        const free = ROTATIONAL_DOFS.filter((d) => dofUnlocked(joint.dofs[d]));
        if (free.length === 0) return;
        const at = free.indexOf(this.activeDof as JointDofName);
        this.setActiveDof(free[(at + 1) % free.length]);
      }
    }
  };

  private setActiveDof(dof: JointDofName): void {
    if (dof === this.activeDof) return;
    this.activeDof = dof;
    this.rebuildGizmo();
  }

  private selectPart(partId: string): void {
    const joints = this.doc.allJoints();
    const unlocked = (j: Joint) => JOINT_DOF_NAMES.some((d) => dofUnlocked(j.dofs[d]));
    if (this.ik) {
      this.chain = jointChainTo(joints, partId).filter(unlocked);
      if (this.chain.length === 0) return;
    } else {
      // the nearest joint up the chain that can move: grabbing a part fixed
      // to a moving one moves that one
      const joint = [...jointChainTo(joints, partId)].reverse().find(unlocked);
      if (!joint) return;
      this.joint = joint;
      partId = joint.childPartId;
      this.activeDof =
        ROTATIONAL_DOFS.find((d) => dofUnlocked(joint.dofs[d])) ?? "translation";
    }
    this.partId = partId;
    this.setHighlights(true);
    this.buildGizmo();
    const driver = this.ik ? this.chain[this.chain.length - 1] : this.joint;
    this.onJointSelected?.(driver?.id ?? null);
  }

  private setHighlights(on: boolean): void {
    if (!this.partId) return;
    for (const stroke of this.doc.strokesInPart(this.partId)) {
      this.strokeRenderer.setHighlight(stroke.id, on, "part");
    }
  }

  // --- gizmo ---

  private rebuildGizmo(): void {
    this.destroyGizmo();
    this.buildGizmo();
  }

  private buildGizmo(): void {
    if (!this.partId) return;
    const deltas = computePartDeltas(this.doc.allJoints());

    this.proxy = new THREE.Object3D();
    if (this.ik) {
      const grab = this.partCentroid(this.partId);
      if (!grab) return;
      this.proxy.position.set(grab.x, grab.y, grab.z);
      const delta = deltas.get(this.partId) ?? identityRigid();
      this.ikRestPoint = rigidApplyPoint(rigidInvert(delta), grab);
    }
    this.viewport.scene.add(this.proxy);

    this.axisGuide = new JointAxisGuide(this.viewport.camera, this.viewport.renderer.domElement);
    this.viewport.scene.add(this.axisGuide);
    if (!this.ik) {
      // FK: no gizmo — the part itself is dragged; the guide shows how
      if (this.joint && this.activeDof) {
        this.guide = new MotionGuide(
          this.activeDof,
          this.viewport.camera,
          this.viewport.renderer.domElement,
        );
        this.viewport.scene.add(this.guide);
      }
      this.refreshAxisGuide();
      return;
    }

    this.controls = new TransformControls(
      this.viewport.camera,
      this.viewport.renderer.domElement,
    );
    this.controls.setSize(0.6);
    this.controls.setMode("translate");
    this.controls.addEventListener("change", () => this.viewport.invalidate());
    this.controls.addEventListener("objectChange", () => this.onGizmoChange());
    this.controls.addEventListener("dragging-changed", (event) => {
      if (event.value) {
        this.onDragStart();
      } else {
        this.onDragEnd();
      }
    });
    this.viewport.scene.add(this.controls.getHelper());
    this.controls.attach(this.proxy);
    this.refreshAxisGuide();
    this.viewport.invalidate();
  }

  private refreshAxisGuide(): void {
    if (!this.axisGuide) return;
    const driver = this.ik ? this.chain[this.chain.length - 1] : this.joint;
    const joint = driver ? this.doc.getJoint(driver.id) : undefined;
    if (!joint || this.doc.exploded) {
      this.deselect();
      return;
    }
    const deltas = computePartDeltas(this.doc.allJoints());
    const delta = deltas.get(joint.childPartId) ?? identityRigid();
    const pivot = rigidApplyPoint(delta, joint.pivot);
    this.axisGuide.position.set(pivot.x, pivot.y, pivot.z);
    this.axisGuide.quaternion.copy(posedJointFrame(joint, delta.q));
    if (this.guide) {
      // the motion guide sits in the frame the drag measures in: the joint
      // as carried by its parent
      const parent = deltas.get(joint.parentPartId) ?? identityRigid();
      const p = rigidApplyPoint(parent, joint.pivot);
      this.guide.position.set(p.x, p.y, p.z);
      this.guide.quaternion.copy(posedJointFrame(joint, parent.q));
    }
    // Reset/undo/redo can change the pose without going through a gizmo drag.
    // Keep the handle in sync too, but never move it underneath an active drag.
    if (this.proxy && !this.dragging) {
      if (this.ik && this.partId) {
        const grab = this.partCentroid(this.partId);
        if (grab) {
          this.proxy.position.set(grab.x, grab.y, grab.z);
          this.ikRestPoint = rigidApplyPoint(rigidInvert(deltas.get(this.partId) ?? identityRigid()), grab);
        }
      }
    }
    this.viewport.invalidate();
  }

  private destroyGizmo(): void {
    this.axisGuide?.dispose();
    this.axisGuide = undefined;
    this.guide?.dispose();
    this.guide = undefined;
    if (this.controls) {
      this.controls.detach();
      this.viewport.scene.remove(this.controls.getHelper());
      this.controls.dispose();
      this.controls = undefined;
    }
    if (this.proxy) {
      this.viewport.scene.remove(this.proxy);
      this.proxy = undefined;
    }
  }

  /** Mean of the part's (posed) stroke pivots — the IK grab point. */
  private partCentroid(partId: string): Vec3 | undefined {
    const strokes = this.doc.strokesInPart(partId);
    if (strokes.length === 0) return undefined;
    const c = { x: 0, y: 0, z: 0 };
    for (const s of strokes) {
      c.x += s.transform.position.x;
      c.y += s.transform.position.y;
      c.z += s.transform.position.z;
    }
    return {
      x: c.x / strokes.length,
      y: c.y / strokes.length,
      z: c.z / strokes.length,
    };
  }

  // --- dragging ---

  private onDragStart(): void {
    if (!this.proxy) return;
    this.dragging = true;
    this.captureBaseline();
  }

  /** Joint values and every stroke that can move, as they are now. */
  private captureBaseline(): void {
    this.baselineValues = poseFrom(this.doc.allJoints());

    // every stroke that can move: the subtree below the driven joint (FK)
    // or below the chain's topmost joint (IK)
    const topPartId = this.ik ? this.chain[0].childPartId : this.joint!.childPartId;
    const affected = partsInSubtree(this.doc.allJoints(), topPartId);
    this.baselineTransforms.clear();
    for (const partId of affected) {
      for (const stroke of this.doc.strokesInPart(partId)) {
        this.baselineTransforms.set(stroke.id, cloneTransform(stroke.transform));
      }
    }
  }

  private onGizmoChange(): void {
    if (!this.dragging || !this.proxy || !this.ik) return;
    const target = {
      x: this.proxy.position.x,
      y: this.proxy.position.y,
      z: this.proxy.position.z,
    };
    const pose = solveIK(
      this.doc.allJoints(),
      this.chain,
      poseFrom(this.doc.allJoints()),
      this.ikRestPoint,
      target,
    );
    this.applyPose(pose);
  }

  /** Re-derive every affected stroke from its drag-start transform under
   *  the new joint pose (exact — nothing accumulates within a drag). */
  private applyPose(pose: JointPose): void {
    const joints = this.doc.allJoints();
    const baseline = valuesOfPose(this.baselineValues);
    const now: JointValues = (j, d) => pose.get(j.id)?.[d] ?? baseline(j, d);

    const baseDeltas = computePartDeltas(joints, baseline);
    const nowDeltas = computePartDeltas(joints, now);

    for (const [strokeId, transform] of this.baselineTransforms) {
      const stroke = this.doc.getStroke(strokeId);
      if (!stroke?.partId) continue;
      const base = baseDeltas.get(stroke.partId) ?? identityRigid();
      const current = nowDeltas.get(stroke.partId) ?? identityRigid();
      const patch = rigidMultiply(current, rigidInvert(base));
      this.doc.setStrokeTransform(strokeId, applyRigidToTransform(patch, transform));
    }
    for (const [jointId, values] of pose) {
      const joint = this.doc.getJoint(jointId);
      if (!joint) continue;
      for (const dof of JOINT_DOF_NAMES) {
        if (joint.dofs[dof].value !== values[dof]) {
          this.doc.setJointValue(jointId, dof, values[dof]);
        }
      }
    }
  }

  private onDragEnd(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const jointChanges: JointValueChange[] = [];
    for (const [jointId, before] of this.baselineValues) {
      const joint = this.doc.getJoint(jointId);
      if (!joint) continue;
      for (const dof of JOINT_DOF_NAMES) {
        const after = joint.dofs[dof].value;
        if (after !== before[dof]) {
          jointChanges.push({ jointId, dof, before: before[dof], after });
        }
      }
    }
    const strokeChanges: StrokeTransformChange[] = [];
    for (const [id, before] of this.baselineTransforms) {
      const stroke = this.doc.getStroke(id);
      if (stroke) {
        strokeChanges.push({
          id,
          before,
          after: cloneTransform(stroke.transform),
        });
      }
    }
    this.baselineValues.clear();
    this.baselineTransforms.clear();
    if (jointChanges.length === 0) return;

    this.undo.push(
      articulateCommand(
        this.doc,
        this.ik ? "Articulate (IK)" : "Articulate joint",
        jointChanges,
        strokeChanges,
      ),
    );

    // reseat the gizmo on the moved part (pivots ride along, the IK handle
    // follows the part)
    const partId = this.partId;
    this.destroyGizmo();
    this.partId = partId;
    if (partId) this.buildGizmo();
  }
}

/** Orientation whose local X/Y/Z are the joint's posed axis/U/V. */
export function posedJointFrame(joint: Joint, q: { x: number; y: number; z: number; w: number }): THREE.Quaternion {
  const { u, v } = jointBasis(joint.axis);
  const x = rotateVec(q, joint.axis);
  const y = rotateVec(q, u);
  const z = rotateVec(q, v);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(x.x, x.y, x.z),
    new THREE.Vector3(y.x, y.y, y.z),
    new THREE.Vector3(z.x, z.y, z.z),
  );
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** Signed rotation of `now` relative to `start` about the start-local
 *  X/Y/Z axis (swing-twist decomposition, twist part). */
export function twistAbout(
  start: THREE.Quaternion,
  now: THREE.Quaternion,
  axis: string,
): number {
  const rel = start.clone().invert().multiply(now);
  const component = axis === "X" ? rel.x : axis === "Y" ? rel.y : rel.z;
  return 2 * Math.atan2(rel.w < 0 ? -component : component, Math.abs(rel.w));
}
