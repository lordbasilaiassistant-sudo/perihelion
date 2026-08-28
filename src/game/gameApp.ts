import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { createRenderer, type GameRenderer } from '../engine/renderer'
import { GameLoop } from '../engine/loop'
import { Input } from '../engine/input'
import { AudioManager } from '../engine/audio'
import { ParticlePool } from '../engine/particles'
import { Rng } from '../engine/rng'
import { GameClock } from '../engine/clock'
import { formatClock, clamp } from '../engine/mathUtils'
import { Physics, initRapier } from '../physics/world'
import { buildColliderDebug } from '../physics/debugRender'
import { gravityAt, pickField } from '../physics/gravity'
import {
  ShipBuilder,
  insidePressurized,
  GRAVITY_FIELDS,
  type DoorEnt,
  type ShipBuild
} from './shipBuilder'
import { Environment } from './environment'
import { Player } from './player'
import { InteractionSystem, type Interactable } from './interact'
import { GardenSystem } from './garden'
import { Companion } from './companion'
import { AmbientScore } from '../engine/music'
import { makeCrateTexture, type CrateSkin } from './textures'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Hud } from './hud'
import { DebugOverlay } from './debugOverlay'
import { ConsoleUI, registerCommands } from './consoleCmds'
import {
  alertsOf,
  dailyReset,
  freshSystems,
  hasCritical,
  hydrateSystems,
  systemActions,
  tickSystems,
  BATTERY_CAP_KWH
} from '../domain/shipState'
import { generateDailyTasks, TaskBoard, type Task } from '../domain/tasks'
import { applyEvent, rollDayEvents, type DayEvent } from '../domain/events'
import { readSave, writeSave } from '../domain/save'

export type ItemName = 'toolkit' | 'filter' | 'sealant'

interface PropEnt {
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  size: number
  mass: number
  prevP: THREE.Vector3
  currP: THREE.Vector3
  prevQ: THREE.Quaternion
  currQ: THREE.Quaternion
}

const DAY_LEN = 86400

function repairTask(id: string): Task | null {
  const map: Record<string, [string, string]> = {
    'repair-wing': ['EVA: repair solar wing', 'Suit up, grab the toolkit, restore the damaged string.'],
    'repair-hull': ['Seal hull breach', 'Trace the whistle, apply sealant.'],
    'repair-filter': ['Replace scrubber filter', 'Swap a fresh filter from the workshop shelf.'],
    'repair-recycler': ['Flush recycler lines', 'Purge sediment from the water loop.']
  }
  const m = map[id]
  if (!m) return null
  return { id, title: m[0], detail: m[1], done: false, tag: 'repair' }
}

function makeProxy(size: [number, number, number], pos: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  )
  m.position.copy(pos)
  return m
}

export class GameApp {
  renderer!: GameRenderer
  scene = new THREE.Scene()
  camera!: THREE.PerspectiveCamera
  loop!: GameLoop
  input = new Input()
  audio = new AudioManager()
  physics!: Physics
  API!: typeof RAPIER
  ship!: ShipBuild
  env!: Environment
  player!: Player
  interaction = new InteractionSystem()
  garden!: GardenSystem
  companion!: Companion
  music!: AmbientScore
  hud = new Hud()
  overlay = new DebugOverlay()
  consoleUI = new ConsoleUI()
  clock = new GameClock(6 * 3600)
  rng = new Rng(1337)
  systems = freshSystems()
  tasks = new TaskBoard()
  dayEvents: DayEvent[] = []
  firedEvents = new Set<string>()
  heldItem: ItemName | null = null
  suited = false
  airlockPhase: 'pressurized' | 'vacuum' = 'pressurized'
  godMode = false
  started = false
  cinematic = true
  private props: PropEnt[] = []
  private grabIdx = -1
  private grabDist = 1.5
  private wasE = false
  private wasMouseL = false
  private exposure = 0
  private co2Time = 0
  private alarmCd = 0
  private shakeT = 0
  private autosaveT = 0
  private fadePhase: 'idle' | 'out' | 'in' = 'idle'
  private fadeA = 0
  private fadeMid: (() => void) | null = null
  private colliderDebug: THREE.Group | null = null
  private wireframeOn = false
  private postFx: { renderAsync(): Promise<void> } | null = null
  photoCam: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
  private ledMatOk!: THREE.MeshStandardMaterial
  private ledMatBad!: THREE.MeshStandardMaterial
  private heldMeshHolder = new THREE.Group()
  private heldPreview: Partial<Record<ItemName, THREE.Mesh>> = {}

  static async create(canvas: HTMLCanvasElement): Promise<GameApp> {
    const app = new GameApp()
    const status = (s: string) => {
      const el = document.getElementById('load-status')
      if (el) el.textContent = s
    }
    status('waking physics core…')
    const API = await initRapier()
    app.API = API
    app.physics = new Physics(API)
    status('igniting renderer…')
    app.renderer = await createRenderer(canvas)
    app.scene.background = new THREE.Color(0x000000)
    app.camera = new THREE.PerspectiveCamera(76, 16 / 9, 0.08, 30000)
    status('forging stars…')
    app.env = new Environment()
    app.scene.add(app.env.group)
    status('welding hull plates…')
    const builder = new ShipBuilder(app.physics, API)
    app.ship = builder.build()
    app.scene.add(app.ship.group)
    status('spinning up the carousel…')
    app.player = new Player(API, app.physics, app.ship.anchors.spawnHub.clone())
    app.scene.add(app.player.avatarRoot)
    app.scene.add(app.player.fpArms)
    app.player.avatarRoot.visible = false
    app.player.fpArms.visible = false
    app.garden = new GardenSystem(app.ship.plots)
    app.companion = new Companion()
    app.scene.add(app.companion.group)
    app.music = new AmbientScore(app.audio)
    const pool = new ParticlePool(900)
    app.particles = pool
    app.scene.add(pool.points)
    app.buildProps()
    app.buildHeldPreviews()
    app.buildInteractions()
    await app.setupPost()
    app.ledMatOk = new THREE.MeshStandardMaterial({ color: 0x9fe8a2, emissive: 0x2fe06a, emissiveIntensity: 2 })
    app.ledMatBad = new THREE.MeshStandardMaterial({ color: 0xe8a09f, emissive: 0xff3b30, emissiveIntensity: 2.4 })
    app.loop = new GameLoop(app.renderer.raw as unknown as { setAnimationLoop(cb: ((t: number) => void) | null): void })
    app.loop.start({
      tick: (dt) => {
        if (app.started && !app.cinematic) app.tick(dt)
      },
      frame: (alpha, dtReal) => {
        app.frame(alpha, dtReal)
      }
    })
    registerCommands(app.consoleUI, () => window.__app ?? null)
    app.consoleUI.onToggleChange = (open) => {
      app.input.enabled = !open
      if (open) app.input.releaseLock()
      else app.input.requestLock()
    }
    ;(globalThis as unknown as { __app?: GameApp }).__app = app
    status('ready.')
    return app
  }

