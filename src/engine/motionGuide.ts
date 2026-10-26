import * as THREE from "three";
import type { JointDofName } from "../core/types";

const DOF_COLORS: Record<JointDofName, number> = {
  translation: 0xdd3333,
  twist: 0xdd3333,
  swingU: 0x2e9e44,
  swingV: 0x3366dd,
};

/** Screen pixels per guide unit — the same scale as JointAxisGuide, so the
 *  motion guide and the axis arrow always read at matching sizes. */
const PIXELS_PER_UNIT = 140;
/** Circle radius / half slide-arrow length, in guide units (~70 px). */
const SIZE = 0.5;

/**
 * Shows which way a DoF moves, in the joint frame (local X = axis, Y = U,
 * Z = V): a circle with an arrowhead around the DoF's rotation axis, or a
 * double arrow along the axis for sliding. A fixed size on screen, however
 * big the part or close the camera — it says *which* motion, while the range
 * fills (world-sized) say *how far*. Drawn through everything and never
 * pickable.
 */
export class MotionGuide extends THREE.Group {
  private readonly cameraPosition = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();

  constructor(
    dof: JointDofName,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    super();
    this.name = `motion-guide:${dof}`;
    this.add(buildShape(dof));
  }

  override updateMatrixWorld(force?: boolean): void {
    this.camera.getWorldPosition(this.cameraPosition);
    this.worldPosition.copy(this.position);
    if (this.parent) this.parent.localToWorld(this.worldPosition);
    const distance = this.worldPosition.distanceTo(this.cameraPosition);
    const worldHeight =
      2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.getEffectiveFOV() / 2));
    this.scale.setScalar(
      (worldHeight * PIXELS_PER_UNIT) / Math.max(this.canvas.clientHeight, 1),
    );
    super.updateMatrixWorld(force);
  }

  dispose(): void {
    this.removeFromParent();
    this.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }
}

/** The guide shape at unit scale; its own rotation aims the circle at the
 *  DoF's axis, so the MotionGuide itself can take the joint frame. */
function buildShape(dof: JointDofName): THREE.Group {
  const material = new THREE.MeshBasicMaterial({
    color: DOF_COLORS[dof],
    depthTest: false,
    transparent: true,
    opacity: 0.85,
  });
  const group = new THREE.Group();
  const thin = SIZE * 0.035;
  const add = (geometry: THREE.BufferGeometry, place: (m: THREE.Mesh) => void) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 6;
    mesh.raycast = () => {};
    place(mesh);
    group.add(mesh);
  };

  if (dof === "translation") {
    add(new THREE.CylinderGeometry(thin, thin, SIZE * 2, 8), (m) => {
      m.rotation.z = Math.PI / 2;
    });
    for (const sign of [1, -1]) {
      add(new THREE.ConeGeometry(thin * 3.5, thin * 9, 12), (m) => {
        m.position.x = sign * SIZE;
        m.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      });
    }
    return group;
  }

  // a circle in the plane perpendicular to the DoF's rotation axis, built
  // about local +Y (torus laid flat, running right-handed), then +Y aimed
  // at the DoF axis
  const sweep = Math.PI * 1.8;
  add(new THREE.TorusGeometry(SIZE, thin, 8, 64, sweep), (m) => {
    m.rotation.x = -Math.PI / 2;
  });
  add(new THREE.ConeGeometry(thin * 3.5, thin * 9, 12), (m) => {
    m.position.set(SIZE * Math.cos(sweep), 0, -SIZE * Math.sin(sweep));
    const tangent = new THREE.Vector3(-Math.sin(sweep), 0, -Math.cos(sweep));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  });
  const dofAxis =
    dof === "twist"
      ? new THREE.Vector3(1, 0, 0)
      : dof === "swingU"
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dofAxis);
  return group;
}
