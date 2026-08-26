// Procedural canvas textures — no external assets, deterministic look.
import * as THREE from 'three'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return [cv, cv.getContext('2d')!]
}

function finish(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number, n = 900): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * alpha})`
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
}

function edgeWear(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(4.5, 4.5, w - 9, h - 9)
}

export type CrateSkin = 'supply' | 'metal' | 'cargo'

export function makeCrateTexture(skin: CrateSkin): THREE.CanvasTexture {
  const S = 256
  const [cv, ctx] = canvas(S, S)
  if (skin === 'supply') {
    ctx.fillStyle = '#b35a20'
    ctx.fillRect(0, 0, S, S)
    // panel frame
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, S - 10, S - 10)
    ctx.strokeRect(24, 24, S - 48, S - 48)
    // hazard stripes band
    ctx.save()
    ctx.beginPath()
    ctx.rect(24, S / 2 - 22, S - 48, 44)
    ctx.clip()
    ctx.fillStyle = '#d8a017'
    ctx.fillRect(24, S / 2 - 22, S - 48, 44)
    ctx.fillStyle = '#1c1c1c'
    for (let x = 24 - 44; x < S; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, S / 2 + 22)
      ctx.lineTo(x + 16, S / 2 - 22)
      ctx.lineTo(x + 28, S / 2 - 22)
      ctx.lineTo(x + 12, S / 2 + 22)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    // label plate
    ctx.fillStyle = '#e8e2d4'
    ctx.fillRect(S / 2 - 44, 40, 88, 30)
    ctx.fillStyle = '#222'
    ctx.font = 'bold 20px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SUPPLY', S / 2, 56)
    // rivets
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    for (const [x, y] of [[16, 16], [S - 16, 16], [16, S - 16], [S - 16, S - 16]]) {
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    noise(ctx, S, S, 0.16)
    edgeWear(ctx, S, S, 'rgba(255,220,180,0.18)')
  } else if (skin === 'metal') {
    const g = ctx.createLinearGradient(0, 0, 0, S)
    g.addColorStop(0, '#9aa2ab')
    g.addColorStop(0.5, '#7e868f')
    g.addColorStop(1, '#6a727b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    // recessed panels
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 6
    ctx.strokeRect(14, 14, S / 2 - 24, S - 28)
    ctx.strokeRect(S / 2 + 10, 14, S / 2 - 24, S - 28)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(18, 18, S / 2 - 32, S - 36)
    ctx.strokeRect(S / 2 + 14, 18, S / 2 - 32, S - 36)
    // vents
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    for (let i = 0; i < 5; i++) ctx.fillRect(S / 2 - 30, 60 + i * 14, 60, 6)
    // id stripe
    ctx.fillStyle = '#4fa3c7'
    ctx.fillRect(24, S - 46, S - 48, 10)
    noise(ctx, S, S, 0.2)
    edgeWear(ctx, S, S, 'rgba(230,240,255,0.16)')
  } else {
    // cargo — warm crate with slats
    ctx.fillStyle = '#7a5230'
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#6b4628' : '#845a36'
      ctx.fillRect(0, (i * S) / 6, S, S / 6 - 4)
    }
    ctx.strokeStyle = '#3c2817'
    ctx.lineWidth = 14
    ctx.strokeRect(7, 7, S - 14, S - 14)
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(10, 10)
    ctx.lineTo(S - 10, S - 10)
    ctx.moveTo(S - 10, 10)
    ctx.lineTo(10, S - 10)
    ctx.stroke()
    noise(ctx, S, S, 0.24, 1400)
    edgeWear(ctx, S, S, 'rgba(255,230,190,0.14)')
  }
  return finish(cv)
}
