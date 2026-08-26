import { formatClock } from '../engine/mathUtils'

export class DebugOverlay {
  visible = false
  private history: number[] = []
  private ctx: CanvasRenderingContext2D | null
  private lastUpdate = 0

  constructor() {
    const cv = document.getElementById('spark') as HTMLCanvasElement | null
    this.ctx = cv ? cv.getContext('2d') : null
  }

  toggle(): boolean {
    this.visible = !this.visible
    document.getElementById('debug-panel')?.classList.toggle('hidden', !this.visible)
    return this.visible
  }

  pushFrame(ms: number): void {
    this.history.push(ms)
    if (this.history.length > 160) this.history.shift()
  }

  update(info: Record<string, string | number>, now: number): void {
    if (!this.visible || now - this.lastUpdate < 130) return
    this.lastUpdate = now
    const lines = Object.entries(info).map(([k, v]) => `${k}: ${v}`)
    document.getElementById('debug-lines')!.textContent = lines.join('\n')
    if (!this.ctx) return
    const cv = this.ctx.canvas
    this.ctx.clearRect(0, 0, cv.width, cv.height)
    const w = cv.width / 160
    for (let i = 0; i < this.history.length; i++) {
      const ms = this.history[i]
      const h = Math.min(cv.height, (ms / 33) * cv.height)
      this.ctx.fillStyle = ms < 7 ? '#57e389' : ms < 14 ? '#e5c95c' : '#ff6b6b'
      this.ctx.fillRect(i * w, cv.height - h, Math.max(1, w - 0.5), h)
    }
    void formatClock
  }
}
