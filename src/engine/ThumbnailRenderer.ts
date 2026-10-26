import * as THREE from "three";
import { deserializeDocument, type DocumentJson } from "../core/serialization";
import { strokesBounds } from "../core/geometry";
import { StrokeRenderer } from "./StrokeRenderer";
import type { Viewport } from "./Viewport";

/** Same direction the editor's camera starts from. */
const VIEW_DIRECTION = new THREE.Vector3(5, 5, 10).normalize();
const FOV = 30;

/** A camera framing: aimed at `center`, far enough back for `radius`. */
export interface ThumbnailFrame {
  center: THREE.Vector3;
  radius: number;
}

export function frameDocument(json: DocumentJson): ThumbnailFrame {
  const doc = deserializeDocument(json);
  const bounds = strokesBounds(doc.allStrokes());
  if (!bounds) return { center: new THREE.Vector3(), radius: 2 };
  const min = new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z);
  const max = new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z);
  return {
    center: min.clone().add(max).multiplyScalar(0.5),
    radius: Math.max(min.distanceTo(max) / 2, 0.5),
  };
}

/**
 * Renders sketches to small images without a visible view, for the data
 * viewer's model cards and timeline. One WebGL context is shared by every
 * thumbnail (browsers cap how many may exist). Each render builds the
 * strokes through the normal StrokeRenderer, so thumbnails look like the
 * editor, then throws them away.
 */
export class ThumbnailRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 0.01, 5000);
  private readonly resolution = new THREE.Vector2();

  constructor(
    readonly width = 240,
    readonly height = 180,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.resolution.set(width, height);
    this.scene.background = new THREE.Color(0xf4f4f4);
    const light = new THREE.HemisphereLight(0xffffff, 0x222222, 0.8);
    light.position.set(0, 50, 150);
    this.scene.add(light);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** A JPEG data URL of the document seen from `frame` (or framed on
   *  itself). */
  render(json: DocumentJson, frame: ThumbnailFrame = frameDocument(json)): string {
    const doc = deserializeDocument(json);
    // StrokeRenderer only needs a scene, the stroke-shader resolution and
    // a redraw hook from its viewport
    const host = {
      scene: this.scene,
      resolution: this.resolution,
      invalidate: () => {},
    } as unknown as Viewport;
    const strokes = new StrokeRenderer(doc, host);
    const distance =
      frame.radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2)) / Math.min(1, this.camera.aspect);
    this.camera.position.copy(frame.center).addScaledVector(VIEW_DIRECTION, distance * 1.05);
    this.camera.lookAt(frame.center);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.85);
    strokes.dispose();
    return url;
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

let shared: ThumbnailRenderer | undefined;

/** The app-wide renderer, created on first use. */
export function thumbnailRenderer(): ThumbnailRenderer {
  return (shared ??= new ThumbnailRenderer());
}
