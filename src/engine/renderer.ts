import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

export interface GameRenderer {
  backend: 'webgpu' | 'webgl'
  raw: THREE.WebGLRenderer | WebGPURenderer
  setSize(w: number, h: number): void
  setPixelRatio(p: number): void
  render(scene: THREE.Scene, camera: THREE.Camera): void
  drawCalls(): number
  triangles(): number
}

type RawAny = THREE.WebGLRenderer & { renderAsync?: unknown } & Record<string, any>

export async function createRenderer(canvas: HTMLCanvasElement): Promise<GameRenderer> {
  let raw: RawAny
  let backend: 'webgpu' | 'webgl'
  try {
    const g = new WebGPURenderer({ canvas, antialias: true }) as unknown as RawAny
    await g.init()
    raw = g
    backend = 'webgpu'
  } catch {
    raw = new THREE.WebGLRenderer({ canvas, antialias: true }) as RawAny
    backend = 'webgl'
  }
  raw.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  raw.toneMapping = THREE.ACESFilmicToneMapping
  raw.toneMappingExposure = 1.02
  raw.shadowMap.enabled = true
  raw.shadowMap.type = THREE.PCFSoftShadowMap

  const r = raw as unknown as { info?: { render?: Record<string, number> } }

  return {
    backend,
    raw,
    setSize: (w, h) => raw.setSize(w, h),
    setPixelRatio: (p) => raw.setPixelRatio(p),
    render: (s, c) => {
      raw.render(s, c)
    },
    drawCalls: () => r.info?.render?.drawCalls ?? r.info?.render?.calls ?? 0,
    triangles: () => r.info?.render?.triangles ?? 0
  }
}
