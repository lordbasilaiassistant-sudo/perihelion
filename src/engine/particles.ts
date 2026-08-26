import * as THREE from 'three'

export type ParticleKind = 'spark' | 'jet' | 'fog'

interface Particle {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  maxLife: number
  drag: number
  color: THREE.Color
}

const KIND_CFG: Record<ParticleKind, { speedMin: number; speedMax: number; spread: number; life: number; drag: number; color: THREE.Color; color2: THREE.Color }> = {
  spark: { speedMin: 1.5, speedMax: 5, spread: 0.7, life: 0.55, drag: 2.5, color: new THREE.Color(0xffc36b), color2: new THREE.Color(0xff5a26) },
  jet: { speedMin: 2.5, speedMax: 4.5, spread: 0.35, life: 0.32, drag: 4, color: new THREE.Color(0xbfe9ff), color2: new THREE.Color(0x4f9dff) },
  fog: { speedMin: 0.15, speedMax: 0.5, spread: 1, life: 2.6, drag: 0.6, color: new THREE.Color(0xbcd8e8), color2: new THREE.Color(0x7fa8bd) }
}

export class ParticlePool {
  points: THREE.Points
  private parts: Particle[] = []
  private positions: Float32Array
  private colors: Float32Array
  private cursor = 0
  readonly max: number

  constructor(max = 900) {
    this.max = max
    this.positions = new Float32Array(max * 3)
    this.colors = new Float32Array(max * 3)
    for (let i = 0; i < max; i++) {
      this.parts.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        drag: 1,
        color: new THREE.Color()
      })
      this.positions[i * 3 + 1] = -99999
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
  }

  emit(kind: ParticleKind, origin: THREE.Vector3, dir: THREE.Vector3, count: number, rng: () => number): void {
    const cfg = KIND_CFG[kind]
    for (let n = 0; n < count; n++) {
      const p = this.parts[this.cursor]
      this.cursor = (this.cursor + 1) % this.max
      p.active = true
      p.pos.copy(origin)
      p.vel
        .copy(dir)
        .addScaledVector(randVec(rng), cfg.spread)
        .normalize()
        .multiplyScalar(cfg.speedMin + rng() * (cfg.speedMax - cfg.speedMin))
      p.maxLife = cfg.life * (0.6 + rng() * 0.8)
      p.life = p.maxLife
      p.drag = cfg.drag
      p.color.copy(cfg.color).lerp(cfg.color2, rng())
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i]
      if (!p.active) continue
      p.life -= dt
      if (p.life <= 0) {
        p.active = false
        this.positions[i * 3 + 1] = -99999
        continue
      }
      const d = Math.exp(-p.drag * dt)
      p.vel.multiplyScalar(d)
      p.pos.addScaledVector(p.vel, dt)
      this.positions[i * 3] = p.pos.x
      this.positions[i * 3 + 1] = p.pos.y
      this.positions[i * 3 + 2] = p.pos.z
      const k = p.life / p.maxLife
      this.colors[i * 3] = p.color.r * k
      this.colors[i * 3 + 1] = p.color.g * k
      this.colors[i * 3 + 2] = p.color.b * k
    }
    ;(this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}

function randVec(rng: () => number): THREE.Vector3 {
  return new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
}
