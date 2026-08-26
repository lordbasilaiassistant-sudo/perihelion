// AmbientScore — procedural deep-space soundtrack, zero assets, zero licenses.
// Detuned triangle pads drift through a slow four-chord cycle; sparse plucked
// harmonics echo into a feedback delay; a crisis layer (tritone pad + sub
// pulse) fades in with alert intensity. All WebAudio, CPU cost ~zero.

type Chord = number[]

const CHORDS: Chord[] = [
  [110.0, 164.81, 220.0, 261.63, 329.63], // Am add9
  [87.31, 130.81, 174.61, 220.0, 261.63], // Fmaj7
  [130.81, 196.0, 246.94, 293.66, 329.63], // Cmaj9
  [98.0, 146.83, 196.0, 220.0, 293.66] // Gsus2
]

const PLUCK_SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0]
const CHORD_SEC = 16

export class AmbientScore {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private started = false
  private chordIdx = 0
  private nextChordAt = 0
  private nextPluckAt = 0
  private intensity = 0.1
  private targetIntensity = 0.1
  private ducked = false
  private crisisGain: GainNode | null = null

  constructor(private audio: { context: AudioContext | null; out: GainNode | null }) {}

  setDuck(d: boolean): void {
    this.ducked = d
    if (this.bus && this.ctx) {
      const target = (this.ducked ? 0.05 : 0.15) * (this.muted() ? 0 : 1)
      this.bus.gain.cancelScheduledValues(this.ctx.currentTime)
      this.bus.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.5)
    }
  }

  private muted(): boolean {
    return false
  }

  setIntensity(x: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, x))
  }

  start(): void {
    if (this.started) return
    const ctx = this.audio.context
    const dest = this.audio.out
    if (!ctx || !dest) return
    this.ctx = ctx
    this.started = true

    this.bus = ctx.createGain()
    this.bus.gain.value = 0.0001
    this.bus.connect(dest)
    this.setDuck(false)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 820
    lp.Q.value = 0.35
    lp.connect(this.bus)

    const delay = ctx.createDelay(1.2)
    delay.delayTime.value = 0.44
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    const wet = ctx.createGain()
    wet.gain.value = 0.3
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(wet)
    wet.connect(this.bus)

    this.padOut = lp
    this.delayIn = delay

    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 55
    const subG = ctx.createGain()
    subG.gain.value = 0.045
    sub.connect(subG)
    subG.connect(lp)
    sub.start()

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.03
    const lfoG = ctx.createGain()
    lfoG.gain.value = 210
    lfo.connect(lfoG)
    lfoG.connect(lp.frequency)
    lfo.start()

    const cG = ctx.createGain()
    cG.gain.value = 0.0001
    cG.connect(lp)
    this.crisisGain = cG
    for (const f of [155.56, 233.08]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.value = 0.05
      o.connect(og)
      og.connect(cG)
      o.start()
    }
    const pulse = ctx.createOscillator()
    pulse.type = 'sine'
    pulse.frequency.value = 52
    const pulseAmp = ctx.createGain()
    pulseAmp.gain.value = 0
    const plfo = ctx.createOscillator()
    plfo.frequency.value = 1.15
    const plfoG = ctx.createGain()
    plfoG.gain.value = 0.5
    plfo.connect(plfoG)
    plfoG.connect(pulseAmp.gain)
    const pulseBase = ctx.createConstantSource ? ctx.createConstantSource() : null
    let baseOffset: ConstantSourceNode | null = null
    if (pulseBase) {
      pulseBase.offset.value = 0.5
      pulseBase.connect(pulseAmp.gain)
      pulseBase.start()
      baseOffset = pulseBase
    }
    void baseOffset
    pulse.connect(pulseAmp)
    pulseAmp.connect(cG)
    pulse.start()
    plfo.start()

    this.nextChordAt = ctx.currentTime + 0.1
    this.nextPluckAt = ctx.currentTime + 6
  }

  private padOut: AudioNode | null = null
  private delayIn: AudioNode | null = null

  private playChord(chord: Chord): void {
    if (!this.ctx || !this.padOut) return
    const t = this.ctx.currentTime
    for (const freq of chord) {
      for (const detune of [-3.5, 3.5]) {
        const o = this.ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = freq
        o.detune.value = detune
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(0.028, t + CHORD_SEC * 0.45)
        g.gain.setValueAtTime(0.028, t + CHORD_SEC * 0.62)
        g.gain.linearRampToValueAtTime(0.0001, t + CHORD_SEC + 3)
        o.connect(g)
        g.connect(this.padOut)
        o.start(t)
        o.stop(t + CHORD_SEC + 3.2)
      }
    }
  }

  private playPluck(): void {
    if (!this.ctx || !this.delayIn || !this.padOut) return
    const t = this.ctx.currentTime
    const f = PLUCK_SCALE[Math.floor(Math.random() * PLUCK_SCALE.length)]
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.075, t)
    g.gain.exponentialRampToValueAtTime(0.0002, t + 2.8)
    const pan = this.ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    o.connect(g)
    g.connect(pan)
    pan.connect(this.padOut)
    pan.connect(this.delayIn)
    o.start(t)
    o.stop(t + 3)
  }

  update(dtReal: number): void {
    if (!this.started || !this.ctx) return
    const now = this.ctx.currentTime
    if (now >= this.nextChordAt - 0.25) {
      this.playChord(CHORDS[this.chordIdx % CHORDS.length])
      this.chordIdx++
      this.nextChordAt = Math.max(now, this.nextChordAt - 0.25) + CHORD_SEC
    }
    if (now >= this.nextPluckAt) {
      this.playPluck()
      if (Math.random() < 0.22) this.playPluck()
      this.nextPluckAt = now + 5 + Math.random() * 9
    }
    const k = Math.min(1, dtReal * 0.7)
    this.intensity += (this.targetIntensity - this.intensity) * k
    if (this.crisisGain && this.ctx) {
      const target = Math.max(0.0001, (this.intensity - 0.35) / 0.65) * 0.85
      this.crisisGain.gain.setTargetAtTime(Math.max(0.0001, target), now, 1.4)
    }
  }
}
