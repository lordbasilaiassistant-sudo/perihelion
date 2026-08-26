import { describe, expect, it } from 'vitest'
import { gravityAt, pickField, tangentialVelocity, fieldContains, type RadialField, type GradientField, type Vec3 } from './gravity'

const v = (x: number, y: number, z: number): Vec3 => [x, y, z]

const ring: RadialField = {
  kind: 'radial',
  id: 'ring',
  point: [0, 0, -4],
  axis: [0, 0, 1],
  refDir: [1, 0, 0],
  axialMin: -1.16,
  axialMax: 1.16,
  innerR: 2.74,
  outerR: 5.08,
  omega: 0.99,
  holes: [{ thetaCenter: Math.PI / 2, thetaHalf: 0.19, axialMin: -0.84, axialMax: 0.84 }]
}

const spoke: GradientField = {
  kind: 'gradient',
  id: 'spoke',
  origin: [0, 2.44, -4],
  dir: [0, 1, 0],
  tMin: 0.02,
  tMax: 2.58,
  gStart: 0,
  gEnd: 0.99 * 0.99 * 5
}

describe('radial spin field', () => {
  it('gives omega^2 * r outward at the floor', () => {
    const g = gravityAt(ring, [5, 0, -4])
    const mag = Math.hypot(g[0], g[1], g[2])
    expect(mag).toBeCloseTo(0.99 * 0.99 * 5, 3)
    expect(g[0] / mag).toBeCloseTo(1, 5)
    expect(g[1]).toBeCloseTo(0, 5)
  })

  it('is zero inside the bore and outside radius bounds', () => {
    expect(gravityAt(ring, [0, 0, -4])).toEqual([0, 0, 0])
    expect(gravityAt(ring, [9, 0, -4])).toEqual([0, 0, 0])
    expect(gravityAt(ring, [4, 0, 40])).toEqual([0, 0, 0])
  })

  it('carves out the spoke hole', () => {
    const p = v(0, 3.8, -4)
    expect(gravityAt(ring, p)).toEqual([0, 0, 0])
    expect(fieldContains(ring, p)).toBe(false)
    const outsideHole = v(3.8 * Math.cos(Math.PI), 3.8 * Math.sin(Math.PI) + 0.001, -4)
    expect(fieldContains(ring, outsideHole)).toBe(true)
  })

  it('tangential velocity is omega cross r', () => {
    const vel = tangentialVelocity(ring, [5, 0, -4])
    expect(vel[1]).toBeCloseTo(0.99 * 5, 4)
    expect(vel[0]).toBeCloseTo(0, 4)
    expect(vel[2]).toBeCloseTo(0, 4)
  })
})

describe('gradient spoke field', () => {
  it('ramps linearly from hub to ring floor', () => {
    const gBottom = gravityAt(spoke, v(0, 2.6, -4))
    const gMid = gravityAt(spoke, v(0, 3.73, -4))
    const gTop = gravityAt(spoke, v(0, 4.98, -4))
    expect(Math.hypot(gBottom[0], gBottom[1], gBottom[2])).toBeLessThan(0.3)
    expect(Math.hypot(gMid[0], gMid[1], gMid[2])).toBeCloseTo((0.99 * 0.99 * 5) * ((3.73 - 2.44 - 0.02) / (2.58 - 0.02)), 2)
    expect(Math.hypot(gTop[0], gTop[1], gTop[2])).toBeGreaterThan(4.4)
  })

  it('is zero beyond its ends', () => {
    expect(gravityAt(spoke, v(0, 1.5, -4))).toEqual([0, 0, 0])
    expect(gravityAt(spoke, v(0, 7, -4))).toEqual([0, 0, 0])
  })
})

describe('pickField', () => {
  it('returns the strongest field containing the point', () => {
    const best = pickField([ring, spoke], [4.9, 0, -4])
    expect(best?.id).toBe('ring')
    const none = pickField([ring, spoke], [0, 0, 30])
    expect(none).toBeNull()
  })
})
