import * as THREE from 'three';
import type { NormalizedHand, Vec3, WristAnchor } from '../types/vision';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { retargetHand } from '../rakhi/handRetargeting';

type BuiltRakhi = { root: THREE.Group; pendant: THREE.Object3D };

/** A purpose-built 3D Rakhi. No GLB, sprites, or overlapping 2D Rakhi artwork. */
export class Rakhi3DRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 100);
  private attached: THREE.Group;
  private attachedPendant: THREE.Object3D;
  private carried: THREE.Group;
  private readonly smoothedSurface = new THREE.Vector3(0, 0, 1);
  private readonly smoothedAxis = new THREE.Vector3(0, -1, 0);
  private hasSurface = false;
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

  private materials(overlay = false) {
    const depth = overlay ? { depthTest: false, depthWrite: false } as const : { depthTest: true, depthWrite: true } as const;
    return {
      red: new THREE.MeshStandardMaterial({ color: 0xa91f2c, roughness: .62, metalness: .03 }),
      saffron: new THREE.MeshStandardMaterial({ color: 0xe3a625, roughness: .54, metalness: .12 }),
      petal: new THREE.MeshPhysicalMaterial({ color: 0xa7192f, roughness: .35, metalness: .13, clearcoat: .48, clearcoatRoughness: .28, side: THREE.DoubleSide, ...depth }),
      gold: new THREE.MeshPhysicalMaterial({ color: 0xe8ad2d, roughness: .28, metalness: .58, clearcoat: .34, side: THREE.DoubleSide, ...depth }),
      ruby: new THREE.MeshPhysicalMaterial({ color: 0x75152a, roughness: .2, metalness: .2, clearcoat: .72, side: THREE.DoubleSide, ...depth }),
    };
  }

  /** One unified multicolour flower: one petal body with a nested gold/ruby centre. */
  private buildFlower(faceCamera = false): THREE.Group {
    const material = this.materials(faceCamera);
    const outline = new THREE.Shape();
    const points = 96;
    for (let index = 0; index <= points; index += 1) {
      const angle = index / points * Math.PI * 2;
      const radius = .3 + Math.cos(angle * 8) * .065;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) outline.moveTo(x, y);
      else outline.lineTo(x, y);
    }
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: .075, bevelEnabled: true, bevelSegments: 2,
      bevelSize: .018, bevelThickness: .018, curveSegments: 12,
    });
    geometry.center();
    if (!faceCamera) geometry.rotateX(-Math.PI / 2);
    const petals = new THREE.Mesh(geometry, material.petal);
    petals.renderOrder = 7;

    const gold = new THREE.Mesh(new THREE.CylinderGeometry(.19, .21, .072, 32), material.gold);
    const ruby = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .082, 24), material.ruby);
    if (faceCamera) {
      gold.rotation.x = ruby.rotation.x = Math.PI / 2;
      gold.position.z = .065;
      ruby.position.z = .11;
    } else {
      gold.position.y = .065;
      ruby.position.y = .11;
    }
    gold.renderOrder = 8;
    ruby.renderOrder = 9;
    const flower = new THREE.Group();
    flower.add(petals, gold, ruby);
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
    pendant.position.set(0, .84, 0);
    root.add(occluder, redThread, goldThread, pendant);
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
    const measuredAxis = anchor.handDirection
      ? new THREE.Vector3(mirrored ? -anchor.handDirection.x : anchor.handDirection.x, anchor.handDirection.y, -anchor.handDirection.z)
      : new THREE.Vector3(mirrored ? -direction.x : direction.x, direction.y, 0);
    if (measuredAxis.lengthSq() < .2) measuredAxis.set(mirrored ? -direction.x : direction.x, direction.y, 0);
    measuredAxis.normalize();
    const fallbackAxis = new THREE.Vector3(mirrored ? -direction.x : direction.x, direction.y, 0).normalize();
    const fallbackFacing = THREE.MathUtils.clamp(anchor.dorsalFacing ?? .7, 0, 1);
    const fallbackAcross = new THREE.Vector3(-fallbackAxis.y, fallbackAxis.x, 0);
    const fallbackRoll = (fallbackFacing - .5) * Math.PI;
    const measuredSurface = anchor.palmNormal
      ? new THREE.Vector3(mirrored ? -anchor.palmNormal.x : anchor.palmNormal.x, anchor.palmNormal.y, -anchor.palmNormal.z)
      : fallbackAcross.clone().multiplyScalar(Math.cos(fallbackRoll)).setZ(Math.sin(fallbackRoll));

    // Project the anatomical knuckle-side normal away from the forearm. This
    // produces a real bracelet basis in face-on, edge-on and palm-side poses.
    // Mirroring is applied once to X only.
    measuredSurface.addScaledVector(measuredAxis, -measuredSurface.dot(measuredAxis));
    if (measuredSurface.lengthSq() < .04) measuredSurface.copy(fallbackAcross).setZ(Math.sin(fallbackRoll));
    measuredSurface.normalize();
    if (!this.hasSurface) {
      this.smoothedSurface.copy(measuredSurface);
      this.smoothedAxis.copy(measuredAxis);
      this.hasSurface = true;
    } else {
      // A real wrist cannot invert either anatomical axis in one frame.
      if (this.smoothedSurface.dot(measuredSurface) < -.35) measuredSurface.multiplyScalar(-1);
      if (this.smoothedAxis.dot(measuredAxis) < -.35) measuredAxis.multiplyScalar(-1);
      this.smoothedSurface.lerp(measuredSurface, .24).normalize();
      this.smoothedAxis.lerp(measuredAxis, .3).normalize();
    }
    const axis = this.smoothedAxis;
    const surface = this.smoothedSurface.clone().addScaledVector(axis, -this.smoothedSurface.dot(axis)).normalize();
    // Recompute the radial vector after mirror/depth conversion. This restores
    // a proper right-handed basis instead of reflecting a quaternion.
    const crossWrist = surface.clone().cross(axis).normalize();
    const correctedSurface = axis.clone().cross(crossWrist).normalize();
    const basis = new THREE.Matrix4().makeBasis(crossWrist, correctedSurface, axis);

    this.attached.position.set(x, y, 0);
    this.attached.quaternion.setFromRotationMatrix(basis);
    this.attached.scale.setScalar(THREE.MathUtils.clamp(widthPx * .68, 27, 92));
    // The flower becomes a true edge profile while turning, then disappears on
    // the palm side so only the wrapped thread remains.
    this.attachedPendant.visible = correctedSurface.z > -.12;
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
