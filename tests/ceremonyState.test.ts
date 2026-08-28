import { describe, expect, it } from 'vitest';
import { deriveNetworkVisionFeatures } from '../src/app/ceremonyState';

describe('Rakhi preparation', () => {
  it('can warm the face during Aarti without starting wrist inference', () => {
    expect(deriveNetworkVisionFeatures('RECEIVER', {
      faceActivated: true,
      wristActivated: false,
      giverHandsActive: false,
      rakhiState: 'IDLE',
    })).toEqual({ face: true, wrist: false, hands: false });
  });

  it('starts receiver wrist inference as soon as Tilak activates', () => {
    expect(deriveNetworkVisionFeatures('RECEIVER', {
      faceActivated: true,
      wristActivated: true,
      giverHandsActive: false,
      rakhiState: 'IDLE',
    })).toEqual({ face: true, wrist: true, hands: false });
  });
});
