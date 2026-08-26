import * as THREE from 'three'
import { CharacterBody } from '../physics/charController'
import type RAPIER from '@dimforge/rapier3d-compat'
import { gravityAt, pickField, tangentialVelocity, type GravityField, type Vec3 } from '../physics/gravity'
import { WALK_G_THRESHOLD } from './shipBuilder'

export interface CamBasis {
  fwd: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
}

const JUMP_V = 3.3
const SUIT_ASSIST_ACCEL = 2.9

function inLadderShaft(p: THREE.Vector3): boolean {
  return p.y > 2.62 && p.y < 4.94 && Math.abs(p.x) < 0.78 && Math.abs(p.z + 4) < 0.82
}

function buildAvatar(suited: boolean): THREE.Group {
  const g = new THREE.Group()
  const suitMat = new THREE.MeshStandardMaterial({ color: suited ? 0xe4e7e9 : 0x49566b, roughness: 0.45, metalness: 0.14 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.5, metalness: 0.4 })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79b76, roughness: 0.7 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 6, 14), suitMat)
  torso.position.y = 1.12
  g.add(torso)
  if (suited) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16), suitMat)
    helmet.position.y = 1.62
    g.add(helmet)
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14, -0.9, 1.8, 0.95, 1.15), new THREE.MeshStandardMaterial({ color: 0x2a1f08, roughness: 0.15, metalness: 0.95 }))
    visor.position.set(0, 1.62, 0.02)
    g.add(visor)
  } else {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 16), skinMat)
    head.position.y = 1.62
    g.add(head)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.148, 20, 12, 0, Math.PI * 2, 0, 1.4), darkMat)
    hair.position.y = 1.63
    g.add(hair)
  }
  if (suited) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.22), darkMat)
    pack.position.set(0, 1.18, -0.26)
    g.add(pack)
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 10), suitMat)
    arm.position.set(s * 0.27, 1.1, 0.04)
    arm.rotation.x = -0.35
    arm.rotation.z = s * 0.12
    g.add(arm)
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.52, 4, 10), suitMat)
    leg.position.set(s * 0.11, 0.42, 0)
    g.add(leg)
    if (!suited) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), darkMat)
      boot.position.set(s * 0.11, 0.05, 0.04)
      g.add(boot)
    }
  }
  g.traverse((o) => {
    o.castShadow = true
  })
  return g
}

function buildFpArms(): THREE.Group {
  const g = new THREE.Group()
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x49566b, roughness: 0.55 })
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x2e3540, roughness: 0.5, metalness: 0.3 })
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.7 })
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.46, 4, 10), sleeveMat)
    arm.position.set(s * 0.235, -0.285, -0.4)
    arm.rotation.set(-1.22, 0, s * -0.22)
    g.add(arm)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.07, 12), cuffMat)
    cuff.position.set(s * 0.212, -0.335, -0.615)
    cuff.rotation.set(-1.22, 0, s * -0.22)
    g.add(cuff)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), gloveMat)
    hand.scale.set(1, 0.82, 1.18)
    hand.position.set(s * 0.205, -0.36, -0.68)
    hand.rotation.y = s * -0.3
    g.add(hand)
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 3, 8), gloveMat)
    thumb.position.set(s * 0.168, -0.345, -0.645)
    thumb.rotation.set(-0.9, 0, s * -0.5)
    g.add(thumb)
  }
  return g
}

export class Player {
  char: CharacterBody
  yaw = Math.PI * 0.98
  pitch = -0.05
  thirdPerson = false
  boom = 3.4
  private camDist = 3.4
  avatarRoot = new THREE.Group()
  private avatarSuit: THREE.Group
  private avatarCasual: THREE.Group
  fpArms = buildFpArms()
  suited = false
  fov = 76
  currentField: GravityField | null = null
  gVec = new THREE.Vector3()
  gMag = 0
  lastThrustDir = new THREE.Vector3()
  thrusting = false
  private bobPhase = 0
  private stepAccum = 0
  onFootstep: (() => void) | null = null
  private tmpQ = new THREE.Quaternion()

