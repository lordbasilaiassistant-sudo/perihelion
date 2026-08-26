import type { GameApp } from './gameApp'
import * as THREE from 'three'

export class ConsoleUI {
  visible = false
  onToggleChange: ((open: boolean) => void) | null = null
  private log: HTMLElement
  private input: HTMLInputElement

  constructor() {
    this.log = document.getElementById('console-log') as HTMLElement
    this.input = document.getElementById('console-input') as HTMLInputElement
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        const line = this.input.value.trim()
        this.input.value = ''
        if (line) void this.dispatch(line)
      } else if (e.key === 'Backquote' || e.key === '`' || e.key === 'Escape') {
        e.preventDefault()
        this.toggle()
      }
    })
  }

  toggle(): boolean {
    this.visible = !this.visible
    const el = document.documentElement
    el.dataset.consoleToggles = String((Number(el.dataset.consoleToggles) || 0) + 1)
    document.getElementById('console-panel')?.classList.toggle('hidden', !this.visible)
    this.onToggleChange?.(this.visible)
    if (this.visible) {
      setTimeout(() => this.input.focus(), 30)
    } else {
      this.input.blur()
    }
    return this.visible
  }

  print(text: string, cls = ''): void {
    const div = document.createElement('div')
    div.className = `cline ${cls}`
    div.textContent = text
    this.log.appendChild(div)
    while (this.log.childElementCount > 200) this.log.firstChild?.remove()
    this.log.scrollTop = this.log.scrollHeight
  }

  private handlers = new Map<string, { fn: (args: string[]) => string | void | Promise<string | void>; help: string }>()

  register(name: string, help: string, fn: (args: string[]) => string | void | Promise<string | void>): void {
    this.handlers.set(name, { fn, help })
  }

  private async dispatch(line: string): Promise<void> {
    this.print(`> ${line}`, 'echo')
    const parts = line.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const h = this.handlers.get(cmd)
    if (!h) {
      this.print(`unknown command '${cmd}' — try 'help'`, 'err')
      return
    }
    try {
      const out = await h.fn(parts.slice(1))
      if (typeof out === 'string' && out.length) this.print(out)
    } catch (err) {
      this.print(`error: ${String(err)}`, 'err')
    }
  }

  helpText(): string[] {
    return [...this.handlers.entries()].map(([name, h]) => `${name.padEnd(10)} ${h.help}`)
  }
}

