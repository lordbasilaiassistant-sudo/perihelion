import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export const GROUP_WORLD = 1 << 0
export const GROUP_PLAYER = 1 << 1
export const GROUP_PROP = 1 << 2

export const GROUPS_WORLD = (GROUP_WORLD << 16) | 0xffff
export const GROUPS_PLAYER = (GROUP_PLAYER << 16) | GROUP_WORLD
export const GROUPS_PROP = (GROUP_PROP << 16) | (GROUP_WORLD | GROUP_PROP | GROUP_PLAYER)
export const RAY_GROUPS = (0xffff << 16) | (0xffff & ~GROUP_PLAYER)

let ready = false

export async function initRapier(): Promise<typeof RAPIER> {
  if (!ready) {
    await RAPIER.init()
    ready = true
  }
  return RAPIER
}

export interface RayHit {
  toi: number
  point: THREE.Vector3
  normal: THREE.Vector3
}

export interface DynCube {
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
}

export class Physics {
  world: RAPIER.World
  private API: typeof RAPIER

  constructor(API: typeof RAPIER) {
    this.API = API
    this.world = new API.World({ x: 0, y: 0, z: 0 })
    this.world.timestep = 1 / 60
  }

  step(): void {
    this.world.step()
  }

  trimeshFromGeometry(geo: THREE.BufferGeometry, friction = 1): RAPIER.Collider {
    const posAttr = geo.getAttribute('position')
    const pos = new Float32Array(posAttr.array as ArrayLike<number>)
    let idx: Uint32Array
    if (geo.index) {
      idx = new Uint32Array(geo.index.array as ArrayLike<number>)
    } else {
      idx = new Uint32Array(pos.length / 3)
      for (let i = 0; i < idx.length; i++) idx[i] = i
    }
    const desc = this.API.ColliderDesc.trimesh(pos, idx)
    desc.setFriction(friction)
    desc.setCollisionGroups(GROUPS_WORLD)
    return this.world.createCollider(desc)
  }

  createDynamicCube(size: number, mass: number, p: THREE.Vector3): DynCube {
    const bd = this.API.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(0.05).setAngularDamping(0.4)
    const body = this.world.createRigidBody(bd)
    const cd = this.API.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
      .setMass(mass)
      .setFriction(0.75)
      .setRestitution(0.18)
      .setCollisionGroups(GROUPS_PROP)
    const collider = this.world.createCollider(cd, body)
    return { body, collider }
  }

  createKinematicBox(hx: number, hy: number, hz: number, p: THREE.Vector3): DynCube {
    const bd = this.API.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z)
    const body = this.world.createRigidBody(bd)
    const cd = this.API.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.6).setCollisionGroups(GROUPS_WORLD)
    const collider = this.world.createCollider(cd, body)
    return { body, collider }
  }

  rayHit(origin: THREE.Vector3, dir: THREE.Vector3, maxToi: number): RayHit | null {
    const ray = new this.API.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: dir.x, y: dir.y, z: dir.z }
    )
    const hit = this.world.castRayAndGetNormal(ray, maxToi, true, undefined, RAY_GROUPS)
    if (!hit) return null
    return {
      toi: hit.timeOfImpact,
      point: origin.clone().addScaledVector(dir, hit.timeOfImpact),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z)
    }
  }
}
