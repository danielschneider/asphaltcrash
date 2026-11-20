export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" as const;

export const ROOM_CODE_LENGTH = 6;

const BYTE_RANGE = 256;
const REJECT_FROM =
  Math.floor(BYTE_RANGE / ROOM_ALPHABET.length) * ROOM_ALPHABET.length;
const MAX_BATCHES = 1000;
const HOST_PEER_PREFIX = "asph-";
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export type RandomBytes = (count: number) => Uint8Array;

export function defaultRandomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Bytes >= REJECT_FROM (248 for 31 symbols) are discarded so every symbol has equal probability.
export function generateRoomCode(
  randomBytes: RandomBytes = defaultRandomBytes,
): string {
  let code = "";
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const missing = ROOM_CODE_LENGTH - code.length;
    for (const byte of randomBytes(missing)) {
      if (byte < REJECT_FROM && code.length < ROOM_CODE_LENGTH) {
        code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
      }
    }
    if (code.length === ROOM_CODE_LENGTH) {
      return code;
    }
  }
  throw new Error("room code generation exhausted its byte batches");
}

export function validateRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

export function hostPeerIdFor(code: string): string {
  return HOST_PEER_PREFIX + code;
}

export function roomCodeFromPeerId(peerId: string): string | null {
  if (!peerId.startsWith(HOST_PEER_PREFIX)) {
    return null;
  }
  const code = peerId.slice(HOST_PEER_PREFIX.length);
  return validateRoomCode(code) ? code : null;
}

export function generateUniqueRoomCode(
  isTaken: (code: string) => boolean,
  maxAttempts = 5,
  randomBytes: RandomBytes = defaultRandomBytes,
): string | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateRoomCode(randomBytes);
    if (!isTaken(code)) {
      return code;
    }
  }
  return null;
}
