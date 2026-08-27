const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normalizeRoomCode = (value: string) => value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);

export const createRoomCode = (length = 6) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
};

export const hostPeerId = (roomCode: string) => `virtual-rakhi-${normalizeRoomCode(roomCode).toLowerCase()}-host`;