export function registerCommands(console: ConsoleUI, getApp: () => GameApp | null): void {
  console.register('help', 'list commands', () => console.helpText().join('\n'))
  console.register('pos', 'print player position', () => {
    const a = getApp()
    if (!a) return 'no game'
    const p = a.player.char.currPos
    return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  mode=${a.player.char.mode} g=${a.player.gMag.toFixed(2)}`
  })
  console.register('tp', 'tp <x y z>', (args) => {
    const a = getApp()
    if (!a || args.length < 3) return 'usage: tp x y z'
    a.player.char.teleport(new THREE.Vector3(Number(args[0]), Number(args[1]), Number(args[2])))
    return 'teleported'
  })
  console.register('spawn', 'spawn crate [mass]', (args) => {
    const a = getApp()
    if (!a) return 'no game'
    const mass = args.length > 1 ? Number(args[1]) : 6
    a.spawnCrate(mass)
    return `crate spawned (mass ${mass}kg)`
  })
  console.register('give', 'give <toolkit|filter|sealant|none>', (args) => {
    const a = getApp()
    if (!a) return 'no game'
    return a.setItemInHand(args[0] as 'toolkit' | 'filter' | 'sealant' | 'none')
  })
  console.register('break', 'break <wing|hull|filter|recycler|surge>', (args) => {
    const a = getApp()
    if (!a) return 'no game'
    return a.debugBreak(args[0] ?? '')
  })
  console.register('fixall', 'restore all systems', () => {
    const a = getApp()
    if (!a) return 'no game'
    a.debugFixAll()
    return 'all systems restored'
  })
  console.register('time', 'time <HH:MM>', (args) => {
    const a = getApp()
    if (!a || args.length < 1) return 'usage: time 14:30'
    const [h, m] = args[0].split(':').map(Number)
    a.clock.setTimeOfDay(h * 3600 + m * 60)
    return `time set to ${args[0]}`
  })
  console.register('warp', 'warp <multiplier>', (args) => {
    const a = getApp()
    const w = Number(args[0] ?? 1)
    if (a && Number.isFinite(w)) {
      a.loop.stats.warp = Math.max(0.25, Math.min(64, w))
      return `warp x${a.loop.stats.warp}`
    }
    return 'usage: warp 8'
  })
  console.register('fov', 'fov <deg>', (args) => {
    const a = getApp()
    const f = Number(args[0])
    if (a && f >= 50 && f <= 110) {
      a.player.fov = f
      return `fov ${f}`
    }
    return 'usage: fov 90'
  })
  console.register('colliders', 'toggle collider debug view', () => {
    const a = getApp()
    if (!a) return 'no game'
    return a.toggleColliders() ? 'colliders ON' : 'colliders OFF'
  })
  console.register('wireframe', 'toggle wireframe materials', () => {
    const a = getApp()
    if (!a) return 'no game'
    return a.toggleWireframe() ? 'wireframe ON' : 'wireframe OFF'
  })
  console.register('god', 'toggle god mode (ignore hazards)', () => {
    const a = getApp()
    if (!a) return 'no game'
    a.godMode = !a.godMode
    return a.godMode ? 'god mode ON' : 'god mode OFF'
  })
  console.register('save', 'save game now', async () => {
    const a = getApp()
    if (!a) return 'no game'
    await a.save()
    return 'saved'
  })
  console.register('reset', 'wipe save and reload page', async () => {
    const { clearSave } = await import('../domain/save')
    await clearSave()
    location.reload()
  })
  console.register('day', 'skip to next morning', async () => {
    const a = getApp()
    if (!a) return 'no game'
    await a.sleep(true)
    return `day ${a.clock.day}`
  })
  console.register('face', 'face <anchor id> — aim camera at anchor', (args) => {
    const a = getApp()
    if (!a || args.length < 1) return 'usage: face scrubber|breaker|treadmill|toolkit|filter|sealant|bunk|logConsole|suitLocker|airlockPanel|wingRepair|leakSpot|recycler|plot0..11'
    const anchors = a.ship.anchors as Record<string, THREE.Vector3 | undefined>
    let target: THREE.Vector3 | undefined = anchors[args[0]]
    if (!target && args[0].startsWith('plot')) {
      const idx = Number(args[0].slice(4))
      const def = a.ship.plots[idx]
      if (def) target = def.anchor
    }
    if (!target) return `unknown anchor '${args[0]}'`
    return a.faceAnchor(target)
  })
  console.register('hover', 'print current hover target', () => {
    const a = getApp()
    if (!a) return 'no game'
    const h = a.interaction.hover
    const hold = a.interaction.holding
    const holdStr = hold ? ` HOLDING=${hold.entry.id} t=${hold.t.toFixed(2)}/${(a.interaction.holdSeconds(hold.entry) ?? 0).toFixed(1)}` : ''
    return `${a.interaction.lastDebug} || hover=${h ? h.id : 'null'}${holdStr}`
  })
  console.register('dbg-ray', 'raw raycast diagnostics', () => {
    const a = getApp()
    if (!a) return 'no game'
    const rc = new THREE.Raycaster()
    a.camera.updateMatrixWorld(true)
    rc.setFromCamera(new THREE.Vector2(0, 0), a.camera)
    const roots = a.interaction.debugRoots()
    const rootHits = rc.intersectObjects(roots, true)
    const d = rc.ray.direction
    const first = rootHits[0]
    return `dir=(${d.x.toFixed(3)},${d.y.toFixed(3)},${d.z.toFixed(3)}) rootHits=${rootHits.length} first=${first ? `${first.distance.toFixed(2)}` : 'none'}`
  })
  console.register('garden-grow', 'force all growing plots to ripe', () => {
    const a = getApp()
    if (!a) return 'no game'
    for (const s of a.garden.states) {
      if (s.stage === 'growing') {
        s.t = 1
        s.stage = 'ripe'
      }
    }
    a.garden.visualSync()
    return 'plots ripened'
  })
  console.register('suit', 'toggle suit instantly (debug)', () => {
    const a = getApp()
    if (!a) return 'no game'
    a.setSuited(!a.suited)
    return a.suited ? 'suited' : 'unsuited'
  })
  console.register('mira', 'talk to MIRA (debug)', () => {
    const a = getApp()
    if (!a) return 'no game'
    a.talkToMira()
    return 'MIRA speaking'
  })
  console.register('fps', 'fps <60|0> — render cap (0 = uncapped, sim stays 60Hz)', (args) => {
    const a = getApp()
    const n = Number(args[0])
    if (a && Number.isFinite(n) && n >= 0 && n <= 240) {
      a.loop.frameCap = n
      return n === 0 ? 'frame cap OFF (uncapped)' : `frame cap ${n}fps`
    }
    return `frame cap is ${a ? a.loop.frameCap : '?'} — usage: fps 60 | fps 0`
  })
  console.register('cam', 'cam <x y z tx ty tz> — free camera (photo mode); "cam off" to release', (args) => {
    const a = getApp()
    if (!a) return 'no game'
    if (args[0] === 'off') {
      a.photoCam = null
      return 'photo camera off'
    }
    if (args.length < 6) return 'usage: cam x y z tx ty tz | cam off'
    const V = a.ship.anchors.spawnHub.constructor as new (x: number, y: number, z: number) => THREE.Vector3
    a.photoCam = {
      pos: new V(Number(args[0]), Number(args[1]), Number(args[2])),
      target: new V(Number(args[3]), Number(args[4]), Number(args[5]))
    }
    return `photo cam at ${args.slice(0, 3).join(' ')} → ${args.slice(3).join(' ')}`
  })
  console.register('airlock', 'set airlock phase <pressurized|vacuum>', (args) => {
    const a = getApp()
    if (!a) return 'no game'
    if (args[0] === 'vacuum' || args[0] === 'pressurized') {
      a.airlockPhase = args[0]
      return `airlock ${args[0]}`
    }
    return `airlock is ${a.airlockPhase}`
  })
}
