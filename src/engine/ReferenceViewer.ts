import * as THREE from "three";
import type { RigidTransform } from "../core/rigid";
import {
  animatedValue,
  jointRange,
  movableJoints,
  partTransforms,
  type ReferenceJoint,
  type ReferenceModel,
  type ReferencePose,
} from "../reference/model";
import {
  disposeObject,
  loadReferenceParts,
} from "./referenceMeshes";
import type { Viewport } from "./Viewport";

const GLYPH_COLORS = {
  revolute: 0xe53935,
  continuous: 0xe53935,
  prismatic: 0x1e88e5,
} as const;

interface PartEntry {
  /** Moved by the part's kinematic transform; children stay at rest. */
  group: THREE.Group;
  /** Each mesh with the material it came with (textures and all). Not
   *  shown for now — dataset textures vary too much in quality — but kept
   *  so it can come back. */
  meshes: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[];
  /** The part's palette colour, lit. */
  partMaterial: THREE.MeshStandardMaterial;
  /** Plain grey, while part colours are off. */
  neutralMaterial: THREE.MeshStandardMaterial;
}

/**
 * The reference model in its own viewport, dataset-viewer style: part
 * meshes under simple studio lighting, optional per-part colouring, joint
 * glyphs (circular arrows for revolute, double arrows for prismatic), and
 * a pose driven by sliders or the play-all animation.
 *
 * Everything here is display only — nothing is recorded from it except
 * what the ui chooses to log.
 */
export class ReferenceViewer {
  private readonly root = new THREE.Group();
  private readonly glyphRoot = new THREE.Group();
  private readonly lights: THREE.Light[] = [];
  private model: ReferenceModel | null = null;
  private parts = new Map<string, PartEntry>();
  private glyphs = new Map<string, THREE.Group>();
  private pose: ReferencePose = {};
  private colored = true;
  private playing = false;
  private playStart = 0;
  private rafHandle = 0;
  /** Called on every animation frame while playing, with the pose shown. */
  onAnimatedPose?: (pose: ReferencePose) => void;

  constructor(private readonly viewport: Viewport) {
    viewport.scene.add(this.root);
    viewport.scene.background = new THREE.Color(0xf0f0f0);
    this.root.add(this.glyphRoot);
    // Lighting: a strong key light that rides with the camera, from above
    // and to the left of the view, so every surface the viewer looks at is
    // shaded and form reads from any angle; a cool fill from the opposite
    // side and a little ambient so shadowed faces stay readable. The
    // viewport's flat hemisphere light is turned down: it washes shading out.
    viewport.scene.traverse((object) => {
      if (object instanceof THREE.HemisphereLight) object.intensity = 0.25;
    });
    viewport.scene.add(viewport.camera); // so lights can ride along with it
    const key = new THREE.DirectionalLight(0xfff6ec, 2.4);
    key.position.set(-1, 1.6, 1);
    key.target.position.set(0, 0, -1);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
    fill.position.set(1.5, -0.4, 0.6);
    fill.target.position.set(0, 0, -1);
    for (const light of [key, fill]) viewport.camera.add(light, light.target);
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    viewport.scene.add(ambient);
    this.lights.push(key, fill, ambient);
  }

  get jointCount(): number {
    return this.model ? movableJoints(this.model).length : 0;
  }

