import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { NormalizedHand, Vec3, WristAnchor } from '../types/vision';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { retargetHand } from '../rakhi/handRetargeting';
import { publicUrl } from '../app/baseUrl';

export class Rakhi3DRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 100);
  private attached = new THREE.Group();
  private ornament = new THREE.Group();
  private carried = new THREE.Group();
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Keep the authored GLB colours neutral: no cinematic colour grading.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera.position.z = 10;
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-2, -3, 6);
    this.scene.add(key, this.attached, this.carried);
    this.buildWristWrap();
    void this.loadSuppliedModel();
  }

  private buildWristWrap() {
    const red = new THREE.MeshStandardMaterial({ color: 0xb51f2e, roughness: .68, metalness: .04 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3ad32, roughness: .5, metalness: .22 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .075, 12, 64), red);
    const accent = new THREE.Mesh(new THREE.TorusGeometry(1, .025, 8, 64), gold);
    ring.scale.y = accent.scale.y = .43;
    ring.renderOrder = 2; accent.renderOrder = 3;
    const occluder = new THREE.Mesh(
      new THREE.CapsuleGeometry(.58, 1.5, 8, 16),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    );
    occluder.rotation.z = Math.PI / 2;
    occluder.scale.set(1, 1, .34);
    occluder.renderOrder = 1;
    // Local +Y points from the wrist toward the elbow.
    this.ornament.position.set(0, .44, .23);
    this.ornament.renderOrder = 4;
    this.attached.add(occluder, ring, accent, this.ornament);
  }

  private async loadSuppliedModel() {
    try {
      const original = (await new GLTFLoader().loadAsync(publicUrl('assets/rakhi.glb'))).scene;
      original.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(original);
      const size = box.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z) || 1;
      const center = box.getCenter(new THREE.Vector3());
      original.position.sub(center);
      original.scale.setScalar(1 / max);
      original.rotation.x = Math.PI / 2;
      original.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; }
      });
      // Both views are clones of the one supplied GLB—not 2D crops or replacement artwork.
      const attachedModel = original.clone(true);
      attachedModel.scale.multiplyScalar(1.18);
      this.ornament.add(attachedModel);
      const carriedModel = original.clone(true);
      carriedModel.scale.multiplyScalar(1.55);
      this.carried.add(carriedModel);
    } catch (error) {
      console.error('The supplied 3D Rakhi could not be loaded.', error);
    }
  }

  draw(anchor: WristAnchor | null, hands: NormalizedHand[], state: RakhiTyingState, mirrored: boolean) {
    this.resize();
    const attachedVisible = !!anchor && (state === 'FINISHING_ANIMATION' || state === 'RAKHI_ATTACHED') && anchor.confidence >= .45;
    this.attached.visible = attachedVisible;
    if (anchor && attachedVisible) this.placeOnWrist(anchor, mirrored);

    const carrying = !!anchor && (state === 'APPROACHING_WRIST' || state === 'ALIGNMENT_VALID') && hands.length === 2;
    this.carried.visible = carrying;
    if (anchor && carrying) this.placeBetweenPinches(anchor, hands, mirrored);
    this.renderer.render(this.scene, this.camera);
  }

  private placeOnWrist(anchor: WristAnchor, mirrored: boolean) {
    const x = (mirrored ? 1 - anchor.x : anchor.x) * this.width;
    const y = anchor.y * this.height;
    const angle = mirrored ? Math.PI - anchor.angle : anchor.angle;
    const wristPx = Math.max(46, (anchor.wristWidth ?? anchor.scale * .42) * this.width);
    const facing = THREE.MathUtils.clamp(anchor.dorsalFacing ?? .7, 0, 1);
    this.attached.position.set(x, y, 0);
    this.attached.rotation.set((1 - facing) * Math.PI, 0, angle);
    this.attached.scale.setScalar(wristPx * .5);
    // The supplied ornament is visible only on the back/knuckle side. Turning
    // the wrist away reveals only the wrapped thread.
    this.ornament.visible = facing > .58;
    this.ornament.scale.setScalar(.78 + facing * .22);
  }

  private placeBetweenPinches(anchor: WristAnchor, hands: NormalizedHand[], mirrored: boolean) {
    const targetScale = Math.max(.045, anchor.scale * .42);
    const points = hands.map((hand) => retargetHand(hand, {
      x: anchor.x, y: anchor.y, palmScale: targetScale,
      angle: anchor.angle - Math.PI / 2, motionGain: .92,
    }));
    const pinch = (landmarks: Vec3[]) => ({
      x: ((landmarks[4]?.x ?? landmarks[0].x) + (landmarks[8]?.x ?? landmarks[0].x)) / 2,
      y: ((landmarks[4]?.y ?? landmarks[0].y) + (landmarks[8]?.y ?? landmarks[0].y)) / 2,
    });
    const map = (p: { x: number; y: number }) => ({ x: (mirrored ? 1 - p.x : p.x) * this.width, y: p.y * this.height });
    const a = map(pinch(points[0]));
    const b = map(pinch(points[1]));
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    this.carried.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, .4);
    this.carried.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x));
    this.carried.scale.setScalar(THREE.MathUtils.clamp(span * .8, 70, 210));
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
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    });
    this.renderer.dispose();
  }
}
