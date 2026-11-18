// План местности: где что стоит. Единица — метр, +X — восток, +Z — юг (к зрителю).
// План один на все ступени: город расчищает лес и занимает участки по мере роста.
// Здесь только числа и расчёты, без three.js: файл проверяется тестами.
import { BUILDINGS } from '../game/town'

/** Шаг сетки: участок 10 × 10 м и улица 3 м. */
export const PITCH = 13
export const PLOT = 10
const COLUMNS = 8
const ROWS = 5

export interface Plot {
  /** Номер постройки: «house-1», «garden-2»… */
  id: string
  type: string
  /** Порядковый номер среди построек своего типа, с единицы. */
  n: number
  x: number
  z: number
  /** Поворот постройки, градусы: 0 — лицом на юг. */
  rot: number
  /** Участок у воды: постройка выходит на реку. */
  water?: boolean
}

const columnX = (c: number) => (c - (COLUMNS - 1) / 2) * PITCH
const rowZ = (r: number) => PITCH / 2 - r * PITCH

/**
 * Раскладка: ряды от площади на север, столбцы с запада на восток.
 * Запад — жильё, середина за площадью — торговля и ремесло, восток — поля и амбары,
 * дальний ряд у леса — печи и мельница. «·» — площадь, «park» — сквер.
 */
const GRID: string[][] = [
  ['house-5', 'house-3', 'house-1', '·', '·', 'garden-1', 'garden-2', 'garden-3'],
  ['house-6', 'house-4', 'house-2', '·', '·', 'barn-1', 'well-1', 'garden-4'],
  ['house-9', 'house-8', 'house-7', 'tavern-1', 'market-1', 'woodshed-1', 'sawmill-1', 'barn-2'],
  ['well-2', 'house-10', 'store-1', 'bakery-1', 'workshop-1', 'store-2', 'brickyard-1', 'sawmill-2'],
  ['mill-1', 'park-1', 'park-2', 'park-3', 'park-4', 'park-5', 'brickyard-2', 'tower-1'],
]

/** Площадь: середина сетки, два столбца на два ряда. */
export const PLAZA = { x: 0, z: 0, w: PITCH * 2 - 3, d: PITCH * 2 - 3 }
/** Центральная постройка стоит в глубине площади, костёр — ближе к зрителю. */
export const CENTER_AT = { x: 0, z: -5.2 }
export const FIRE_AT = { x: 0, z: 5.5 }
/** На стоянке костёр горит посреди поляны, палатка путника рядом. */
export const CAMP_FIRE_AT = { x: 0.5, z: 1 }
export const CAMP_TENT_AT = { x: -5.4, z: -2.6 }

/** Река течёт с запада на восток южнее площади. */
export const RIVER = { z: 27, half: 5.2, depth: 1.7 }
export const riverCenter = (x: number) => RIVER.z + Math.sin(x / 34) * 2.6 + Math.sin(x / 13 + 1) * 0.7

/** Мост через реку и аллея слободы. */
export const BRIDGE_X = 0

const PIERS: Plot[] = [
  { id: 'pier-1', type: 'pier', n: 1, x: 22, z: 0, rot: 0, water: true },
  { id: 'pier-2', type: 'pier', n: 2, x: -24, z: 0, rot: 0, water: true },
]
for (const pier of PIERS) pier.z = riverCenter(pier.x) - RIVER.half - 4.4

export const PLOTS: Plot[] = [
  ...GRID.flatMap((row, r) =>
    row
      .map((id, c) => ({ id, c }))
      .filter(({ id }) => id !== '·')
      .map(({ id, c }) => {
        const [type, n] = id.split('-')
        return { id, type, n: Number(n), x: columnX(c), z: rowZ(r), rot: 0 }
      }),
  ),
  ...PIERS,
]

export const plotOf = (id: string): Plot | undefined => PLOTS.find((p) => p.id === id)

/** Участки, которые ступень уже открыла: остальные пока под лесом. */
export function openPlots(tier: number): Plot[] {
  return PLOTS.filter((plot) => {
    if (plot.type === 'park') return tier >= 3
    const type = BUILDINGS.find((b) => b.id === plot.type)
    return !!type && plot.n <= type.count[tier]
  })
}

