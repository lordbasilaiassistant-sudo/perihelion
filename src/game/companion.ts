import * as THREE from 'three'
import type { AudioManager } from '../engine/audio'
import { pickCompanionLine, freshLineMemory, type LineMemory } from './companionLines'

export interface CompanionLine {
  id: string
  text: string
}

interface TaskLike {
  done: boolean
}

interface ManifestEntry {
  file: string
  dur: number
  text: string
}

function buildDrone(): { group: THREE.Group; eye: THREE.Mesh; halo: THREE.Mesh; hitMesh: THREE.Mesh } {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8edf0, roughness: 0.32, metalness: 0.55 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.6 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x59d8ff, emissiveIntensity: 2.6, roughness: 0.2 })
  const haloMat = new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x3fc4ef, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 18), bodyMat)
  group.add(body)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.087, 0.008, 10, 32), darkMat)
  band.rotation.x = Math.PI / 2
  group.add(band)
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), eyeMat)
  eye.position.set(0, 0.01, 0.068)
  group.add(eye)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.0035, 8, 40), haloMat)
  halo.rotation.x = Math.PI / 2.4
  group.add(halo)
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 6), darkMat)
  ant.position.y = 0.12
  group.add(ant)
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xffb454, emissive: 0xffb454, emissiveIntensity: 1.8 })
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), tipMat)
  tip.position.y = 0.168
  group.add(tip)
  const light = new THREE.PointLight(0x6fd3ff, 0.55, 2.6, 2)
  light.position.set(0, 0.02, 0.09)
  group.add(light)

  for (const o of [body, band]) o.castShadow = true

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  )
  group.add(hitMesh)

  return { group, eye, halo, hitMesh }
}

export class Companion {
  group: THREE.Group
  hitMesh: THREE.Mesh
  private eye: THREE.Mesh
  private halo: THREE.Mesh
  private pos = new THREE.Vector3(0, 1.35, -1.4)
  private vel = new THREE.Vector3()
  private t = Math.random() * 100
  private manifest: Record<string, ManifestEntry> | null = null
  private mem: LineMemory = freshLineMemory()
  dialogOpen = false
  private typingTimer = 0
  private fullText = ''
  private typedChars = 0
  private closeAt = Infinity
  private voiceDur = 0
  private elText: HTMLElement | null = null
  private elBox: HTMLElement | null = null

  constructor() {
    const d = buildDrone()
    this.group = d.group
    this.eye = d.eye
    this.halo = d.halo
    this.hitMesh = d.hitMesh
    this.elBox = document.getElementById('dialogue')
    this.elText = document.getElementById('dialogue-text')
    void fetch('audio/voice/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.lines)) {
          this.manifest = {}
          for (const l of j.lines) this.manifest[l.id] = { file: 'audio/voice/' + l.file, dur: l.dur, text: l.text }
        }
      })
      .catch(() => {})
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dialogOpen) this.closeDialog(true)
    })
  }

  preloadVoices(audio: AudioManager): void {
    if (!this.manifest) return
    for (const l of Object.values(this.manifest)) audio.preload('mira:' + l.file, l.file)
  }

  onNewDay(): void {
    this.mem.greetedDay = -1
  }

  notify(kind: string): void {
    if (!this.mem.pending) this.mem.pending = kind
  }

  pickLine(
    systems: { co2Percent: number; powerKWh: number; hullPuncture: boolean; wingDamaged: boolean },
    tasks: TaskLike[],
    day: number,
    capKWh: number
  ): { id: string; text: string } {
    const res = pickCompanionLine(systems, tasks, day, capKWh, this.mem)
    this.mem = res.mem
    return this.line(res.id)
  }

  private line(id: string): { id: string; text: string } {
    const m = this.manifest?.[id]
    return { id, text: m ? m.text : '…radio crackles softly…' }
  }

  speak(audio: AudioManager, lineId: string, text: string): void {
    if (this.dialogOpen) this.closeDialog(true)
    this.dialogOpen = true
    this.fullText = text
    this.typedChars = 0
    this.typingTimer = 0
    this.elBox?.classList.remove('hidden')
    if (this.elText) this.elText.textContent = ''
    let dur = 0
    if (this.manifest && this.manifest[lineId]) {
      dur = audio.playBuffer('mira:' + this.manifest[lineId].file, 0.95)
      if (!dur) dur = this.manifest[lineId].dur
    } else {
      dur = text.length * 0.055
    }
    this.voiceDur = dur
    this.closeAt = performance.now() / 1000 + dur + 2.2
  }

  advance(): boolean {
    if (!this.dialogOpen) return false
    if (this.typedChars < this.fullText.length) {
      this.typedChars = this.fullText.length
      if (this.elText) this.elText.textContent = this.fullText
    } else {
      this.closeDialog(false)
    }
    return true
  }

  closeDialog(silent: boolean): void {
    if (!silent && this.dialogOpen === false) return
    this.dialogOpen = false
    this.closeAt = Infinity
    this.elBox?.classList.add('hidden')
  }

  frame(dtReal: number, camera: THREE.PerspectiveCamera, playerEye: THREE.Vector3, basisUp: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3): void {
    this.t += dtReal
    const camDir = new THREE.Vector3()
    camera.getWorldDirection(camDir)

    const target = new THREE.Vector3()
    if (this.dialogOpen) {
      target.copy(camera.position).addScaledVector(camDir, 1.05)
      target.addScaledVector(basisUp, -0.16)
    } else {
      // floats at head height, right of view, clear of furniture volumes
      target.copy(playerEye).addScaledVector(basisUp, 0.28).addScaledVector(fwd, 0.72).addScaledVector(right, 0.58)
    }

    const steer = target.clone().sub(this.pos)
    const dist = steer.length()
    const k = Math.min(1, dtReal * (this.dialogOpen ? 3.4 : 2.3))
    this.vel.lerp(steer.multiplyScalar(k * 2.4), Math.min(1, dtReal * 3))
    this.pos.addScaledVector(this.vel, dtReal)
    if (dist > 3.2) this.pos.copy(target)

    const bob = Math.sin(this.t * 2.15) * 0.02 + Math.sin(this.t * 0.7) * 0.008
    this.group.position.copy(this.pos)
    this.group.position.y += bob

    const lookTarget = this.dialogOpen ? playerEye : this.pos.clone().addScaledVector(this.vel.lengthSq() > 1e-6 ? this.vel : camDir, 1)
    this.group.lookAt(lookTarget)

    this.halo.rotation.z += dtReal * 0.9
    const talkPulse = this.dialogOpen ? 1 + Math.sin(this.t * 7.3) * 0.1 : 1
    this.eye.scale.setScalar(talkPulse)
    ;(this.halo.material as THREE.MeshStandardMaterial).opacity = this.dialogOpen ? 0.95 : 0.6 + Math.sin(this.t * 1.8) * 0.15

    if (this.dialogOpen) {
      const cps = Math.max(26, this.fullText.length / Math.max(0.6, this.voiceDur * 0.82))
      if (this.typedChars < this.fullText.length) {
        this.typingTimer += dtReal * cps
        const n = Math.min(this.fullText.length, Math.floor(this.typingTimer))
        if (n !== this.typedChars) {
          this.typedChars = n
          if (this.elText) this.elText.textContent = this.fullText.slice(0, n)
        }
      }
      if (performance.now() / 1000 > this.closeAt) this.closeDialog(false)
    }
  }
}
