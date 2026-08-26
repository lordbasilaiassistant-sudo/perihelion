// MIRA's conversational brain — pure logic, no DOM, unit-testable in Node.
export interface LineContext {
  co2Percent: number
  powerKWh: number
  hullPuncture: boolean
  wingDamaged: boolean
}

export interface LineMemory {
  greetedDay: number
  idleIdx: number
  pending: string | null
  crisisSeen: boolean
}

export function freshLineMemory(): LineMemory {
  return { greetedDay: -1, idleIdx: 0, pending: null, crisisSeen: false }
}

export const IDLE_POOL = ['idle_1', 'idle_2', 'idle_3', 'idle_4', 'lore_1', 'lore_2', 'lore_3', 'lore_4']

export function pickCompanionLine(
  ctx: LineContext,
  tasks: Array<{ done: boolean }>,
  day: number,
  capKWh: number,
  mem: LineMemory
): { id: string; mem: LineMemory } {
  const out = { ...mem }
  const crit = ctx.hullPuncture || ctx.co2Percent > 2.4
  if (crit) {
    if (!out.crisisSeen) {
      out.crisisSeen = true
      return { id: 'crisis', mem: out }
    }
  } else {
    out.crisisSeen = false
  }
  if (out.greetedDay !== day) {
    out.greetedDay = day
    return { id: `greet_${(day % 3) + 1}`, mem: out }
  }
  if (out.pending) {
    const p = out.pending
    out.pending = null
    return { id: p, mem: out }
  }
  if (ctx.wingDamaged) return { id: 'status_wing', mem: out }
  if (ctx.hullPuncture) return { id: 'status_hull', mem: out }
  if (ctx.co2Percent > 1.1) return { id: 'status_co2', mem: out }
  if (ctx.powerKWh < capKWh * 0.25) return { id: 'status_power', mem: out }
  if (tasks.length > 0 && tasks.every((t) => t.done)) return { id: 'praise_all', mem: out }
  const id = IDLE_POOL[out.idleIdx % IDLE_POOL.length]
  out.idleIdx++
  return { id, mem: out }
}
