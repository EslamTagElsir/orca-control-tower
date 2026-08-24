/**
 * Tiny seeded PRNG (mulberry32) + helpers.
 *
 * Presentation-layer only. Used to make the Live Operations Demo run plan
 * randomized per run but internally deterministic and reproducible from a
 * single integer seed. Never used for model values.
 *
 * Framework-agnostic: plain TypeScript.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Weighted pick; weights must be positive. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    weighted: (items) => {
      const total = items.reduce((sum, i) => sum + i.weight, 0);
      let roll = next() * total;
      for (const entry of items) {
        roll -= entry.weight;
        if (roll <= 0) return entry.item;
      }
      return items[items.length - 1]!.item;
    },
  };
  return rng;
}

/** New seed for a fresh run. Not used during render. */
export function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Short, human-quotable run identifier derived from the seed. */
export function runIdFromSeed(seed: number): string {
  return `RUN-${(seed >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
}
