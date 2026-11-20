import { ROOM_CODE_LENGTH, validateRoomCode } from "../network/room/roomCode";

export { ROOM_CODE_LENGTH, validateRoomCode };

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().slice(0, ROOM_CODE_LENGTH);
}
