import * as THREE from 'three';
import { publicUrl } from '../app/baseUrl';
import type { NormalizedHand, WristAnchor } from '../types/vision';
import type { RakhiTyingState } from '../rakhi/tyingStateMachine';
import { rakhiPlacement } from '../rakhi/handRetargeting';

type DetectState = {
  isDetected: boolean;
  detected: number;
  isRightHand: boolean;
};

type VtoThree = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  trackersParent: THREE.Object3D[];
};

type VtoHelper = {
  init(spec: Record<string, unknown>): Promise<VtoThree>;
  resize(width: number, height: number): void;
  add_threeObject(object: THREE.Object3D): void;
  add_threeSoftOccluder(object: THREE.Mesh, radius: number, fade: number, debug: boolean): void;
  destroy(): Promise<void>;
};

type VtoGlobals = typeof globalThis & {
  THREE: typeof THREE;
  HandTrackerThreeHelper: VtoHelper;
  PoseFlipFilter: { instance(spec: Record<string, unknown>): unknown };
};

const BASE = 'vendor/webar-hand';
let runtimePromise: Promise<void> | null = null;

const loadScript = (path: string) => new Promise<void>((resolve, reject) => {
  const script = document.createElement('script');
  script.src = publicUrl(`${BASE}/${path}`);
  script.onload = () => resolve();
  script.onerror = () => reject(new Error(`Could not load ${path}`));
  document.head.append(script);
});

const loadRuntime = () => runtimePromise ??= (async () => {
  (globalThis as VtoGlobals).THREE = THREE;
  for (const file of ['WebARRocksHand.js', 'OneEuroLMStabilizer.js', 'PoseFlipFilter.js', 'HandTrackerThreeHelper.js']) {
    await loadScript(file);
  }
})();

let modelPreload: Promise<unknown> | null = null;

/** Watch-grade wrist VTO: dedicated wrist detector + PnP pose + soft occlusion. */
export class Rakhi3DRenderer {
  private helper: VtoHelper | null = null;
  private three: VtoThree | null = null;
  private startPromise: Promise<void> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private trackerCanvas = document.createElement('canvas');
  private attached: THREE.Group | null = null;
  private carried: THREE.Group | null = null;
  private anchor: WristAnchor | null = null;
  private positionAnchor: WristAnchor | null = null;
  private trackerDepth = .92;
  private lastTrackedAt = -Infinity;
  private hands: NormalizedHand[] = [];
  private state: RakhiTyingState = 'IDLE';
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  preload() {
    return Promise.all([
      loadRuntime(),
      modelPreload ??= fetch(publicUrl(`${BASE}/NN_WRIST_27.json`)).then((response) => {
        if (!response.ok) throw new Error('Could not preload the wrist model.');
        return response.text();
      }),
    ]).then(() => undefined);
  }

  start(video: HTMLVideoElement) {
    if (this.disposed || video.readyState < 2) return Promise.resolve();
    return this.startPromise ??= this.initialize(video);
  }

  private async initialize(video: HTMLVideoElement) {
    await loadRuntime();
    if (this.disposed) return;
    const globals = globalThis as VtoGlobals;
    this.helper = globals.HandTrackerThreeHelper;
    this.sizeCanvases(false);
    this.three = await this.helper.init({
      handTrackerCanvas: this.trackerCanvas,
      VTOCanvas: this.canvas,
      videoSettings: { videoElement: video },
      NNsPaths: [publicUrl(`${BASE}/NN_WRIST_27.json`)],
      poseLandmarksLabels: ['wristBack', 'wristLeft', 'wristRight', 'wristPalm', 'wristPalmTop', 'wristBackTop', 'wristRightBottom', 'wristLeftBottom'],
      objectPointsPositionFactors: [1, 1.3, 1],
      // Preserve the proven pose solve while letting translation respond to
      // real landmark motion instead of visibly trailing it.
      poseFilter: globals.PoseFlipFilter.instance({ startStabilizeCounter: 2, dPixTransTol: 32 }),
      landmarksStabilizerSpec: { minCutOff: .001, beta: 5, freqRange: [2, 144] },
      stabilizationSettings: { switchNNErrorThreshold: .5 },
      scanSettings: { threshold: .72, translationScalingFactors: [.52, .52, 1] },
      threshold: .72,
      maxHandsDetected: 1,
      freeZRot: true,
      enableFlipObject: false,
      hideTrackerIfDetectionLost: false,
      debugDisplayLandmarks: false,
      callbackTrack: (detectState: DetectState) => this.onTrack(detectState),
    });
    if (this.disposed) return void this.helper.destroy();
    this.setupScene();
    this.resizeObserver = new ResizeObserver(() => this.sizeCanvases(true));
    this.resizeObserver.observe(this.canvas);
  }

