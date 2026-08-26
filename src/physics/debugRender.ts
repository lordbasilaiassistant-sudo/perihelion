import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Physics } from './world'

export function buildColliderDebug(physics: Physics, API: typeof RAPIER): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.LineBasicMaterial({ color: 0x3fe3ff, transparent: true, opacity: 0.5, depthTest: false })
  physics.world.forEachCollider((col) => {
    const shape = col.shape as unknown as Record<string, unknown> & { type: number }
    let geo: THREE.BufferGeometry | null = null
    const t = shape.type
    if (t === API.ShapeType.Cuboid) {
      const he = shape.halfExtents as { x: number; y: number; z: number }
      geo = new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2)
    } else if (t === API.ShapeType.Ball) {
      geo = new THREE.SphereGeometry(shape.radius as number, 12, 8)
    } else if (t === API.ShapeType.Capsule) {
      geo = new THREE.CapsuleGeometry(shape.radius as number, (shape.halfHeight as number) * 2, 4, 10)
    } else if (t === API.ShapeType.Cylinder) {
      geo = new THREE.CylinderGeometry(shape.radius as number, shape.radius as number, (shape.halfHeight as number) * 2, 14)
    } else if (t === API.ShapeType.TriMesh) {
      const verts = shape.vertices as Float32Array
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (let i = 0; i < verts.length; i += 3) {
        minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i])
        minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1])
        minZ = Math.min(minZ, verts[i + 2]); maxZ = Math.max(maxZ, verts[i + 2])
      }
      geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ)
      geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
    }
    if (!geo) return
    const seg = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), mat)
    const p = col.translation()
    seg.position.set(p.x, p.y, p.z)
    const r = col.rotation()
    seg.quaternion.set(r.x, r.y, r.z, r.w)
    seg.renderOrder = 999
    group.add(seg)
  })
  return group
}