  constructor(API: typeof RAPIER, physicsCtor: { world: import('@dimforge/rapier3d-compat').World }, spawn: THREE.Vector3) {
    this.char = new CharacterBody(API, physicsCtor.world as import('@dimforge/rapier3d-compat').World, spawn)
    this.avatarSuit = buildAvatar(true)
    this.avatarCasual = buildAvatar(false)
    this.avatarRoot.add(this.avatarSuit, this.avatarCasual)
    this.avatarCasual.visible = true
    this.avatarSuit.visible = false
    this.fpArms.visible = false
  }

  setSuited(on: boolean): void {
    this.suited = on
    this.avatarSuit.visible = on
    this.avatarCasual.visible = !on
    this.char.walkSpeedMult = on ? 0.86 : 1
  }

  computeGravity(fields: GravityField[]): void {
    const p: Vec3 = [this.char.currPos.x, this.char.currPos.y, this.char.currPos.z]
    const f = pickField(fields, p)
    this.currentField = f
    if (!f) {
      this.gVec.set(0, 0, 0)
      this.gMag = 0
      return
    }
    const g = gravityAt(f, p)
    this.gVec.set(g[0], g[1], g[2])
    this.gMag = this.gVec.length()
  }

  basis(camQuatResult?: THREE.Quaternion): CamBasis {
    const up = this.char.upSmoothSafe()
    const yawQ = this.tmpQ.setFromAxisAngle(up, this.yaw)
    const fwdNoPitch = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQ)
    const rightNoPitch = new THREE.Vector3().crossVectors(fwdNoPitch, up).normalize().multiplyScalar(-1)
    const cp = Math.cos(this.pitch)
    const sp = Math.sin(this.pitch)
    const fwd = fwdNoPitch.multiplyScalar(cp).addScaledVector(up, -sp).normalize()
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize()
    void rightNoPitch
    if (camQuatResult) {
      const m = new THREE.Matrix4().makeBasis(right, up, fwd.clone().multiplyScalar(-1))
      camQuatResult.setFromRotationMatrix(m)
    }
    return { fwd, right, up }
  }

  handleLook(dx: number, dy: number): void {
    this.yaw -= dx
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, -1.51, 1.51)
  }

  moveIntent(input: { axis(neg: string, pos: string): number; down(c: string): boolean }): { intent: import('../physics/charController').MoveIntent } {
    const sprint = input.down('ShiftLeft')
    return {
      intent: {
        moveX: input.axis('KeyA', 'KeyD'),
        moveZ: input.axis('KeyS', 'KeyW'),
        vertical: input.axis('ControlLeft', 'Space'),
        sprint,
        boost: input.down('ShiftLeft')
      }
    }
  }

  tick(dt: number, intent: import('../physics/charController').MoveIntent, spaceHeld: boolean, spacePressed: boolean, rPressed: boolean): void {
    const basis = this.basis()
    const prevMode = this.char.mode
    const wantWalk = this.gMag >= WALK_G_THRESHOLD
    if (wantWalk && prevMode === 'thrust' && this.currentField?.kind === 'radial') {
      const tv = tangentialVelocity(this.currentField, [this.char.currPos.x, this.char.currPos.y, this.char.currPos.z])
      this.char.vel.add(new THREE.Vector3(tv[0], tv[1], tv[2]))
    }
    if (rPressed) this.char.stabilizers = !this.char.stabilizers

    this.thrusting = false

    if (inLadderShaft(this.char.currPos)) {
      this.char.mode = 'walk'
      const lookUp = basis.fwd.y >= 0 ? 1 : -1
      let climb = intent.vertical + intent.moveZ * lookUp
      climb = THREE.MathUtils.clamp(climb, -1, 1)
      const latX = basis.right.x * intent.moveX
      const latZ = basis.right.z * intent.moveX
      this.char.tickLadder(dt, climb, latX, latZ)
      return
    }

    if (wantWalk) {
      this.char.mode = 'walk'
      if (spacePressed && this.char.grounded) {
        this.char.vel.addScaledVector(basis.up, JUMP_V)
        this.char.grounded = false
      }
      if (!this.char.grounded && spaceHeld && this.gMag > WALK_G_THRESHOLD) {
        this.char.vel.addScaledVector(basis.up, SUIT_ASSIST_ACCEL * dt)
      }
      this.char.tickWalk(dt, intent, basis, this.gVec, this.gMag)
      const speed = Math.hypot(this.char.vel.x, this.char.vel.z)
      if (this.char.grounded && speed > 0.4) {
        this.stepAccum += speed * dt
        this.bobPhase += speed * dt * 3.4
        if (this.stepAccum > 1.85) {
          this.stepAccum = 0
          this.onFootstep?.()
        }
      }
    } else {
      this.char.mode = 'thrust'
      const acc = new THREE.Vector3()
        .addScaledVector(basis.fwd, intent.moveZ)
        .addScaledVector(basis.right, intent.moveX)
        .addScaledVector(basis.up, intent.vertical)
      this.thrusting = acc.lengthSq() > 0.01
      this.lastThrustDir.copy(acc).normalize()
      this.char.tickThrust(dt, intent, basis, true)
    }
  }

  frame(alpha: number, camera: THREE.PerspectiveCamera, physicsRay: (o: THREE.Vector3, d: THREE.Vector3, m: number) => { toi: number } | null): void {
    const ip = new THREE.Vector3().lerpVectors(this.char.prevPos, this.char.currPos, alpha)
    const basis = this.basis()
    const eye = ip.clone().addScaledVector(basis.up, 0.62)

    camera.up.copy(basis.up)
    const target = eye.clone().addScaledVector(basis.fwd, 10)

    if (this.thirdPerson) {
      const back = basis.fwd.clone().multiplyScalar(-1)
      let dist = this.boom
      const hit = physicsRay(eye, back, this.boom + 0.5)
      if (hit) dist = Math.max(0.4, Math.min(this.boom, hit.toi - 0.28))
      this.camDist += (dist - this.camDist) * 0.35
      camera.position.copy(eye).addScaledVector(back, this.camDist).addScaledVector(basis.up, 0.08)
    } else {
      const bob = this.char.grounded ? Math.sin(this.bobPhase * 2.1) * 0.022 : 0
      camera.position.copy(eye).addScaledVector(basis.up, bob)
    }
    camera.lookAt(target)
    camera.updateMatrixWorld(true)
    const el = document.documentElement
    el.dataset.pfFwd = `${basis.fwd.x.toFixed(3)},${basis.fwd.y.toFixed(3)},${basis.fwd.z.toFixed(3)}`
    el.dataset.pfCount = String((Number(el.dataset.pfCount) ?? 0) + 1)

    this.avatarRoot.position.copy(ip).addScaledVector(basis.up, -0.89)
    const faceQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
    const alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), basis.up)
    this.avatarRoot.quaternion.copy(alignQ).multiply(faceQ)
    this.avatarRoot.visible = this.thirdPerson
    this.fpArms.visible = !this.thirdPerson
    if (!this.thirdPerson) {
      this.fpArms.position.copy(camera.position)
      this.fpArms.quaternion.copy(camera.quaternion)
    }
  }

  serialize(): { x: number; y: number; z: number; yaw: number; pitch: number; thirdPerson: boolean } {
    return { x: this.char.currPos.x, y: this.char.currPos.y, z: this.char.currPos.z, yaw: this.yaw, pitch: this.pitch, thirdPerson: this.thirdPerson }
  }

  hydrate(d: { x: number; y: number; z: number; yaw: number; pitch: number; thirdPerson: boolean }): void {
    this.char.teleport(new THREE.Vector3(d.x, d.y, d.z))
    this.yaw = d.yaw
    this.pitch = d.pitch
    this.thirdPerson = d.thirdPerson
  }
}
