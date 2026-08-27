import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WristAnchor } from '../types/vision';
import { publicUrl } from '../app/baseUrl';

/** Lightweight screen-space AR renderer: real 3D ornament + a wrist-sized band. */
export class Rakhi3DRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 100);
  private root = new THREE.Group();
  private ornament = new THREE.Group();
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera.position.z = 10;
    this.scene.add(new THREE.HemisphereLight(0xfff3df, 0x6b3b2b, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-2, -3, 6);
    this.scene.add(key, this.root);
    this.buildBand();
    void this.loadOrnament();
  }

  private buildBand() {
    const thread = new THREE.MeshStandardMaterial({ color: 0xb51f2e, roughness: 0.65, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3ad32, roughness: 0.48, metalness: 0.25 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 12, 64), thread);
    const accent = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 64), gold);
    ring.scale.y = 0.43;
    accent.scale.y = 0.43;
    ring.renderOrder = 2;
    accent.renderOrder = 3;

    // This depth-only wrist proxy hides the rear thread and the ornament when the
    // hand rolls away, creating wrap-around occlusion without sending video depth.
    const occluder = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.58, 1.5, 8, 16),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    );
    occluder.rotation.z = Math.PI / 2;
    occluder.scale.set(1, 1, 0.34);
    occluder.renderOrder = 1;
    this.ornament.position.set(0, -0.44, 0.23);
    this.ornament.renderOrder = 4;
    this.root.add(occluder, ring, accent, this.ornament);
  }

  private async loadOrnament() {
    try {
      const gltf = await new GLTFLoader().loadAsync(publicUrl('assets/rakhi.glb'));
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const whole = new THREE.Box3().setFromObject(model);
      const size = whole.getSize(new THREE.Vector3());
      const major: 'x' | 'y' | 'z' = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
      const center = whole.getCenter(new THREE.Vector3());
      const half = size[major] * 0.36;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const box = new THREE.Box3().setFromObject(object);
        const meshCenter = box.getCenter(new THREE.Vector3());
        if (Math.abs(meshCenter[major] - center[major]) > half) object.visible = false;
        object.castShadow = false;
        object.receiveShadow = false;
      });
      const kept = new THREE.Box3().setFromObject(model);
      const keptSize = kept.getSize(new THREE.Vector3());
      const max = Math.max(keptSize.x, keptSize.y, keptSize.z) || 1;
      model.position.sub(kept.getCenter(new THREE.Vector3()));
      model.scale.setScalar(1.05 / max);
      model.rotation.set(Math.PI / 2, 0, 0);
      this.ornament.add(model);
    } catch (error) {
      console.warn('The 3D Rakhi ornament could not load; the procedural band remains available.', error);
      const fallback = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32),
        new THREE.MeshStandardMaterial({ color: 0xd6a52f, roughness: 0.45, metalness: 0.35 }),
      );
      fallback.rotation.x = Math.PI / 2;
      this.ornament.add(fallback);
    }
  }

  draw(anchor: WristAnchor | null, mirrored: boolean, visible: boolean) {
    this.resize();
    this.root.visible = !!anchor && visible && anchor.confidence >= 0.48;
    if (anchor && this.root.visible) {
      const x = (mirrored ? 1 - anchor.x : anchor.x) * this.width;
      const y = anchor.y * this.height;
      const angle = mirrored ? Math.PI - anchor.angle : anchor.angle;
      const wristPx = Math.max(46, (anchor.wristWidth ?? anchor.scale * 0.42) * this.width);
      const facing = THREE.MathUtils.clamp(anchor.dorsalFacing ?? 0.7, 0, 1);
      this.root.position.set(x, y, 0);
      this.root.rotation.set((1 - facing) * Math.PI, 0, angle);
      this.root.scale.setScalar(wristPx * 0.5);
      this.ornament.visible = facing > 0.18;
      this.ornament.scale.setScalar(0.72 + facing * 0.28);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.left = 0; this.camera.right = width; this.camera.top = 0; this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
  }
}
