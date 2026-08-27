import type { Vec3 } from '../types/vision';

export const fitCanvasToVideo = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
};

export const mirrorPoint = (point: Vec3): Vec3 => ({ x: 1 - point.x, y: point.y, z: point.z });

export const clear = (canvas: HTMLCanvasElement) => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
