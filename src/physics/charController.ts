import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { GROUPS_PLAYER } from './world'

export type MoveMode = 'walk' | 'thrust'

export interface MoveIntent {
  moveX: number
  moveZ: number
  vertical: number
  sprint: boolean
  boost: boolean
}

export interface CamBasis {
  fwd: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
}

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpMove = new THREE.Vector3()

export class CharacterBody {
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  cc: RAPIER.KinematicCharacterController
  mode: MoveMode = 'thrust'
  vel = new THREE.Vector3()
  grounded = false
  wasGrounded = false
  stabilizers = true
  walkSpeedMult = 1
  prevPos = new THREE.Vector3()
  currPos = new THREE.Vector3()
  private upSmooth = new THREE.Vector3(0, 1, 0)

  constructor(API: typeof RAPIER, world: RAPIER.World, spawn: THREE.Vector3) {
    this.prevPos.copy(spawn)
    this.currPos.copy(spawn)
    const bd = API.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z)
    this.body = world.createRigidBody(bd)
    const cd = API.ColliderDesc.capsule(0.55, 0.34).setCollisionGroups(GROUPS_PLAYER).setFriction(0.9)
    this.collider = world.createCollider(cd, this.body)
    this.cc = world.createCharacterController(0.06)
    this.cc.setUp({ x: 0, y: 1, z: 0 })
    this.cc.enableAutostep(0.45, 0.22, true)
    this.cc.setMaxSlopeClimbAngle((58 * Math.PI) / 180)
    this.cc.enableSnapToGround(0.4)
  }

  get position(): THREE.Vector3 {
    return this.currPos
  }

  setUp(up: THREE.Vector3, snap = false): void {
    if (snap) this.upSmooth.copy(up)
    else this.upSmooth.lerp(up, 0.18)
    if (this.upSmooth.lengthSq() < 1e-8) this.upSmooth.copy(up)
    this.upSmooth.normalize()
  }

  upSmoothSafe(): THREE.Vector3 {
    return this.upSmooth
  }

  teleport(p: THREE.Vector3): void {
    this.currPos.copy(p)
    this.prevPos.copy(p)
    this.vel.set(0, 0, 0)
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
  }

  tickWalk(dt: number, intent: MoveIntent, basis: CamBasis, _gVec: THREE.Vector3, gMag: number): void {
    const up = tmpA.copy(this.upSmooth)
    const down = tmpB.copy(up).multiplyScalar(-1)

    const move = tmpMove
      .copy(basis.right)
      .multiplyScalar(intent.moveX)
      .addScaledVector(basis.fwd, intent.moveZ)
    move.addScaledVector(up, -move.dot(up))
    if (move.lengthSq() > 1e-6) move.normalize()

    const speed = (intent.sprint ? 5.4 : 3.15) * this.walkSpeedMult
    move.multiplyScalar(speed)
    const blend = 1 - Math.exp(-11 * dt)
    const along = this.vel.dot(up)
    this.vel.addScaledVector(up, -along)
    this.vel.x += (move.x - this.vel.x) * blend
    this.vel.y += (move.y - this.vel.y) * blend
    this.vel.z += (move.z - this.vel.z) * blend
    this.vel.addScaledVector(up, along)

    if (!this.grounded && gMag > 0.01) {
      this.vel.addScaledVector(down, gMag * dt)
    }

    if (this.grounded || this.wasGrounded) {
      const into = this.vel.dot(down)
      if (into > 0) this.vel.addScaledVector(down, -into)
    }

    this.stepMove(dt, up, true)
  }

  tickThrust(dt: number, intent: MoveIntent, basis: CamBasis, boostFuelOK: boolean): void {
    const accel = 7.5 * (intent.boost && boostFuelOK ? 2.3 : 1)
    const acc = new THREE.Vector3()
      .addScaledVector(basis.fwd, intent.moveZ)
      .addScaledVector(basis.right, intent.moveX)
      .addScaledVector(basis.up, intent.vertical)
    if (acc.lengthSq() > 1) acc.normalize()
    acc.multiplyScalar(accel)
    this.vel.addScaledVector(acc, dt)
    const dampRate = this.stabilizers ? 2.6 : 0.03
    const d = Math.exp(-dampRate * dt)
    this.vel.multiplyScalar(d)
    const cap = intent.boost && boostFuelOK ? 21 : 11
    if (this.vel.length() > cap) this.vel.setLength(cap)
    this.grounded = false
    this.stepMove(dt, this.upSmooth, false)
  }

  private stepMove(dt: number, up: THREE.Vector3, snap: boolean): void {
    this.cc.setUp({ x: up.x, y: up.y, z: up.z })
    if (snap) this.cc.enableSnapToGround(0.4)
    else this.cc.disableSnapToGround()
    const dx = this.vel.x * dt
    const dy = this.vel.y * dt
    const dz = this.vel.z * dt
    this.cc.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz })
    const mv = this.cc.computedMovement()
    this.prevPos.copy(this.currPos)
    this.currPos.x += mv.x
    this.currPos.y += mv.y
    this.currPos.z += mv.z
    this.body.setNextKinematicTranslation({ x: this.currPos.x, y: this.currPos.y, z: this.currPos.z })
    this.wasGrounded = this.grounded
    this.grounded = this.cc.computedGrounded()
  }

  tickLadder(dt: number, climb: number, strafeX: number, strafeZ: number): void {
    const speed = 2.5
    this.vel.set(strafeX * 0.9, climb * speed, strafeZ * 0.9)
    this.cc.setUp({ x: 0, y: 1, z: 0 })
    this.cc.disableSnapToGround()
    const dx = this.vel.x * dt
    const dy = this.vel.y * dt
    const dz = this.vel.z * dt
    this.cc.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz })
    const mv = this.cc.computedMovement()
    this.prevPos.copy(this.currPos)
    this.currPos.x += mv.x
    this.currPos.y += mv.y
    this.currPos.z += mv.z
    this.body.setNextKinematicTranslation({ x: this.currPos.x, y: this.currPos.y, z: this.currPos.z })
    this.wasGrounded = this.grounded
    this.grounded = false
  }

  inheritTangential(v: THREE.Vector3): void {
    this.vel.copy(v)
  }
}
