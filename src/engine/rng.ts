export type RngFn = () => number

export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Rng {
  private nextFn: RngFn

  constructor(seed: number) {
    this.nextFn = mulberry32(seed)
  }

  float(): number {
    return this.nextFn()
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.nextFn()
  }

  int(minIncl: number, maxIncl: number): number {
    return Math.floor(this.range(minIncl, maxIncl + 0.999999))
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.nextFn() * arr.length) % arr.length]
  }

  chance(p: number): boolean {
    return this.nextFn() < p
  }
}
