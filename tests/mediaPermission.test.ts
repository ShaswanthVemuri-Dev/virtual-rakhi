import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireCameraThenMicrophone } from '../src/media/acquireMedia';

class FakeStream {
  constructor(private tracks: Array<{ kind: string }> = []) {}
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
}

afterEach(() => vi.unstubAllGlobals());

describe('media permission fallback', () => {
  it('keeps camera video when microphone permission is denied', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('MediaStream', FakeStream);
    const camera = new FakeStream([{ kind: 'video' }]);
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(camera)
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const result = await acquireCameraThenMicrophone({ getUserMedia } as unknown as MediaDevices);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.stream.getVideoTracks()).toHaveLength(1);
    expect(result.stream.getAudioTracks()).toHaveLength(0);
    expect(result.microphoneError).toContain('Microphone access is blocked');
  });
});
