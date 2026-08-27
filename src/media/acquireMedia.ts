export interface MediaAcquireResult {
  stream: MediaStream;
  microphoneError: string | null;
}

const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
};

export const describeMediaError = (cause: unknown, device: 'camera' | 'microphone') => {
  const error = cause as DOMException | undefined;
  const name = error?.name ?? '';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return `${device === 'camera' ? 'Camera' : 'Microphone'} access requires HTTPS or localhost. Open the app from its local/Vercel URL, not directly from index.html.`;
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return `${device === 'camera' ? 'Camera' : 'Microphone'} access is blocked. Use the lock icon beside the address, set ${device} to Allow, then retry.`;
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return `No usable ${device} was found. Connect one or close software that disabled it, then retry.`;
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return `The ${device} is busy or blocked by Windows privacy settings. Close other camera apps and check Settings > Privacy & security.`;
  }
  if (name === 'OverconstrainedError') return `The ${device} cannot satisfy the requested settings. Retry after reconnecting it.`;
  return `${device === 'camera' ? 'Camera' : 'Microphone'} could not start${error?.message ? `: ${error.message}` : '.'}`;
};

export const acquireCameraThenMicrophone = async (
  mediaDevices: MediaDevices = navigator.mediaDevices,
): Promise<MediaAcquireResult> => {
  if (!window.isSecureContext || !mediaDevices?.getUserMedia) {
    throw new DOMException('HTTPS or localhost is required.', 'SecurityError');
  }

  // Video is requested first on purpose. A denied/unavailable microphone must not
  // destroy an already-valid camera session (the Phase 2 permission regression).
  const videoStream = await mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
  const tracks = [...videoStream.getVideoTracks()];
  let microphoneError: string | null = null;
  try {
    const audioStream = await mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    tracks.push(...audioStream.getAudioTracks());
  } catch (cause) {
    microphoneError = describeMediaError(cause, 'microphone');
  }
  return { stream: new MediaStream(tracks), microphoneError };
};

export const retryMicrophone = async (stream: MediaStream, mediaDevices: MediaDevices = navigator.mediaDevices) => {
  const audioStream = await mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
  return stream;
};
