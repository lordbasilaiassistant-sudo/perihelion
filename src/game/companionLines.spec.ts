import { describe, expect, it } from 'vitest'
import { pickCompanionLine, freshLineMemory, IDLE_POOL } from './companionLines'

const OK = { co2Percent: 0.09, powerKWh: 10, hullPuncture: false, wingDamaged: false }
const CAP = 12

describe('MIRA line selection', () => {
  it('greets once per day, then falls through to idle pool', () => {
    const mem = freshLineMemory()
    const d1 = pickCompanionLine(OK, [], 1, CAP, mem)
    expect(d1.id).toBe('greet_2')
    const d1b = pickCompanionLine(OK, [], 1, CAP, d1.mem)
    expect(d1b.id).toBe(IDLE_POOL[0])
    const d2 = pickCompanionLine(OK, [], 2, CAP, d1b.mem)
    expect(d2.id).toBe('greet_3')
  })

  it('announces a crisis the first time, then stays calm about it', () => {
    const mem = freshLineMemory()
    mem.greetedDay = 1
    const bad = { ...OK, hullPuncture: true }
    const first = pickCompanionLine(bad, [], 1, CAP, mem)
    expect(first.id).toBe('crisis')
    const second = pickCompanionLine(bad, [], 1, CAP, first.mem)
    expect(second.id).toBe('status_hull')
    const healed = pickCompanionLine(OK, [], 1, CAP, second.mem)
    const reBroken = pickCompanionLine({ ...OK, hullPuncture: true }, [], 1, CAP, healed.mem)
    expect(reBroken.id).toBe('crisis')
  })

  it('delivers a pending event line exactly once before returning to rotation', () => {
    const mem = freshLineMemory()
    mem.greetedDay = 3
    mem.pending = 'harvest'
    const a = pickCompanionLine(OK, [], 3, CAP, mem)
    expect(a.id).toBe('harvest')
    expect(a.mem.pending).toBeNull()
    const b = pickCompanionLine(OK, [], 3, CAP, a.mem)
    expect(b.id).not.toBe('harvest')
  })

  it('prioritizes wing damage over co2 over power', () => {
    const mem = freshLineMemory()
    mem.greetedDay = 2
    const all = pickCompanionLine({ co2Percent: 2.0, powerKWh: 1, hullPuncture: false, wingDamaged: true }, [], 2, CAP, mem)
    expect(all.id).toBe('status_wing')
    const noWing = pickCompanionLine({ co2Percent: 2.0, powerKWh: 1, hullPuncture: false, wingDamaged: false }, [], 2, CAP, all.mem)
    expect(noWing.id).toBe('status_co2')
    const onlyPower = pickCompanionLine({ co2Percent: 0.2, powerKWh: 1, hullPuncture: false, wingDamaged: false }, [], 2, CAP, noWing.mem)
    expect(onlyPower.id).toBe('status_power')
  })

  it('praises a fully completed checklist', () => {
    const mem = freshLineMemory()
    mem.greetedDay = 4
    const res = pickCompanionLine(OK, [{ done: true }, { done: true }], 4, CAP, mem)
    expect(res.id).toBe('praise_all')
  })

  it('idle pool never repeats back-to-back and cycles', () => {
    const mem = freshLineMemory()
    mem.greetedDay = 9
    let m = mem
    let prev = ''
    for (let i = 0; i < IDLE_POOL.length * 2; i++) {
      const r = pickCompanionLine(OK, [], 9, CAP, m)
      expect(r.id).not.toBe(prev)
      prev = r.id
      m = r.mem
    }
    expect(m.idleIdx).toBe(IDLE_POOL.length * 2)
  })
})
