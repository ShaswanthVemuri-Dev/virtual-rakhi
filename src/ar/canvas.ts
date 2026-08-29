export const fitCanvasToVideo = (canvas: HTMLCanvasElement, video: HTMLVideoElement, maxWidth = Number.POSITIVE_INFINITY) => {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const scale = Math.min(1, maxWidth / width);
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
};
