import * as THREE from 'three';
import type { NormalizedHand, Vec3, WristAnchor } from '../types/vision';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { retargetHand } from '../rakhi/handRetargeting';

type BuiltRakhi = { root: THREE.Group; pendant: THREE.Group };

/** A purpose-built 3D Rakhi. No GLB, sprites, or overlapping 2D Rakhi artwork. */
export class Rakhi3DRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 100);
  private attached: THREE.Group;
  private attachedPendant: THREE.Group;
  private carried: THREE.Group;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.camera.position.z = 10;

    this.scene.add(new THREE.AmbientLight(0xfff8ef, 2.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, -4, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc85e, .65);
    rim.position.set(4, 2, 4);
    this.scene.add(rim);

    const attached = this.buildAttachedRakhi();
    this.attached = attached.root;
    this.attachedPendant = attached.pendant;
    this.carried = this.buildCarriedRakhi();
    this.scene.add(this.attached, this.carried);
  }

  private materials() {
    return {
      red: new THREE.MeshStandardMaterial({ color: 0xa91f2c, roughness: .62, metalness: .03 }),
      saffron: new THREE.MeshStandardMaterial({ color: 0xe3a625, roughness: .54, metalness: .12 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd69a22, roughness: .3, metalness: .7 }),
      ruby: new THREE.MeshStandardMaterial({ color: 0x9c1725, roughness: .22, metalness: .18 }),
      pearl: new THREE.MeshStandardMaterial({ color: 0xffe39b, roughness: .28, metalness: .18 }),
    };
  }

  /** Flower face lies in XZ; its normal is local +Y (the back of the hand). */
  private buildFlower(faceCamera = false) {
    const material = this.materials();
    const flower = new THREE.Group();
    const petalGeometry = new THREE.SphereGeometry(1, 16, 10);
    for (let index = 0; index < 10; index += 1) {
      const angle = index / 10 * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry, index % 2 ? material.red : material.saffron);
      petal.scale.set(.13, .055, .27);
      petal.position.set(Math.sin(angle) * .27, 0, Math.cos(angle) * .27);
      petal.rotation.y = angle;
      flower.add(petal);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.245, .035, 10, 40), material.gold);
    halo.rotation.x = Math.PI / 2;
    const center = new THREE.Mesh(new THREE.CylinderGeometry(.19, .22, .105, 32), material.ruby);
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(.105, 20, 12), material.pearl);
    jewel.position.y = .075;
    flower.add(halo, center, jewel);
    if (faceCamera) flower.rotation.x = Math.PI / 2;
    return flower;
  }

  private buildAttachedRakhi(): BuiltRakhi {
    const material = this.materials();
    const root = new THREE.Group();
    const occluder = new THREE.Mesh(
      new THREE.CylinderGeometry(.72, .76, 2.2, 32, 1, false),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }),
    );
    occluder.rotation.x = Math.PI / 2;
    occluder.renderOrder = 1;

    const redThread = new THREE.Mesh(new THREE.TorusGeometry(.82, .045, 12, 80), material.red);
    const goldThread = new THREE.Mesh(new THREE.TorusGeometry(.82, .027, 10, 80), material.saffron);
    redThread.position.z = -.065;
    goldThread.position.z = .065;
    redThread.renderOrder = 2;
    goldThread.renderOrder = 3;

    const pendant = this.buildFlower();
    pendant.position.set(0, .86, -.07);
    pendant.scale.setScalar(1.08);
    pendant.renderOrder = 4;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.09, 14, 10), material.gold);
    knot.position.set(0, .78, .17);
    root.add(occluder, redThread, goldThread, knot, pendant);
    return { root, pendant };
  }

  private buildCarriedRakhi() {
    const material = this.materials();
    const root = new THREE.Group();
    const redCord = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, 2.5, 10), material.red);
    const goldCord = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, 2.5, 10), material.saffron);
    redCord.rotation.z = goldCord.rotation.z = Math.PI / 2;
    redCord.position.y = -.045;
    goldCord.position.y = .045;
    const flower = this.buildFlower(true);
    flower.scale.setScalar(.92);
    root.add(redCord, goldCord, flower);
    return root;
  }

  draw(anchor: WristAnchor | null, hands: NormalizedHand[], state: RakhiTyingState, mirrored: boolean) {
    this.resize();
    const attachedVisible = !!anchor && (state === 'FINISHING_ANIMATION' || state === 'RAKHI_ATTACHED') && anchor.confidence >= .48;
    this.attached.visible = attachedVisible;
    if (anchor && attachedVisible) this.placeOnWrist(anchor, mirrored);
    const carrying = !!anchor && (state === 'APPROACHING_WRIST' || state === 'ALIGNMENT_VALID') && hands.length === 2;
    this.carried.visible = carrying;
    if (anchor && carrying) this.placeBetweenPinches(anchor, hands, mirrored);
    this.renderer.render(this.scene, this.camera);
  }

  private placeOnWrist(anchor: WristAnchor, mirrored: boolean) {
    const direction = anchor.forearmDirection;
    const wristOffset = (anchor.wristWidth ?? anchor.scale * .42) * .16;
    const anchorX = anchor.x - direction.x * wristOffset;
    const anchorY = anchor.y - direction.y * wristOffset;
    const x = (mirrored ? 1 - anchorX : anchorX) * this.width;
    const y = anchorY * this.height;
    const widthPx = Math.max(42, (anchor.wristWidth ?? anchor.scale * .42) * this.width);
    const facing = THREE.MathUtils.clamp(anchor.dorsalFacing ?? .7, 0, 1);

    const handDepth = THREE.MathUtils.clamp(anchor.handDirection?.z ?? 0, -.7, .7);
    const axis = new THREE.Vector3(mirrored ? -direction.x : direction.x, direction.y, -handDepth * .42).normalize();
    const normal = anchor.palmNormal;
    const surface = normal
      ? new THREE.Vector3(mirrored ? -normal.x : normal.x, normal.y, -normal.z)
      : new THREE.Vector3(-(mirrored ? -direction.y : direction.y), direction.x, 1);
    surface.addScaledVector(axis, -surface.dot(axis));
    if (surface.lengthSq() < .04) surface.set(0, 0, facing >= .5 ? 1 : -1);
    surface.normalize();
    const crossWrist = surface.clone().cross(axis).normalize();
    const correctedSurface = axis.clone().cross(crossWrist).normalize();
    const basis = new THREE.Matrix4().makeBasis(crossWrist, correctedSurface, axis);

    this.attached.position.set(x, y, 0);
    this.attached.quaternion.setFromRotationMatrix(basis);
    this.attached.scale.setScalar(THREE.MathUtils.clamp(widthPx * .68, 27, 92));
    this.attachedPendant.visible = facing > .43;
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
    const map = (point: { x: number; y: number }) => ({ x: (mirrored ? 1 - point.x : point.x) * this.width, y: point.y * this.height });
    const first = map(pinch(points[0]));
    const second = map(pinch(points[1]));
    const span = Math.hypot(second.x - first.x, second.y - first.y);
    this.carried.position.set((first.x + second.x) / 2, (first.y + second.y) / 2, .5);
    this.carried.rotation.set(0, 0, Math.atan2(second.y - first.y, second.x - first.x));
    this.carried.scale.setScalar(THREE.MathUtils.clamp(span * .45, 42, 118));
  }

  private resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = height;
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
