import * as THREE from 'three'

export interface Interactable {
  id: string
  objs: THREE.Object3D[]
  range: number
  holdTime?: number
  getHoldTime?: () => number | undefined
  prompt: () => string | null
  onStart?: () => void
  onTick?: (dt: number) => void
  onFinish?: () => void
  onCancel?: () => void
}

export class InteractionSystem {
  entries: Interactable[] = []
  private raycaster = new THREE.Raycaster()
  private allRoots: THREE.Object3D[] = []
  private owner = new Map<THREE.Object3D, Interactable>()
  hover: Interactable | null = null
  hoverDist = Infinity
  holding: { entry: Interactable; t: number } | null = null
  lastDebug = ''

  register(entry: Interactable): void {
    this.entries.push(entry)
    for (const o of entry.objs) {
      this.allRoots.push(o)
      this.owner.set(o, entry)
    }
  }

  debugRoots(): THREE.Object3D[] {
    return this.allRoots
  }

  findHover(camera: THREE.Camera): Interactable | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hits = this.raycaster.intersectObjects(this.allRoots, true)
    const dbg: string[] = [`roots=${this.allRoots.length} hits=${hits.length}`]
    for (const hit of hits.slice(0, 3)) dbg.push(`${hit.object.type}@${hit.distance.toFixed(2)}`)
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object
      while (o) {
        const entry = this.owner.get(o)
        if (entry) {
          if (hit.distance <= entry.range) {
            const p = entry.prompt()
            dbg.push(`->${entry.id}:${p === null ? 'nullprompt' : 'ok'}`)
            this.lastDebug = dbg.join(' ')
            if (p !== null) {
              this.hover = entry
              this.hoverDist = hit.distance
              return entry
            }
            break
          }
          dbg.push(`->${entry.id}:FAR${hit.distance.toFixed(1)}>${entry.range}`)
          this.lastDebug = dbg.join(' ')
          break
        }
        o = o.parent
      }
    }
    this.lastDebug = dbg.join(' ')
    this.hover = null
    this.hoverDist = Infinity
    return null
  }

  holdSeconds(entry: Interactable): number | undefined {
    return entry.getHoldTime ? entry.getHoldTime() : entry.holdTime
  }

  tryBeginHold(): boolean {
    if (this.holding || !this.hover) return false
    const need = this.holdSeconds(this.hover)
    if (need === undefined) return false
    this.holding = { entry: this.hover, t: 0 }
    document.documentElement.dataset.tb = `${this.hover.id}@${need.toFixed(1)}`
    this.hover.onStart?.()
    return true
  }

  isHoldEntry(entry: Interactable | null): boolean {
    return !!entry && entry.holdTime !== undefined
  }

  tickHold(dt: number): number | null {
    if (!this.holding) return null
    const need = this.holdSeconds(this.holding.entry) ?? 1
    if (need <= 0) {
      const doneEntry = this.holding.entry
      this.holding = null
      doneEntry.onStart?.()
      doneEntry.onFinish?.()
      return 1
    }
    this.holding.t += dt
    document.documentElement.dataset.tb = `${this.holding.entry.id} t=${this.holding.t.toFixed(2)}/${need.toFixed(1)}`
    this.holding.entry.onTick?.(dt)
    if (this.holding.t >= need) {
      const done = this.holding.entry
      this.holding = null
      done.onFinish?.()
      return 1
    }
    return this.holding.t / need
  }

  releaseHold(): void {
    if (!this.holding) return
    this.holding.entry.onCancel?.()
    this.holding = null
  }

  useHover(): void {
    if (this.hover && this.holdSeconds(this.hover) === undefined) {
      this.hover.onStart?.()
    }
  }
}
