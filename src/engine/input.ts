const GAME_KEYS = new Set(['Tab', 'F3', 'Space', 'Backquote'])

export class Input {
  private held = new Set<string>()
  private edges = new Set<string>()
  mouseDX = 0
  mouseDY = 0
  sensitivity = 0.0022
  locked = false
  enabled = true
  private lockGraceUntil = 0
  private el: HTMLElement | null = null

  attach(el: HTMLElement): void {
    this.el = el
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        const el = document.documentElement
        el.dataset.bqKeydowns = String((Number(el.dataset.bqKeydowns) || 0) + 1)
      }
      const del = document.documentElement
      del.dataset.lastKd = e.code
      del.dataset.kdEnabled = String(this.enabled)
      if (!this.enabled && e.code !== 'Escape') return
      if (GAME_KEYS.has(e.code) || e.code.startsWith('Arrow')) e.preventDefault()
      if (!e.repeat) this.edges.add(e.code)
      this.held.add(e.code)
    })
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code)
    })
    window.addEventListener('blur', () => {
      this.held.clear()
    })
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el
      if (!this.locked) this.held.clear()
      this.lockGraceUntil = performance.now() + 250
      this.mouseDX = 0
      this.mouseDY = 0
    })
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return
      if (performance.now() < this.lockGraceUntil) return
      const mx = e.movementX
      const my = e.movementY
      if (Math.abs(mx) > 300 || Math.abs(my) > 300) return
      this.mouseDX += mx
      this.mouseDY += my
    })
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        this.requestLock()
        return
      }
      const code = e.button === 0 ? 'MouseL' : 'MouseR'
      this.edges.add(code)
      this.held.add(code)
    })
    window.addEventListener('mouseup', (e) => {
      this.held.delete(e.button === 0 ? 'MouseL' : 'MouseR')
    })
  }

  requestLock(): void {
    void this.el?.requestPointerLock()
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  down(code: string): boolean {
    return this.held.has(code)
  }

  pressed(code: string): boolean {
    return this.edges.has(code)
  }

  consumeEdge(code: string): boolean {
    const had = this.edges.has(code)
    this.edges.delete(code)
    return had
  }

  consumeLook(): [number, number] {
    const d: [number, number] = [this.mouseDX * this.sensitivity, this.mouseDY * this.sensitivity]
    this.mouseDX = 0
    this.mouseDY = 0
    return d
  }

  endFrame(): void {
    this.edges.clear()
  }

  axis(neg: string, pos: string): number {
    return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0)
  }
}
