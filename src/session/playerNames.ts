export const PLAYER_NAME_ADJECTIVES = [
  "awesome",
  "fancy",
  "ultra",
  "super",
  "epic",
  "legendary",
  "deluxe",
] as const;

export const PLAYER_NAME_ANIMALS = [
  "squirrel",
  "pig",
  "dog",
  "cat",
  "mouse",
  "cow",
] as const;

export const PLAYER_NAME_MAX_LENGTH = 16;
export const PLAYER_NAME_NUMBER_MIN = 10;
export const PLAYER_NAME_NUMBER_MAX = 99;

export type PlayerNameAdjective = (typeof PLAYER_NAME_ADJECTIVES)[number];
export type PlayerNameAnimal = (typeof PLAYER_NAME_ANIMALS)[number];
export type RandomIndex = (max: number) => number;

const UINT32_RANGE = 0x1_0000_0000;

// Rejection sampling keeps every index equally likely.
export function defaultRandomIndex(max: number): number {
  const limit = UINT32_RANGE - (UINT32_RANGE % max);
  for (;;) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    if (value < limit) return value % max;
  }
}

// Format "<Adjective>-<Animal>-<NN>" (NN always two digits). If that exceeds
// 16 chars the adjective is dropped: "<Animal>-<NN>" (e.g. "Squirrel-42").
export function formatPlayerName(
  adjective: PlayerNameAdjective,
  animal: PlayerNameAnimal,
  number: number,
): string {
  const animalPart = `${capitalise(animal)}-${number}`;
  const full = `${capitalise(adjective)}-${animalPart}`;
  return full.length <= PLAYER_NAME_MAX_LENGTH ? full : animalPart;
}

export function generatePlayerName(
  randomIndex: RandomIndex = defaultRandomIndex,
): string {
  return formatPlayerName(
    pick(PLAYER_NAME_ADJECTIVES, randomIndex),
    pick(PLAYER_NAME_ANIMALS, randomIndex),
    drawNumber(randomIndex),
  );
}

export function generateUniquePlayerName(
  taken: ReadonlySet<string>,
  randomIndex: RandomIndex = defaultRandomIndex,
  maxAttempts = 20,
): string {
  const takenKeys = new Set(Array.from(taken, nameKey));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generatePlayerName(randomIndex);
    if (!takenKeys.has(nameKey(candidate))) return candidate;
  }
  const animal = capitalise(pick(PLAYER_NAME_ANIMALS, randomIndex));
  // Among size+1 consecutive numbers at most size candidates are taken, so one is always free.
  for (
    let number = PLAYER_NAME_NUMBER_MIN;
    number <= PLAYER_NAME_NUMBER_MIN + takenKeys.size;
    number += 1
  ) {
    const candidate = `${animal}-${number}`;
    if (!takenKeys.has(nameKey(candidate))) return candidate;
  }
  throw new Error("playerNames: no free fallback name");
}

function drawNumber(randomIndex: RandomIndex): number {
  const span = PLAYER_NAME_NUMBER_MAX - PLAYER_NAME_NUMBER_MIN + 1;
  return PLAYER_NAME_NUMBER_MIN + randomIndex(span);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function nameKey(name: string): string {
  return name.toLowerCase();
}

function pick<T>(items: readonly T[], randomIndex: RandomIndex): T {
  const item = items[randomIndex(items.length)];
  if (item === undefined) {
    throw new RangeError("playerNames: random index out of range");
  }
  return item;
}
