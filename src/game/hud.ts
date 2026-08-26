import * as THREE from 'three'

const REF_CACHE = new Map<string, HTMLElement>()

function el(id: string): HTMLElement {
  let e = REF_CACHE.get(id)
  if (!e) {
    const found = document.getElementById(id)
    if (!found) throw new Error(`missing HUD element #${id}`)
    e = found
    REF_CACHE.set(id, e)
  }
  return e
}

export interface ToastLevel {
  level?: 'info' | 'warn' | 'crit'
}

export class Hud {
  private toasts: HTMLElement
  private toastTimes: Array<{ node: HTMLElement; born: number }> = []
  checklistOpen = false

  constructor() {
    this.toasts = el('toasts')
  }

  setHudVisible(v: boolean): void {
    el('hud').classList.toggle('hidden', !v)
  }

  update(d: {
    day: number
    clock: string
    powerPct: number
    o2: number
    co2: number
    pressure: number
    water: number
    food: number
    mode: string
    grav: string
    suited: boolean
    held: string | null
    prompt: string | null
    holdFrac: number | null
    tasks: Array<{ title: string; done: boolean; tag: string }>
    alertsCrit: boolean
    exposureFrac: number
    co2Frac: number
  }): void {
    el('day-label').textContent = `DAY ${d.day}`
    el('clock-label').textContent = d.clock
    const set = (id: string, txt: string) => {
      el(id).textContent = txt
    }
    set('chip-power', `${Math.round(d.powerPct)}%`)
    set('chip-o2', `${d.o2.toFixed(1)}%`)
    set('chip-co2', `${d.co2.toFixed(2)}%`)
    set('chip-pres', `${Math.round(d.pressure)} kPa`)
    set('chip-water', `${d.water.toFixed(1)} L`)
    set('chip-food', `${Math.round(d.food)} kcal`)
    this.tint('chip-power', d.powerPct < 15)
    this.tint('chip-o2', d.o2 < 19)
    this.tint('chip-co2', d.co2 > 0.7)
    this.tint('chip-water', d.water < 25)
    this.tint('chip-food', d.food < 1400)
    el('mode-chip').textContent = d.mode
    el('grav-chip').textContent = d.grav
    const heldChip = el('held-chip')
    if (d.held) {
      heldChip.classList.remove('hidden')
      heldChip.textContent = `IN HAND: ${d.held.toUpperCase()}`
    } else {
      heldChip.classList.add('hidden')
    }
    const promptEl = el('prompt')
    if (d.prompt) {
      promptEl.classList.remove('hidden')
      promptEl.textContent = d.prompt
    } else {
      promptEl.classList.add('hidden')
    }
    const holdbar = el('holdbar')
    if (d.holdFrac !== null) {
      holdbar.classList.remove('hidden')
      el('holdfill').style.width = `${Math.round(d.holdFrac * 100)}%`
    } else {
      holdbar.classList.add('hidden')
    }
    const list = el('task-list')
    if (this.checklistOpen && list.childElementCount !== d.tasks.length) this.renderTasks(d.tasks)
    else if (this.checklistOpen) this.renderTasks(d.tasks)
    const visor = el('visor')
    visor.classList.toggle('on', d.suited)
    const vig = el('vignette') as HTMLElement
    vig.style.opacity = String(Math.min(0.95, Math.max(d.exposureFrac * 0.9, d.co2Frac * 0.8)))
    vig.style.boxShadow = d.exposureFrac > d.co2Frac ? 'inset 0 0 180px 60px rgba(255,40,40,0.55)' : 'inset 0 0 200px 70px rgba(120,80,20,0.5)'
  }

  private tint(id: string, warn: boolean): void {
    el(id).classList.toggle('warn', warn)
  }

  renderTasks(tasks: Array<{ title: string; done: boolean; tag: string }>): void {
    const list = el('task-list')
    list.innerHTML = ''
    for (const t of tasks) {
      const li = document.createElement('li')
      li.className = t.done ? 'done' : t.tag === 'repair' ? 'repair' : ''
      li.textContent = `${t.done ? '[x]' : '[ ]'} ${t.title}`
      list.appendChild(li)
    }
  }

  toggleChecklist(force?: boolean): void {
    this.checklistOpen = force ?? !this.checklistOpen
    el('checklist').classList.toggle('hidden', !this.checklistOpen)
  }

  toast(msg: string, opts: ToastLevel = {}): void {
    const div = document.createElement('div')
    div.className = `toast ${opts.level ?? 'info'}`
    div.textContent = msg
    this.toasts.appendChild(div)
    this.toastTimes.push({ node: div, born: performance.now() })
    while (this.toastTimes.length > 4) {
      const old = this.toastTimes.shift()!
      old.node.remove()
    }
  }

  frameToasts(): void {
    const now = performance.now()
    for (let i = this.toastTimes.length - 1; i >= 0; i--) {
      const t = this.toastTimes[i]
      const age = now - t.born
      if (age > 4200) {
        t.node.remove()
        this.toastTimes.splice(i, 1)
      } else if (age > 3600) {
        t.node.style.opacity = String(1 - (age - 3600) / 600)
      }
    }
  }

  brackets(camera: THREE.Camera, target: THREE.Vector3 | null, dist: number): void {
    const b = el('brackets')
    if (!target) {
      b.classList.add('hidden')
      return
    }
    const v = target.clone().project(camera)
    if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) {
      b.classList.add('hidden')
      return
    }
    b.classList.remove('hidden')
    const scale = THREE.MathUtils.clamp(90 / Math.max(0.8, dist), 22, 110)
    b.style.left = `${((v.x + 1) / 2) * 100}%`
    b.style.top = `${((-v.y + 1) / 2) * 100}%`
    b.style.width = `${scale}px`
    b.style.height = `${scale}px`
  }

  setFade(a: number): void {
    ;(el('fade') as HTMLElement).style.opacity = String(a)
  }

  setPaused(v: boolean): void {
    el('resume-overlay').classList.toggle('hidden', !v)
  }
}
