import { clamp } from './mathUtils'

export class GameClock {
  simSeconds: number
  dayLength = 86400

  constructor(startSeconds = 6 * 3600) {
    this.simSeconds = startSeconds
  }

  advance(dt: number): void {
    this.simSeconds += dt
  }

  get day(): number {
    return Math.floor(this.simSeconds / this.dayLength) + 1
  }

  get timeOfDay(): number {
    return this.simSeconds % this.dayLength
  }

  setTimeOfDay(seconds: number, dayOffset = 0): void {
    this.simSeconds += dayOffset * this.dayLength
    this.simSeconds -= this.timeOfDay
    this.simSeconds += clamp(seconds, 0, this.dayLength)
  }
}
