export type Vec3 = [number, number, number]

export interface FieldHole {
  thetaCenter: number
  thetaHalf: number
  axialMin: number
  axialMax: number
}

export interface RadialField {
  kind: 'radial'
  id: string
  point: Vec3
  axis: Vec3
  refDir: Vec3
  axialMin: number
  axialMax: number
  innerR: number
  outerR: number
  omega: number
  holes?: FieldHole[]
}

export interface GradientField {
  kind: 'gradient'
  id: string
  origin: Vec3
  dir: Vec3
  tMin: number
  tMax: number
  gStart: number
  gEnd: number
  radius?: number
}

export type GravityField = RadialField | GradientField

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function angDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

interface RadialSample {
  inBounds: boolean
  r: number
  rx: number
  ry: number
  rz: number
}

function sampleRadial(f: RadialField, p: Vec3): RadialSample {
  const rel: Vec3 = [p[0] - f.point[0], p[1] - f.point[1], p[2] - f.point[2]]
  const ax = dot(rel, f.axis)
  if (ax < f.axialMin || ax > f.axialMax) return { inBounds: false, r: 0, rx: 0, ry: 0, rz: 0 }
  const rx = rel[0] - f.axis[0] * ax
  const ry = rel[1] - f.axis[1] * ax
  const rz = rel[2] - f.axis[2] * ax
  const r = Math.hypot(rx, ry, rz)
  if (r < f.innerR || r > f.outerR || r < 1e-5) return { inBounds: false, r, rx, ry, rz }
  if (f.holes && f.holes.length) {
    const ux = dot([rx, ry, rz], f.refDir)
    const px: Vec3 = [
      f.axis[1] * f.refDir[2] - f.axis[2] * f.refDir[1],
      f.axis[2] * f.refDir[0] - f.axis[0] * f.refDir[2],
      f.axis[0] * f.refDir[1] - f.axis[1] * f.refDir[0]
    ]
    const uy = dot([rx, ry, rz], px)
    const theta = Math.atan2(uy, ux)
    for (const h of f.holes) {
      if (
        Math.abs(angDiff(theta, h.thetaCenter)) < h.thetaHalf &&
        ax >= h.axialMin &&
        ax <= h.axialMax
      ) {
        return { inBounds: false, r, rx, ry, rz }
      }
    }
  }
  return { inBounds: true, r, rx, ry, rz }
}

export function fieldContains(f: GravityField, p: Vec3): boolean {
  if (f.kind === 'radial') return sampleRadial(f, p).inBounds
  const rel: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]]
  const t = dot(rel, f.dir)
  if (t < f.tMin || t > f.tMax) return false
  if (f.radius !== undefined) {
    const lat: Vec3 = [rel[0] - f.dir[0] * t, rel[1] - f.dir[1] * t, rel[2] - f.dir[2] * t]
    if (Math.hypot(lat[0], lat[1], lat[2]) > f.radius) return false
  }
  return true
}

export function gravityAt(f: GravityField, p: Vec3): Vec3 {
  if (f.kind === 'radial') {
    const s = sampleRadial(f, p)
    if (!s.inBounds) return [0, 0, 0]
    const mag = f.omega * f.omega * s.r
    return [(s.rx / s.r) * mag, (s.ry / s.r) * mag, (s.rz / s.r) * mag]
  }
  const rel: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]]
  const t = dot(rel, f.dir)
  if (t < f.tMin || t > f.tMax) return [0, 0, 0]
  if (f.radius !== undefined) {
    const lat: Vec3 = [rel[0] - f.dir[0] * t, rel[1] - f.dir[1] * t, rel[2] - f.dir[2] * t]
    if (Math.hypot(lat[0], lat[1], lat[2]) > f.radius) return [0, 0, 0]
  }
  const k = (t - f.tMin) / Math.max(1e-6, f.tMax - f.tMin)
  const mag = f.gStart + (f.gEnd - f.gStart) * k
  return [f.dir[0] * mag, f.dir[1] * mag, f.dir[2] * mag]
}

/** Standing-up direction: opposite gravity, or world +Y in free fall. */
export function upFromGravity(g: Vec3): Vec3 {
  const m = Math.hypot(g[0], g[1], g[2])
  if (m < 1e-8) return [0, 1, 0]
  return [-g[0] / m, -g[1] / m, -g[2] / m]
}

export function pickField(fields: readonly GravityField[], p: Vec3): GravityField | null {
  let best: GravityField | null = null
  let bestMag = 0
  for (const f of fields) {
    const g = gravityAt(f, p)
    const m = Math.hypot(g[0], g[1], g[2])
    if (m > bestMag) {
      bestMag = m
      best = f
    }
  }
  return best
}

export function tangentialVelocity(f: RadialField, p: Vec3): Vec3 {
  const rel: Vec3 = [p[0] - f.point[0], p[1] - f.point[1], p[2] - f.point[2]]
  const w = f.omega
  return [
    w * (f.axis[1] * rel[2] - f.axis[2] * rel[1]),
    w * (f.axis[2] * rel[0] - f.axis[0] * rel[2]),
    w * (f.axis[0] * rel[1] - f.axis[1] * rel[0])
  ]
}
