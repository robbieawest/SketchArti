import * as THREE from "three";
import type { ReferenceModel } from "../reference/model";
import { disposeObject, loadReferenceParts, restyle } from "./referenceMeshes";
import type { Viewport } from "./Viewport";

/** What the sketch view shows of the reference model to help with
 *  proportions. */
export type GuideKind = "none" | "box" | "parts" | "ghost";

/** How reference-model coordinates map into sketch space:
 *  sketch = model * scale + offset. Recorded with the session so sketches
 *  can be compared against the ground-truth model afterwards. */
export interface GuideFrame {
  scale: number;
  offset: [number, number, number];
}

/** The reference model's largest dimension in sketch units — a bit under
 *  the 5-unit drawing plane, so the plane covers it. */
const GUIDE_SIZE = 4;

/**
 * Faint, non-interactive traces of the reference model in the sketch scene:
 * its overall bounding box, per-part boxes, or a translucent ghost. The model
 * is scaled to GUIDE_SIZE and stood on the grid at the origin, the same frame
 * whichever guide is showing. Nothing here is pickable or part of the
 * document.
 */
export class ReferenceGuide {
  private readonly root = new THREE.Group();
  private readonly layers: Record<Exclude<GuideKind, "none">, THREE.Group> = {
    box: new THREE.Group(),
    parts: new THREE.Group(),
    ghost: new THREE.Group(),
  };
  private kind: GuideKind = "none";
  frame: GuideFrame | null = null;

  constructor(private readonly viewport: Viewport) {
    this.root.name = "reference-guide";
    for (const layer of Object.values(this.layers)) {
      layer.visible = false;
      this.root.add(layer);
    }
    viewport.scene.add(this.root);
  }

  async load(model: ReferenceModel, baseUrl: string): Promise<GuideFrame> {
    const parts = await loadReferenceParts(model, baseUrl);
    const content = new THREE.Group();
    for (const part of parts) content.add(part.object);
    content.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(content);
    const size = box.getSize(new THREE.Vector3());
    const scale = GUIDE_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    const center = box.getCenter(new THREE.Vector3());
    const offset: [number, number, number] = [
      -center.x * scale,
      -box.min.y * scale,
      -center.z * scale,
    ];
    this.frame = { scale, offset };
    this.root.scale.setScalar(scale);
    this.root.position.fromArray(offset);

    // overall box
    this.layers.box.add(boxLines(box, 0x555555, 0.55));
    // per-part boxes, in the part colours
    for (const part of parts) {
      const partBox = new THREE.Box3().setFromObject(part.object);
      if (!partBox.isEmpty()) {
        this.layers.parts.add(boxLines(partBox, part.color.getHex(), 0.7));
      }
    }
    // translucent ghost of the meshes themselves
    restyle(
      content,
      () =>
        new THREE.MeshBasicMaterial({
          color: 0x8a8a8a,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    );
    this.layers.ghost.add(content);

    this.root.traverse((object) => {
      object.raycast = () => {}; // guides must never be hit by a tool
      object.renderOrder = -1; // under the strokes
    });
    this.setKind(this.kind);
    return this.frame;
  }

  setKind(kind: GuideKind): void {
    this.kind = kind;
    for (const [name, layer] of Object.entries(this.layers)) {
      layer.visible = name === kind;
    }
    this.viewport.invalidate();
  }

  dispose(): void {
    this.root.removeFromParent();
    disposeObject(this.root);
  }
}

function boxLines(box: THREE.Box3, color: number, opacity: number): THREE.LineSegments {
  const size = box.getSize(new THREE.Vector3());
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  box.getCenter(lines.position);
  return lines;
}
