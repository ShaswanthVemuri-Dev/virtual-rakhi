import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireRequiredMedia } from '../src/media/acquireMedia';

afterEach(() => vi.unstubAllGlobals());

describe('required call media', () => {
  it('requests camera and microphone as one required path', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const result = await acquireRequiredMedia({ getUserMedia } as unknown as MediaDevices);
    expect(result).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.any(Object),
      audio: expect.any(Object),
    }));
  });

  it('fails setup when a required device is denied', async () => {
    vi.stubGlobal('window', { isSecureContext: true });
    const denied = new DOMException('denied', 'NotAllowedError');
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    await expect(acquireRequiredMedia({ getUserMedia } as unknown as MediaDevices)).rejects.toBe(denied);
  });
});
