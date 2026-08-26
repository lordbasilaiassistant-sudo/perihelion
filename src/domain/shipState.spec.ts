import { describe, expect, it } from 'vitest'
import { freshSystems, tickSystems, alertsOf, hasCritical, systemActions } from './shipState'

describe('ship systems tick', () => {
  it('keeps co2 stable when scrubbers are powered and online', () => {
    const s = freshSystems()
    const startCo2 = s.co2Percent
    for (let i = 0; i < 3600; i++) tickSystems(s, 1)
    expect(s.co2Percent).toBeLessThan(startCo2 + 0.05)
    expect(s.powerKWh).toBeGreaterThan(0)
  })

  it('co2 climbs with scrubber breakers open', () => {
    const s = freshSystems()
    s.scrubbersOnline = false
    for (let i = 0; i < 36000; i++) tickSystems(s, 1)
    expect(s.co2Percent).toBeGreaterThan(0.09 + 0.9)
    expect(hasCritical(s)).toBe(true)
  })

  it('pressure falls on puncture and stops after seal', () => {
    const s = freshSystems()
    systemActions.microPuncture(s)
    for (let i = 0; i < 60; i++) tickSystems(s, 1)
    const low = s.pressureKPa
    expect(low).toBeLessThan(101)
    systemActions.sealHull(s)
    for (let i = 0; i < 600; i++) tickSystems(s, 1)
    expect(s.pressureKPa).toBeGreaterThan(low)
  })

  it('damaged wing reduces solar generation', () => {
    const a = freshSystems()
    a.powerKWh = 6
    const b = freshSystems()
    b.powerKWh = 6
    systemActions.meteorHitWing(b)
    for (let i = 0; i < 7200; i++) {
      tickSystems(a, 1)
      tickSystems(b, 1)
    }
    expect(a.powerKWh).toBeGreaterThan(b.powerKWh)
  })

  it('food depletes over time', () => {
    const s = freshSystems()
    const start = s.foodKcal
    for (let i = 0; i < 86400 / 10; i++) tickSystems(s, 10)
    expect(s.foodKcal).toBeLessThan(start - 2000)
  })

  it('alerts escalate with severity', () => {
    const s = freshSystems()
    expect(alertsOf(s).length).toBe(0)
    s.co2Percent = 3.6
    expect(alertsOf(s).some((a) => a.level === 'crit')).toBe(true)
  })

  it('a single filter clog makes the filter replaceable (task completable)', () => {
    const s = freshSystems()
    systemActions.clogFilter(s)
    expect(s.scrubberFilterWear).toBeGreaterThan(0.5)
    expect(alertsOf(s).some((a) => a.id === 'filter')).toBe(true)
    systemActions.replaceFilter(s)
    expect(s.scrubberFilterWear).toBeLessThan(0.1)
    expect(alertsOf(s).some((a) => a.id === 'filter')).toBe(false)
  })
})
