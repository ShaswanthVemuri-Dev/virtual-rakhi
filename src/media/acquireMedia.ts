const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  aspectRatio: { ideal: 16 / 9 },
  facingMode: 'user',
  frameRate: { ideal: 30, max: 30 },
};

export const describeMediaError = (cause: unknown, device: 'camera' | 'microphone' | 'camera or microphone') => {
  const error = cause as DOMException | undefined;
  const name = error?.name ?? '';
  const label = device === 'camera or microphone' ? 'Camera or microphone' : device === 'camera' ? 'Camera' : 'Microphone';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return `${label} access requires HTTPS or localhost. Open the app from its local/Vercel URL, not directly from index.html.`;
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return `${label} access is blocked. Use the lock icon beside the address, allow both camera and microphone, then retry.`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return `No usable ${device} was found. Connect one or close software that disabled it, then retry.`;
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return `The ${device} is busy or blocked by Windows privacy settings. Close other camera apps and check Settings > Privacy & security.`;
  }
  if (name === 'OverconstrainedError') return `The ${device} cannot satisfy the requested settings. Retry after reconnecting it.`;
  return `${label} could not start${error?.message ? `: ${error.message}` : '.'}`;
};

export const assertMainPathSupported = () => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!window.isSecureContext) throw new Error('Open this application over HTTPS or localhost.');
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support the required camera and WebRTC APIs.');
  if (typeof canvas.captureStream !== 'function' || typeof RTCRtpSender === 'undefined' || typeof RTCRtpSender.prototype.replaceTrack !== 'function') throw new Error('This browser cannot send the composed ceremony video. Use a current Chrome, Edge, or Safari release.');
  if (!gl || typeof WebAssembly === 'undefined') throw new Error('This device cannot run the required 3D/WASM wrist tracking path.');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};

export const acquireRequiredMedia = async (
  mediaDevices: MediaDevices = navigator.mediaDevices,
): Promise<MediaStream> => {
  if (!window.isSecureContext || !mediaDevices?.getUserMedia) {
    throw new DOMException('HTTPS or localhost is required.', 'SecurityError');
  }

  return mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
};