  async load(model: ReferenceModel, baseUrl: string): Promise<void> {
    this.clear();
    this.model = model;
    for (const part of await loadReferenceParts(model, baseUrl)) {
      const group = new THREE.Group();
      group.name = part.name;
      const meshes: PartEntry["meshes"] = [];
      part.object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        // scanned and CAD parts are often open shells: show both faces
        for (const m of [child.material].flat()) m.side = THREE.DoubleSide;
        meshes.push({ mesh: child, original: child.material });
      });
      const lit = (color: THREE.ColorRepresentation) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.55,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
      const partMaterial = lit(part.color);
      const neutralMaterial = lit(0xcfcfcf);
      group.add(part.object);
      this.root.add(group);
      this.parts.set(part.id, { group, meshes, partMaterial, neutralMaterial });
    }
    this.buildGlyphs(model);
    this.setPartColors(this.colored);
    this.setPose({});
    this.groundAndFrame();
  }

  /** Part colours on: one palette colour per part; off: plain grey. */
  setPartColors(on: boolean): void {
    this.colored = on;
    for (const entry of this.parts.values()) {
      for (const { mesh } of entry.meshes) {
        mesh.material = on ? entry.partMaterial : entry.neutralMaterial;
      }
    }
    this.viewport.invalidate();
  }

  setJointsVisible(on: boolean): void {
    this.glyphRoot.visible = on;
    this.viewport.invalidate();
  }

  setPose(pose: ReferencePose): void {
    if (!this.model) return;
    this.pose = { ...pose };
    const transforms = partTransforms(this.model, this.pose);
    for (const [partId, entry] of this.parts) {
      applyRigid(entry.group, transforms.get(partId));
    }
    // a joint's glyph rides on its parent part
    for (const joint of this.model.joints) {
      const glyph = this.glyphs.get(joint.id);
      if (glyph) applyRigid(glyph, transforms.get(joint.parent));
    }
    this.viewport.invalidate();
  }

  get currentPose(): ReferencePose {
    return { ...this.pose };
  }

  /** Emphasize one joint's glyph (e.g. while its slider is held). */
  highlightJoint(jointId: string | null): void {
    for (const [id, glyph] of this.glyphs) {
      glyph.scale.setScalar(id === jointId ? 1.35 : 1);
    }
    this.viewport.invalidate();
  }

  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    cancelAnimationFrame(this.rafHandle);
    if (!playing) return;
    this.playStart = performance.now();
    const step = () => {
      if (!this.playing || !this.model) return;
      const seconds = (performance.now() - this.playStart) / 1000;
      const pose: ReferencePose = {};
      for (const joint of movableJoints(this.model)) {
        pose[joint.id] = animatedValue(joint, seconds);
      }
      this.setPose(pose);
      this.onAnimatedPose?.(pose);
      this.rafHandle = requestAnimationFrame(step);
    };
    this.rafHandle = requestAnimationFrame(step);
  }

  /** Point the camera at the whole model from a three-quarter view. */
  frame(): void {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const c = sphere.center;
    const r = sphere.radius;
    void this.viewport.controls.setLookAt(
      c.x + r * 1.6,
      c.y + r * 1.1,
      c.z + r * 2.2,
      c.x,
      c.y,
      c.z,
      false,
    );
    void this.viewport.controls.fitToSphere(sphere, false);
    this.viewport.invalidate();
  }

  clear(): void {
    this.setPlaying(false);
    for (const entry of this.parts.values()) {
      entry.group.removeFromParent();
      // put the originals back so both sets get disposed
      for (const { mesh, original } of entry.meshes) mesh.material = original;
      disposeObject(entry.group);
      entry.partMaterial.dispose();
      entry.neutralMaterial.dispose();
    }
    for (const glyph of this.glyphs.values()) {
      glyph.removeFromParent();
      disposeObject(glyph);
    }
    this.parts.clear();
    this.glyphs.clear();
    this.model = null;
    this.pose = {};
    this.root.position.set(0, 0, 0);
    this.viewport.invalidate();
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
    for (const light of this.lights) {
      light.removeFromParent();
      if (light instanceof THREE.DirectionalLight) light.target.removeFromParent();
    }
  }

  /** Sit the model on the grid and frame it. */
  private groundAndFrame(): void {
    this.root.position.set(0, 0, 0);
    const box = new THREE.Box3();
    for (const entry of this.parts.values()) box.expandByObject(entry.group);
    if (!box.isEmpty()) this.root.position.y = -box.min.y;
    this.frame();
  }

  private buildGlyphs(model: ReferenceModel): void {
    const box = new THREE.Box3();
    for (const entry of this.parts.values()) box.expandByObject(entry.group);
    const size = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length();
    const radius = size * 0.06;
    for (const joint of movableJoints(model)) {
      const glyph = new THREE.Group();
      glyph.name = `joint:${joint.id}`;
      const inner = jointGlyph(joint, radius);
      inner.position.fromArray(joint.origin);
      inner.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().fromArray(joint.axis).normalize(),
      );
      glyph.add(inner);
      this.glyphRoot.add(glyph);
      this.glyphs.set(joint.id, glyph);
    }
  }
}

/** A glyph in a frame whose +Y is the joint axis, centred on the origin. */
function jointGlyph(joint: ReferenceJoint, radius: number): THREE.Group {
  const color = GLYPH_COLORS[joint.type as keyof typeof GLYPH_COLORS] ?? 0x888888;
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    transparent: true,
  });
  const group = new THREE.Group();
  const thin = radius * 0.06;
  const add = (geometry: THREE.BufferGeometry, setup?: (m: THREE.Mesh) => void) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10; // always readable through the model
    setup?.(mesh);
    group.add(mesh);
  };

  // the axis line, for every kind
  add(new THREE.CylinderGeometry(thin * 0.6, thin * 0.6, radius * 3, 8));

  if (joint.type === "prismatic") {
    // a double-headed arrow along the axis, spanning the slide range
    const [lo, hi] = jointRange(joint);
    const span = Math.max(Math.abs(hi - lo), radius * 2);
    const mid = (lo + hi) / 2;
    add(new THREE.CylinderGeometry(thin * 1.6, thin * 1.6, span, 10), (m) => {
      m.position.y = mid;
    });
    for (const sign of [1, -1]) {
      add(new THREE.ConeGeometry(thin * 4, thin * 9, 14), (m) => {
        m.position.y = mid + (sign * span) / 2;
        if (sign < 0) m.rotation.x = Math.PI;
      });
    }
  } else {
    // a circular arrow about the axis; the arc shows the limit for
    // revolute joints (at least a readable sweep), nearly full for continuous
    const [lo, hi] = jointRange(joint);
    const sweep =
      joint.type === "continuous"
        ? Math.PI * 1.75
        : Math.min(Math.max(hi - lo, Math.PI / 3), Math.PI * 1.9);
    const arcStart = joint.type === "continuous" ? 0 : lo;
    add(new THREE.TorusGeometry(radius, thin * 1.4, 8, 48, sweep), (m) => {
      // the torus arc runs counterclockwise in XY from +X; laying it into
      // the plane perpendicular to +Y this way makes it run positively
      // (right-handed) about the axis, matching the arrowhead below
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = arcStart;
    });
    // arrowhead at the end of the sweep, tangent to the circle
    const end = arcStart + sweep;
    add(new THREE.ConeGeometry(thin * 4, thin * 9, 14), (m) => {
      m.position.set(radius * Math.cos(end), 0, -radius * Math.sin(end));
      const tangent = new THREE.Vector3(-Math.sin(end), 0, -Math.cos(end));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    });
  }
  return group;
}

function applyRigid(object: THREE.Object3D, rigid: RigidTransform | undefined): void {
  if (!rigid) {
    object.position.set(0, 0, 0);
    object.quaternion.identity();
    return;
  }
  object.position.set(rigid.t.x, rigid.t.y, rigid.t.z);
  object.quaternion.set(rigid.q.x, rigid.q.y, rigid.q.z, rigid.q.w);
}
