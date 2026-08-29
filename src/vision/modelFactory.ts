import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { publicUrl } from '../app/baseUrl';

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

const fileset = () => {
  if (!filesetPromise) filesetPromise = FilesetResolver.forVisionTasks(publicUrl('wasm'));
  return filesetPromise;
};

export const createFaceLandmarker = async () => {
  const vision = await fileset();
  return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/face_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
};

export const createHandLandmarker = async (numHands = 2) => {
  const vision = await fileset();
  return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/hand_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
};

export const createPoseLandmarker = async () => {
  const vision = await fileset();
  return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/pose_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: false,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
};
