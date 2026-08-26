import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from '../physics/world'
import type { GravityField } from '../physics/gravity'

export type MatKey =
  | 'wall'
  | 'floor'
  | 'trim'
  | 'accent'
  | 'white'
  | 'grate'
  | 'glass'
  | 'solar'
  | 'solarDead'
  | 'radiator'
  | 'soil'
  | 'plant'
  | 'lightFix'
  | 'growLight'
  | 'orange'
  | 'suitWhite'
  | 'visor'
  | 'metalDark'
  | 'screen'

const MAT_DEFS: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  wall: { color: 0xb9c2c9, roughness: 0.58, metalness: 0.32 },
  floor: { color: 0x565c62, roughness: 0.82, metalness: 0.45 },
  trim: { color: 0x22262b, roughness: 0.42, metalness: 0.7 },
  accent: { color: 0xc4551f, roughness: 0.5, metalness: 0.3 },
  white: { color: 0xdde3e6, roughness: 0.5, metalness: 0.18 },
  grate: { color: 0x33383d, roughness: 0.85, metalness: 0.6 },
  glass: { color: 0x0a1622, roughness: 0.08, metalness: 0.4, emissive: 0x0a2438, emissiveIntensity: 0.55 },
  solar: { color: 0x14264f, roughness: 0.35, metalness: 0.6, emissive: 0x0a1834, emissiveIntensity: 0.35 },
  solarDead: { color: 0x0a0b0d, roughness: 0.7, metalness: 0.3 },
  radiator: { color: 0x3d444c, roughness: 0.92, metalness: 0.25 },
  soil: { color: 0x37302a, roughness: 1, metalness: 0 },
  plant: { color: 0x3f9950, roughness: 0.7, metalness: 0, emissive: 0x1d4022, emissiveIntensity: 0.3 },
  lightFix: { color: 0xf4f7fa, emissive: 0xdfeeff, emissiveIntensity: 2.6, roughness: 0.4 },
  growLight: { color: 0xffc9e0, emissive: 0xff7fb0, emissiveIntensity: 2.2, roughness: 0.5 },
  orange: { color: 0xe07a28, roughness: 0.55, metalness: 0.25 },
  suitWhite: { color: 0xe6e9ea, roughness: 0.42, metalness: 0.12 },
  screen: { color: 0x061620, emissive: 0x1d5a74, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.2 },
  metalDark: { color: 0x3a4048, roughness: 0.45, metalness: 0.75 },
  visor: { color: 0x2a1f08, roughness: 0.15, metalness: 0.95 }
}

export const OMEGA = 0.99
export const RING_POINT: [number, number, number] = [0, 0, -4]
export const WALK_G_THRESHOLD = 0.12

export interface FieldHoleDef {
  thetaCenter: number
  thetaHalf: number
  axialMin: number
  axialMax: number
}

export const GRAVITY_FIELDS: GravityField[] = [
  {
    kind: 'radial',
    id: 'ring',
    point: [0, 0, -4],
    axis: [0, 0, 1],
    refDir: [1, 0, 0],
    axialMin: -1.16,
    axialMax: 1.16,
    innerR: 2.74,
    outerR: 5.08,
    omega: OMEGA,
    holes: [{ thetaCenter: Math.PI / 2, thetaHalf: 0.19, axialMin: -0.84, axialMax: 0.84 }]
  },
  {
    kind: 'gradient',
    id: 'spoke',
    origin: [0, 2.44, -4],
    dir: [0, 1, 0],
    tMin: 0.02,
    tMax: 2.58,
    gStart: 0,
    gEnd: OMEGA * OMEGA * 5,
    radius: 1.1
  }
]

export interface ZoneBox {
  min: [number, number, number]
  max: [number, number, number]
}
export type PressureZone = ZoneBox | { annulus: true; point: [number, number, number]; axialMin: number; axialMax: number; innerR: number; outerR: number }

