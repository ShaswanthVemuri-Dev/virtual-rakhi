import { describe, expect, it } from 'vitest';
import { createRoomCode, hostPeerId, normalizeRoomCode } from '../src/rtc/room';

describe('room codes', () => {
  it('normalizes ambiguous/unsafe input and creates stable peer ids', () => {
    expect(normalizeRoomCode(' ab-01_z9 ')).toBe('ABZ9');
    expect(hostPeerId('ABCD23')).toBe('virtual-rakhi-abcd23-host');
  });

  it('creates shareable codes from the unambiguous alphabet', () => {
    const code = createRoomCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
