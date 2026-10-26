import * as THREE from "three";

/** Non-interactive axis and pivot overlay. Local X is the joint axis;
 *  the owning tool supplies the posed joint frame. */
export class JointAxisGuide extends THREE.Group {
  private readonly cameraPosition = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    super();
    this.name = "articulation-axis-guide";
    const material = (color: number) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const red = material(0xe53935);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1.35, 8), red);
    shaft.rotation.z = -Math.PI / 2;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 12), red);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.x = 0.735;
    // A white rim keeps the pivot readable against both strokes and surfaces.
    const rim = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), material(0xffffff));
    const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 12), material(0xffc400));
    shaft.renderOrder = arrow.renderOrder = 3;
    rim.renderOrder = 4;
    pivot.renderOrder = 5;
    this.add(shaft, arrow, rim, pivot);
    for (const mesh of [shaft, arrow, rim, pivot]) {
      mesh.raycast = () => {}; // the guide must never intercept a handle or part
    }
  }

  override updateMatrixWorld(force?: boolean): void {
    // Match the gizmo's screen sizing while orbiting, zooming or resizing.
    // Update here so there is no extra render loop or camera subscription.
    this.camera.getWorldPosition(this.cameraPosition);
    // world position, so the guide can also sit inside a moving parent
    this.worldPosition.copy(this.position);
    if (this.parent) this.parent.localToWorld(this.worldPosition);
    const distance = this.worldPosition.distanceTo(this.cameraPosition);
    const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.getEffectiveFOV() / 2));
    this.scale.setScalar(worldHeight * 140 / Math.max(this.canvas.clientHeight, 1));
    super.updateMatrixWorld(force);
  }

  dispose(): void {
    this.removeFromParent();
    const materials = new Set<THREE.Material>();
    this.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    });
    for (const material of materials) material.dispose();
  }
}
