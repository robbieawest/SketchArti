import * as THREE from "three";
import type { SketchDocument, DocumentEvent } from "../core/SketchDocument";
import type { Stroke, Transform } from "../core/types";
import type { Viewport } from "./Viewport";
import {
  buildRibbonGeometry,
  computeVertexWidths,
  createRibbonMaterial,
} from "./ribbon";

export type HighlightKind = "stroke" | "part" | "jointChild";

export const HIGHLIGHT_COLORS: Record<HighlightKind, THREE.Color> = {
  stroke: new THREE.Color(1, 0.62, 0), // orange
  part: new THREE.Color(0.62, 0.35, 1), // purple (also a joint's parent part)
  jointChild: new THREE.Color(1, 0.85, 0.1), // yellow (a joint's child part)
};

/** Display colours for parts, by position in the document's part list.
 *  Steers clear of the highlight hues above so a tinted stroke still reads
 *  as selected. Derived at render time only — stroke styles are untouched. */
export const PART_PALETTE = [
  "#1f77b4", // blue
  "#2ca02c", // green
  "#d62728", // red
  "#17becf", // cyan
  "#8c564b", // brown
  "#e377c2", // pink
  "#3f6e5a", // dark teal
  "#7f7f7f", // grey
  "#1a3d7c", // navy
  "#9e9a00", // olive
];

export function partColor(index: number): string {
  return PART_PALETTE[index % PART_PALETTE.length];
}

/**
 * Mirrors the document into the three.js scene: one Group per stroke
 * (ribbon mesh + optional fill mesh), created/removed/moved in response to
 * document events. This is the only place strokes become GPU data; nothing
 * else in the app touches stroke meshes.
 */
export class StrokeRenderer {
  private groups = new Map<string, THREE.Group>();
  private readonly unsubscribe: () => void;
  /** Whole-sketch visibility toggle (the "Hide Sketch" button); applies to
   *  existing groups and any created while hidden. */
  private visible = true;
  /** Part id → display colour; strokes outside any part keep their own. */
  private partColors = new Map<string, string>();

  constructor(
    private readonly doc: SketchDocument,
    private readonly viewport: Viewport,
  ) {
    this.unsubscribe = doc.subscribe((event) => this.onEvent(event));
    this.refreshPartColors();
    for (const stroke of doc.allStrokes()) this.add(stroke);
  }

  /** The colour a part is drawn in (for panel swatches). */
  colorOfPart(partId: string): string | undefined {
    return this.partColors.get(partId);
  }

  /** The scene group for a stroke, for raycasting/selection later. */
  groupFor(strokeId: string): THREE.Group | undefined {
    return this.groups.get(strokeId);
  }

  /** Tint a stroke with a selection color (ribbon via shader uniform, fill
   *  by blending the material color). "stroke" glows orange, "part" purple. */
  setHighlight(
    strokeId: string,
    on: boolean,
    kind: HighlightKind = "stroke",
  ): void {
    const tint = HIGHLIGHT_COLORS[kind];
    const group = this.groups.get(strokeId);
    if (!group) return;
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material;
      if (material instanceof THREE.ShaderMaterial) {
        material.uniforms.highlight.value = on ? 1 : 0;
        (material.uniforms.highlightColor.value as THREE.Color).copy(tint);
      } else if (material instanceof THREE.MeshBasicMaterial) {
        if (!object.userData.baseColor) {
          object.userData.baseColor = material.color.clone();
        }
        material.color.copy(object.userData.baseColor as THREE.Color);
        if (on) material.color.lerp(tint, 0.65);
      }
    });
    this.viewport.invalidate();
  }

  clearHighlights(): void {
    for (const id of this.groups.keys()) this.setHighlight(id, false);
  }

  /** Show or hide every stroke at once (drawing/selection still work). */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const group of this.groups.values()) group.visible = visible;
    this.viewport.invalidate();
  }

  strokeIdFor(object: THREE.Object3D): string | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (typeof current.userData.strokeId === "string") {
        return current.userData.strokeId;
      }
      current = current.parent;
    }
    return undefined;
  }

  dispose(): void {
    this.unsubscribe();
    for (const id of [...this.groups.keys()]) this.remove(id);
  }

  private onEvent(event: DocumentEvent): void {
    switch (event.type) {
      case "strokeAdded":
        this.add(event.stroke);
        break;
      case "strokeRemoved":
        this.remove(event.stroke.id);
        break;
      case "strokeChanged": {
        const group = this.groups.get(event.stroke.id);
        if (group) applyTransform(group, event.stroke.transform);
        this.applyBaseColor(event.stroke);
        break;
      }
      case "partsChanged":
        this.refreshPartColors();
        for (const stroke of this.doc.allStrokes()) this.applyBaseColor(stroke);
        break;
      case "cleared":
        for (const id of [...this.groups.keys()]) this.remove(id);
        break;
    }
    this.viewport.invalidate();
  }

  private add(stroke: Stroke): void {
    const group = new THREE.Group();
    group.userData.strokeId = stroke.id;

    if (stroke.style.visible && stroke.points.length >= 6) {
      const geometry = buildRibbonGeometry(
        stroke.points,
        computeVertexWidths(stroke.pressure),
      );
      const material = createRibbonMaterial(
        this.baseColor(stroke),
        stroke.style.width,
        this.viewport.resolution,
      );
      group.add(new THREE.Mesh(geometry, material));
    }

    if (stroke.fill.visible && stroke.points.length >= 9) {
      group.add(buildFillMesh(stroke));
    }

    applyTransform(group, stroke.transform);
    group.visible = this.visible;
    this.groups.set(stroke.id, group);
    this.viewport.scene.add(group);
  }

  private refreshPartColors(): void {
    this.partColors = new Map(
      this.doc.allParts().map((part, i) => [part.id, partColor(i)]),
    );
  }

  private baseColor(stroke: Stroke): string {
    return (
      (stroke.partId && this.partColors.get(stroke.partId)) || stroke.style.color
    );
  }

  private applyBaseColor(stroke: Stroke): void {
    const group = this.groups.get(stroke.id);
    if (!group) return;
    const color = this.baseColor(stroke);
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material;
      if (material instanceof THREE.ShaderMaterial) {
        (material.uniforms.color.value as THREE.Color).set(color);
      }
    });
  }

  private remove(strokeId: string): void {
    const group = this.groups.get(strokeId);
    if (!group) return;
    this.groups.delete(strokeId);
    this.viewport.scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }
}

function applyTransform(object: THREE.Object3D, t: Transform): void {
  object.position.set(t.position.x, t.position.y, t.position.z);
  object.quaternion.set(
    t.quaternion.x,
    t.quaternion.y,
    t.quaternion.z,
    t.quaternion.w,
  );
  object.scale.set(t.scale.x, t.scale.y, t.scale.z);
}

// Fill: triangulate the centerline polygon. Like Penzil, the points are
// projected onto their local XY plane for triangulation (strokes are drawn
// on a surface, so locally they are near-planar).
export function buildFillGeometry(points: Float32Array): THREE.BufferGeometry {
  const contour: THREE.Vector2[] = [];
  for (let i = 0; i < points.length; i += 3) {
    contour.push(new THREE.Vector2(points[i], points[i + 1]));
  }
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(points.slice(), 3),
  );
  geometry.setIndex(triangles.flat());
  geometry.computeBoundingSphere();
  return geometry;
}

function buildFillMesh(stroke: Stroke): THREE.Mesh {
  const geometry = buildFillGeometry(stroke.points);
  const material = new THREE.MeshBasicMaterial({
    color: stroke.fill.color,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  return new THREE.Mesh(geometry, material);
}
