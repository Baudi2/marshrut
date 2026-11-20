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
  /** Место редкой постройки: вне сетки участков, улицы к нему нет, жители туда не ходят. */
  rare?: boolean
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
/** Где встаёт стройка новой центральной постройки: на площади рядом с прежней. */
export const centerSite = (tier: number): { x: number; z: number } =>
  tier <= 1 ? { x: CENTER_AT.x + 0.5, z: CENTER_AT.z - 3.4 } : { x: CENTER_AT.x + 9.5, z: CENTER_AT.z - 1 }
/** На стоянке костёр горит посреди поляны, палатка путника рядом. */
export const CAMP_FIRE_AT = { x: 0.5, z: 1 }
export const CAMP_TENT_AT = { x: -5.4, z: -2.6 }

/** Река течёт с запада на восток южнее площади. */
export const RIVER = { z: 27, half: 5.2, depth: 1.7 }
export const riverCenter = (x: number) => RIVER.z + Math.sin(x / 34) * 2.6 + Math.sin(x / 13 + 1) * 0.7

/** Мост через реку и аллея слободы. */
export const BRIDGE_X = 0

// Оба причала стоят на восточном берегу: там река отходит от южной улицы дальше всего,
// и большой пристани хватает места между улицей и водой. На западе река подходит к улице вплотную.
const PIERS: Plot[] = [
  { id: 'pier-1', type: 'pier', n: 1, x: 22, z: 0, rot: 0, water: true },
  { id: 'pier-2', type: 'pier', n: 2, x: 45.5, z: 0, rot: 0, water: true },
]
for (const pier of PIERS) pier.z = riverCenter(pier.x) - RIVER.half - 4.4
/** На столько пристань четвёртого и пятого уровня выдвинута в реку: иначе её дальний от воды край вставал на южную улицу. */
export const PORT_PUSH = 1.5

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

/**
 * Места редких построек — вне сетки, в стороне от улиц, поэтому в список участков они не входят:
 * ни улиц, ни площадок под них не рисуется, и носильщики к ним не ходят.
 * Обе постройки одного чертежа стоят на одном месте: из двух всё равно строится одна.
 *  — первый чертёж (пасека или голубятня): лужок у тропы к мосту, между южной улицей и берегом;
 *  — второй (гончарня или лодочный сарай): берег между двумя причалами, место выходит к воде, как у причалов.
 */
const RARE_SPOTS: [string[], number, number][] = [
  [['apiary', 'dovecote'], 5.8, 17.2],
  [['pottery', 'boathouse'], 33.8, riverCenter(33.8) - RIVER.half - 4.4],
]
export const RARE_PLOTS: Plot[] = RARE_SPOTS.flatMap(([types, x, z]) => types.map((type) => ({ id: `${type}-1`, type, n: 1, x, z, rot: 0, rare: true })))
/** Полуширина места редкой постройки: на столько от его середины расчищается лес. */
export const RARE_HALF = 4.6

export const plotOf = (id: string): Plot | undefined => PLOTS.find((p) => p.id === id) ?? RARE_PLOTS.find((p) => p.id === id)

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

/** Памятник цикла занимает квадрат такого размера: две каменные ступени. */
export const MONUMENT = { size: 3.6, step: 5.4 }

/**
 * Памятники закрытых циклов стоят в ряд на южном берегу к западу от моста —
 * между рекой и первым рядом слободы. Первый ближе всех к мосту, следующие уходят на запад.
 */
export function monumentSpot(index: number): { x: number; z: number } {
  const x = BRIDGE_X - 8 - index * MONUMENT.step
  return { x, z: riverCenter(x) + RIVER.half + 5 }
}

/** На стоянке есть только костёр и палатка: мост и слобода появляются, когда она становится лагерем. */
export const quarterOpen = (tier: number) => tier >= 1
/**
 * Где горит общий костёр: на стоянке — посреди поляны, в лагере — под навесом в середине площади,
 * на хуторе — перед домом собраний, дальше — в углу площади, потому что середину занимает фонтан.
 * Вокруг него встают купленные скамьи и котелок.
 */
export function fireSpot(tier: number): { x: number; z: number } {
  if (tier === 0) return CAMP_FIRE_AT
  if (tier === 1) return { x: PLAZA.x, z: PLAZA.z }
  if (tier === 2) return FIRE_AT
  return { x: -8, z: 7.5 }
}