  private setupScene() {
    if (!this.three || !this.helper) return;
    this.three.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.three.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.renderer.toneMappingExposure = 1.05;
    this.three.scene.add(new THREE.HemisphereLight(0xfff8ee, 0x4d2419, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 7, 12);
    this.three.scene.add(key);

    this.attached = this.buildAttachedRakhi();
    this.attached.visible = false;
    this.helper.add_threeObject(this.attached);

    const radius = 4.55;
    const occluder = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 48, 40, 1, true),
      new THREE.MeshNormalMaterial(),
    );
    occluder.rotation.x = Math.PI / 2;
    occluder.position.set(0, -.45, .9);
    this.helper.add_threeSoftOccluder(occluder, radius, .55, false);

    this.carried = this.buildCarriedRakhi();
    this.carried.visible = false;
    this.carried.frustumCulled = false;
    this.three.scene.add(this.carried);
  }

  private materials() {
    return {
      red: new THREE.MeshPhysicalMaterial({ color: 0xb22632, roughness: .46, clearcoat: .35 }),
      saffron: new THREE.MeshPhysicalMaterial({ color: 0xf1b52f, roughness: .34, metalness: .24, clearcoat: .35 }),
      ruby: new THREE.MeshPhysicalMaterial({ color: 0x741329, roughness: .2, metalness: .16, clearcoat: .72 }),
    };
  }

  private buildFlower(cameraFacing = false) {
    const material = this.materials();
    const shape = new THREE.Shape();
    for (let index = 0; index <= 96; index += 1) {
      const angle = index / 96 * Math.PI * 2;
      const radius = 1.16 + Math.cos(angle * 10) * .28;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index) shape.lineTo(x, y); else shape.moveTo(x, y);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: .28, bevelEnabled: true, bevelSegments: 3,
      bevelSize: .08, bevelThickness: .08, curveSegments: 14,
    });
    geometry.center();
    if (!cameraFacing) geometry.rotateX(-Math.PI / 2);
    const petals = new THREE.Mesh(geometry, material.red);
    const gold = new THREE.Mesh(new THREE.CylinderGeometry(.72, .78, .22, 40), material.saffron);
    const ruby = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, .27, 32), material.ruby);
    if (cameraFacing) {
      gold.rotation.x = ruby.rotation.x = Math.PI / 2;
      gold.position.z = .22;
      ruby.position.z = .38;
    } else {
      gold.position.y = .22;
      ruby.position.y = .38;
    }
    const flower = new THREE.Group();
    flower.add(petals, gold, ruby);
    return flower;
  }

  private buildAttachedRakhi() {
    const material = this.materials();
    const root = new THREE.Group();
    root.position.set(0, -.45, .9);
    const red = new THREE.Mesh(new THREE.TorusGeometry(4.22, .14, 14, 96), material.red);
    const gold = new THREE.Mesh(new THREE.TorusGeometry(4.22, .075, 12, 96), material.saffron);
    red.position.z = -.15;
    gold.position.z = .15;
    const flower = this.buildFlower();
    flower.position.y = 4.23;
    root.add(red, gold, flower);
    return root;
  }

  private buildCarriedRakhi() {
    const material = this.materials();
    const root = new THREE.Group();
    const red = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 3.2, 12), material.red);
    const gold = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 3.2, 10), material.saffron);
    red.rotation.z = gold.rotation.z = Math.PI / 2;
    red.position.y = -.11;
    gold.position.y = .11;
    const flower = this.buildFlower(true);
    flower.scale.setScalar(.62);
    root.add(red, gold, flower);
    return root;
  }

  private onTrack(detectState: DetectState) {
    const now = performance.now();
    const rightWrist = !!detectState.isDetected && detectState.isRightHand;
    if (!detectState.isDetected && now - this.lastTrackedAt <= 700) return;
    if (!rightWrist || !this.three || !this.attached) {
      this.anchor = null;
      if (this.three?.trackersParent[0]) this.three.trackersParent[0].visible = false;
      return;
    }
    this.lastTrackedAt = now;
    const parent = this.three.trackersParent[0];
    parent.visible = true;
    this.three.scene.updateMatrixWorld(true);
    const camera = this.three.camera;
    this.alignTrackerToLandmark(parent, camera);
    const project = (point: THREE.Vector3) => this.attached!.localToWorld(point).project(camera);
    const center = project(new THREE.Vector3());
    const left = project(new THREE.Vector3(-4.22, 0, 0));
    const right = project(new THREE.Vector3(4.22, 0, 0));
    const bottom = project(new THREE.Vector3(0, 0, -2));
    const top = project(new THREE.Vector3(0, 0, 2));
    const wristWidth = Math.hypot(right.x - left.x, right.y - left.y) / 2;
    const axis = { x: top.x - bottom.x, y: bottom.y - top.y };
    const axisLength = Math.hypot(axis.x, axis.y) || 1;
    const direction = { x: axis.x / axisLength, y: axis.y / axisLength };
    this.anchor = {
      x: (center.x + 1) / 2,
      y: (1 - center.y) / 2,
      scale: THREE.MathUtils.clamp(wristWidth * 2.05, .07, .32),
      wristWidth: THREE.MathUtils.clamp(wristWidth, .03, .16),
      angle: Math.atan2(direction.y, direction.x) + Math.PI / 2,
      forearmDirection: direction,
      confidence: THREE.MathUtils.clamp(detectState.detected, 0, 1),
    };
    this.updateVisibility();
    this.placeCarried();
  }

  draw(hands: NormalizedHand[], state: RakhiTyingState, mirrored: boolean) {
    this.hands = hands;
    this.state = state;
    this.canvas.classList.toggle('mirrored-rakhi', mirrored);
    this.updateVisibility();
    this.placeCarried();
  }

  getAnchor() {
    return this.anchor;
  }

  setPositionAnchor(anchor: WristAnchor | null) {
    this.positionAnchor = anchor;
  }

  private alignTrackerToLandmark(parent: THREE.Object3D, camera: THREE.PerspectiveCamera) {
    if (!this.positionAnchor || this.positionAnchor.confidence < .42 || !this.attached || !this.three) return;
    // The VTO solve remains authoritative for rotation, depth and scale. Only
    // correct its X/Y translation with MediaPipe's anatomical wrist landmark.
    this.three.scene.updateMatrixWorld(true);
    const currentWorld = this.attached.localToWorld(new THREE.Vector3());
    const currentNdc = currentWorld.clone().project(camera);
    if (![currentNdc.x, currentNdc.y, currentNdc.z].every(Number.isFinite)) return;
    this.trackerDepth = THREE.MathUtils.clamp(currentNdc.z, -.95, .98);
    const targetWorld = new THREE.Vector3(
      this.positionAnchor.x * 2 - 1,
      1 - this.positionAnchor.y * 2,
      this.trackerDepth,
    ).unproject(camera);
    const delta = targetWorld.sub(currentWorld);
    parent.matrix.elements[12] += delta.x;
    parent.matrix.elements[13] += delta.y;
    parent.matrix.elements[14] += delta.z;
    parent.matrixWorldNeedsUpdate = true;
    this.three.scene.updateMatrixWorld(true);
  }

  private updateVisibility() {
    if (!this.attached || !this.carried) return;
    this.attached.visible = !!this.anchor && (this.state === 'FINISHING_ANIMATION' || this.state === 'RAKHI_ATTACHED');
    this.carried.visible = ['POSITIONING', 'APPROACHING_WRIST', 'ALIGNMENT_VALID'].includes(this.state) && this.hands.length === 2;
  }

  private placeCarried() {
    if (!this.carried?.visible || !this.three) return;
    const placement = rakhiPlacement(this.hands);
    if (!placement) return;
    const camera = this.three.camera;
    const screenToWorld = (x: number, y: number) =>
      new THREE.Vector3(x * 2 - 1, 1 - y * 2, this.trackerDepth).unproject(camera);
    const center = screenToWorld(placement.center.x, placement.center.y);
    const edge = screenToWorld(placement.center.x + placement.span / 2, placement.center.y);
    this.carried.position.copy(center);
    this.carried.quaternion.copy(camera.quaternion);
    this.carried.rotateZ(-placement.angle);
    this.carried.scale.setScalar(THREE.MathUtils.clamp(center.distanceTo(edge) / 1.6, .03, 3));
  }

  private sizeCanvases(notify: boolean) {
    const clientWidth = Math.max(2, this.canvas.clientWidth);
    const clientHeight = Math.max(2, this.canvas.clientHeight);
    // The call camera is requested at 1280x720. Rendering a larger tracking
    // surface adds GPU work but no wrist detail, especially on high-DPI iPads.
    const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1280 / clientWidth, 720 / clientHeight);
    const width = Math.max(2, Math.round(clientWidth * scale));
    const height = Math.max(2, Math.round(clientHeight * scale));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = this.trackerCanvas.width = width;
    this.canvas.height = this.trackerCanvas.height = height;
    if (notify) this.helper?.resize(width, height);
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.anchor = null;
    this.positionAnchor = null;
    if (this.helper && this.startPromise) void this.helper.destroy();
  }
}
