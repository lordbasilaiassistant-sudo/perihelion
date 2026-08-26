import type { Rng } from '../engine/rng'
import type { ShipSystems } from './shipState'
import { systemActions } from './shipState'

export type EventKind = 'clogFilter' | 'meteor' | 'surge' | 'pumpClog' | 'puncture'

export interface DayEvent {
  kind: EventKind
  atSec: number
}

const WEIGHTS: Array<[EventKind, number]> = [
  ['clogFilter', 0.27],
  ['meteor', 0.22],
  ['surge', 0.18],
  ['pumpClog', 0.17],
  ['puncture', 0.16]
]

export function rollDayEvents(rng: Rng, sys: ShipSystems, dayStartSec: number, dayLen: number): DayEvent[] {
  let count = 0
  const r0 = rng.float()
  if (r0 < 0.42) count = 0
  else if (r0 < 0.82) count = 1
  else count = 2
  const out: DayEvent[] = []
  for (let i = 0; i < count; i++) {
    const atSec = dayStartSec + rng.range(dayLen * 0.12, dayLen * 0.86)
    let pick = rng.float()
    let kind: EventKind = 'clogFilter'
    for (const [k, w] of WEIGHTS) {
      if (pick < w) {
        kind = k
        break
      }
      pick -= w
    }
    if (kind === 'meteor' && sys.wingDamaged) kind = 'clogFilter'
    if (out.some((e) => e.kind === kind)) continue
    out.push({ kind, atSec })
  }
  out.sort((a, b) => a.atSec - b.atSec)
  return out
}

export interface EventResult {
  toast: string
  task: string | null
  sfx: 'boom' | 'alarm' | null
  shake: number
}

export function applyEvent(kind: EventKind, sys: ShipSystems): EventResult {
  switch (kind) {
    case 'clogFilter':
      systemActions.clogFilter(sys)
      return { toast: 'ALERT: scrubber filter pressure dropping', task: 'repair-filter', sfx: 'alarm', shake: 0 }
    case 'meteor':
      systemActions.meteorHitWing(sys)
      return { toast: 'IMPACT: micrometeorite strike — port solar wing damaged', task: 'repair-wing', sfx: 'boom', shake: 1 }
    case 'surge':
      systemActions.powerSurge(sys)
      return { toast: 'ELECTRICAL SURGE — battery bank took a hit', task: null, sfx: 'alarm', shake: 0.4 }
    case 'pumpClog':
      systemActions.pumpClog(sys)
      return { toast: 'Water recycler flow degrading — sediment buildup', task: 'repair-recycler', sfx: 'alarm', shake: 0 }
    case 'puncture':
      systemActions.microPuncture(sys)
      return { toast: 'HULL BREACH — pressure falling. Find and seal the leak.', task: 'repair-hull', sfx: 'boom', shake: 1 }
  }
}
