/**
 * Small, fast, seeded pseudo-random number generator (mulberry32). Used so seed
 * data generation is reproducible in tests and can be seeded from `Date.now()`
 * at runtime without pulling in a third-party dependency.
 */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function random(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
