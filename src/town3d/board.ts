// Каталог: облики построек, расставленные рядами. Ряд — тип постройки, столбец — уровень.
import * as THREE from 'three'
import type { Season } from '../world/sky'
import type { Scenery } from './fx'
import { buildLook, type LookContext, type LookFn } from './look'

export interface BoardCell {
  title: string
  note?: string
  look: LookFn
  ctx?: Partial<LookContext>
  broken?: boolean
}

export interface BoardLabel {
  title: string
  note?: string
  at: THREE.Vector3
}

export const GROUND: Record<Season, { grass: string; pad: string }> = {
  spring: { grass: '#a9bd7c', pad: '#cdbf96' },
  summer: { grass: '#9fb176', pad: '#cbbb90' },
  autumn: { grass: '#b3a873', pad: '#c8b588' },
  winter: { grass: '#c2c7b4', pad: '#c2b9a6' },
}

export interface BoardResult {
  labels: BoardLabel[]
  width: number
  depth: number
}

export async function fillBoard(scenery: Scenery, rows: BoardCell[][], season: Season, pitch = 15): Promise<BoardResult> {
  scenery.clear()
  const columns = Math.max(...rows.map((row) => row.length))
  const width = columns * pitch
  const depth = rows.length * pitch
  const colors = GROUND[season]

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 400, depth + 400).rotateX(-Math.PI / 2), scenery.material)
  const tint = new THREE.Color(colors.grass)
  const count = ground.geometry.getAttribute('position').count
  const color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) tint.toArray(color, i * 3)
  ground.geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
  ground.geometry.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(count), 1))
  ground.position.set(width / 2 - pitch / 2, 0, depth / 2 - pitch / 2)
  ground.receiveShadow = true
  ground.userData.own = true
  scenery.root.add(ground)

  const labels: BoardLabel[] = []
  await Promise.all(
    rows.flatMap((row, r) =>
      row.map(async (cell, c) => {
        const built = await buildLook(cell.look, { season, ...cell.ctx }, r * 7 + c)
        const placed = scenery.place(built, c * pitch, r * pitch, 0, { broken: cell.broken, emblem: cell.ctx?.emblem })
        placed.group.traverse((object) => (object.userData.own = true))
        labels.push({ title: cell.title, note: cell.note, at: new THREE.Vector3(c * pitch, 0, r * pitch + pitch * 0.42) })
      }),
    ),
  )
  scenery.commit()
  return { labels, width, depth }
}