export const PRESSURE_ZONES: PressureZone[] = [
  { min: [-2.52, -2.52, -7.05], max: [2.52, 2.52, -0.98] },
  { min: [-1.06, -1.06, -1.02], max: [1.06, 1.06, 2.02] },
  { min: [-1.82, -0.05, 1.94], max: [1.82, 2.72, 6.06] },
  { min: [-0.84, 2.44, -4.91], max: [0.84, 5.07, -3.09] },
  { annulus: true, point: [0, 0, -4], axialMin: -1.22, axialMax: 1.22, innerR: 2.6, outerR: 5.1 }
]

export function insidePressurized(p: THREE.Vector3): boolean {
  for (const z of PRESSURE_ZONES) {
    if ('min' in z && 'max' in z) {
      if (
        p.x >= z.min[0] && p.x <= z.max[0] &&
        p.y >= z.min[1] && p.y <= z.max[1] &&
        p.z >= z.min[2] && p.z <= z.max[2]
      ) {
        return true
      }
    } else {
      const dx = p.x - z.point[0]
      const dy = p.y - z.point[1]
      const dz = p.z - z.point[2]
      if (dz < z.axialMin || dz > z.axialMax) continue
      const r = Math.hypot(dx, dy)
      if (r >= z.innerR && r <= z.outerR) return true
    }
  }
  return false
}

export interface DoorEnt {
  id: string
  label: string
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  open: boolean
  locked: boolean
  t: number
  closedPos: THREE.Vector3
  slideDir: THREE.Vector3
  dist: number
  autoCloseDelay: number
  autoCloseTimer: number
}

export interface PlotDef {
  id: string
  rackId: string
  soilMesh: THREE.Mesh
  plantGroup: THREE.Group
  hitProxy: THREE.Object3D
  anchor: THREE.Vector3
}

export interface PropSpawn {
  pos: THREE.Vector3
  mass: number
  size: number
}

export interface ShipBuild {
  group: THREE.Group
  doors: DoorEnt[]
  propSpawns: PropSpawn[]
  anchors: Record<string, THREE.Vector3>
  plots: PlotDef[]
  suitDisplay: THREE.Group
  scrubberLed: THREE.Mesh
  breakerLever: THREE.Mesh
  itemMeshes: Record<'toolkit' | 'filter' | 'sealant', THREE.Mesh>
  deadWingCells: THREE.Mesh[]
  leakAnchor: THREE.Vector3
  interactRoots: THREE.Object3D[]
  mats: Record<MatKey, THREE.MeshStandardMaterial>
}

function angDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function shellPatchGeometry(
  r: number,
  zMin: number,
  zMax: number,
  holes: FieldHoleDef[],
  matSide: THREE.Side
): THREE.BufferGeometry {
  const circ = r * Math.PI * 2
  const segT = Math.max(48, Math.min(140, Math.ceil(circ / 0.14)))
  const pos: number[] = []
  const nor: number[] = []
  const pushQuad = (t0: number, t1: number, z0: number, z1: number) => {
    const x00 = r * Math.cos(t0), y00 = r * Math.sin(t0)
    const x10 = r * Math.cos(t1), y10 = r * Math.sin(t1)
    const n0x = Math.cos(t0), n0y = Math.sin(t0)
    const n1x = Math.cos(t1), n1y = Math.sin(t1)
    pos.push(x00, y00, z0, x10, y10, z0, x10, y10, z1)
    pos.push(x00, y00, z0, x10, y10, z1, x00, y00, z1)
    nor.push(n0x, n0y, 0, n1x, n1y, 0, n1x, n1y, 0)
    nor.push(n0x, n0y, 0, n1x, n1y, 0, n0x, n0y, 0)
  }
  let tPrev = 0
  for (let i = 1; i <= segT; i++) {
    const t = (i / segT) * Math.PI * 2
    const tm = (tPrev + t) / 2
    const inHoleZ = holes.filter((h) => Math.abs(angDiff(tm, h.thetaCenter)) < h.thetaHalf)
    if (!inHoleZ.length) {
      pushQuad(tPrev, t, zMin, zMax)
    } else {
      let zLo = zMin
      const sorted = [...inHoleZ].sort((a, b) => a.axialMin - b.axialMin)
      for (const h of sorted) {
        if (h.axialMin > zLo) pushQuad(tPrev, t, zLo, h.axialMin)
        zLo = Math.max(zLo, h.axialMax)
      }
      if (zLo < zMax) pushQuad(tPrev, t, zLo, zMax)
    }
    tPrev = t
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.computeBoundingSphere()
  void matSide
  return geo
}

export class ShipBuilder {
  private mats: Record<MatKey, THREE.MeshStandardMaterial>
  group = new THREE.Group()
  doors: DoorEnt[] = []
  plots: PlotDef[] = []
  interactRoots: THREE.Object3D[] = []
  private suitDisplay!: THREE.Group
  private scrubberLed!: THREE.Mesh
  private breakerLever!: THREE.Mesh
  private itemMeshes: Record<'toolkit' | 'filter' | 'sealant', THREE.Mesh>
  private deadCells: THREE.Mesh[] = []

  constructor(private physics: Physics, API: typeof RAPIER) {
    void API
    this.mats = {} as Record<MatKey, THREE.MeshStandardMaterial>
    for (const [k, def] of Object.entries(MAT_DEFS)) {
      this.mats[k as MatKey] = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...def })
    }
    this.itemMeshes = {} as Record<'toolkit' | 'filter' | 'sealant', THREE.Mesh>
  }

  private addPart(
    geo: THREE.BufferGeometry,
    key: MatKey,
    opts: { collide?: boolean; cast?: boolean; receive?: boolean } = {}
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, this.mats[key])
    mesh.castShadow = opts.cast ?? false
    mesh.receiveShadow = opts.receive ?? true
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    this.group.add(mesh)
    this.interactRoots.push(mesh)
    if (opts.collide !== false) this.physics.trimeshFromGeometry(geo, key === 'floor' || key === 'grate' ? 1.05 : 0.9)
    return mesh
  }

  private box(w: number, h: number, d: number, pos: [number, number, number], key: MatKey, opts: { collide?: boolean; cast?: boolean; rotX?: number; rotZ?: number } = {}): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d)
    if (opts.rotX) geo.rotateX(opts.rotX)
    if (opts.rotZ) geo.rotateZ(opts.rotZ)
    geo.translate(pos[0], pos[1], pos[2])
    return this.addPart(geo, key, opts)
  }

  build(): ShipBuild {
    this.buildRing()
    this.buildHub()
    this.buildSpoke()
    this.buildTubeAndCommand()
    this.buildEvaShaft()
    this.buildExterior()
    this.buildFurniture()
    this.buildGardenRacks()
    this.buildLights()
    return {
      group: this.group,
      doors: this.doors,
      propSpawns: [
        { pos: new THREE.Vector3(-1.2, 0.4, -2.2), mass: 4, size: 0.42 },
        { pos: new THREE.Vector3(1.3, -0.3, -3.4), mass: 9, size: 0.5 },
        { pos: new THREE.Vector3(0.4, 1.1, -1.9), mass: 2, size: 0.36 },
        { pos: new THREE.Vector3(-0.9, -1.2, -2.8), mass: 14, size: 0.55 },
        { pos: new THREE.Vector3(-1.1, 1.2, 4.6), mass: 6, size: 0.44 },
        { pos: new THREE.Vector3(1.2, 0.6, 5.2), mass: 3, size: 0.38 }
      ],
      anchors: {
        spawnBunk: new THREE.Vector3(-0.6, 1.4, -5.6),
        spawnHub: new THREE.Vector3(0, 0.6, -2.4),
        scrubber: new THREE.Vector3(-1.95, 0.75, -5.5),
        breaker: new THREE.Vector3(1.55, 1.35, 2.2),
        recycler: new THREE.Vector3(Math.cos((280 * Math.PI) / 180) * 4.55, Math.sin((280 * Math.PI) / 180) * 4.55, -4),
        treadmill: new THREE.Vector3(1.15, 0.35, 4.7),
        toolkit: new THREE.Vector3(-1.5, 1.22, 3.12),
        filter: new THREE.Vector3(-1.5, 1.22, 3.4),
        sealant: new THREE.Vector3(-1.5, 1.22, 3.68),
        bunk: new THREE.Vector3(-1.35, 0.6, -6.25),
        logConsole: new THREE.Vector3(0, 1.35, 5.55),
        suitLocker: new THREE.Vector3(-1.45, 1.05, 2.45),
        airlockPanel: new THREE.Vector3(0.85, 4.05, 3.4),
        wingRepair: new THREE.Vector3(4.35, 0.55, -8),
        leakSpot: new THREE.Vector3(Math.cos((305 * Math.PI) / 180) * 4.85, Math.sin((305 * Math.PI) / 180) * 4.85, -4)
      },
      plots: this.plots,
      suitDisplay: this.suitDisplay,
      scrubberLed: this.scrubberLed,
      breakerLever: this.breakerLever,
      itemMeshes: this.itemMeshes,
      deadWingCells: this.deadCells,
      leakAnchor: new THREE.Vector3(Math.cos((305 * Math.PI) / 180) * 4.85, Math.sin((305 * Math.PI) / 180) * 4.85, -4),
      interactRoots: this.interactRoots,
      mats: this.mats
    }
  }

  private makeDoor(id: string, label: string, size: [number, number, number], closedPos: [number, number, number], slideDir: [number, number, number], dist: number, autoCloseDelay = 5): DoorEnt {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2])
    const mesh = new THREE.Mesh(geo, this.mats.accent)
    mesh.castShadow = false
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.interactRoots.push(mesh)
    const { body } = this.physics.createKinematicBox(size[0] / 2, size[1] / 2, size[2] / 2, new THREE.Vector3(closedPos[0], closedPos[1], closedPos[2]))
    const door: DoorEnt = {
      id,
      label,
      mesh,
      body,
      open: false,
      locked: false,
      t: 0,
      closedPos: new THREE.Vector3(closedPos[0], closedPos[1], closedPos[2]),
      slideDir: new THREE.Vector3(slideDir[0], slideDir[1], slideDir[2]),
      dist,
      autoCloseDelay,
      autoCloseTimer: 0
    }
    this.doors.push(door)
    return door
  }

  private buildRing() {
    const hole: FieldHoleDef[] = [{ thetaCenter: Math.PI / 2, thetaHalf: 0.17, axialMin: -4.78, axialMax: -3.22 }]
    const outerGeo = shellPatchGeometry(5, -5.2, -2.8, hole, THREE.BackSide)
    this.addPart(outerGeo, 'wall')
    const floorTrim = shellPatchGeometry(4.985, -5.18, -2.82, [], THREE.BackSide)
    void floorTrim
    const innerGeo = shellPatchGeometry(2.72, -5.2, -2.8, [], THREE.FrontSide)
    this.addPart(innerGeo, 'wall')

    const mkBulk = (z: number) => {
      const g = new THREE.RingGeometry(2.72, 5.02, 72)
      g.translate(0, 0, z)
      this.addPart(g, 'wall')
    }
    mkBulk(-5.2)
    mkBulk(-2.8)

    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * Math.PI * 2 + Math.PI / 12
      const strip = new THREE.BoxGeometry(0.09, 0.09, 1.7)
      strip.translate(Math.cos(th) * 4.93, Math.sin(th) * 4.93, -4)
      this.addPart(strip, 'lightFix', { collide: false })
    }

    this.makeDoor('ringFloorHatch', 'Ring floor hatch', [1.56, 0.1, 1.54], [0, 4.99, -4], [1, 0, 0], 1.52, 0)
  }

  private buildHub() {
    const hole: FieldHoleDef[] = [{ thetaCenter: Math.PI / 2, thetaHalf: 0.31, axialMin: -4.88, axialMax: -3.12 }]
    const shellGeo = shellPatchGeometry(2.5, -7, -1, hole, THREE.BackSide)
    this.addPart(shellGeo, 'wall')

    const rearCap = new THREE.CircleGeometry(2.5, 56)
    rearCap.rotateY(Math.PI)
    rearCap.translate(0, 0, -7)
    this.addPart(rearCap, 'wall')

    const frontCap = new THREE.RingGeometry(1.05, 2.5, 56)
    frontCap.translate(0, 0, -1)
    this.addPart(frontCap, 'wall')

    this.box(4.9, 0.1, 5.9, [0, -2.32, -4.05], 'floor', { cast: false })

    this.makeDoor('hubTopHatch', 'Spoke hatch', [1.72, 0.09, 1.9], [0, 2.51, -4], [1, 0, 0], 1.68, 0)
  }

  private buildSpoke() {
    this.box(0.14, 2.6, 1.78, [-0.82, 3.75, -4], 'wall')
    this.box(0.14, 2.6, 1.78, [0.82, 3.75, -4], 'wall')
    this.box(1.78, 2.6, 0.14, [0, 3.75, -4.89], 'wall')
    this.box(1.78, 2.6, 0.14, [0, 3.75, -3.11], 'wall')
    for (let i = 0; i < 7; i++) {
      const y = 2.85 + i * 0.34
      const rung = new THREE.CylinderGeometry(0.028, 0.028, 1.4, 8)
      rung.rotateZ(Math.PI / 2)
      rung.translate(0, y, -4.62)
      this.addPart(rung, 'trim', { collide: false, cast: true })
    }
  }

  private buildTubeAndCommand() {
    const tube = new THREE.CylinderGeometry(1.05, 1.05, 3, 36, 4, true)
    tube.rotateX(Math.PI / 2)
    tube.translate(0, 0, 0.5)
    this.addPart(tube, 'wall')

    this.box(3.72, 0.12, 4.3, [0, -0.06, 4], 'floor')
    this.box(1.25, 2.7, 0.12, [-1.175, 1.35, 2], 'wall')
    this.box(1.25, 2.7, 0.12, [1.175, 1.35, 2], 'wall')
    this.box(1.1, 0.75, 0.12, [0, 2.325, 2], 'wall')
    this.box(0.12, 2.7, 4.3, [-1.8, 1.35, 4], 'wall')
    this.box(0.12, 2.7, 4.3, [1.8, 1.35, 4], 'wall')
    this.box(3.72, 2.7, 0.12, [0, 1.35, 6], 'wall')
    this.box(2.24, 0.12, 4.3, [-0.74, 2.76, 4], 'wall')
    this.box(0.53, 0.12, 4.3, [1.595, 2.76, 4], 'wall')
    this.box(0.95, 0.12, 2.54, [0.855, 2.76, 4.85], 'wall')
    this.box(0.95, 0.12, 0.69, [0.855, 2.76, 2.285], 'wall')

    for (const sx of [-1, 1]) {
      const win = new THREE.PlaneGeometry(0.85, 0.5)
      win.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2)
      win.translate(sx * 1.73, 1.75, 4.9)
      this.addPart(win, 'glass', { collide: false })
    }
  }

  private buildEvaShaft() {
    this.box(0.1, 1.65, 1.15, [0.33, 3.525, 3.105], 'wall')
    this.box(0.1, 1.65, 1.15, [1.38, 3.525, 3.105], 'wall')
    this.box(1.25, 1.65, 0.1, [0.855, 3.525, 2.58], 'wall')
    this.box(1.25, 1.65, 0.1, [0.855, 3.525, 3.63], 'wall')

    this.box(2.7, 0.08, 2.4, [0.9, 4.38, 3.3], 'grate', { cast: false })
    this.box(2.7, 0.05, 0.05, [0.9, 4.85, 2.15], 'accent', { collide: false })
    this.box(2.7, 0.05, 0.05, [0.9, 4.85, 4.45], 'accent', { collide: false })
    this.box(0.05, 0.45, 0.05, [-0.4, 4.63, 2.15], 'accent', { collide: false })
    this.box(0.05, 0.45, 0.05, [2.2, 4.63, 2.15], 'accent', { collide: false })
    this.box(0.05, 0.45, 0.05, [-0.4, 4.63, 4.45], 'accent', { collide: false })
    this.box(0.05, 0.45, 0.05, [2.2, 4.63, 4.45], 'accent', { collide: false })

    this.makeDoor('evaLid', 'EVA hatch', [1.0, 0.08, 1.0], [0.855, 4.33, 3.105], [1, 0, 0], 1.04, 0)
  }

  private buildExterior() {
    this.box(16, 0.26, 0.36, [0, 0.35, -8], 'trim', { cast: true })
    this.box(0.14, 0.14, 2.6, [1.4, 0.35, -7.4], 'trim', { collide: false })
    this.box(0.14, 0.14, 2.6, [-1.4, 0.35, -7.4], 'trim', { collide: false })
    this.box(0.14, 0.14, 2.6, [1.4, 0.35, -9.4], 'trim', { collide: false })
    this.box(0.14, 0.14, 2.6, [-1.4, 0.35, -9.4], 'trim', { collide: false })
    this.box(0.1, 0.1, 5.4, [0, -1.4, -11], 'trim', { collide: false, cast: true })
    this.box(0.1, 0.1, 5.4, [0, 1.4, -11], 'trim', { collide: false, cast: true })

    for (const side of [1, -1]) {
      for (let col = 0; col < 5; col++) {
        for (let row = 0; row < 2; row++) {
          const idx = col * 2 + row
          const damaged = side === 1 && (idx === 3 || idx === 5)
          const w = 1.5
          const cellGeo = new THREE.BoxGeometry(w * 0.94, 0.06, 0.86)
          if (damaged) cellGeo.rotateZ(0.1 + row * 0.05)
          const x = side * (1.35 + col * 1.56 + w / 2)
          const y = 0.35 + (row - 0.5) * 0.92
          cellGeo.translate(x, y, -8)
          const cell = this.addPart(cellGeo, damaged ? 'solarDead' : 'solar', {
            collide: damaged,
            cast: true,
            receive: true
          })
          if (damaged) this.deadCells.push(cell)
        }
      }
    }

    this.box(0.1, 2.3, 3.4, [1.9, 0.1, -11.2], 'radiator', { cast: true })
    this.box(0.1, 2.3, 3.4, [-1.9, 0.1, -11.2], 'radiator', { cast: true })
    this.box(0.34, 0.34, 0.5, [0, 0.35, -13.6], 'orange', { collide: false, cast: true })
  }

  private buildFurniture() {
    const scrubberBody = this.box(0.7, 1.15, 0.5, [-2.1, 0.75, -5.5], 'white', { rotX: 0 })
    void scrubberBody
    this.box(0.06, 0.8, 0.36, [-1.83, 0.8, -5.5], 'trim', { collide: false })
    const led = new THREE.SphereGeometry(0.045, 12, 10)
    led.translate(-1.79, 1.32, -5.32)
    this.scrubberLed = this.addPart(led, 'plant', { collide: false })

    const recyclerAngle = (280 * Math.PI) / 180
    const rx = Math.cos(recyclerAngle) * 4.55
    const ry = Math.sin(recyclerAngle) * 4.55
    const tankGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 20)
    tankGeo.rotateZ(Math.PI / 2)
    const rzRot = recyclerAngle + Math.PI / 2
    tankGeo.rotateZ(rzRot - Math.PI / 2)
    tankGeo.translate(rx, ry + 0.5, -4)
    this.addPart(tankGeo, 'white')
    const pipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10)
    pipeGeo.rotateZ(rzRot)
    pipeGeo.translate(rx * 0.86, ry * 0.86 + 0.2, -4)
    this.addPart(pipeGeo, 'trim', { collide: false })

    this.box(0.5, 2.0, 0.16, [1.55, 1.35, 2.2], 'metalDark')
    const lever = new THREE.BoxGeometry(0.07, 0.42, 0.07)
    lever.translate(1.42, 1.75, 2.3)
    this.breakerLever = this.addPart(lever, 'orange', { collide: false, cast: true })

    const treadBase = this.box(0.85, 0.16, 1.7, [1.15, 0.14, 4.7], 'trim')
    void treadBase
    this.box(0.7, 0.03, 1.4, [1.15, 0.24, 4.7], 'grate', { collide: false })
    this.box(0.06, 1.1, 1.5, [1.55, 0.8, 4.7], 'trim', { collide: false })

    this.box(0.5, 0.06, 1.6, [-1.52, 1.0, 3.24], 'grate')
    this.box(0.5, 0.06, 1.6, [-1.52, 1.44, 3.24], 'grate', { collide: false })

    const tk = new THREE.BoxGeometry(0.34, 0.16, 0.22)
    tk.translate(-1.5, 1.12, 3.12)
    this.itemMeshes.toolkit = this.addPart(tk, 'orange', { collide: false, cast: true })
    const fl = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12)
    fl.translate(-1.5, 1.13, 3.4)
    this.itemMeshes.filter = this.addPart(fl, 'white', { collide: false, cast: true })
    const sl = new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10)
    sl.rotateX(Math.PI / 2)
    sl.translate(-1.5, 1.12, 3.68)
    this.itemMeshes.sealant = this.addPart(sl, 'plant', { collide: false, cast: true })

    this.box(1.7, 0.18, 0.9, [-1.45, 0.5, -6.25], 'white')
    this.box(0.55, 0.09, 0.32, [-1.45, 0.62, -6.58], 'grate', { collide: false })
    this.box(1.6, 0.05, 0.8, [-1.45, 0.61, -6.12], 'accent', { collide: false })
    this.box(0.3, 0.08, 0.08, [-1.45, 1.9, -6.25], 'lightFix', { collide: false })

    const desk = this.box(1.9, 0.08, 0.7, [0, 1.0, 5.6], 'metalDark')
    void desk
    const screen = new THREE.PlaneGeometry(1.5, 0.55)
    screen.translate(0, 1.5, 5.9)
    this.addPart(screen, 'screen', { collide: false })
    this.box(0.08, 0.5, 0.08, [-0.6, 1.25, 5.85], 'trim', { collide: false })
    this.box(0.08, 0.5, 0.08, [0.6, 1.25, 5.85], 'trim', { collide: false })

    this.box(0.5, 2.1, 0.14, [-1.68, 1.05, 2.1], 'trim')
    this.box(0.5, 0.14, 1.0, [-1.68, 2.12, 2.6], 'trim', { collide: false })

    const suit = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), this.mats.suitWhite)
    torso.position.set(0, 1.25, 0)
    suit.add(torso)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), this.mats.suitWhite)
    helmet.position.set(0, 1.78, 0)
    suit.add(helmet)
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 14, -0.9, 1.8, 0.9, 1.2), this.mats.visor)
    visor.position.set(0, 1.78, 0.02)
    suit.add(visor)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.2), this.mats.trim)
    pack.position.set(0, 1.32, -0.24)
    suit.add(pack)
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 10), this.mats.suitWhite)
      arm.position.set(s * 0.29, 1.22, 0)
      arm.rotation.z = s * 0.18
      suit.add(arm)
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 10), this.mats.suitWhite)
      leg.position.set(s * 0.11, 0.62, 0)
      suit.add(leg)
    }
    suit.position.set(-1.42, 0.05, 2.45)
    suit.traverse((o) => {
      o.castShadow = true
    })
    this.group.add(suit)
    this.suitDisplay = suit
  }

  private buildGardenRacks() {
    const rackAngles = [150, 195, 240]
    rackAngles.forEach((deg, ri) => {
      const rackId = `rack${ri}`
      const th = (deg * Math.PI) / 180
      const bx = Math.cos(th)
      const by = Math.sin(th)
      for (let pi = 0; pi < 4; pi++) {
        const zoff = -4.85 + pi * 0.57
        const soilGeo = new THREE.BoxGeometry(0.5, 0.14, 0.5)
        const tilt = th + Math.PI / 2
        soilGeo.rotateZ(tilt)
        soilGeo.translate(bx * 4.62, by * 4.62, zoff)
        const soil = this.addPart(soilGeo, 'soil', { collide: false })
        const plant = new THREE.Group()
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.22, 6), this.mats.plant)
        stem.position.y = 0.11
        plant.add(stem)
        for (let l = 0; l < 4; l++) {
          const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), this.mats.plant)
          leaf.position.set(Math.sin(l * 1.7) * 0.06, 0.16 + (l % 2) * 0.05, Math.cos(l * 1.7) * 0.06)
          leaf.scale.set(1, 0.5, 1)
          plant.add(leaf)
        }
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.mats.orange)
        fruit.name = 'fruit'
        fruit.position.set(0.03, 0.24, 0.02)
        fruit.visible = false
        plant.add(fruit)
        const holder = new THREE.Group()
        holder.position.copy(soil.position)
        holder.rotation.z = tilt
        holder.add(plant)
        plant.position.y = 0.08
        plant.scale.setScalar(0.001)
        const hitProxy = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 0.5, 0.72),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        )
        hitProxy.position.set(bx * 4.55, by * 4.55, zoff)
        hitProxy.rotation.z = tilt
        this.group.add(hitProxy)
        this.interactRoots.push(hitProxy)
        this.group.add(holder)
        this.interactRoots.push(holder)
        this.plots.push({
          id: `p${ri}${pi}`,
          rackId,
          soilMesh: soil,
          plantGroup: holder,
          hitProxy,
          anchor: hitProxy.position.clone()
        })
      }
      const railGeo = new THREE.BoxGeometry(0.06, 0.06, 2.5)
      railGeo.rotateZ(th + Math.PI / 2)
      railGeo.translate(bx * 4.62, by * 4.62 + 0.55, -4)
      this.addPart(railGeo, 'trim', { collide: false })
      const lightGeo = new THREE.BoxGeometry(0.1, 0.05, 2.4)
      lightGeo.rotateZ(th + Math.PI / 2)
      lightGeo.translate(bx * 4.35, by * 4.35, -4)
      this.addPart(lightGeo, 'growLight', { collide: false })
    })
  }

  private buildLights() {
    const addPoint = (x: number, y: number, z: number, intensity: number, dist: number, color = 0xcfe4ff) => {
      const l = new THREE.PointLight(color, intensity, dist, 1.8)
      l.position.set(x, y, z)
      this.group.add(l)
    }
    addPoint(0, 1.9, -5.6, 10, 9)
    addPoint(0, 1.9, -2.2, 10, 9)
    addPoint(0, 0, 0.5, 5, 5, 0xd8e6ff)
    addPoint(-0.7, 2.4, 3.4, 9, 7)
    addPoint(0.9, 2.4, 5.2, 8, 7)
    addPoint(0, 3.4, 3.105, 4, 4, 0xffe2c2)
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * Math.PI * 2 + Math.PI / 12
      addPoint(Math.cos(th) * 3.9, Math.sin(th) * 3.9, -4, 6, 6.5)
    }
    const spokeL = new THREE.PointLight(0xcfe4ff, 6, 4, 1.8)
    spokeL.position.set(0, 3.7, -4)
    this.group.add(spokeL)
  }
}
