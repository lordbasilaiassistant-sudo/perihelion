import type { PlotDef } from './shipBuilder'

export type PlotStage = 'empty' | 'growing' | 'ripe'

export interface PlotState {
  stage: PlotStage
  t: number
  watered: boolean
}

export const GROW_SECS = 420

export class GardenSystem {
  states: PlotState[]

  constructor(public defs: PlotDef[]) {
    this.states = defs.map(() => ({ stage: 'empty' as PlotStage, t: 0, watered: false }))
  }

  tick(dt: number): void {
    for (const s of this.states) {
      if (s.stage === 'growing') {
        s.t += (dt * (s.watered ? 1.6 : 1)) / GROW_SECS
        if (s.t >= 1) {
          s.t = 1
          s.stage = 'ripe'
        }
      }
    }
  }

  interact(idx: number): 'planted' | 'harvested' | 'watered' | 'none' {
    const s = this.states[idx]
    if (!s) return 'none'
    if (s.stage === 'empty') {
      s.stage = 'growing'
      s.t = 0
      s.watered = false
      return 'planted'
    }
    if (s.stage === 'ripe') {
      s.stage = 'empty'
      s.t = 0
      s.watered = false
      return 'harvested'
    }
    if (!s.watered) {
      s.watered = true
      return 'watered'
    }
    return 'none'
  }

  visualSync(): void {
    this.defs.forEach((def, i) => {
      const s = this.states[i]
      const holder = def.plantGroup
      const plant = holder.children[0]
      if (!plant) return
      let sc = 0.001
      if (s.stage === 'growing') sc = 0.18 + s.t * 0.62
      else if (s.stage === 'ripe') sc = 0.85
      plant.scale.setScalar(sc)
      const fruit = plant.getObjectByName('fruit')
      if (fruit) fruit.visible = s.stage === 'ripe'
    })
  }

  ripeCount(): number {
    return this.states.filter((s) => s.stage === 'ripe').length
  }

  serialize(): PlotState[] {
    return this.states.map((s) => ({ ...s }))
  }

  hydrate(raw: PlotState[] | undefined): void {
    if (!raw || raw.length !== this.states.length) return
    for (let i = 0; i < raw.length; i++) this.states[i] = { ...raw[i] }
    this.visualSync()
  }
}
