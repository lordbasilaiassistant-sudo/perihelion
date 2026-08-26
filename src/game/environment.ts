import * as THREE from 'three'
import { fbm } from '../engine/noise'

export const SUN_DIR = new THREE.Vector3(0.44, 0.6, 0.38).normalize()

function genEarthTexture(seed: number): THREE.CanvasTexture {
  const W = 1024
  const H = 512
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data
  const deep = new THREE.Color(0x07213f)
  const shallow = new THREE.Color(0x155e93)
  const sand = new THREE.Color(0xb3a065)
  const grass = new THREE.Color(0x40682f)
  const forest = new THREE.Color(0x2c4a24)
  const rock = new THREE.Color(0x6b6558)
  const ice = new THREE.Color(0xe8f0f4)
  const c = new THREE.Color()
  for (let y = 0; y < H; y++) {
    const v = y / H
    const lat = (v - 0.5) * Math.PI
    for (let x = 0; x < W; x++) {
      const u = x / W
      const lon = u * Math.PI * 2
      const cx = Math.cos(lon)
      const sx = Math.sin(lon)
      const cont = fbm(cx * 1.7 + 4.2, lat * 3.1 + sx * 1.7 + 9.7, seed, 6)
      const detail = fbm(cx * 5.3 + 21.3, lat * 9.4 + sx * 5.3 + 3.1, seed + 77, 5)
      const landMask = cont > 0.485
      if (!landMask) {
        const depth = Math.min(1, (0.485 - cont) * 9)
        c.copy(shallow).lerp(deep, depth)
      } else {
        const elev = Math.min(1, (cont - 0.485) * 10)
        c.copy(grass).lerp(forest, detail)
        if (elev < 0.12) c.lerp(sand, 1 - elev / 0.12)
        if (elev > 0.72) c.lerp(rock, (elev - 0.72) / 0.28)
      }
      const polar = Math.max(0, (Math.abs(lat) - 1.08) / 0.49)
      if (polar > 0) {
        const icy = Math.min(1, polar * (1.4 + detail))
        c.lerp(ice, Math.min(1, icy))
      }
      const i = (y * W + x) * 4
      d[i] = c.r * 255
      d[i + 1] = c.g * 255
      d[i + 2] = c.b * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function genCloudTexture(seed: number): THREE.CanvasTexture {
  const W = 512
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    const v = y / H
    const lat = (v - 0.5) * Math.PI
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2
      const cx = Math.cos(lon)
      const sx = Math.sin(lon)
      const n = fbm(cx * 3.1 + 31.7, lat * 6.2 + sx * 3.1 + 11.4, seed + 500, 6)
      const swirl = fbm(cx * 7.7 - 8.2, lat * 15.5 + sx * 7.7 - 4.9, seed + 900, 4)
      const a = Math.max(0, n * 0.75 + swirl * 0.45 - 0.62) * 3.4
      const i = (y * W + x) * 4
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
      d[i + 3] = Math.min(235, a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(cv)
}

function genGlowSprite(inner: string, outer: string): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')!
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.25, outer)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)
  return new THREE.CanvasTexture(cv)
}

export class Environment {
  group = new THREE.Group()
  sun: THREE.DirectionalLight
  private earthMesh: THREE.Mesh
  private cloudMesh: THREE.Mesh

  constructor() {
    const starGeo = new THREE.BufferGeometry()
    const N = 5200
    const sp = new Float32Array(N * 3)
    const sc = new Float32Array(N * 3)
    const tmp = new THREE.Vector3()
    for (let i = 0; i < N; i++) {
      do {
        tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      } while (tmp.lengthSq() > 1 || tmp.lengthSq() < 0.01)
      tmp.normalize().multiplyScalar(4200)
      sp[i * 3] = tmp.x
      sp[i * 3 + 1] = tmp.y
      sp[i * 3 + 2] = tmp.z
      const t = Math.random()
      const warm = t < 0.18
      const cool = t > 0.86
      sc[i * 3] = warm ? 1 : cool ? 0.75 : 0.92
      sc[i * 3 + 1] = warm ? 0.82 : cool ? 0.85 : 0.94
      sc[i * 3 + 2] = warm ? 0.6 : cool ? 1 : 1
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3))
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 1.9, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
    )
    stars.frustumCulled = false
    this.group.add(stars)

    const mwN = new THREE.Vector3(0.32, 0.88, 0.34).normalize()
    const mwU = new THREE.Vector3(1, 0, 0).cross(mwN).normalize()
    const mwV = mwN.clone().cross(mwU)
    const M = 4200
    const mp = new Float32Array(M * 3)
    const mc = new Float32Array(M * 3)
    for (let i = 0; i < M; i++) {
      const th = Math.random() * Math.PI * 2
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * 0.24
      const dir = mwU.clone().multiplyScalar(Math.cos(th)).addScaledVector(mwV, Math.sin(th)).addScaledVector(mwN, off).normalize()
      mp[i * 3] = dir.x * 4300
      mp[i * 3 + 1] = dir.y * 4300
      mp[i * 3 + 2] = dir.z * 4300
      const b = 0.28 + Math.max(0, 1 - Math.abs(off) * 4) * 0.4
      mc[i * 3] = b
      mc[i * 3 + 1] = b * 0.97
      mc[i * 3 + 2] = b * 0.92
    }
    const mwGeo = new THREE.BufferGeometry()
    mwGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3))
    mwGeo.setAttribute('color', new THREE.BufferAttribute(mc, 3))
    const mw = new THREE.Points(
      mwGeo,
      new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })
    )
    mw.frustumCulled = false
    this.group.add(mw)

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.4)
    this.sun.position.copy(SUN_DIR).multiplyScalar(90)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    const cam = this.sun.shadow.camera
    cam.left = -30
    cam.right = 30
    cam.top = 30
    cam.bottom = -30
    cam.near = 1
    cam.far = 240
    this.sun.shadow.bias = -0.00035
    this.sun.shadow.normalBias = 0.03
    this.group.add(this.sun)
    this.group.add(this.sun.target)

    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: genGlowSprite('rgba(255,252,240,1)', 'rgba(255,214,150,0.55)'), blending: THREE.AdditiveBlending, depthWrite: false }))
    sunCore.position.copy(SUN_DIR).multiplyScalar(6000)
    sunCore.scale.setScalar(1500)
    this.group.add(sunCore)
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: genGlowSprite('rgba(255,236,200,0.5)', 'rgba(255,190,120,0.18)'), blending: THREE.AdditiveBlending, depthWrite: false }))
    sunHalo.position.copy(SUN_DIR).multiplyScalar(6000)
    sunHalo.scale.setScalar(4200)
    this.group.add(sunHalo)

    const earthGroup = new THREE.Group()
    earthGroup.position.set(2700, 1000, 3500)
    earthGroup.rotation.z = 0.41
    this.earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(700, 64, 48),
      new THREE.MeshStandardMaterial({ map: genEarthTexture(1337), roughness: 0.92, metalness: 0 })
    )
    earthGroup.add(this.earthMesh)
    this.cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(707.5, 64, 48),
      new THREE.MeshStandardMaterial({ alphaMap: genCloudTexture(4242), color: 0xffffff, transparent: true, roughness: 1, metalness: 0, depthWrite: false })
    )
    earthGroup.add(this.cloudMesh)
    this.group.add(earthGroup)

    const hemi = new THREE.HemisphereLight(0x2e4258, 0x05070a, 0.2)
    this.group.add(hemi)

    const nebulas: Array<[string, string, number, THREE.Vector3, number]> = [
      ['rgba(64,140,190,0.34)', 'rgba(30,80,130,0.16)', 0.2, new THREE.Vector3(-3200, 1500, -2600), 3400],
      ['rgba(150,90,200,0.26)', 'rgba(80,40,140,0.12)', 0.16, new THREE.Vector3(2600, -900, -3400), 4200],
      ['rgba(200,90,120,0.22)', 'rgba(120,50,80,0.1)', 0.13, new THREE.Vector3(-1800, -2200, 3000), 3600]
    ]
    for (const [inner, outer, op, pos, scale] of nebulas) {
      const mat = new THREE.SpriteMaterial({
        map: genGlowSprite(inner, outer),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: op,
        transparent: true
      })
      const sp = new THREE.Sprite(mat)
      sp.position.copy(pos)
      sp.scale.setScalar(scale)
      sp.frustumCulled = false
      this.nebulae.push(sp)
      this.group.add(sp)
    }
  }

  private nebulae: THREE.Sprite[] = []

  update(dt: number): void {
    this.earthMesh.rotation.y += dt * 0.0042
    this.cloudMesh.rotation.y += dt * 0.0056
    for (let i = 0; i < this.nebulae.length; i++) {
      const n = this.nebulae[i]
      n.material.rotation += dt * (0.002 + i * 0.0011)
    }
  }
}
