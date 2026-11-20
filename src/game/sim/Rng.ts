export interface Rng {
  next(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
}

export function createRng(seed: number): Rng {
  let state = (seed >>> 0) | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (minInclusive: number, maxInclusive: number): number => {
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(next() * span);
  };

  return { next, nextInt };
}
