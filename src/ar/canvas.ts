import type { Vec3 } from '../types/vision';

export const fitCanvasToVideo = (canvas: HTMLCanvasElement, video: HTMLVideoElement, maxWidth = Number.POSITIVE_INFINITY) => {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / width);
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
};

export const mirrorPoint = (point: Vec3): Vec3 => ({ x: 1 - point.x, y: point.y, z: point.z });

export const clear = (canvas: HTMLCanvasElement) => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
