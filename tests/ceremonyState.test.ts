import { describe, expect, it } from 'vitest';
import { deriveNetworkVisionFeatures } from '../src/app/ceremonyState';

describe('Rakhi preparation', () => {
  it('starts receiver wrist inference as soon as Tilak activates', () => {
    expect(deriveNetworkVisionFeatures('RECEIVER', {
      faceActivated: true,
      giverHandsActive: false,
      rakhiState: 'IDLE',
    })).toEqual({ face: true, wrist: true, hands: false });
  });
});
