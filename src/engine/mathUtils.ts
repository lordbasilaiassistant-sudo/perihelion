export const TAU = Math.PI * 2
export const EPS = 1e-6

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function stepsFor(accumulator: number, fixedDt: number, maxSteps: number): number {
  if (!(accumulator >= fixedDt)) return 0
  return Math.min(maxSteps, Math.floor(accumulator / fixedDt))
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600) % 24
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`
}
