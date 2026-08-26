type SfxName =
  | 'ui'
  | 'doorOpen'
  | 'doorClose'
  | 'clank'
  | 'hiss'
  | 'alarm'
  | 'boom'
  | 'step'
  | 'harvest'

type LoopName = 'hum' | 'thrust' | 'breath'

const FILES: Record<SfxName, string[]> = {
  ui: ['audio/computerNoise_000.ogg', 'audio/computerNoise_002.ogg'],
  doorOpen: ['audio/doorOpen_000.ogg', 'audio/doorOpen_001.ogg'],
  doorClose: ['audio/doorClose_000.ogg', 'audio/doorClose_001.ogg'],
  clank: ['audio/impactMetal_000.ogg', 'audio/impactMetal_001.ogg', 'audio/impactMetal_003.ogg'],
  hiss: ['audio/engineCircular_000.ogg'],
  alarm: ['audio/forceField_001.ogg', 'audio/forceField_003.ogg'],
  boom: ['audio/lowFrequency_explosion_000.ogg'],
  step: ['audio/impactMetal_003.ogg'],
  harvest: ['audio/computerNoise_001.ogg']
}

const LOOP_FILES: Record<LoopName, string> = {
  hum: 'audio/spaceEngineLow_000.ogg',
  thrust: 'audio/thrusterFire_001.ogg',
  breath: ''
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loops = new Map<LoopName, { gain: GainNode; target: number }>()
  private extra = new Map<string, Promise<AudioBuffer | null>>()
  muted = false

  get context(): AudioContext | null {
    return this.ctx
  }

  get out(): GainNode | null {
    return this.master
  }

  preload(key: string, url: string): void {
    if (this.extra.has(key)) return
    const p = this.load(url).catch(() => null)
    this.extra.set(key, p)
    void p.then((buf) => {
      if (buf) this.buffers.set(key, buf)
    })
  }

  playBuffer(key: string, vol = 1, rate = 1): number {
    if (!this.ctx || !this.master || this.muted) return 0
    const cached = this.buffers.get(key)
    if (cached) {
      return this.startBuffer(cached, vol, rate)
    }
    const p = this.extra.get(key)
    if (p) {
      void p.then((buf) => {
        if (buf && this.ctx) this.startBuffer(buf, vol, rate)
      })
      return 0
    }
    return 0
  }

  private startBuffer(buf: AudioBuffer, vol: number, rate: number): number {
    if (!this.ctx || !this.master) return buf.duration
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = vol
    src.connect(g)
    g.connect(this.master)
    src.start()
    return buf.duration / rate
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.85
    this.master.connect(this.ctx.destination)
    for (const [name, files] of Object.entries(FILES)) {
      const file = files[Math.floor(Math.random() * files.length)]
      void this.load(file).then((buf) => {
        if (buf) this.buffers.set(name, buf)
      })
    }
    const humFile = LOOP_FILES.hum
    void this.load(humFile).then((buf) => {
      if (buf && this.ctx && this.master) this.makeLoop('hum', buf, 0.0, 0.9)
    })
    const thrFile = LOOP_FILES.thrust
    void this.load(thrFile).then((buf) => {
      if (buf && this.ctx && this.master) this.makeLoop('thrust', buf, 0.0, 1)
    })
    this.makeSynthBreathLoop()
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const arr = await res.arrayBuffer()
      return await this.ctx.decodeAudioData(arr)
    } catch {
      return null
    }
  }

  private makeLoop(name: LoopName, buf: AudioBuffer, vol: number, rate: number): void {
    if (!this.ctx || !this.master) return
    if (this.loops.has(name)) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.playbackRate.value = rate
    const gain = this.ctx.createGain()
    gain.gain.value = vol
    src.connect(gain)
    gain.connect(this.master)
    src.start()
    this.loops.set(name, { gain, target: vol })
  }

  private makeSynthBreathLoop(): void {
    if (!this.ctx || !this.master) return
    const len = 4
    const sr = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, len * sr, sr)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const t = i / sr
      const phase = (t % 4) / 4
      const env = Math.sin(phase * Math.PI) ** 2
      data[i] = (Math.random() * 2 - 1) * env * env
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = 700
    filt.Q.value = 0.7
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    src.connect(filt)
    filt.connect(gain)
    gain.connect(this.master)
    src.start()
    this.loops.set('breath', { gain, target: 0 })
  }

  play(name: SfxName, vol = 1, rate = 1): void {
    if (!this.ctx || !this.master || this.muted) return
    const buf = this.buffers.get(name)
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = vol
    src.connect(g)
    g.connect(this.master)
    src.start()
  }

  setLoopVolume(name: LoopName, v: number, rampSec = 0.25): void {
    const loop = this.loops.get(name)
    if (!loop || !this.ctx) return
    loop.target = v
    loop.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    loop.gain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + rampSec)
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.85
  }
}