/** Границы, в которых двигается камера. */
export const BOUNDS = { minX: -62, maxX: 62, minZ: -62, maxZ: QUARTER.z + QUARTER.rows * QUARTER.pitch }
/** Где растёт лес: видимая камерой часть карты. */
export const FOREST = { minX: -112, maxX: 112, minZ: -128, maxZ: 122 }
/** Размер земли: с запасом на лес и горы вокруг. */
export const LAND = { minX: -150, maxX: 150, minZ: -170, maxZ: 130 }

/** Улицы: по линиям сетки между участками. */
export const STREET_X = Array.from({ length: COLUMNS + 1 }, (_, i) => (i - COLUMNS / 2) * PITCH)
export const STREET_Z = Array.from({ length: ROWS + 1 }, (_, i) => PITCH - i * PITCH)

/** Отрезок улицы между двумя соседними перекрёстками. */
export interface Road {
  x0: number
  z0: number
  x1: number
  z1: number
}

/**
 * Соединительные дороги. Улицы идут вдоль открытых участков и вокруг площади. Если открытый участок
 * стоит особняком — на «Хуторе» это склад и мастерская в дальнем ряду, — между ним и остальным городом
 * остаётся кусок леса. Через него прокладывается кратчайшая дорога по линиям сетки:
 * лес с неё убирается, она рисуется на земле, и жители ходят по ней, а не петляют между стволами.
 */
export function connectors(open: Plot[]): Road[] {
  const land = new Set(open.filter((plot) => !plot.water).map((plot) => `${Math.round(plot.x / PITCH + (COLUMNS - 1) / 2)}:${Math.round((PITCH / 2 - plot.z) / PITCH)}`))
  const plaza = (c: number, r: number) => GRID[r]?.[c] === '·'
  // У квартала (c, r) есть улица, если он открыт или это площадь; между двумя кварталами площади улицы нет.
  const kind = (cells: [number, number][]): 'paved' | 'wild' | 'closed' => {
    const inside = cells.filter(([c, r]) => c >= 0 && c < COLUMNS && r >= 0 && r < ROWS)
    if (inside.length === 2 && inside.every(([c, r]) => plaza(c, r))) return 'closed'
    return inside.some(([c, r]) => plaza(c, r) || land.has(`${c}:${r}`)) ? 'paved' : 'wild'
  }
  const width = COLUMNS + 1
  const node = (i: number, j: number) => i + j * width
  interface Segment {
    a: number
    b: number
    paved: boolean
  }
  const segments: Segment[] = []
  for (let j = 0; j <= ROWS; j++) {
    for (let i = 0; i < COLUMNS; i++) {
      const street = kind([[i, j - 1], [i, j]])
      if (street !== 'closed') segments.push({ a: node(i, j), b: node(i + 1, j), paved: street === 'paved' })
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i <= COLUMNS; i++) {
      const street = kind([[i - 1, j], [i, j]])
      if (street !== 'closed') segments.push({ a: node(i, j), b: node(i, j + 1), paved: street === 'paved' })
    }
  }

  const total = width * (ROWS + 1)
  const roads: Road[] = []
  // Пока город не связан: от части с площадью ищем ближайший остров улиц и мостим путь к нему.
  for (let guard = 0; guard < total; guard++) {
    const reached = new Array<boolean>(total).fill(false)
    const spread = (from: number[]) => {
      const queue = [...from]
      for (const start of from) reached[start] = true
      while (queue.length) {
        const at = queue.shift()!
        for (const s of segments) {
          if (!s.paved || (s.a !== at && s.b !== at)) continue
          const next = s.a === at ? s.b : s.a
          if (!reached[next]) {
            reached[next] = true
            queue.push(next)
          }
        }
      }
    }
    // Угол площади: перекрёсток, с которого начинается город на любой ступени.
    spread([node(COLUMNS / 2 - 1, 0)])
    const island = (n: number) => !reached[n] && segments.some((s) => s.paved && (s.a === n || s.b === n))
    if (!Array.from({ length: total }, (_, n) => n).some(island)) break

    // Кратчайший путь по лесным отрезкам от связанной части до любого острова.
    const cost = new Array<number>(total).fill(Infinity)
    const before = new Array<number>(total).fill(-1)
    const done = new Array<boolean>(total).fill(false)
    for (let n = 0; n < total; n++) if (reached[n]) cost[n] = 0
    let goal = -1
    for (;;) {
      let at = -1
      for (let n = 0; n < total; n++) if (!done[n] && cost[n] < Infinity && (at < 0 || cost[n] < cost[at])) at = n
      if (at < 0) break
      done[at] = true
      if (island(at)) {
        goal = at
        break
      }
      for (const s of segments) {
        if (s.a !== at && s.b !== at) continue
        const next = s.a === at ? s.b : s.a
        if (cost[at] + 1 < cost[next]) {
          cost[next] = cost[at] + 1
          before[next] = at
        }
      }
    }
    if (goal < 0) break
    for (let n = goal; before[n] >= 0; n = before[n]) {
      const from = before[n]
      const segment = segments.find((s) => (s.a === n && s.b === from) || (s.a === from && s.b === n))!
      if (segment.paved) continue
      segment.paved = true
      roads.push({ x0: STREET_X[from % width], z0: STREET_Z[Math.floor(from / width)], x1: STREET_X[n % width], z1: STREET_Z[Math.floor(n / width)] })
    }
  }
  return roads
}

