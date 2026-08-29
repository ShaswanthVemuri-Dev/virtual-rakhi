import { describe, expect, it } from 'vitest';
import { acceptsParticipant } from '../src/rtc/peerSession';

describe('two-person admission', () => {
  it('accepts the first participant and only that participant afterward', () => {
    expect(acceptsParticipant(null, 'first-device')).toBe(true);
    expect(acceptsParticipant('first-device', 'first-device')).toBe(true);
    expect(acceptsParticipant('first-device', 'third-device')).toBe(false);
  });
});