/** Слобода особых построек: за мостом, три ряда по восемь мест вдоль аллеи. */
export const QUARTER = { pitch: 10.5, plot: 8, columns: 8, rows: 3, z: 0 }
QUARTER.z = RIVER.z + RIVER.half + 12

export function quarterSlot(index: number): { x: number; z: number } {
  // Места заполняются от аллеи наружу и от реки вглубь: первые файлы стоят у моста.
  const row = Math.floor(index / QUARTER.columns) % QUARTER.rows
  const order = index % QUARTER.columns
  const side = order % 2 === 0 ? -1 : 1
  const step = Math.floor(order / 2)
  return { x: side * (QUARTER.pitch / 2 + 1 + step * QUARTER.pitch), z: QUARTER.z + row * QUARTER.pitch }
}

export const QUARTER_SLOTS = QUARTER.columns * QUARTER.rows

/** Границы, в которых двигается камера. */
export const BOUNDS = { minX: -62, maxX: 62, minZ: -62, maxZ: QUARTER.z + QUARTER.rows * QUARTER.pitch }
/** Размер земли: с запасом на лес и горы вокруг. */
export const LAND = { minX: -150, maxX: 150, minZ: -170, maxZ: 130 }

/** Улицы: по линиям сетки между участками. */
export const STREET_X = Array.from({ length: COLUMNS + 1 }, (_, i) => (i - COLUMNS / 2) * PITCH)
export const STREET_Z = Array.from({ length: ROWS + 1 }, (_, i) => PITCH - i * PITCH)

/** Высота земли: ровно везде, кроме русла реки. */
export function groundHeight(x: number, z: number): number {
  const distance = Math.abs(z - riverCenter(x))
  const bank = RIVER.half + 2.2
  if (distance >= bank) return 0
  const t = 1 - distance / bank
  return -RIVER.depth * Math.min(1, t * 1.9) ** 1.4
}

/** Простой повторяемый случай: одно и то же зерно даёт один и тот же лес. */
export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Tree {
  x: number
  z: number
  /** 0–2 — лиственные, 3 — сосна. */
  kind: number
  scale: number
  turn: number
}

/** Точка занята: участок, площадь, река, слобода, улица. */
function taken(x: number, z: number, open: Plot[], specials: number): boolean {
  if (Math.abs(x - PLAZA.x) < PLAZA.w / 2 + 3 && Math.abs(z - PLAZA.z) < PLAZA.d / 2 + 3) return true
  if (Math.abs(z - riverCenter(x)) < RIVER.half + 3.2) return true
  for (const plot of open) {
    if (Math.abs(x - plot.x) < PITCH / 2 + 0.6 && Math.abs(z - plot.z) < PITCH / 2 + 0.6) return true
  }
  // Тропа от площади к мосту и аллея слободы.
  if (Math.abs(x - BRIDGE_X) < 3 && z > PLAZA.d / 2 && z < QUARTER.z + 34) return true
  for (let i = 0; i < specials; i++) {
    const slot = quarterSlot(i)
    if (Math.abs(x - slot.x) < QUARTER.pitch / 2 + 0.5 && Math.abs(z - slot.z) < QUARTER.pitch / 2 + 0.5) return true
  }
  return false
}

/** Лес: растёт везде, где город ещё не расчистил землю. */
export function forest(tier: number, specials: number): Tree[] {
  const open = openPlots(tier)
  const random = seeded(20261118)
  const trees: Tree[] = []
  const step = 4.6
  for (let z = LAND.minZ + 30; z < LAND.maxZ - 6; z += step) {
    for (let x = LAND.minX + 20; x < LAND.maxX - 20; x += step) {
      const jx = x + (random() - 0.5) * step * 0.9
      const jz = z + (random() - 0.5) * step * 0.9
      const density = random()
      const kindRoll = random()
      const scale = 0.85 + random() * 0.6
      const turn = random() * 360
      // Вдали от города лес гуще, у самой площади — редкий.
      const far = Math.hypot(jx, jz - 4) / 90
      if (density > 0.34 + Math.min(0.5, far * 0.55)) continue
      if (taken(jx, jz, open, specials)) continue
      // Сосны держатся севера и опушек у гор.
      const pine = kindRoll < (jz < -50 ? 0.7 : 0.22)
      trees.push({ x: jx, z: jz, kind: pine ? 3 : Math.floor(kindRoll * 97) % 3, scale, turn })
    }
  }
  return trees
}