/** Высота земли: ровно везде, кроме русла реки. */
export function groundHeight(x: number, z: number): number {
  const distance = Math.abs(z - riverCenter(x))
  const bank = RIVER.half + 2.2
  if (distance >= bank) return 0
  const t = 1 - distance / bank
  return -RIVER.depth * Math.min(1, t * 1.9) ** 1.4
}

/** Лесная поляна к западу от поселения: здесь пасутся олени. Участков и улиц тут нет на любой ступени. */
export const GLADE = { x: -67, z: -8, r: 7.5 }

/**
 * Луга у реки: полосы между южной улицей и берегом, где нет ни участков, ни улиц, ни деревьев.
 * Здесь пасутся домашние животные: во дворах построек им негде развернуться.
 * Южный край луга идёт вдоль реки (meadowEdge), room — сколько животных помещается.
 */
export interface Meadow {
  id: string
  minX: number
  maxX: number
  minZ: number
  room: number
}

export const MEADOWS: Meadow[] = [
  { id: 'east', minX: 8.6, maxX: 14.5, minZ: 15, room: 1 },
  { id: 'west', minX: -15.5, maxX: -6.8, minZ: 15, room: 1 },
  { id: 'far-east', minX: 54, maxX: 63.2, minZ: 15, room: 2 },
]

/** Южный край луга: до спуска к воде остаётся запас. */
export const meadowEdge = (x: number) => riverCenter(x) - RIVER.half - 2.6

/** Точка на лугу; margin — отступ внутрь от краёв. */
export function inMeadow(meadow: Meadow, x: number, z: number, margin = 0): boolean {
  return x >= meadow.minX + margin && x <= meadow.maxX - margin && z >= meadow.minZ + margin && z <= meadowEdge(x) - margin
}

export interface AnimalSpot {
  /** Модель: «a/cow», «a/deer»… */
  key: string
  x: number
  z: number
  /** Куда смотрит, градусы. */
  turn: number
  /** Рост до макушки, метры. */
  height: number
  /** Пасётся (голова опущена) или просто стоит. */
  grazing: boolean
}

/**
 * Животные: олени на поляне есть всегда, домашние появляются вместе с постройками —
 * корова у амбара с третьего уровня, осёл у мельницы со второго, лошадь у таверны с четвёртого.
 */
