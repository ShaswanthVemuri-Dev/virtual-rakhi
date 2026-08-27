import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { publicUrl } from '../app/baseUrl';

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

const fileset = () => {
  if (!filesetPromise) filesetPromise = FilesetResolver.forVisionTasks(publicUrl('wasm'));
  return filesetPromise;
};

async function withDelegateFallback<T>(creator: (delegate: 'GPU' | 'CPU') => Promise<T>) {
  try {
    return await creator('GPU');
  } catch (gpuError) {
    console.warn('MediaPipe GPU delegate failed; falling back to CPU.', gpuError);
    return creator('CPU');
  }
}

export const createFaceLandmarker = async () => {
  const vision = await fileset();
  return withDelegateFallback((delegate) =>
    FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/face_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
};

export const createHandLandmarker = async (numHands = 2) => {
  const vision = await fileset();
  return withDelegateFallback((delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/hand_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numHands,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    }),
  );
};

export const createPoseLandmarker = async () => {
  const vision = await fileset();
  return withDelegateFallback((delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: publicUrl('models/pose_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: false,
      minPoseDetectionConfidence: 0.45,
      minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    }),
  );
};
