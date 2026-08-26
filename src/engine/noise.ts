export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const v00 = hash2(xi, yi, seed)
  const v10 = hash2(xi + 1, yi, seed)
  const v01 = hash2(xi, yi + 1, seed)
  const v11 = hash2(xi + 1, yi + 1, seed)
  const u = smooth(xf)
  const v = smooth(yf)
  return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v
}

export function fbm(x: number, y: number, seed: number, octaves = 5, lacunarity = 2.1, gain = 0.5): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
