import { stepsFor } from './mathUtils'

export const SIM_DT = 1 / 60

export interface LoopStats {
  fps: number
  msFrame: number
  msTick: number
  msRender: number
  ticksLastFrame: number
  warp: number
}

export interface LoopCallbacks {
  tick: (dt: number) => void
  frame: (alpha: number, dtReal: number) => void
}

export class GameLoop {
  stats: LoopStats = { fps: 0, msFrame: 0, msTick: 0, msRender: 0, ticksLastFrame: 0, warp: 1 }
  maxStepsPerFrame = 12
  /** Max rendered fps. 0 = uncapped. Sim always runs on the fixed 60Hz clock. */
  frameCap = 60
  private acc = 0
  private last = 0
  private lastRender = 0
  private frames = 0
  private fpsTimer = 0
  private running = false
  private rendererRaw: { setAnimationLoop(cb: ((t: number) => void) | null): void }

  constructor(rendererRaw: { setAnimationLoop(cb: ((t: number) => void) | null): void }) {
    this.rendererRaw = rendererRaw
  }

  start(cb: LoopCallbacks): void {
    this.running = true
    this.last = performance.now()
    this.lastRender = 0
    this.rendererRaw.setAnimationLoop((t) => {
      const now = performance.now()
      void t
      let dtReal = (now - this.last) / 1000
      this.last = now
      if (!(dtReal > 0) || dtReal > 0.25) dtReal = 0.016

      const t0 = now
      this.acc += dtReal * this.stats.warp
      const steps = stepsFor(this.acc, SIM_DT, this.maxStepsPerFrame)
      this.acc -= steps * SIM_DT
      if (steps === this.maxStepsPerFrame) this.acc = 0
      for (let i = 0; i < steps; i++) cb.tick(SIM_DT)
      const t1 = performance.now()
      this.stats.msTick = this.stats.msTick * 0.92 + (t1 - t0) * 0.08
      this.stats.ticksLastFrame = steps
      this.stats.msFrame = this.stats.msFrame * 0.92 + dtReal * 1000 * 0.08
      this.fpsTimer += dtReal

      if (this.frameCap > 0 && this.lastRender > 0 && now - this.lastRender < 1000 / this.frameCap - 1.5) {
        if (this.fpsTimer >= 0.5) {
          this.stats.fps = Math.round(this.frames / this.fpsTimer)
          this.frames = 0
          this.fpsTimer = 0
        }
        return
      }
      this.lastRender = now
      cb.frame(this.acc / SIM_DT, dtReal)
      const t2 = performance.now()
      this.stats.msRender = this.stats.msRender * 0.92 + (t2 - t1) * 0.08
      this.frames++
      if (this.fpsTimer >= 0.5) {
        this.stats.fps = Math.round(this.frames / this.fpsTimer)
        this.frames = 0
        this.fpsTimer = 0
      }
    })
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.rendererRaw.setAnimationLoop(null)
  }
}
