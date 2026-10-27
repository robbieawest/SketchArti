import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { PartPrimitive, ReferenceModel } from "../reference/model";
import { partColor } from "./StrokeRenderer";

/** One reference part as loaded geometry, at its rest placement. */
export interface LoadedPart {
  id: string;
  name: string;
  object: THREE.Object3D;
  color: THREE.Color;
}

/** Load every part's geometry (mesh file or placeholder primitive). Shared
 *  by the reference viewer and the sketch-side proportion guides; meshes
 *  keep whatever material they came with — callers restyle them. */
export async function loadReferenceParts(
  model: ReferenceModel,
  baseUrl: string,
): Promise<LoadedPart[]> {
  return Promise.all(
    model.parts.map(async (part, index) => {
      const object = part.mesh
        ? await loadMesh(new URL(part.mesh, baseUrl).href)
        : part.primitive
          ? primitiveMesh(part.primitive)
          : new THREE.Group(); // invisible connector
      if (part.primitive && part.position) object.position.fromArray(part.position);
      object.name = part.name;
      return {
        id: part.id,
        name: part.name,
        object,
        color: new THREE.Color(part.color ?? partColor(index)),
      };
    }),
  );
}

function primitiveMesh(primitive: PartPrimitive): THREE.Object3D {
  const material = () => new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.65 });
  if (primitive.type === "box") {
    return new THREE.Mesh(new THREE.BoxGeometry(...primitive.size), material());
  }
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(primitive.radius, primitive.radius, primitive.height, 32),
    material(),
  );
  if (primitive.axis === "x") mesh.rotation.z = Math.PI / 2;
  if (primitive.axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}

async function loadMesh(url: string): Promise<THREE.Object3D> {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".obj")) {
    return new OBJLoader().loadAsync(url);
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse((child) => {
    // meshes exported without normals would light as solid black
    if (child instanceof THREE.Mesh && !child.geometry.getAttribute("normal")) {
      child.geometry.computeVertexNormals();
    }
  });
  return gltf.scene;
}

/** Replace every mesh material under `object`, disposing the old ones. */
export function restyle(
  object: THREE.Object3D,
  make: () => THREE.Material,
): THREE.Material[] {
  const made: THREE.Material[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    disposeMaterial(child.material);
    const material = make();
    child.material = material;
    made.push(material);
  });
  return made;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  });
}