export function animalSpots(buildings: { id: string; type: string; level: number }[]): AnimalSpot[] {
  const spots: AnimalSpot[] = [
    { key: 'a/deer', x: GLADE.x - 1.6, z: GLADE.z + 1.2, turn: 40, height: 1.9, grazing: true },
    { key: 'a/deer', x: GLADE.x + 2.4, z: GLADE.z - 1.8, turn: -110, height: 1.8, grazing: false },
  ]
  for (const building of buildings) {
    const plot = plotOf(building.id)
    if (!plot) continue
    if (building.type === 'barn' && building.level >= 3) spots.push({ key: 'a/cow', x: plot.x - 4.6, z: plot.z + 5.4, turn: 75, height: 1.75, grazing: true })
    if (building.type === 'mill' && building.level >= 2) spots.push({ key: 'a/donkey', x: plot.x + 4.4, z: plot.z + 5.3, turn: -70, height: 1.6, grazing: false })
    if (building.type === 'tavern' && building.level >= 4) spots.push({ key: 'a/horse', x: plot.x + 4.6, z: plot.z + 5.4, turn: 200, height: 2.2, grazing: false })
  }
  return spots
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

/**
 * Насколько дальше улицы не растут деревья. Крона большого дерева шириной больше шести метров и начинается
 * ниже роста человека: дерево у самой улицы накрывало бы идущих листвой. Улица у открытого участка
 * и вокруг площади остаётся чистой на всю ширину, вместе с кронами.
 */
const STREET_CLEAR = 2.6

/** Точка занята: участок, площадь, река, слобода, улица. */
function taken(x: number, z: number, open: Plot[], specials: number, quarter: boolean, monuments: number, pasture: boolean, roads: Road[], rare: Plot[]): boolean {
  // Место редкой постройки расчищается, когда она там стоит или строится.
  for (const plot of rare) if (Math.abs(x - plot.x) < RARE_HALF && Math.abs(z - plot.z) < RARE_HALF) return true
  if (Math.abs(x - PLAZA.x) < PLAZA.w / 2 + 3 + STREET_CLEAR && Math.abs(z - PLAZA.z) < PLAZA.d / 2 + 3 + STREET_CLEAR) return true
  if (Math.abs(z - riverCenter(x)) < RIVER.half + 3.2) return true
  for (const plot of open) {
    // Участок, половина улицы до её середины, вторая половина и запас на ствол.
    if (Math.abs(x - plot.x) < PITCH / 2 + 1.5 + STREET_CLEAR && Math.abs(z - plot.z) < PITCH / 2 + 1.5 + STREET_CLEAR) return true
  }
  // Соединительная дорога через лес: чистая на ту же ширину, что и улица у открытого участка.
  for (const road of roads) {
    const reach = 1.5 + STREET_CLEAR
    if (x > Math.min(road.x0, road.x1) - reach && x < Math.max(road.x0, road.x1) + reach && z > Math.min(road.z0, road.z1) - reach && z < Math.max(road.z0, road.z1) + reach) return true
  }
  if (Math.hypot(x - GLADE.x, z - GLADE.z) < GLADE.r) return true
  // Луга у реки: с «Хутора» там может пастись скот, деревьям на них не место.
  if (pasture) {
    for (const meadow of MEADOWS) {
      if (x > meadow.minX - 2.4 && x < meadow.maxX + 2.4 && z > meadow.minZ - 2.4 && z < meadowEdge(x) + 2.4) return true
    }
  }
  // Тропа от площади к мосту и аллея слободы.
  if (!quarter) return false
  if (Math.abs(x - BRIDGE_X) < 3 && z > PLAZA.d / 2 && z < QUARTER.z + 34) return true
  for (let i = 0; i < specials; i++) {
    const slot = quarterSlot(i)
    if (Math.abs(x - slot.x) < QUARTER.pitch / 2 + 0.5 && Math.abs(z - slot.z) < QUARTER.pitch / 2 + 0.5) return true
  }
  // Ряд памятников и дорожка к нему от моста: кроны не должны закрывать камень.
  if (monuments > 0) {
    const last = monumentSpot(monuments - 1)
    const clear = MONUMENT.size / 2 + 2.4
    if (x > last.x - clear && x < BRIDGE_X && Math.abs(z - (riverCenter(x) + RIVER.half + 5)) < clear + 1) return true
  }
  return false
}

/** Лес: растёт везде, где город ещё не расчистил землю. */
export function forest(tier: number, specials: number, monuments = 0, rare: Plot[] = []): Tree[] {
  const open = openPlots(tier)
  const roads = connectors(open)
  const random = seeded(20261118)
  const trees: Tree[] = []
  // Шаг и границы подобраны под скорость: лес — самая тяжёлая часть сцены. Дальше ±112 м камера не видит.
  const step = 5.6
  for (let z = FOREST.minZ; z < FOREST.maxZ; z += step) {
    for (let x = FOREST.minX; x < FOREST.maxX; x += step) {
      const jx = x + (random() - 0.5) * step * 0.9
      const jz = z + (random() - 0.5) * step * 0.9
      const density = random()
      const kindRoll = random()
      const scale = 0.85 + random() * 0.6
      const turn = random() * 360
      // Вдали от города лес гуще, у самой площади — редкий.
      const far = Math.hypot(jx, jz - 4) / 90
      if (density > 0.34 + Math.min(0.5, far * 0.55)) continue
      if (taken(jx, jz, open, specials, quarterOpen(tier), monuments, tier >= 2, roads, rare)) continue
      // Сосны держатся севера и опушек у гор.
      const pine = kindRoll < (jz < -50 ? 0.7 : 0.22)
      trees.push({ x: jx, z: jz, kind: pine ? 3 : Math.floor(kindRoll * 97) % 3, scale, turn })
    }
  }
  return trees
}
