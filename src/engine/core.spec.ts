import { describe, expect, it } from 'vitest'
import { clamp, lerp, stepsFor, formatClock } from './mathUtils'
import { mulberry32, Rng } from './rng'
import { rollDayEvents } from '../domain/events'
import { freshSystems } from '../domain/shipState'

describe('mathUtils', () => {
  it('clamps', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(2, 0, 1)).toBe(1)
  })

  it('lerps', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5)
  })

  it('stepsFor respects fixed dt and cap', () => {
    expect(stepsFor(0.016, 1 / 60, 12)).toBe(0)
    expect(stepsFor(0.05, 1 / 60, 12)).toBe(3)
    expect(stepsFor(10, 1 / 60, 5)).toBe(5)
    expect(stepsFor(NaN, 1 / 60, 5)).toBe(0)
  })

  it('formats clock', () => {
    expect(formatClock(6 * 3600)).toBe('06:00:00')
    expect(formatClock(3661)).toBe('01:01:01')
  })
})

describe('rng determinism', () => {
  it('same seed same sequence', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('Rng.int stays in range', () => {
    const r = new Rng(7)
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
})

describe('event director', () => {
  it('is deterministic per seed and respects day bounds', () => {
    const mk = (seed: number) => rollDayEvents(new Rng(seed), freshSystems(), 21600, 86400)
    const a = mk(99)
    const b = mk(99)
    expect(a).toEqual(b)
    for (const e of a) {
      expect(e.atSec).toBeGreaterThan(21600)
      expect(e.atSec).toBeLessThan(21600 + 86400 * 0.86)
    }
  })

  it('never doubles the meteor when wing already damaged', () => {
    const sys = freshSystems()
    sys.wingDamaged = true
    for (let seed = 0; seed < 200; seed++) {
      const evs = rollDayEvents(new Rng(seed), sys, 0, 86400)
      expect(evs.filter((e) => e.kind === 'meteor').length).toBeLessThanOrEqual(1)
    }
  })
})