  particles!: ParticlePool

  private crateTex: Partial<Record<CrateSkin, THREE.CanvasTexture>> = {}

  private crateSkinFor(mass: number): CrateSkin {
    return mass > 10 ? 'cargo' : mass > 5 ? 'metal' : 'supply'
  }

  private makeCrateMesh(size: number, mass: number): THREE.Mesh {
    const skin = this.crateSkinFor(mass)
    if (!this.crateTex[skin]) this.crateTex[skin] = makeCrateTexture(skin)
    const geo = new RoundedBoxGeometry(size, size, size, 3, size * 0.07)
    const mat = new THREE.MeshStandardMaterial({
      map: this.crateTex[skin],
      roughness: skin === 'cargo' ? 0.85 : 0.55,
      metalness: skin === 'metal' ? 0.45 : 0.15
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  private buildProps(): void {
    for (const s of this.ship.propSpawns) {
      const mesh = this.makeCrateMesh(s.size, s.mass)
      mesh.position.copy(s.pos)
      mesh.rotation.set(Math.random() * 0.5 - 0.25, Math.random() * Math.PI, Math.random() * 0.3 - 0.15)
      this.scene.add(mesh)
      const { body } = this.physics.createDynamicCube(s.size, s.mass, s.pos)
      this.props.push({
        mesh,
        body,
        size: s.size,
        mass: s.mass,
        prevP: s.pos.clone(),
        currP: s.pos.clone(),
        prevQ: new THREE.Quaternion().setFromEuler(mesh.rotation),
        currQ: new THREE.Quaternion().setFromEuler(mesh.rotation)
      })
    }
  }

  private buildHeldPreviews(): void {
    const mk = (color: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 })
    const tk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.14), mk(0xe07a28))
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.19, 12), mk(0xdde3e6))
    fl.rotation.x = Math.PI / 2
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 10), mk(0x3f9950))
    sl.rotation.x = Math.PI / 2
    this.heldPreview.toolkit = tk
    this.heldPreview.filter = fl
    this.heldPreview.sealant = sl
    this.heldMeshHolder.position.set(0.21, -0.33, -0.62)
    this.player.fpArms.add(this.heldMeshHolder)
    for (const k of Object.keys(this.heldPreview) as ItemName[]) {
      this.heldPreview[k]!.visible = false
      this.heldMeshHolder.add(this.heldPreview[k]!)
    }
  }

  private proxyList: THREE.Mesh[] = []

  private buildInteractions(): void {
    const A = this.ship.anchors
    const reg = (e: Interactable) => this.interaction.register(e)

    reg({
      id: 'mira',
      objs: [this.companion.hitMesh],
      range: 2.6,
      prompt: () => (this.companion.dialogOpen ? null : '[E] Talk to MIRA'),
      onStart: () => this.talkToMira()
    })

    for (const door of this.ship.doors) {
      reg({
        id: `door-${door.id}`,
        objs: [door.mesh],
        range: 2.7,
        prompt: () => {
          if (door.locked) return `${door.label} — LOCKED`
          return `${door.label} — [E] ${door.open ? 'close' : 'open'}`
        },
        onStart: () => this.toggleDoor(door)
      })
    }

    const scrubberProxy = makeProxy([1.0, 1.3, 0.7], A.scrubber)
    this.addProxy(scrubberProxy)
    reg({
      id: 'scrubber',
      objs: [scrubberProxy],
      range: 2.4,
      getHoldTime: () => (this.systems.scrubberFilterWear > 0.5 ? (this.heldItem === 'filter' ? 4 : undefined) : undefined),
      prompt: () => {
        const wear = this.systems.scrubberFilterWear
        const pct = Math.round(wear * 100)
        if (wear > 0.5) {
          return this.heldItem === 'filter' ? `[HOLD] Replace scrubber filter (${pct}%)` : `Filter saturated (${pct}%) — needs a fresh filter`
        }
        return `[E] Inspect CO2 scrubber`
      },
      onStart: () => {
        if (this.systems.scrubberFilterWear > 0.5) return
        this.completeTask(`d${this.clock.day}-scrubber`)
        this.toast(`Scrubber nominal — filter ${Math.round(this.systems.scrubberFilterWear * 100)}% worn`)
      },
      onFinish: () => {
        systemActions.replaceFilter(this.systems)
        this.setItemInHand('none')
        this.completeTask('repair-filter')
        this.toast('Fresh filter seated — airflow restored')
      }
    })

    const breakerProxy = makeProxy([0.7, 1.6, 0.35], A.breaker)
    this.addProxy(breakerProxy)
    reg({
      id: 'breaker',
      objs: [breakerProxy],
      range: 2.3,
      prompt: () => `[E] Breaker panel — scrubbers ${this.systems.scrubbersOnline ? 'ONLINE' : 'OFFLINE'}`,
      onStart: () => {
        this.systems.scrubbersOnline = !this.systems.scrubbersOnline
        this.audio.play('ui', 0.7, 0.8)
        this.toast(`Scrubber breakers ${this.systems.scrubbersOnline ? 'closed' : 'OPEN'}`, { level: this.systems.scrubbersOnline ? 'info' : 'warn' })
        this.completeTask(`d${this.clock.day}-power`)
      }
    })

    const recyclerProxy = makeProxy([1.0, 1.4, 1.0], A.recycler)
    this.addProxy(recyclerProxy)
    recyclerProxy.rotation.z = (280 * Math.PI) / 180 + Math.PI / 2
    reg({
      id: 'recycler',
      objs: [recyclerProxy],
      range: 2.4,
      getHoldTime: () => (this.systems.recyclerIntegrity < 70 ? 5 : undefined),
      prompt: () => {
        if (this.systems.recyclerIntegrity < 70) return `[HOLD] Flush recycler lines (${Math.round(this.systems.recyclerIntegrity)}%)`
        return `[E] Inspect water recycler`
      },
      onStart: () => {
        if (this.systems.recyclerIntegrity < 70) return
        this.completeTask(`d${this.clock.day}-water`)
        this.toast(`Recycler output clean — efficiency ${Math.round(this.systems.recyclerIntegrity)}%`)
      },
      onFinish: () => {
        systemActions.flushRecycler(this.systems)
        this.completeTask('repair-recycler')
        this.audio.play('hiss', 0.5)
        this.toast('Lines purged — flow restored')
      }
    })

    const treadProxy = makeProxy([1.0, 0.9, 1.9], A.treadmill)
    this.addProxy(treadProxy)
    reg({
      id: 'treadmill',
      objs: [treadProxy],
      range: 2.2,
      holdTime: 8,
      prompt: () => (this.systems.exerciseMinutesToday > 0 ? null : '[HOLD] Resistance treadmill session'),
      onStart: () => this.toast('Exercise started — keep moving'),
      onTick: () => {
        this.shakeT = Math.max(this.shakeT, 0.08)
      },
      onFinish: () => {
        this.systems.exerciseMinutesToday = 42
        this.systems.foodKcal = Math.max(0, this.systems.foodKcal - 160)
        this.completeTask(`d${this.clock.day}-exercise`)
        this.companion.notify('exercise')
        this.toast('Session complete — endorphins deployed')
      }
    })

    const itemDefs: Array<[ItemName, THREE.Vector3]> = [
      ['toolkit', A.toolkit],
      ['filter', A.filter],
      ['sealant', A.sealant]
    ]
    for (const [name, pos] of itemDefs) {
      const proxy = makeProxy([0.5, 0.4, 0.5], pos)
      this.addProxy(proxy)
      reg({
        id: `item-${name}`,
        objs: [proxy, this.ship.itemMeshes[name]],
        range: 2.2,
        prompt: () => (this.heldItem === name ? null : `[E] Take ${name}`),
        onStart: () => this.setItemInHand(name)
      })
    }

    const bunkProxy = makeProxy([1.9, 1.1, 1.1], A.bunk)
    this.addProxy(bunkProxy)
    reg({
      id: 'bunk',
      objs: [bunkProxy],
      range: 2.4,
      getHoldTime: () => (hasCritical(this.systems) ? undefined : 2.5),
      prompt: () => (hasCritical(this.systems) ? `Cannot sleep — critical alerts active` : '[HOLD] Sleep until morning'),
      onStart: () => undefined,
      onFinish: () => {
        void this.sleep(false)
      }
    })

    const consoleProxy = makeProxy([2.0, 1.0, 0.8], A.logConsole)
    this.addProxy(consoleProxy)
    reg({
      id: 'logConsole',
      objs: [consoleProxy],
      range: 2.5,
      prompt: () => `[E] Ship log — record entry`,
      onStart: () => {
        this.completeTask(`d${this.clock.day}-log`)
        this.toast(`Logged: Day ${this.clock.day} — PWR ${Math.round((this.systems.powerKWh / BATTERY_CAP_KWH) * 100)}%, CO2 ${this.systems.co2Percent.toFixed(2)}%`)
      }
    })

    const lockerProxy = makeProxy([0.9, 2.2, 0.78], A.suitLocker)
    this.addProxy(lockerProxy)
    reg({
      id: 'suitLocker',
      objs: [lockerProxy, this.ship.suitDisplay],
      range: 2.4,
      getHoldTime: () => 3.5,
      prompt: () => {
        if (!this.suited && !insidePressurized(this.player.char.currPos)) return 'Too risky — get somewhere pressurized'
        return this.suited ? '[HOLD] Doff EVA suit' : '[HOLD] Don EVA suit'
      },
      onStart: () => this.audio.play('ui', 0.6, 0.7),
      onFinish: () => {
        if (!this.suited && !insidePressurized(this.player.char.currPos)) return
        this.setSuited(!this.suited)
      }
    })

    const airlockProxy = makeProxy([0.5, 0.7, 0.3], A.airlockPanel)
    this.addProxy(airlockProxy)
    reg({
      id: 'airlockPanel',
      objs: [airlockProxy],
      range: 2.3,
      getHoldTime: () => {
        const evaLid = this.ship.doors.find((d) => d.id === 'evaLid')
        if (evaLid && evaLid.open) return undefined
        return 4
      },
      prompt: () => {
        const evaLid = this.ship.doors.find((d) => d.id === 'evaLid')
        if (!evaLid) return null
        if (!this.inShaft()) return null
        if (evaLid.open) return 'Close the outer hatch first'
        return this.airlockPhase === 'pressurized' ? '[HOLD] Depressurize airlock' : '[HOLD] Pressurize and enter'
      },
      onStart: () => undefined,
      onFinish: () => {
        const wasVac = this.airlockPhase === 'vacuum'
        this.airlockPhase = wasVac ? 'pressurized' : 'vacuum'
        this.audio.play('hiss', 0.85, wasVac ? 1.15 : 0.85)
        this.toast(wasVac ? 'Airlock pressurized — welcome inside' : 'Airlock cycled — vacuum side is yours', { level: 'info' })
      }
    })

    const wingProxy = makeProxy([1.6, 1.2, 1.2], A.wingRepair)
    this.addProxy(wingProxy)
    let clankT = 0
    reg({
      id: 'wingRepair',
      objs: [wingProxy, ...this.ship.deadWingCells],
      range: 3.4,
      getHoldTime: () => {
        if (!this.systems.wingDamaged) return undefined
        if (!this.suited) return undefined
        if (this.heldItem !== 'toolkit') return undefined
        return 7
      },
      prompt: () => {
        if (!this.systems.wingDamaged) return null
        if (!this.suited) return 'Damaged solar string — requires EVA suit'
        if (this.heldItem !== 'toolkit') return 'Requires toolkit in hand'
        return '[HOLD] Re-seat damaged panel string'
      },
      onTick: (dt) => {
        clankT -= dt
        if (clankT <= 0) {
          clankT = 0.9
          this.audio.play('clank', 0.55, 0.9 + Math.random() * 0.3)
        }
        this.particles.emit('spark', A.wingRepair, new THREE.Vector3(0, 0.4, 0).addScalar(-0.2), 6, this.rng.float.bind(this.rng))
      },
      onFinish: () => {
        systemActions.fixWing(this.systems)
        for (const cell of this.ship.deadWingCells) cell.material = this.ship.mats.solar
        this.completeTask('repair-wing')
        this.audio.play('ui', 0.9, 1.2)
        this.toast('Solar string restored — array output nominal', { level: 'info' })
      }
    })

    const leakProxy = makeProxy([1.2, 1.2, 1.2], A.leakSpot)
    this.addProxy(leakProxy)
    reg({
      id: 'hullSeal',
      objs: [leakProxy],
      range: 2.6,
      getHoldTime: () => (this.systems.hullPuncture && this.heldItem === 'sealant' ? 5 : undefined),
      prompt: () => {
        if (!this.systems.hullPuncture) return null
        if (this.heldItem !== 'sealant') return 'Leak located — requires sealant in hand'
        return '[HOLD] Apply sealant to breach'
      },
      onTick: (dt) => {
        void dt
        this.particles.emit('fog', A.leakSpot, new THREE.Vector3(0, 0, 0), 2, this.rng.float.bind(this.rng))
      },
      onFinish: () => {
        systemActions.sealHull(this.systems)
        this.setItemInHand('none')
        this.completeTask('repair-hull')
        this.audio.play('hiss', 0.7, 1.3)
        this.toast('Breach sealed — repressurizing')
      }
    })

    this.ship.plots.forEach((def, i) => {
      reg({
        id: `plot-${def.id}`,
        objs: [def.hitProxy, def.soilMesh],
        range: 2.3,
        prompt: () => {
          const st = this.garden.states[i]
          if (st.stage === 'empty') return '[E] Plant lettuce'
          if (st.stage === 'ripe') return '[E] Harvest lettuce'
          if (st.stage === 'growing' && !st.watered) return '[E] Water plant'
          return null
        },
        onStart: () => {
          const res = this.garden.interact(i)
          if (res === 'planted') this.toast('Lettuce planted')
          else if (res === 'watered') this.toast('Watered — growth boosted')
          else if (res === 'harvested') {
            this.systems.foodKcal += 170
            this.audio.play('harvest', 0.7, 1.2)
            this.completeTask(`d${this.clock.day}-garden`)
            this.companion.notify('harvest')
            this.toast('Harvested — +170 kcal to stores')
          }
        }
      })
    })

    this.player.onFootstep = () => {
      if (this.started && !this.cinematic) this.audio.play('step', 0.14, 0.9 + Math.random() * 0.25)
    }
  }

  private addProxy(m: THREE.Mesh): void {
    this.proxyList.push(m)
    this.scene.add(m)
  }

  private inShaft(): boolean {
    const p = this.player.char.currPos
    return p.y > 2.75 && p.y < 4.32 && p.z > 2.56 && p.z < 3.66 && p.x > 0.36 && p.x < 1.36
  }

  toggleDoor(door: DoorEnt): void {
    if (door.locked) {
      this.toast(`${door.label} is locked`, { level: 'warn' })
      return
    }
    door.open = !door.open
    door.autoCloseTimer = 0
    this.audio.play(door.open ? 'doorOpen' : 'doorClose', 0.65)
  }

  setSuited(on: boolean): void {
    this.suited = on
    this.player.setSuited(on)
    this.ship.suitDisplay.visible = !on
    this.audio.play('hiss', 0.5, on ? 1.2 : 0.9)
    this.toast(on ? 'Suit sealed — visor HUD active' : 'Suit doffed and stowed')
  }

  setItemInHand(item: ItemName | 'none'): string {
    if (item !== 'none' && this.heldItem === item) return ''
    if (this.heldItem) {
      const mesh = this.ship.itemMeshes[this.heldItem]
      if (mesh) mesh.visible = true
    }
    this.heldItem = item === 'none' ? null : item
    for (const k of Object.keys(this.heldPreview) as ItemName[]) {
      this.heldPreview[k]!.visible = this.heldItem === k
    }
    if (this.heldItem) {
      const mesh = this.ship.itemMeshes[this.heldItem]
      if (mesh) mesh.visible = false
      this.audio.play('ui', 0.5, 1.1)
    }
    return this.heldItem ? `holding ${this.heldItem}` : 'hands free'
  }

  completeTask(id: string): void {
    const t = this.tasks.tasks.find((x) => x.id === id)
    if (t && !t.done && this.tasks.complete(id)) {
      this.toast(`TASK COMPLETE — ${t.title}`, { level: 'info' })
      this.audio.play('ui', 0.8, 1.35)
      if (id.startsWith('repair-')) this.companion.notify('repair_done')
    }
  }

  toast(msg: string, opts: { level?: 'info' | 'warn' | 'crit' } = {}): void {
    this.hud.toast(msg, opts)
  }

  faceAnchor(target: THREE.Vector3): string {
    const eye = this.player.char.currPos.clone().addScaledVector(this.player.basis().up, 0.62)
    const dir = target.clone().sub(eye)
    const dist = dir.length()
    dir.normalize()
    const up = this.player.basis().up
    const sinP = THREE.MathUtils.clamp(-dir.dot(up), -1, 1)
    this.player.pitch = Math.asin(sinP)
    const fwdNP = dir.clone().addScaledVector(up, Math.sin(this.player.pitch)).normalize()
    const F0 = new THREE.Vector3(0, 0, -1)
    F0.addScaledVector(up, -F0.dot(up))
    if (F0.lengthSq() < 1e-6) F0.set(1, 0, 0)
    F0.normalize()
    const B = new THREE.Vector3().crossVectors(up, F0)
    this.player.yaw = Math.atan2(fwdNP.dot(B), fwdNP.dot(F0))
    return `facing anchor at ${dist.toFixed(2)}m`
  }

  private async setupPost(): Promise<void> {
    if (this.renderer.backend !== 'webgpu') return
    try {
      const [{ pass }, { bloom }] = await Promise.all([
        import('three/tsl'),
        import('three/addons/tsl/display/BloomNode.js')
      ])
      const PP = (THREE as unknown as { PostProcessing?: new (r: never) => { outputNode: unknown; renderAsync(): Promise<void> } }).PostProcessing
      if (!PP) return
      const post = new PP(this.renderer.raw as never)
      const scenePass = pass(this.scene, this.camera)
      post.outputNode = bloom(scenePass.getTextureNode(), 0.34, 0.6, 0.88)
      this.postFx = post as { renderAsync(): Promise<void> }
    } catch {
      this.postFx = null
    }
  }

  private renderFrame(): void {
    if (this.postFx) void this.postFx.renderAsync().catch(() => {})
    else this.renderer.render(this.scene, this.camera)
  }

  talkToMira(): void {
    const cap = BATTERY_CAP_KWH
    const line = this.companion.pickLine(
      {
        co2Percent: this.systems.co2Percent,
        powerKWh: this.systems.powerKWh,
        hullPuncture: this.systems.hullPuncture,
        wingDamaged: this.systems.wingDamaged
      },
      this.tasks.tasks.map((t) => ({ done: t.done })),
      this.clock.day,
      cap
    )
    this.music.setDuck(true)
    this.companion.speak(this.audio, line.id, line.text)
  }

  spawnCrate(mass = 6): void {
    const fwd = this.player.basis().fwd
    const pos = this.player.char.currPos.clone().addScaledVector(fwd, 1.6)
    const size = clamp(0.3 + mass * 0.012, 0.34, 0.6)
    const mesh = this.makeCrateMesh(size, mass)
    this.scene.add(mesh)
    const { body } = this.physics.createDynamicCube(size, mass, pos)
    this.props.push({
      mesh,
      body,
      size,
      mass,
      prevP: pos.clone(),
      currP: pos.clone(),
      prevQ: new THREE.Quaternion(),
      currQ: new THREE.Quaternion()
    })
  }

  debugBreak(kind: string): string {
    switch (kind) {
      case 'wing':
        systemActions.meteorHitWing(this.systems)
        this.ensureRepairTask('repair-wing')
        return 'wing broken'
      case 'hull':
        systemActions.microPuncture(this.systems)
        this.ensureRepairTask('repair-hull')
        return 'puncture created'
      case 'filter':
        systemActions.clogFilter(this.systems)
        this.ensureRepairTask('repair-filter')
        return 'filter clogged'
      case 'recycler':
        systemActions.pumpClog(this.systems)
        this.ensureRepairTask('repair-recycler')
        return 'recycler degraded'
      case 'surge':
        systemActions.powerSurge(this.systems)
        return 'surge applied'
      default:
        return 'usage: break wing|hull|filter|recycler|surge'
    }
  }

  debugFixAll(): void {
    systemActions.fixWing(this.systems)
    systemActions.sealHull(this.systems)
    systemActions.replaceFilter(this.systems)
    systemActions.flushRecycler(this.systems)
    this.systems.scrubbersOnline = true
    for (const cell of this.ship.deadWingCells) cell.material = this.ship.mats.solar
    this.tasks.completeAll()
    this.systems.powerKWh = BATTERY_CAP_KWH
    this.systems.o2Percent = 20.9
    this.systems.co2Percent = 0.08
    this.systems.pressureKPa = 101.3
  }

  ensureRepairTask(id: string): void {
    if (this.tasks.isDone(id)) return
    const t = repairTask(id)
    if (t) this.tasks.add(t)
  }

  toggleColliders(): boolean {
    if (!this.colliderDebug) {
      this.colliderDebug = buildColliderDebug(this.physics, this.API)
      this.scene.add(this.colliderDebug)
    } else {
      this.scene.remove(this.colliderDebug)
      this.colliderDebug = buildColliderDebug(this.physics, this.API)
      this.scene.add(this.colliderDebug)
    }
    this.colliderDebug.visible = true
    return true
  }

  toggleWireframe(): boolean {
    this.wireframeOn = !this.wireframeOn
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial
          if ('wireframe' in std) std.wireframe = this.wireframeOn
        }
      }
    })
    return this.wireframeOn
  }

  async save(): Promise<void> {
    try {
      await writeSave({
        v: 1,
        seed: 1337,
        simSeconds: this.clock.simSeconds,
        systems: this.systems,
        tasks: this.tasks.serialize(),
        garden: this.garden.serialize(),
        player: this.player.serialize(),
        heldItem: this.heldItem,
        suited: this.suited,
        doors: this.ship.doors.map((d) => ({ id: d.id, open: d.open }))
      })
    } catch (e) {
      this.consoleUI.print(`save failed: ${String(e)}`, 'err')
    }
  }

  hydrate(raw: Record<string, unknown> | null): boolean {
    if (!raw || typeof raw !== 'object') return false
    try {
      const d = raw as Record<string, any>
      this.clock.simSeconds = Number(d.simSeconds) || 6 * 3600
      this.systems = hydrateSystems(d.systems)
      if (Array.isArray(d.tasks)) this.tasks.load(d.tasks)
      this.garden.hydrate(d.garden)
      if (d.player) this.player.hydrate(d.player)
      if (typeof d.heldItem === 'string' && ['toolkit', 'filter', 'sealant'].includes(d.heldItem)) {
        this.setItemInHand(d.heldItem as ItemName)
      }
      if (Array.isArray(d.doors)) {
        for (const dd of d.doors) {
          const door = this.ship.doors.find((x) => x.id === dd.id)
          if (door && dd.open) {
            door.open = true
            door.t = 1
            const p = door.closedPos.clone().addScaledVector(door.slideDir, door.dist)
            door.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
          }
        }
      }
      this.setSuited(!!d.suited)
      return true
    } catch {
      return false
    }
  }

  startNewGame(): void {
    this.beginPlay(null)
  }

  async startSavedGame(): Promise<void> {
    const data = await readSave<Record<string, unknown>>()
    this.beginPlay(data)
  }

  private beginPlay(saveData: Record<string, unknown> | null): void {
    this.companion.preloadVoices(this.audio)
    this.music.start()
    if (saveData) this.hydrate(saveData)
    else {
      this.tasks.load(generateDailyTasks(this.clock.day, this.systems))
      this.dayEvents = rollDayEvents(this.rng, this.systems, this.clock.simSeconds, DAY_LEN)
    }
    this.player.computeGravity(GRAVITY_FIELDS)
    this.cinematic = false
    this.started = true
    this.hud.setHudVisible(true)
    this.toast('Day ' + this.clock.day + ' aboard ICV Perihelion — checklist is on TAB', { level: 'info' })
  }

  async sleep(force: boolean): Promise<void> {
    if (this.fadePhase !== 'idle') return
    if (hasCritical(this.systems) && !force) {
      this.toast('Cannot sleep with critical alerts active', { level: 'warn' })
      return
    }
    this.fadeMid = () => {
      const steps = 96
      for (let i = 0; i < steps; i++) tickSystems(this.systems, DAY_LEN / steps)
      this.garden.tick(DAY_LEN)
      this.clock.setTimeOfDay(6 * 3600, 1)
      dailyReset(this.systems, this.rng.float())
      this.tasks.load(generateDailyTasks(this.clock.day, this.systems))
      this.dayEvents = rollDayEvents(this.rng, this.systems, this.clock.simSeconds, DAY_LEN)
      this.firedEvents.clear()
      this.garden.visualSync()
      void this.save()
      this.companion.onNewDay()
      this.toast(`DAY ${this.clock.day} — new checklist posted`, { level: 'info' })
    }
    this.fadePhase = 'out'
  }

  private blackout(reason: string): void {
    this.exposure = 0
    this.co2Time = 0
    this.player.char.teleport(this.ship.anchors.spawnBunk.clone())
    this.fadePhase = 'out'
    this.fadeMid = () => {
      this.toast(reason, { level: 'crit' })
      this.toast('You come to on your bunk…', { level: 'warn' })
    }
  }

  private processDayEvents(): void {
    for (const e of this.dayEvents) {
      if (this.firedEvents.has(e.kind)) continue
      if (this.clock.simSeconds >= e.atSec) {
        this.firedEvents.add(e.kind)
        const res = applyEvent(e.kind, this.systems)
        if (res.task) this.ensureRepairTask(res.task)
        this.toast(res.toast, { level: 'warn' })
        if (res.sfx) this.audio.play(res.sfx, res.sfx === 'boom' ? 0.9 : 0.5)
        if (res.shake) this.shakeT = Math.max(this.shakeT, res.shake * 0.5)
      }
    }
  }

  private hazards(dt: number): void {
    if (this.godMode) {
      this.exposure = 0
      this.co2Time = 0
      return
    }
    const eye = this.player.char.currPos.clone().addScaledVector(this.player.basis().up, 0.5)
    const outside = !insidePressurized(eye)
    if (outside && !this.suited) this.exposure += dt
    else this.exposure = Math.max(0, this.exposure - dt * 2)
    if (this.exposure > 16) this.blackout('Vacuum exposure — vision tunneled and went black.')
    if (this.systems.co2Percent > 3.2) this.co2Time += dt
    else this.co2Time = Math.max(0, this.co2Time - dt * 2)
    if (this.co2Time > 40) this.blackout('CO2 narcosis — everything went soft and dark.')
  }

  private updateDoors(dt: number): void {
    for (const d of this.ship.doors) {
      if (!d.autoCloseDelay && d.autoCloseDelay !== 0) d.autoCloseDelay = 0
      const target = d.open ? 1 : 0
      if (d.t !== target) {
        const speed = dt / 0.75
        d.t += Math.sign(target - d.t) * Math.min(speed, Math.abs(target - d.t))
        const k = d.t * d.t * (3 - 2 * d.t)
        const p = d.closedPos.clone().addScaledVector(d.slideDir, d.dist * k)
        d.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
      }
    }
  }

  private propFields(dt: number): void {
    for (const p of this.props) {
      const f = pickField(GRAVITY_FIELDS, [p.currP.x, p.currP.y, p.currP.z])
      if (f) {
        const g = gravityAt(f, [p.currP.x, p.currP.y, p.currP.z])
        const gm = Math.hypot(g[0], g[1], g[2])
        if (gm > 0.001) {
          p.body.applyImpulse({ x: g[0] * p.mass * dt, y: g[1] * p.mass * dt, z: g[2] * p.mass * dt }, true)
          p.body.setLinearDamping(0.28)
        } else {
          p.body.setLinearDamping(0.02)
        }
      }
    }
    if (this.grabIdx >= 0) {
      const p = this.props[this.grabIdx]
      if (!p) {
        this.grabIdx = -1
        return
      }
      const target = this.player.char.currPos
        .clone()
        .addScaledVector(this.player.basis().up, 0.45)
        .addScaledVector(this.player.basis().fwd, this.grabDist)
      const lv = p.body.linvel()
      const dx = target.x - p.currP.x
      const dy = target.y - p.currP.y
      const dz = target.z - p.currP.z
      let ax = dx * 26 - lv.x * 3.6
      let ay = dy * 26 - lv.y * 3.6
      let az = dz * 26 - lv.z * 3.6
      const mag = Math.hypot(ax, ay, az)
      const cap = 17
      if (mag > cap) {
        ax = (ax / mag) * cap
        ay = (ay / mag) * cap
        az = (az / mag) * cap
      }
      p.body.applyImpulse({ x: ax * p.mass * dt, y: ay * p.mass * dt, z: az * p.mass * dt }, true)
      p.body.setAngularDamping(6)
    }
  }

  private syncPropsAfterStep(): void {
    for (const p of this.props) {
      p.prevP.copy(p.currP)
      p.prevQ.copy(p.currQ)
      const t = p.body.translation()
      const r = p.body.rotation()
      p.currP.set(t.x, t.y, t.z)
      p.currQ.set(r.x, r.y, r.z, r.w)
    }
  }

  tick(dt: number): void {
    this.clock.advance(dt)
    tickSystems(this.systems, dt)
    this.processDayEvents()
    this.garden.tick(dt)
    this.updateDoors(dt)
    this.propFields(dt)

    const eDown = this.input.down('KeyE')
    if (this.input.consumeEdge('KeyE')) {
      if (this.companion.dialogOpen) this.companion.advance()
      else if (!this.interaction.tryBeginHold()) this.interaction.useHover()
    }
    if (!eDown && this.wasE) {
      if (!this.companion.dialogOpen) this.interaction.releaseHold()
    }
    this.wasE = eDown
    this.interaction.tickHold(dt)

    const spacePressed = this.input.consumeEdge('Space')
    const rPressed = this.input.consumeEdge('KeyR')
    const intent = this.player.moveIntent(this.input).intent
    this.player.computeGravity(GRAVITY_FIELDS)
    this.player.tick(dt, intent, this.input.down('Space'), spacePressed, rPressed)

    this.hazards(dt)
    this.physics.step()
    this.syncPropsAfterStep()

    for (const d of this.ship.doors) {
      const t = d.body.translation()
      d.mesh.position.set(t.x, t.y, t.z)
    }

    if (this.systems.hullPuncture) {
      if (Math.random() < dt * 2.2) {
        this.particles.emit('fog', this.ship.leakAnchor, new THREE.Vector3(0, 0, 0), 3, this.rng.float.bind(this.rng))
      }
    }
    this.autosaveT += dt
    if (this.autosaveT > 300) {
      this.autosaveT = 0
      void this.save()
    }
  }

  frame(alpha: number, dtReal: number): void {
    if (this.cinematic) {
      const t = performance.now() * 0.00006
      const r = 17
      this.camera.position.set(Math.cos(t) * r, 4.5 + Math.sin(t * 1.7) * 2.2, -4 + Math.sin(t) * r)
      this.camera.lookAt(0, 0.4, -5)
      this.renderFrame()
      this.overlay.pushFrame(this.loop.stats.msFrame)
      this.input.endFrame()
      return
    }
    if (this.photoCam) {
      this.camera.position.copy(this.photoCam.pos)
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(this.photoCam.target)
      this.camera.updateMatrixWorld(true)
      this.env.update(dtReal)
      this.particles.update(dtReal)
      this.companion.frame(dtReal, this.camera, this.photoCam.pos, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0))
      this.renderFrame()
      this.overlay.pushFrame(this.loop.stats.msFrame)
      this.input.endFrame()
      return
    }
    if (!this.started) return

    const [dx, dy] = this.input.consumeLook()
    if (!this.consoleUI.visible) this.player.handleLook(dx, dy)

    if (this.input.pressed('KeyV')) this.player.thirdPerson = !this.player.thirdPerson
    if (this.input.pressed('F3')) this.overlay.toggle()
    if (this.input.pressed('Tab')) this.hud.toggleChecklist()
    if (this.input.pressed('Backquote')) this.consoleUI.toggle()

    const hover = this.interaction.findHover(this.camera)
    if (hover) {
      const wp = new THREE.Vector3()
      hover.objs[0].getWorldPosition(wp)
      this.hud.brackets(this.camera, wp, this.interaction.hoverDist)
    } else {
      this.hud.brackets(this.camera, null, 0)
    }

    if (this.input.pressed('MouseL')) {
      const hoverUsable = !!hover && hover.prompt() !== null
      if (!hoverUsable && this.tryGrab()) {
        /* grabbed */
      }
    }
    if (!this.input.down('MouseL') && this.wasMouseL) this.dropGrab()
    this.wasMouseL = this.input.down('MouseL')

    const holding = this.interaction.holding
    const holdFrac = holding ? Math.min(1, holding.t / (this.interaction.holdSeconds(holding.entry) ?? 1)) : null

    this.player.frame(alpha, this.camera, (o, dirv, m) => this.physics.rayHit(o, dirv, m))
    this.syncGrabsRender(alpha)

    const fovNow = this.camera.fov
    if (Math.abs(fovNow - this.player.fov) > 0.01) {
      this.camera.fov += (this.player.fov - fovNow) * Math.min(1, dtReal * 8)
      this.camera.updateProjectionMatrix()
    }

    if (this.shakeT > 0.001) {
      const s = this.shakeT * 0.09
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s
      this.shakeT = Math.max(0, this.shakeT - dtReal * 1.1)
    }

    this.env.update(dtReal)
    this.particles.update(dtReal)
    this.garden.visualSync()
    this.updateAmbienceAndFx(dtReal)

    const eyeVec = this.player.char.currPos.clone().addScaledVector(this.player.basis().up, 0.62)
    const basisNow = this.player.basis()
    this.companion.frame(dtReal, this.camera, eyeVec, basisNow.up, basisNow.fwd, basisNow.right)

    const eyePressurized = insidePressurized(this.player.char.currPos)
    const critAlerts = hasCritical(this.systems)
    this.alarmCd -= dtReal
    if (critAlerts && this.alarmCd <= 0) {
      this.alarmCd = 2.4
      this.audio.play('alarm', 0.16, 1)
    }

    const alerts = alertsOf(this.systems)

    if (!this.companion.dialogOpen) this.music.setDuck(false)
    this.music.setIntensity(critAlerts ? 0.9 : alerts.length > 2 ? 0.5 : 0.12)
    this.music.update(dtReal)
    this.hud.update({
      day: this.clock.day,
      clock: formatClock(this.clock.timeOfDay),
      powerPct: (this.systems.powerKWh / BATTERY_CAP_KWH) * 100,
      o2: this.systems.o2Percent,
      co2: this.systems.co2Percent,
      pressure: this.systems.pressureKPa,
      water: this.systems.waterLiters,
      food: this.systems.foodKcal,
      mode: this.player.char.mode === 'walk' ? 'BOOTS' : this.player.char.stabilizers ? 'JET · STAB' : 'JET · RAW',
      grav: `${this.player.gMag.toFixed(2)} m/s² ${this.player.currentField?.id ?? '—'}${eyePressurized ? '' : ' · VACUUM'}`,
      suited: this.suited,
      held: this.heldItem,
      prompt: hover ? hover.prompt() : null,
      holdFrac: holdFrac !== null && holdFrac !== 1 ? holdFrac : null,
      tasks: this.hud.checklistOpen ? this.tasks.tasks : [],
      alertsCrit: critAlerts,
      exposureFrac: clamp(this.exposure / 16, 0, 1),
      co2Frac: clamp(this.co2Time / 40, 0, 1)
    })
    this.hud.frameToasts()

    this.updateFade(dtReal)

    const st = this.loop.stats
    this.overlay.pushFrame(st.msFrame)
    this.overlay.update(
      {
        backend: this.renderer.backend.toUpperCase(),
        fps: st.fps,
        ms_frame: st.msFrame.toFixed(1),
        ms_tick: st.msTick.toFixed(2),
        ms_render: st.msRender.toFixed(2),
        ticks: st.ticksLastFrame,
        warp: st.warp,
        draws: this.renderer.drawCalls(),
        tris: this.renderer.triangles(),
        props: this.props.length,
        pos: `${this.player.char.currPos.x.toFixed(1)},${this.player.char.currPos.y.toFixed(1)},${this.player.char.currPos.z.toFixed(1)}`,
        vel: this.player.char.vel.length().toFixed(2),
        mode: this.player.char.mode,
        grounded: String(this.player.char.grounded),
        field: this.player.currentField?.id ?? 'none',
        g: this.player.gMag.toFixed(2),
        stab: String(this.player.char.stabilizers),
        co2: this.systems.co2Percent.toFixed(2),
        o2: this.systems.o2Percent.toFixed(1),
        soc: `${Math.round((this.systems.powerKWh / BATTERY_CAP_KWH) * 100)}%`,
        events: [...this.firedEvents].join(',') || 'none'
      },
      performance.now()
    )

    this.renderFrame()
    this.input.endFrame()
  }

  private tryGrab(): boolean {    const eye = this.player.char.currPos.clone().addScaledVector(this.player.basis().up, 0.55)
    const fwd = this.player.basis().fwd
    let best = -1
    let bestD = 3.2
    for (let i = 0; i < this.props.length; i++) {
      const to = this.props[i].currP.clone().sub(eye)
      const along = to.dot(fwd)
      if (along <= 0.2 || along > bestD) continue
      const perp = to.addScaledVector(fwd, -along).length()
      if (perp < this.props[i].size + 0.24) {
        best = i
        bestD = along
      }
    }
    if (best < 0) return false
    this.grabIdx = best
    this.grabDist = Math.max(1.2, bestD)
    this.props[best].body.setAngularDamping(6)
    return true
  }

  private dropGrab(): void {
    if (this.grabIdx >= 0) {
      this.props[this.grabIdx].body.setAngularDamping(0.4)
      this.grabIdx = -1
    }
  }

  private syncGrabsRender(alpha: number): void {
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i]
      p.mesh.position.lerpVectors(p.prevP, p.currP, alpha)
      p.mesh.quaternion.slerpQuaternions(p.prevQ, p.currQ, alpha)
    }
  }

  private updateAmbienceAndFx(dtReal: number): void {
    const eye = this.player.char.currPos.clone().addScaledVector(this.player.basis().up, 0.5)
    const pressurized = insidePressurized(eye)
    this.audio.setLoopVolume('hum', pressurized ? 0.5 : this.suited ? 0.1 : 0.04)
    this.audio.setLoopVolume('thrust', this.player.thrusting ? 0.55 : 0)
    this.audio.setLoopVolume('breath', this.suited && !pressurized ? 0.5 : this.suited ? 0.12 : 0)

    if (this.player.thrusting) {
      const back = this.player.lastThrustDir.clone().multiplyScalar(-1)
      const origin = this.player.char.currPos.clone().addScaledVector(back, 0.5)
      this.particles.emit('jet', origin, back, 3, this.rng.float.bind(this.rng))
    }

    this.ship.scrubberLed.material =
      this.systems.scrubberFilterWear > 0.5 || !this.systems.scrubbersOnline || this.systems.scrubberIntegrity < 50
        ? this.ledMatBad
        : this.ledMatOk
    const lever = this.ship.breakerLever as THREE.Mesh & { rotation: THREE.Euler }
    lever.rotation.x = this.systems.scrubbersOnline ? 0 : -0.8

    void dtReal
  }

  private updateFade(dtReal: number): void {
    if (this.fadePhase === 'out') {
      this.fadeA = Math.min(1, this.fadeA + dtReal * 1.6)
      if (this.fadeA >= 1) {
        this.fadeMid?.()
        this.fadeMid = null
        this.fadePhase = 'in'
      }
    } else if (this.fadePhase === 'in') {
      this.fadeA = Math.max(0, this.fadeA - dtReal * 1.1)
      if (this.fadeA <= 0) this.fadePhase = 'idle'
    }
    this.hud.setFade(this.fadeA)
  }
}

declare global {
  interface Window {
    __app?: GameApp
  }
}
