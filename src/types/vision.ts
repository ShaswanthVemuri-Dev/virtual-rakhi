export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export interface FaceAnchor {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  confidence: number;
}

export interface WristAnchor {
  x: number;
  y: number;
  scale: number;
  angle: number;
  confidence: number;
  forearmDirection: Vec2;
  wristWidth?: number;
  palmNormal?: Vec3;
  handDirection?: Vec3;
  dorsalFacing?: number;
}

export interface TrackedHand {
  id: string;
  handedness: 'Left' | 'Right' | 'Unknown';
  confidence: number;
  landmarks: Vec3[];
  worldLandmarks?: Vec3[];
}

export interface NormalizedHand {
  id: string;
  handedness: 'Left' | 'Right' | 'Unknown';
  confidence: number;
  localLandmarks: Vec3[];
  palmScale: number;
  palmAngle: number;
  wrist: Vec2;
  workspaceOffset: Vec2;
  pairCenter: Vec2;
  pairScale: number;
}

export interface InferenceStats {
  faceFps: number;
  wristFps: number;
  handFps: number;
  renderFps: number;
}

export interface Phase1Frame {
  timestamp: number;
  faceAnchor: FaceAnchor | null;
  wristAnchor: WristAnchor | null;
  faceLandmarks: Vec3[];
  poseLandmarks: Vec3[];
  hands: TrackedHand[];
  normalizedHands: NormalizedHand[];
  stats: InferenceStats;
}

export type LabMode = 'RECEIVER' | 'GIVER';

export interface VisionFeatures {
  face: boolean;
  wrist: boolean;
  hands: boolean;
}

export type QualityLabel = 'READY' | 'GOOD - HOLD STEADY' | 'ADJUST POSITION' | 'TRACKING LOST';
