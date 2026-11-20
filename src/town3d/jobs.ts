// Занятия жителей, их маршруты, грузы и выпас животных: кто чем занят, куда идёт, что несёт и где стоит.
// Здесь только числа и расчёты, без three.js: файл проверяется тестами. Отрисовка и движение — people.ts.
import type { Phase, WeatherKind } from '../world/sky'
import type { GearPart } from './gear'
import { GLADE, MEADOWS, PITCH, PLAZA, PORT_PUSH, STREET_X, STREET_Z, centerSite, connectors, forest, inMeadow, meadowEdge, plotOf, seeded, type AnimalSpot, type Plot, type Tree } from './plan'

/** Точка на земле: x и z в метрах. */
export type Point = [number, number]

/** Поворот фигуры, которая смотрит вдоль (dx, dz): модели обращены лицом к +Z. */
export const heading = (dx: number, dz: number) => Math.atan2(dx, dz)

// ——— Сколько жителей на улице ———

/** Больше стольких жителей по улицам не ходит: предел ради скорости сцены. */
export const MAX_WALKERS = 12

/** Сколько жителей выходит на улицу. Запустение второго уровня и выше (quiet) — никого. */
export const walkersFor = (population: number, quiet: boolean) => (quiet ? 0 : Math.max(0, Math.min(MAX_WALKERS, Math.floor(population))))

const PHASE_SHARE: Record<Phase, number> = { dawn: 0.6, day: 1, dusk: 0.75, night: 0.3 }
const WEATHER_SHARE: Record<WeatherKind, number> = { clear: 1, cloudy: 1, overcast: 1, fog: 0.85, snow: 0.8, drizzle: 0.7, rain: 0.45, storm: 0.2 }

/** Сколько из вышедших жителей остаётся на улице при таком времени суток и погоде: остальные сидят по домам. */
export function outdoors(walkers: number, phase: Phase, kind: WeatherKind): number {
  return Math.max(0, Math.min(walkers, Math.round(walkers * PHASE_SHARE[phase] * WEATHER_SHARE[kind])))
}

/** Животные бродят днём и в сумерках; ночью и в грозу стоят на месте. */
export const animalsRoam = (phase: Phase, kind: WeatherKind) => phase !== 'night' && kind !== 'storm'

/** В дождь и грозу шаг быстрее: под крышу торопятся. */
export const hurry = (kind: WeatherKind) => (kind === 'rain' || kind === 'storm' ? 1.25 : 1)

// ——— Грузы ———

export type Cargo = 'firewood' | 'planks' | 'sack' | 'basket' | 'bread' | 'fish' | 'buckets' | 'bricks' | 'crate'

export const CARGO_NAME: Record<Cargo, string> = {
  firewood: 'вязанка поленьев',
  planks: 'доски',
  sack: 'мешок',
  basket: 'корзина с овощами',
  bread: 'корзина с хлебом',
  fish: 'корзина с рыбой',
  buckets: 'вёдра',
  bricks: 'кирпич',
  crate: 'ящик с товаром',
}

/** С тяжёлой ношей шаг медленнее: доля от обычной скорости. */
export const CARGO_PACE: Record<Cargo, number> = { firewood: 0.86, planks: 0.86, sack: 0.86, basket: 0.9, bread: 1, fish: 1, buckets: 0.88, bricks: 0.8, crate: 0.9 }

/**
 * Фигура жителя ростом 2,1 м, по скелету моделей: высота плеча, спина, кисть опущенной руки, голова.
 * Ось X — влево от жителя, Y — вверх, Z — вперёд, как у экипировки путника (gear.ts).
 */
export const FIGURE = { height: 2.1, shoulder: 1.76, shoulderX: 0.29, back: -0.17, hand: 0.92, handX: 0.37, headY: 1.97, headRadius: 0.17 }

const WOOD = '#876a44'
const WOOD_DARK = '#6b5236'
const WOOD_LIGHT = '#b39a6c'
const WICKER = '#a5854f'
const IRON = '#55575c'

/** Лежащий вдоль оси X цилиндр длиной length с серединой над точкой (0, y, z). */
const across = (y: number, z: number, radius: number, length: number, color: string): GearPart => ({
  shape: 'cylinder',
  at: [-length / 2, y, z],
  size: [radius, radius, length],
  color,
  tilt: [0, -Math.PI / 2],
})

/** Дужка корзины или ведра: две планки домиком над точкой (x, y, z), сходятся на высоте top. Крестом они не лежат. */
function bail(x: number, y: number, z: number, span: number, top: number, color: string): GearPart[] {
  const rise = top - y
  const length = Math.hypot(span, rise)
  const lean = Math.atan2(span, rise)
  return [
    { shape: 'box', at: [x, y, z - span], size: [0.02, length, 0.02], color, tilt: [lean, 0] },
    { shape: 'box', at: [x, y, z + span], size: [0.02, length, 0.02], color, tilt: [-lean, 0] },
  ]
}

/** Корзина в опущенной руке: что лежит сверху, решает цвет. */
function handBasket(top: string, items: [string, string], size: [number, number, number]): GearPart[] {
  const x = FIGURE.handX + 0.01
  const [w, h, d] = size
  return [
    { shape: 'cylinder', at: [x, 0.6, 0.05], size: [0.12, 0.16, 0.17], color: WICKER },
    { shape: 'cylinder', at: [x, 0.765, 0.05], size: [0.148, 0.148, 0.025], color: top },
    { shape: 'box', at: [x, 0.785, 0.005], size: [w, h, d], color: items[0] },
    { shape: 'box', at: [x, 0.785, 0.1], size: [w, h, d], color: items[1] },
    ...bail(x, 0.77, 0.05, 0.15, FIGURE.hand + 0.02, '#8a6d4b'),
  ]
}

/**
 * Из чего собран груз и где он на фигуре жителя ростом 2,1 м: детали в метрах от ног.
 * Длинных жердей и брёвен поперёк фигуры нет нарочно: человек с перекладиной на плече издали читается крестом.
 */
export function cargoParts(kind: Cargo): GearPart[] {
  const back = FIGURE.back
  if (kind === 'firewood') {
    // Вязанка за спиной: пять коротких поленьев поперёк спины, торцы светлее.
    const logs: [number, number, string][] = [
      [1.16, back - 0.09, WOOD],
      [1.31, back - 0.09, '#7a5f3d'],
      [1.46, back - 0.09, WOOD],
      [1.235, back - 0.22, WOOD_DARK],
      [1.385, back - 0.22, '#7a5f3d'],
    ]
    return logs.flatMap(([y, z, color]) => [across(y, z, 0.075, 0.56, color), across(y, z, 0.058, 0.58, WOOD_LIGHT)])
  }
  if (kind === 'planks') {
    // Три доски стоймя за спиной, чуть отклонены назад: вдоль фигуры, а не поперёк.
    return [
      { shape: 'box', at: [0.02, 0.86, back - 0.045], size: [0.24, 1, 0.035], color: WOOD_LIGHT, tilt: [-0.1, 0] },
      { shape: 'box', at: [-0.02, 0.9, back - 0.09], size: [0.24, 1, 0.035], color: '#a38658', tilt: [-0.1, 0] },
      { shape: 'box', at: [0.01, 0.84, back - 0.135], size: [0.24, 1, 0.035], color: '#c2a877', tilt: [-0.1, 0] },
    ]
  }
  if (kind === 'sack') {
    // Мешок лежит на правом плече вдоль шага, спереди завязка.
    const y = FIGURE.shoulder + 0.16
    return [
      { shape: 'cylinder', at: [-FIGURE.shoulderX, y, -0.27], size: [0.15, 0.16, 0.5], color: '#c9bd98', tilt: [Math.PI / 2, 0] },
      { shape: 'cylinder', at: [-FIGURE.shoulderX, y, 0.23], size: [0.06, 0.035, 0.08], color: '#8f8262', tilt: [Math.PI / 2, 0] },
    ]
  }
  if (kind === 'basket') {
    // Заплечная корзина: сверху видны овощи.
    const z = back - 0.19
    return [
      { shape: 'cylinder', at: [0, 1.02, z], size: [0.15, 0.21, 0.36], color: WICKER },
      { shape: 'cylinder', at: [0, 1.365, z], size: [0.215, 0.215, 0.03], color: '#8a6d4b' },
      { shape: 'cylinder', at: [0, 1.385, z], size: [0.19, 0.19, 0.03], color: '#6f9a55' },
      { shape: 'box', at: [0.06, 1.4, z + 0.03], size: [0.1, 0.07, 0.1], color: '#c9803c' },
      { shape: 'box', at: [-0.07, 1.4, z - 0.05], size: [0.1, 0.07, 0.1], color: '#a94f3c' },
      { shape: 'box', at: [-0.05, 1.4, z + 0.08], size: [0.08, 0.06, 0.08], color: '#d9c26a' },
    ]
  }
  if (kind === 'bread') return handBasket('#c99a55', ['#c08a45', '#d2a35c'], [0.2, 0.07, 0.085])
  if (kind === 'fish') return handBasket('#8fa0a6', ['#aab2b4', '#c3cacb'], [0.2, 0.04, 0.06])
  if (kind === 'buckets') {
    // По ведру в каждой руке: клёпка, обруч, вода и дужка.
    return [-1, 1].flatMap((side): GearPart[] => {
      const x = side * FIGURE.handX
      return [
        { shape: 'cylinder', at: [x, 0.5, 0.04], size: [0.1, 0.125, 0.24], color: '#a38658' },
        { shape: 'cylinder', at: [x, 0.66, 0.04], size: [0.128, 0.128, 0.03], color: IRON },
        { shape: 'cylinder', at: [x, 0.725, 0.04], size: [0.11, 0.11, 0.02], color: '#5b8fa0' },
        ...bail(x, 0.74, 0.04, 0.115, FIGURE.hand, IRON),
      ]
    })
  }
  if (kind === 'bricks') {
    // Заплечная «коза»: доска с полкой, на полке кирпич в три ряда.
    const z = back - 0.135
    return [
      { shape: 'box', at: [0, 0.98, back - 0.03], size: [0.38, 0.5, 0.03], color: WOOD },
      { shape: 'box', at: [0, 0.98, z], size: [0.38, 0.03, 0.21], color: WOOD },
      { shape: 'box', at: [0, 1.01, z], size: [0.34, 0.085, 0.17], color: '#b0644a' },
      { shape: 'box', at: [0, 1.1, z], size: [0.34, 0.085, 0.17], color: '#94523d' },
      { shape: 'box', at: [0, 1.19, z], size: [0.34, 0.085, 0.17], color: '#b0644a' },
      { shape: 'box', at: [-0.06, 1.28, z], size: [0.2, 0.085, 0.17], color: '#a85c44' },
    ]
  }
  // Ящик с товаром на левом плече: крышка светлее.
  return [
    { shape: 'box', at: [FIGURE.shoulderX + 0.01, FIGURE.shoulder, -0.03], size: [0.34, 0.24, 0.36], color: '#8f6f48' },
    { shape: 'box', at: [FIGURE.shoulderX + 0.01, FIGURE.shoulder + 0.24, -0.03], size: [0.3, 0.02, 0.32], color: WOOD_LIGHT },
  ]
}

// ——— Остановки у построек ———

/** Постройка города, как её видит расчёт занятий. */
export interface Site {
  id: string
  type: string
  level: number
  /** Идёт стройка или улучшение. */
  pending: boolean
}

/** Стройка новой центральной постройки на площади. */
export const CENTER_SITE = 'center'

export interface Stop {
  /** Номер постройки; «center» — стройка на площади. */
  id: string
  x: number
  z: number
  /** Куда смотрит житель, пока стоит: радианы, как поворот фигуры. */
  face: number
  /** Точка на улице, с которой сворачивают к остановке. */
  gate: Point
}

/** Остановка у ворот: за передним краем участка, на ближней кромке улицы. Все постройки заканчиваются раньше. */
const DOOR_DEPTH = 5.75
/** Места у ворот: смещения от середины участка, чтобы двое у одной постройки не стояли друг в друге. */
const DOOR_SLOTS = [1.2, -1.2, 2.5, 0, 3.6, -0.6]
/** У колодца подходят к самой воде: двор колодца пуст на любом уровне. */
const WELL_SPOTS: Point[] = [
  [2.2, 3.4],
  [-2.3, 3.6],
]
/** Новая стройка: леса кончаются в 3,4 м от середины участка, штабель досок лежит справа. */
const SITE_DEPTH = 4.4
const SITE_SLOTS = [0.6, -0.8, 2, -2.2]
/** Причал первых трёх уровней: к воде подходят по тропе от южной улицы. */
const PIER_DEPTH = [-1.2, -1.2, -2.7]
const PIER_SLOTS = [0.4, 1.4, 2.2]

const nearest = (values: number[], to: number) => values.reduce((best, value) => (Math.abs(value - to) < Math.abs(best - to) ? value : best), values[0])

/**
 * Где житель останавливается у постройки: снаружи, у ворот или у дела, лицом к ней.
 * slot — который по счёту житель у этой постройки; tier нужен только стройке на площади.
 */
export function stopOf(site: Site, slot: number, tier = 0): Stop | null {
  const id = site.id
  if (id === CENTER_SITE) {
    // Леса на площади: до «Хутора» подходят с запада, дальше — с востока, где нет ни очага, ни фонарей.
    const at = centerSite(tier)
    const west = tier <= 1
    const k = slot % 4
    const x = at.x + (west ? [-0.3, -1.7, 1.1, 2.5] : [0.6, -0.8, 1.8, -2.2])[k]
    // Места разнесены и по глубине: идущий к дальнему не проходит сквозь стоящих. На востоке — южнее штабеля досок у лесов.
    const z = at.z + SITE_DEPTH + (west ? [0, -0.6, 0.3, -0.3] : [0.4, 1.1, 1.7, 0.75])[k]
    return { id, x, z, face: Math.PI, gate: [west ? -PITCH : PITCH, z] }
  }
  const plot = plotOf(id)
  if (!plot) return null
  const front = plot.z + PITCH / 2
  if (plot.water) {
    if (site.level >= 1 && site.level <= 3 && !site.pending) {
      const x = plot.x + PIER_SLOTS[slot % PIER_SLOTS.length]
      const z = plot.z + PIER_DEPTH[site.level - 1]
      return { id, x, z, face: heading(plot.x - x, plot.z + 3 - z), gate: [x, STREET_Z[0]] }
    }
    // Большая пристань и стройка занимают весь берег до улицы: ждут на кромке поперечной улицы.
    const side = nearest(STREET_X, plot.x)
    const x = side + Math.sign(plot.x - side) * 0.75
    const z = plot.z - 7.2 - (slot % 3) * 0.9
    return { id, x, z, face: heading(plot.x - x, plot.z - 4 - z), gate: [side, z] }
  }
  if (site.level <= 0) {
    const x = plot.x + SITE_SLOTS[slot % SITE_SLOTS.length]
    return { id, x, z: plot.z + SITE_DEPTH, face: Math.PI, gate: [x, front] }
  }
  if (site.type === 'well' && !site.pending && slot < WELL_SPOTS.length) {
    const [dx, dz] = WELL_SPOTS[slot]
    return { id, x: plot.x + dx, z: plot.z + dz, face: heading(-dx, -dz), gate: [plot.x + dx, front] }
  }
  const shift = site.type === 'well' && !site.pending ? WELL_SPOTS.length : 0
  const x = plot.x + DOOR_SLOTS[(slot - shift) % DOOR_SLOTS.length]
  return { id, x, z: plot.z + DOOR_DEPTH, face: Math.PI, gate: [x, front] }
}

// ——— Улицы и маршруты ———

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Ствол дерева у земли: середина и радиус. */
export interface Trunk {
  x: number
  z: number
  r: number
}

/** Сеть улиц города: какие кварталы открыты и что стоит на пути. */
export interface Net {
  /** Открытые участки на суше: настоящие улицы идут только вдоль них и вокруг площади. */
  open: Set<string>
  /** Соединительные дороги к участкам, стоящим особняком: середины отрезков. По ним ходят как по улице. */
  roads: Set<string>
  /** Постройки, которые выходят на улицу: в обход. */
  blocks: Rect[]
  /** Стволы у самых улиц: лес подступает к краю города вплотную. */
  trunks: Trunk[]
}

const cell = (x: number, z: number) => `${Math.round(x * 2)}:${Math.round(z * 2)}`
const COLS = STREET_X.length
const ROWS = STREET_Z.length
const HALF = PITCH / 2
/** Путь через лес, где улицы ещё нет, считается впятеро длиннее. */
const WILD = 5
/** Метр сквозь постройку стоит как тридцать по улице. */
const THROUGH = 30
/** Отрезок, где ствол не обойти ни по одной стороне улицы, стоит как семьдесят лишних метров. */
const TREE = 70
/** Держатся правой стороны улицы: на столько от её середины. Встречные не идут друг сквозь друга. */
export const LANE = 0.32
/** От середины идущего до коры — не меньше стольких метров: это его плечо. */
export const SHOULDER = 0.3
/** До ограды постройки, вышедшей на улицу, — ещё на столько дальше: ограда не ствол, вдоль неё идут долго. */
const BLOCK_GAP = 0.15

/**
 * Где у дерева ствол. Дерево ставится серединой габаритов модели, а ствол у лиственных пород
 * стоит в стороне от неё; числа сняты с моделей в масштабе леса (town.ts).
 */
export function trunkOf(tree: Tree): Trunk {
  const turn = (tree.turn * Math.PI) / 180
  const [dx, dz, r] = tree.kind === 3 ? [0, 0, 0.42] : tree.kind === 1 ? [0.06, 0, 0.3] : [0.445, -0.395, 0.45]
  const k = tree.scale * (tree.kind === 2 ? 1.5 / 1.7 : 1)
  return { x: tree.x + (dx * Math.cos(turn) + dz * Math.sin(turn)) * k, z: tree.z + (-dx * Math.sin(turn) + dz * Math.cos(turn)) * k, r: r * k }
}

export function streetNet(open: Plot[], sites: Site[] = [], trees: Tree[] = []): Net {
  const net: Net = { open: new Set(), roads: new Set(), blocks: [], trunks: [] }
  for (const plot of open) if (!plot.water) net.open.add(cell(plot.x, plot.z))
  for (const road of connectors(open)) net.roads.add(cell((road.x0 + road.x1) / 2, (road.z0 + road.z1) / 2))
  for (const site of sites) {
    // Пристани четвёртого и пятого уровня длиннее своего участка: дальний от воды край подходит к южной улице вплотную.
    const plot = plotOf(site.id)
    if (!plot?.water || site.level < 4) continue
    const [x0, x1] = site.level >= 5 ? [-6.5, 7.5] : [-2.5, 4.5]
    net.blocks.push({ minX: plot.x + x0, maxX: plot.x + x1, minZ: plot.z - 5.8 + PORT_PUSH, maxZ: plot.z - 1 })
  }
  // Запоминаем только стволы у улиц: остальные идущим не мешают.
  const [west, east] = [STREET_X[0] - 3, STREET_X[COLS - 1] + 3]
  const [north, south] = [STREET_Z[ROWS - 1] - 3, STREET_Z[0] + 3]
  for (const tree of trees) {
    const trunk = trunkOf(tree)
    if (trunk.x < west || trunk.x > east || trunk.z < north || trunk.z > south) continue
    const near = Math.min(Math.abs(trunk.x - nearest(STREET_X, trunk.x)), Math.abs(trunk.z - nearest(STREET_Z, trunk.z)))
    if (near < LANE + SHOULDER + trunk.r + 0.2) net.trunks.push(trunk)
  }
  return net
}

/**
 * Сколько места остаётся идущему от (x0, z0) к (x1, z1) со сдвигом offset вправо:
 * расстояние от плеча до ближайшей коры. Меньше нуля — задевает ствол.
 */
function room(net: Net, x0: number, z0: number, x1: number, z1: number, offset: number): number {
  const dx = x1 - x0
  const dz = z1 - z0
  const length = Math.hypot(dx, dz)
  if (length < 1e-6) return Infinity
  // Правая сторона для хода (dx, dz) — это (−dz, dx): идущий на восток держится юга.
  const ax = x0 + (-dz / length) * offset
  const az = z0 + (dx / length) * offset
  let free = Infinity
  for (const trunk of net.trunks) {
    const t = clamp(((trunk.x - ax) * dx + (trunk.z - az) * dz) / (length * length), 0, 1)
    free = Math.min(free, Math.hypot(trunk.x - ax - dx * t, trunk.z - az - dz * t) - trunk.r - SHOULDER)
  }
  // Постройка, вышедшая на улицу (большая пристань): её ограду тоже не задевают плечом.
  // Улицы идут вдоль осей, поэтому расстояние от отрезка до прямоугольника считается по каждой оси отдельно.
  const [lowX, highX] = [Math.min(ax, ax + dx), Math.max(ax, ax + dx)]
  const [lowZ, highZ] = [Math.min(az, az + dz), Math.max(az, az + dz)]
  for (const block of net.blocks) {
    const gapX = Math.max(0, block.minX - highX, lowX - block.maxX)
    const gapZ = Math.max(0, block.minZ - highZ, lowZ - block.maxZ)
    free = Math.min(free, Math.hypot(gapX, gapZ) - SHOULDER - BLOCK_GAP)
  }
  return free
}

/** По какой стороне идти: правой; если там ствол — серединой; если и там — левой; иначе где свободнее. */
function sideOf(net: Net, x0: number, z0: number, x1: number, z1: number, lane: number): number {
  let best = lane
  let most = -Infinity
  for (const offset of [lane, 0, -lane]) {
    const free = room(net, x0, z0, x1, z1, offset)
    if (free >= 0) return offset
    if (free > most) {
      most = free
      best = offset
    }
  }
  return best
}

/** Точка внутри постройки, вышедшей на улицу; reach — запас вокруг неё. */
export const blocked = (net: Net, x: number, z: number, reach = 0) =>
  net.blocks.some((block) => x > block.minX - reach && x < block.maxX + reach && z > block.minZ - reach && z < block.maxZ + reach)

const onPlaza = (x: number, z: number) => Math.abs(x - PLAZA.x) < PITCH && Math.abs(z - PLAZA.z) < PITCH

/**
 * Цена отрезка улицы вдоль одной из осей, в метрах пути. Отрезок лежит между двумя соседними перекрёстками.
 * Через середину площади хода нет: там центральная постройка, костёр и фонтан.
 */
function price(net: Net, x0: number, z0: number, x1: number, z1: number): number {
  const length = Math.abs(x1 - x0) + Math.abs(z1 - z0)
  if (length < 1e-6) return 0
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
  const mx = (x0 + x1) / 2
  const mz = (z0 + z1) / 2
  // Середины двух кварталов по сторонам отрезка.
  const a: Point = alongX ? [(Math.floor(mx / PITCH) + 0.5) * PITCH, mz - HALF] : [mx - HALF, (Math.floor(mz / PITCH) + 0.5) * PITCH]
  const b: Point = alongX ? [a[0], mz + HALF] : [mx + HALF, a[1]]
  const plazaA = onPlaza(a[0], a[1])
  const plazaB = onPlaza(b[0], b[1])
  if (plazaA && plazaB) return Infinity
  const paved = plazaA || plazaB || net.open.has(cell(a[0], a[1])) || net.open.has(cell(b[0], b[1])) || net.roads.has(cell(mx, mz))
  let through = 0
  for (const block of net.blocks) {
    const reach = 0.8
    if (alongX) {
      if (mz < block.minZ - reach || mz > block.maxZ + reach) continue
      through += Math.max(0, Math.min(Math.max(x0, x1), block.maxX + reach) - Math.max(Math.min(x0, x1), block.minX - reach))
    } else {
      if (mx < block.minX - reach || mx > block.maxX + reach) continue
      through += Math.max(0, Math.min(Math.max(z0, z1), block.maxZ + reach) - Math.max(Math.min(z0, z1), block.minZ - reach))
    }
  }
  const free = room(net, x0, z0, x1, z1, sideOf(net, x0, z0, x1, z1, LANE))
  return length * (paved ? 1 : WILD) + through * THROUGH + (free < 0 ? TREE : 0)
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value))
}

/** Отрезок улицы, на котором лежат ворота: его концы-перекрёстки. row — улица вдоль X, иначе вдоль Z. */
function segmentOf(gate: Point): { row: boolean; line: number; at: number } {
  const [gx, gz] = gate
  const row = STREET_Z.findIndex((z) => Math.abs(z - gz) < 0.05)
  if (row >= 0) return { row: true, line: row, at: clamp(Math.floor((gx - STREET_X[0]) / PITCH), 0, COLS - 2) }
  const column = STREET_X.findIndex((x) => Math.abs(x - gx) < 0.05)
  if (column >= 0) return { row: false, line: column, at: clamp(Math.floor((STREET_Z[0] - gz) / PITCH), 0, ROWS - 2) }
  // Ворота не на улице: считаем их стоящими на ближайшей улице вдоль X.
  const line = STREET_Z.indexOf(nearest(STREET_Z, gz))
  return { row: true, line, at: clamp(Math.floor((gx - STREET_X[0]) / PITCH), 0, COLS - 2) }
}

/** Перекрёстки по концам отрезка с воротами и цена пути до каждого: leaving — от ворот, иначе к воротам. */
function ends(net: Net, gate: Point, leaving: boolean): { node: number; cost: number }[] {
  const segment = segmentOf(gate)
  return [0, 1].map((step) => {
    const i = segment.row ? segment.at + step : segment.line
    const j = segment.row ? segment.line : segment.at + step
    const cost = leaving ? price(net, gate[0], gate[1], STREET_X[i], STREET_Z[j]) : price(net, STREET_X[i], STREET_Z[j], gate[0], gate[1])
    return { node: i + j * COLS, cost }
  })
}

/**
 * Путь по улицам от остановки до остановки: от ворот по улицам до ворот, с поворотами на перекрёстках.
 * Улицы без открытых участков обходятся, пока есть другой путь; середина площади закрыта.
 * Идущий держится правой стороны улицы (lane). Первая точка — сама остановка from, последняя — to.
 */
export function route(from: Stop, to: Stop, net: Net, lane = LANE): Point[] {
  const starts = ends(net, from.gate, true)
  const finishes = ends(net, to.gate, false)
  const cost = new Array<number>(COLS * ROWS).fill(Infinity)
  const before = new Array<number>(COLS * ROWS).fill(-1)
  const done = new Array<boolean>(COLS * ROWS).fill(false)
  for (const start of starts) cost[start.node] = Math.min(cost[start.node], start.cost)
  for (;;) {
    let current = -1
    for (let n = 0; n < cost.length; n++) if (!done[n] && cost[n] < Infinity && (current < 0 || cost[n] < cost[current])) current = n
    if (current < 0) break
    done[current] = true
    const i = current % COLS
    const j = Math.floor(current / COLS)
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue
      const next = ni + nj * COLS
      const total = cost[current] + price(net, STREET_X[i], STREET_Z[j], STREET_X[ni], STREET_Z[nj])
      if (total < cost[next]) {
        cost[next] = total
        before[next] = current
      }
    }
  }
  let best = finishes[0]
  for (const finish of finishes) if (cost[finish.node] + finish.cost < cost[best.node] + best.cost) best = finish

  const a = segmentOf(from.gate)
  const b = segmentOf(to.gate)
  const sameStreet = a.row === b.row && a.line === b.line && a.at === b.at
  const direct = sameStreet ? price(net, from.gate[0], from.gate[1], to.gate[0], to.gate[1]) : Infinity

  const points: Point[] = [[from.x, from.z], from.gate]
  if (direct > cost[best.node] + best.cost) {
    const nodes: number[] = []
    for (let n = best.node; n >= 0; n = before[n]) nodes.unshift(n)
    for (const n of nodes) points.push([STREET_X[n % COLS], STREET_Z[Math.floor(n / COLS)]])
  }
  points.push(to.gate, [to.x, to.z])

  // Повторы и точки посреди прямой убираем: остаются только повороты.
  const clean: Point[] = []
  for (const point of points) {
    const last = clean[clean.length - 1]
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.05) continue
    const prior = clean[clean.length - 2]
    if (prior && last) {
      const ax = last[0] - prior[0]
      const az = last[1] - prior[1]
      const bx = point[0] - last[0]
      const bz = point[1] - last[1]
      if (Math.abs(ax * bz - az * bx) < 1e-6 && ax * bx + az * bz > 0) clean.pop()
    }
    clean.push(point)
  }

  // Сторона улицы для каждого прямого отрезка: правая, а где у края улицы растёт дерево — та, где свободно.
  // Первый и последний отрезки — подход от остановки к воротам и обратно.
  const last = clean.length - 2
  const sides = clean.slice(0, -1).map((point, k) => (k === 0 || k === last ? lane : sideOf(net, point[0], point[1], clean[k + 1][0], clean[k + 1][1], lane)))

  // Сдвиг вправо по ходу: на прямой — в сторону, на повороте — в угол между двумя сторонами.
  const shifted = clean.map((point): Point => [point[0], point[1]])
  for (let k = 1; k < clean.length - 1; k++) {
    const inX = clean[k][0] - clean[k - 1][0]
    const inZ = clean[k][1] - clean[k - 1][1]
    const outX = clean[k + 1][0] - clean[k][0]
    const outZ = clean[k + 1][1] - clean[k][1]
    const inLength = Math.hypot(inX, inZ)
    const outLength = Math.hypot(outX, outZ)
    // Правая сторона для хода (dx, dz) — это (−dz, dx): идущий на восток держится юга.
    const rightIn: Point = [(-inZ / inLength) * sides[k - 1], (inX / inLength) * sides[k - 1]]
    const rightOut: Point = [(-outZ / outLength) * sides[k], (outX / outLength) * sides[k]]
    const straight = (inX * outX + inZ * outZ) / (inLength * outLength) > 0.99
    shifted[k] = [clean[k][0] + (straight ? rightIn[0] : rightIn[0] + rightOut[0]), clean[k][1] + (straight ? rightIn[1] : rightIn[1] + rightOut[1])]
  }
  return shifted
}

export const pathLength = (points: Point[]) => points.reduce((sum, point, i) => (i ? sum + Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) : 0), 0)

// ——— Дистанция между идущими ———

/**
 * Дистанция до идущего или стоящего впереди. Ближе KEEP_FAR житель сбавляет шаг, на KEEP_NEAR встаёт и ждёт.
 * Мешает только тот, кто прямо по ходу (не дальше KEEP_SIDE вбок): встречный идёт по своей стороне улицы,
 * стоящий у ворот — у края. Без этого догоняющий проходил бы сквозь идущего впереди.
 */
export const KEEP_FAR = 1.25
export const KEEP_NEAR = 0.7
export const KEEP_SIDE = 0.35

/**
 * Сколько от шага можно сделать, чтобы не войти в другого жителя: 1 — он не мешает, 0 — вплотную.
 * (dx, dz) — куда идёт житель, единичный вектор; (ox, oz) — где другой относительно него;
 * (ax, az) — куда идёт другой, null — стоит у постройки.
 * Считается тот, кто стоит на пути или идёт туда же. Встречные и идущие поперёк расходятся сами:
 * двое встречных друг друга не ждут — иначе встали бы навсегда.
 */
export function roomBehind(dx: number, dz: number, ox: number, oz: number, ax: number | null, az: number | null): number {
  const ahead = ox * dx + oz * dz
  if (ahead <= 0.05 || ahead >= KEEP_FAR || Math.abs(ox * dz - oz * dx) > KEEP_SIDE) return 1
  if (ax !== null && az !== null && ax * dx + az * dz < 0.2 * Math.hypot(ax, az)) return 1
  return Math.max(0, (ahead - KEEP_NEAR) / (KEEP_FAR - KEEP_NEAR))
}

// ——— Площадь: где ходит путник ———
//
// На площади тесно: центральная постройка, очаг со скамьями, фонтан, фонари, флагшток, купленные украшения,
// и на каждой ступени всё стоит по-своему. Поэтому круг путника не задан числами, а прокладывается по карте
// препятствий, снятой с уже собранной сцены (people.ts): что бы ни поставили на площадь, он это обойдёт.

/** Карта препятствий площади: квадратная сетка вокруг её середины с клеткой YARD_CELL. */
export interface Yard {
  /** Клеток по стороне. */
  size: number
  /** 1 — на высоте человека здесь что-то стоит: стена, ступени, скамья, фонарь. */
  solid: Uint8Array
}

export const YARD_CELL = 0.25
/** Карта шире площади: с улицей вокруг неё. */
export const YARD_HALF = PLAZA.w / 2 + 2.5
const YARD_SIZE = Math.round((YARD_HALF * 2) / YARD_CELL)

/** Ближе этого к препятствию путник не подходит: плечо и ещё шаг в запасе. */
export const STROLL_CLEAR = 0.75
/** В тесном городе с таким запасом площадь не обойти: тогда узкие места он проходит вплотную, но не насквозь. */
export const STROLL_TIGHT = 0.45
/** Где до препятствия меньше этого, шаг считается вдвое длиннее: он выбирает дорогу попросторнее. */
const STROLL_WIDE = 1.4
/**
 * Гуляет по площади и по самой кромке улиц вокруг неё: за ратушей иначе не пройти.
 * До полосы, по которой ходят жители, остаётся больше полуметра.
 */
export const STROLL_LIMIT = PLAZA.w / 2 + 0.4
/** Круг идёт через углы и середины сторон площади — там, где это возможно. */
const STROLL_RING = PLAZA.w / 2 - 2.4

export const emptyYard = (): Yard => ({ size: YARD_SIZE, solid: new Uint8Array(YARD_SIZE * YARD_SIZE) })

const yardColumn = (x: number) => Math.floor((x - PLAZA.x + YARD_HALF) / YARD_CELL)
const yardRow = (z: number) => Math.floor((z - PLAZA.z + YARD_HALF) / YARD_CELL)
const yardX = (i: number) => PLAZA.x - YARD_HALF + (i + 0.5) * YARD_CELL
const yardZ = (j: number) => PLAZA.z - YARD_HALF + (j + 0.5) * YARD_CELL

/** Отметить точку как занятую. Точки за краем карты пропускаются. */
export function markYard(yard: Yard, x: number, z: number) {
  const i = yardColumn(x)
  const j = yardRow(z)
  if (i >= 0 && j >= 0 && i < yard.size && j < yard.size) yard.solid[j * yard.size + i] = 1
}

/** Отметить занятым прямоугольник. */
export function blockYard(yard: Yard, minX: number, maxX: number, minZ: number, maxZ: number) {
  const i0 = Math.max(0, yardColumn(minX))
  const i1 = Math.min(yard.size - 1, yardColumn(maxX))
  const j0 = Math.max(0, yardRow(minZ))
  const j1 = Math.min(yard.size - 1, yardRow(maxZ))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) yard.solid[j * yard.size + i] = 1
}

/**
 * Расстояние от каждой клетки до ближайшей занятой, в метрах. Считается двумя проходами по сетке:
 * это быстро, но по косым направлениям выходит до 8% больше настоящего — запас берётся с поправкой (within).
 */
function distances(yard: Yard): Float32Array {
  const n = yard.size
  const far = n * 4
  const out = new Float32Array(n * n)
  for (let k = 0; k < n * n; k++) out[k] = yard.solid[k] ? 0 : far
  const diagonal = Math.SQRT2
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      let least = out[k]
      if (!least) continue
      if (i > 0) least = Math.min(least, out[k - 1] + 1)
      if (j > 0) {
        least = Math.min(least, out[k - n] + 1)
        if (i > 0) least = Math.min(least, out[k - n - 1] + diagonal)
        if (i < n - 1) least = Math.min(least, out[k - n + 1] + diagonal)
      }
      out[k] = least
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i
      let least = out[k]
      if (!least) continue
      if (i < n - 1) least = Math.min(least, out[k + 1] + 1)
      if (j < n - 1) {
        least = Math.min(least, out[k + n] + 1)
        if (i < n - 1) least = Math.min(least, out[k + n + 1] + diagonal)
        if (i > 0) least = Math.min(least, out[k + n - 1] + diagonal)
      }
      out[k] = least
    }
  }
  for (let k = 0; k < n * n; k++) out[k] *= YARD_CELL
  return out
}

/** Клетки не дальше radius от занятых. Поправка 1,09 покрывает неточность быстрого счёта расстояний. */
function within(distance: Float32Array, radius: number): Uint8Array {
  const out = new Uint8Array(distance.length)
  const limit = radius * 1.09
  for (let k = 0; k < distance.length; k++) if (distance[k] <= limit) out[k] = 1
  return out
}

/** Свободен ли прямой отрезок: проверяется каждая клетка под ним. */
function clearLine(blocked: Uint8Array, n: number, a: number, b: number): boolean {
  const ai = a % n
  const aj = Math.floor(a / n)
  const bi = b % n
  const bj = Math.floor(b / n)
  const steps = Math.max(1, Math.ceil(Math.hypot(bi - ai, bj - aj) * 3))
  for (let s = 0; s <= steps; s++) {
    const i = Math.round(ai + ((bi - ai) * s) / steps)
    const j = Math.round(aj + ((bj - aj) * s) / steps)
    if (blocked[j * n + i]) return false
  }
  return true
}

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/** Кратчайшая дорога по свободным клеткам от from до to; тесные места считаются длиннее. Пусто — дороги нет. */
function yardPath(blocked: Uint8Array, tight: Uint8Array, n: number, from: number, to: number): number[] {
  const cost = new Float32Array(n * n).fill(Infinity)
  const before = new Int32Array(n * n).fill(-1)
  const done = new Uint8Array(n * n)
  // Очередь с приоритетом: двоичная куча из номеров клеток.
  const heap: number[] = []
  const score = new Float32Array(n * n)
  const push = (cell: number) => {
    heap.push(cell)
    for (let k = heap.length - 1; k > 0; ) {
      const parent = (k - 1) >> 1
      if (score[heap[parent]] <= score[heap[k]]) break
      ;[heap[parent], heap[k]] = [heap[k], heap[parent]]
      k = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      for (let k = 0; ; ) {
        const left = k * 2 + 1
        const right = left + 1
        let least = k
        if (left < heap.length && score[heap[left]] < score[heap[least]]) least = left
        if (right < heap.length && score[heap[right]] < score[heap[least]]) least = right
        if (least === k) break
        ;[heap[least], heap[k]] = [heap[k], heap[least]]
        k = least
      }
    }
    return top
  }
  const ti = to % n
  const tj = Math.floor(to / n)
  cost[from] = 0
  score[from] = 0
  push(from)
  while (heap.length) {
    const current = pop()
    if (done[current]) continue
    done[current] = 1
    if (current === to) break
    const i = current % n
    const j = Math.floor(current / n)
    for (const [di, dj] of STEPS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
      const next = nj * n + ni
      if (blocked[next] || done[next]) continue
      // Наискось — только если свободны обе соседние клетки: углы не срезаются.
      if (di && dj && (blocked[j * n + ni] || blocked[nj * n + i])) continue
      const total = cost[current] + Math.hypot(di, dj) * (tight[next] ? 2 : 1)
      if (total >= cost[next]) continue
      cost[next] = total
      before[next] = current
      score[next] = total + Math.hypot(ti - ni, tj - nj)
      push(next)
    }
  }
  if (!done[to]) return []
  const cells: number[] = []
  for (let cell = to; cell >= 0; cell = before[cell]) cells.unshift(cell)
  return cells
}

/**
 * Круг путника по площади: замкнутая ломаная, которая обходит всё, что на площади стоит.
 * Идёт через углы и середины сторон площади; куда не пройти — туда не идёт.
 * Пусто — гулять негде: путник остаётся у костра.
 */
export function stroll(yard: Yard): Point[] {
  const distance = distances(yard)
  const roomy = tour(yard, distance, STROLL_CLEAR)
  // Обошёл почти всю площадь — хорошо. Иначе пробуем пройти узкие места с меньшим запасом.
  if (roomy.reached >= 6) return roomy.loop
  const snug = tour(yard, distance, STROLL_TIGHT)
  return snug.reached > roomy.reached ? snug.loop : roomy.loop
}

/** Круг с заданным запасом до препятствий и число опорных точек, до которых он дошёл. */
function tour(yard: Yard, distance: Float32Array, clear: number): { loop: Point[]; reached: number } {
  const none = { loop: [] as Point[], reached: 0 }
  const n = yard.size
  const blocked = within(distance, clear)
  const tight = within(distance, STROLL_WIDE)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (Math.abs(yardX(i) - PLAZA.x) > STROLL_LIMIT || Math.abs(yardZ(j) - PLAZA.z) > STROLL_LIMIT) blocked[j * n + i] = 1
    }
  }

  // Связные области свободных клеток: круг целиком лежит в одной.
  const area = new Int32Array(n * n).fill(-1)
  let areas = 0
  for (let start = 0; start < n * n; start++) {
    if (blocked[start] || area[start] >= 0) continue
    const queue = [start]
    area[start] = areas
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]
      const i = cell % n
      const j = Math.floor(cell / n)
      for (const [di, dj] of STEPS.slice(0, 4)) {
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
        const next = nj * n + ni
        if (blocked[next] || area[next] >= 0) continue
        area[next] = areas
        queue.push(next)
      }
    }
    areas++
  }
  if (!areas) return none

  // Опорные точки по кругу: юго-запад, юг, юго-восток и дальше. Каждая сдвигается на ближайшую свободную клетку.
  const r = STROLL_RING
  const ring: Point[] = [[-r, r], [0, r], [r, r], [r, 0], [r, -r], [0, -r], [-r, -r], [-r, 0]]
  const reach = Math.round(3 / YARD_CELL)
  const anchors: number[] = []
  for (const [x, z] of ring) {
    const ci = yardColumn(PLAZA.x + x)
    const cj = yardRow(PLAZA.z + z)
    let best = -1
    let least = Infinity
    for (let dj = -reach; dj <= reach; dj++) {
      for (let di = -reach; di <= reach; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= n || j >= n || blocked[j * n + i]) continue
        // Из двух одинаково близких клеток лучше та, что не в тесноте.
        const distance = di * di + dj * dj + (tight[j * n + i] ? 6 : 0)
        if (distance < least) {
          least = distance
          best = j * n + i
        }
      }
    }
    anchors.push(best)
  }
  // Область, в которую попало больше всего опорных точек.
  const votes = new Map<number, number>()
  for (const cell of anchors) if (cell >= 0) votes.set(area[cell], (votes.get(area[cell]) ?? 0) + 1)
  let home = -1
  for (const [id, count] of votes) if (home < 0 || count > (votes.get(home) ?? 0)) home = id
  const stops = anchors.filter((cell) => cell >= 0 && area[cell] === home)
  if (stops.length < 2) return none

  // Круг — от опорной точки к следующей и от последней к первой. Каждый переход спрямляется отдельно:
  // из точки — к самой дальней на этом переходе, до которой прямая свободна, сначала с запасом пошире, потом как есть.
  // Опорные точки остаются на месте, иначе на пустой площади круг стянулся бы в отрезок.
  const roomy = within(distance, clear + 0.3)
  for (let k = 0; k < n * n; k++) if (blocked[k]) roomy[k] = 1
  const turns: number[] = []
  for (let s = 0; s < stops.length; s++) {
    const leg = yardPath(blocked, tight, n, stops[s], stops[(s + 1) % stops.length])
    if (!leg.length) return none
    const far = (grid: Uint8Array, from: number) => {
      let reachable = from + 1
      for (let k = from + 2; k < leg.length; k++) if (clearLine(grid, n, leg[from], leg[k])) reachable = k
      return reachable
    }
    // Последняя клетка перехода — первая клетка следующего: её добавит он.
    for (let k = 0; k < leg.length - 1; ) {
      turns.push(leg[k])
      const wide = far(roomy, k)
      k = wide > k + 1 ? wide : far(blocked, k)
    }
  }
  if (turns.length < 3) return none
  return { loop: turns.map((cell): Point => [yardX(cell % n), yardZ(Math.floor(cell / n))]), reached: stops.length }
}

/** Та же ломаная, сдвинутая влево по ходу на shift: по ней рядом с путником идёт кот. */
export function beside(loop: Point[], shift: number): Point[] {
  const count = loop.length
  return loop.map(([x, z], k): Point => {
    const [px, pz] = loop[(k + count - 1) % count]
    const [nx, nz] = loop[(k + 1) % count]
    const dx = nx - px
    const dz = nz - pz
    const length = Math.hypot(dx, dz) || 1
    // Левая сторона для хода (dx, dz) — это (dz, −dx).
    return [x + (dz / length) * shift, z + (-dx / length) * shift]
  })
}

// ——— Занятия ———

/** Перенос груза от постройки одного типа к постройке другого. */
export interface Haul {
  id: string
  name: string
  from: string
  to: string
  cargo: Cargo
  /** Что несут обратно; без поля — идут налегке. */
  back?: Cargo
}

export const HAULS: Haul[] = [
  { id: 'firewood', name: 'поленья с лесопилки в дровник', from: 'sawmill', to: 'woodshed', cargo: 'firewood' },
  { id: 'harvest', name: 'урожай с огорода в амбар', from: 'garden', to: 'barn', cargo: 'basket' },
  { id: 'water', name: 'вода из колодца в жилище', from: 'well', to: 'house', cargo: 'buckets' },
  { id: 'planks', name: 'доски с лесопилки на склад', from: 'sawmill', to: 'store', cargo: 'planks' },
  { id: 'grain', name: 'зерно из амбара на мельницу', from: 'barn', to: 'mill', cargo: 'sack' },
  { id: 'flour', name: 'мука с мельницы в пекарню, обратно хлеб', from: 'mill', to: 'bakery', cargo: 'sack', back: 'bread' },
  { id: 'bread', name: 'хлеб из пекарни на рынок', from: 'bakery', to: 'market', cargo: 'bread' },
  { id: 'fish', name: 'рыба с причала на рынок', from: 'pier', to: 'market', cargo: 'fish' },
  { id: 'bricks', name: 'кирпич с кирпичного двора на склад, обратно дрова для печей', from: 'brickyard', to: 'store', cargo: 'bricks', back: 'firewood' },
  { id: 'greens', name: 'овощи с огорода на рынок', from: 'garden', to: 'market', cargo: 'basket' },
  { id: 'wares', name: 'товар из мастерской на рынок', from: 'workshop', to: 'market', cargo: 'crate' },
  { id: 'stock', name: 'мешки из амбара в пекарню', from: 'barn', to: 'bakery', cargo: 'sack' },
  { id: 'catch', name: 'рыба с причала в амбар', from: 'pier', to: 'barn', cargo: 'fish' },
  { id: 'supplies', name: 'припасы со склада в таверну', from: 'store', to: 'tavern', cargo: 'crate' },
  { id: 'kitchen', name: 'вода из колодца в таверну', from: 'well', to: 'tavern', cargo: 'buckets' },
  { id: 'hearth', name: 'дрова из дровника в жилище', from: 'woodshed', to: 'house', cargo: 'firewood' },
  { id: 'boards', name: 'доски с лесопилки в мастерскую', from: 'sawmill', to: 'workshop', cargo: 'planks' },
]

/** Откуда носят материалы на стройку и что именно. Со склада — доски и кирпич по очереди. */
const SUPPLY: Record<string, Cargo[]> = { sawmill: ['planks'], brickyard: ['bricks'], store: ['planks', 'bricks'] }
/** Куда ходят гулять, по убыванию охоты. */
const LEISURE = ['tavern', 'market', 'well', 'bakery', 'house', 'garden', 'mill', 'workshop', 'barn', 'store', 'sawmill', 'woodshed', 'brickyard', 'tower']
/** Одну и ту же пару построек одним и тем же делом занимают не больше стольких жителей. */
const PER_PAIR = 2

export interface Task {
  /** haul — носит груз между постройками, build — носит материалы на стройку, stroll — гуляет налегке. */
  role: 'haul' | 'build' | 'stroll'
  /** Номер занятия из HAULS; у стройки «build», у прогулки «stroll». */
  job: string
  from: Site
  to: Site
  cargo: Cargo | null
  back: Cargo | null
}

const apart = (a: Site, b: Site) => {
  const pa = a.id === CENTER_SITE ? PLAZA : plotOf(a.id)
  const pb = b.id === CENTER_SITE ? PLAZA : plotOf(b.id)
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : Infinity
}

const numberOf = (site: Site) => Number(site.id.split('-')[1] ?? 0)

/** Готовые постройки, у которых есть участок. Постройка, которую улучшают, продолжает работать. */
export const standing = (sites: Site[]) => sites.filter((site) => site.level > 0 && !!plotOf(site.id))

/** Какие занятия возможны при таком наборе построек: обе постройки занятия должны стоять. */
export function possibleHauls(sites: Site[]): Haul[] {
  const types = new Set(standing(sites).map((site) => site.type))
  return HAULS.filter((haul) => types.has(haul.from) && types.has(haul.to))
}

/** Стройки: новые постройки, улучшения и, если город переходит на ступень, леса на площади. */
export function buildSites(sites: Site[], tierPending: boolean): Site[] {
  const list = sites.filter((site) => site.pending && !!plotOf(site.id))
  if (tierPending) list.push({ id: CENTER_SITE, type: CENTER_SITE, level: 0, pending: true })
  return list
}

/**
 * Раздаёт занятия count жителям. Часть носит материалы на стройку, если она идёт и есть откуда носить;
 * остальные заняты делами, которые подсказывает сам город; каждый четвёртый гуляет. Если дел нет — гуляют все.
 * Порядок в списке важен: ночью и в дождь на улице остаются первые.
 */
export function tasks(sites: Site[], count: number, tierPending = false): Task[] {
  const ready = standing(sites)
  if (count <= 0 || ready.length === 0) return []
  const random = seeded(977 + ready.length * 13 + count)
  const ofType = (type: string) => ready.filter((site) => site.type === type).sort((a, b) => numberOf(a) - numberOf(b))

  // Стройка.
  const builds = buildSites(sites, tierPending)
  const sources = ready.filter((site) => SUPPLY[site.type])
  const builders: Task[] = []
  if (builds.length && sources.length) {
    const wanted = Math.min(count, clamp(Math.round(count / 3), 1, 4))
    for (let k = 0; k < wanted; k++) {
      const to = builds[k % builds.length]
      const near = sources.filter((site) => site.id !== to.id).sort((a, b) => apart(a, to) - apart(b, to))
      if (!near.length) continue
      const from = near[Math.floor(k / builds.length) % near.length]
      const goods = SUPPLY[from.type]
      builders.push({ role: 'build', job: 'build', from, to, cargo: goods[k % goods.length], back: null })
    }
  }

  // Дела: пары построек каждого занятия, ближние первыми.
  const hauls = possibleHauls(sites).map((haul) => {
    const pairs = ofType(haul.from).flatMap((from) => ofType(haul.to).map((to): [Site, Site] => [from, to]))
    return { haul, pairs: pairs.sort((p, q) => apart(p[0], p[1]) - apart(q[0], q[1])), used: 0 }
  })
  const rest = count - builders.length
  const idle = hauls.length ? (rest >= 4 ? Math.max(1, Math.round(rest / 4)) : 0) : rest
  const workers: Task[] = []
  for (let round = 0; workers.length < rest - idle && round < PER_PAIR * 12; round++) {
    let given = false
    for (const entry of hauls) {
      if (workers.length >= rest - idle) break
      if (entry.used >= entry.pairs.length * PER_PAIR) continue
      const [from, to] = entry.pairs[entry.used % entry.pairs.length]
      entry.used++
      workers.push({ role: 'haul', job: entry.haul.id, from, to, cargo: entry.haul.cargo, back: entry.haul.back ?? null })
      given = true
    }
    if (!given) break
  }

  // Прогулки: туда, куда ходят люди. Выходят из своего дома — его назначит crew; from — запасная цель,
  // если первая окажется этим самым домом.
  const strollers: Task[] = []
  const walks = rest - workers.length
  const targets = LEISURE.flatMap((type) => ofType(type))
  for (let k = 0; k < walks && targets.length >= 2; k++) {
    // Чаще выбирают начало списка: таверну, рынок, колодец.
    const to = targets[Math.floor(random() * random() * targets.length)]
    const others = targets.filter((site) => site.id !== to.id)
    const from = others[Math.floor(random() * random() * others.length)]
    strollers.push({ role: 'stroll', job: 'stroll', from, to, cargo: null, back: null })
  }

  // Вперемешку: чтобы первые в списке, которые остаются на улице ночью, были заняты разным.
  const order: Task[] = []
  const total = builders.length + workers.length + strollers.length
  for (let i = 0; order.length < total; i++) {
    const pick = i % 4 === 1 && builders.length ? builders : i % 4 === 3 && strollers.length ? strollers : workers.length ? workers : builders.length ? builders : strollers
    order.push(pick.shift()!)
  }
  return order
}

/** Один переход: куда, по каким точкам и с чем. */
export interface Leg {
  /** Остановка, где переход кончается. */
  to: Stop
  points: Point[]
  cargo: Cargo | null
}

/** Что делает один житель: ходит по кругу legs, а когда пора домой — сворачивает к дому с ближайшей остановки. */
export interface Itinerary {
  role: Task['role']
  job: string
  /** Круг: каждый переход начинается там, где кончился прежний. */
  legs: Leg[]
  /** Дом жителя: туда он уходит на ночь и в непогоду. null — жилищ нет. */
  home: Stop | null
  /** Номер перехода, который кончается у дома, если дом — одна из остановок круга; иначе −1. */
  homeLeg: number
  /** Дорога домой с каждой остановки круга: toHome[i] — оттуда, где кончается переход i. Пусто, если дом и так на круге или дома нет. */
  toHome: Point[][]
  /** Из дома к началу круга. */
  fromHome: Point[]
  /** От остановки у ворот дома до его двери: там житель скрывается в доме и оттуда выходит. Пусто — заходить некуда. */
  door: Point[]
}

/** Где скрываются в жилище: по середине участка, сразу за проёмом ограды. Самый глубокий дом кончается в 3,4 м от середины. */
const DOOR_AT = 3.8

/**
 * Путь от остановки у ворот до двери жилища: к середине участка и через проём в ограде.
 * У недостроенного дома и у дома в лесах двери нет.
 */
export function doorway(site: Site, stop: Stop): Point[] {
  const plot = plotOf(site.id)
  if (!plot || site.type !== 'house' || site.level <= 0 || site.pending) return []
  return [
    [stop.x, stop.z],
    [plot.x, plot.z + 4.9],
    [plot.x, plot.z + DOOR_AT],
  ]
}

export interface CrewInput {
  tier: number
  population: number
  /** Запустение второго уровня и выше. */
  quiet: boolean
  sites: Site[]
  tierPending: boolean
  /** Открытые участки: по ним считаются улицы. */
  open: Plot[]
}

/** Занятия и маршруты всех жителей, которые выходят на улицу. */
export function crew(input: CrewInput): Itinerary[] {
  // На стоянке жителей нет: там только костёр и палатка путника.
  if (input.tier <= 0) return []
  const count = walkersFor(input.population, input.quiet)
  const list = tasks(input.sites, count, input.tierPending)
  if (!list.length) return []
  // Лес у улиц от числа особых построек не зависит: они стоят за рекой.
  const net = streetNet(input.open, input.sites, forest(input.tier, 0))
  const taken = new Map<string, number>()
  const stop = (site: Site): Stop | null => {
    // Места, которые заняла чужая постройка, пропускаем: большая пристань заходит на соседний участок.
    for (let attempt = 0; attempt < 8; attempt++) {
      const slot = taken.get(site.id) ?? 0
      taken.set(site.id, slot + 1)
      const found = stopOf(site, slot, input.tier)
      if (!found || (!blocked(net, found.x, found.z, 0.5) && !blocked(net, found.gate[0], found.gate[1], 0.3))) return found
    }
    return null
  }
  const houses = standing(input.sites)
    .filter((site) => site.type === 'house')
    .sort((a, b) => numberOf(a) - numberOf(b))

  const result: Itinerary[] = []
  list.forEach((task, i) => {
    // Кто носит воду или дрова в жилище, живёт в нём; гуляющий выходит из своего дома.
    let house: Site | null = houses.length ? houses[i % houses.length] : null
    if (task.role !== 'stroll' && task.to.type === 'house') house = task.to
    let from = task.from
    let to = task.to
    if (task.role === 'stroll' && house) {
      if (house.id === to.id) to = task.from
      from = house
    }
    if (from.id === to.id) return
    const a = stop(from)
    const b = stop(to)
    if (!a || !b) return
    const legs: Leg[] = [
      { to: b, points: route(a, b, net), cargo: task.cargo },
      { to: a, points: route(b, a, net), cargo: task.back },
    ]
    const homeLeg = !house ? -1 : house.id === b.id ? 0 : house.id === a.id ? 1 : -1
    const home = !house ? null : homeLeg === 0 ? b : homeLeg === 1 ? a : stop(house)
    const apartFromLoop = !!home && homeLeg < 0
    result.push({
      role: task.role,
      job: task.job,
      legs,
      home,
      homeLeg,
      toHome: apartFromLoop ? legs.map((leg) => route(leg.to, home!, net)) : [],
      fromHome: apartFromLoop ? route(home!, a, net) : [],
      door: house && home ? doorway(house, home) : [],
    })
  })
  return result
}

// ——— Животные ———

/** Тело животного в метрах от середины, где его держит сцена: назад до хвоста, вперёд до носа и полширины. */
export interface Body {
  back: number
  front: number
  half: number
}

// Доли от роста: габариты моделей, делённые на рост по скелету.
const BODY: Record<string, [number, number, number]> = {
  'a/cow': [0.68, 1.16, 0.26],
  'a/deer': [0.38, 0.63, 0.17],
  'a/donkey': [0.43, 0.76, 0.15],
  'a/horse': [0.45, 0.7, 0.14],
}

export function bodyOf(key: string, height: number): Body {
  const [back, front, half] = BODY[key] ?? [0.45, 0.75, 0.2]
  return { back: back * height, front: front * height, half: half * height }
}

/** Где пасутся домашние животные, по убыванию охоты: корова — на восточном лугу, у полей; лошадь — на западном; осёл — на дальнем. */
const PASTURE: Record<string, string[]> = {
  'a/cow': ['east', 'far-east', 'west'],
  'a/horse': ['west', 'far-east', 'east'],
  'a/donkey': ['far-east', 'west', 'east'],
}
/** Олени не подходят к опушке ближе чем на столько: дальше их закрывают кроны. */
const GLADE_ROOM = GLADE.r - 2.4
/** Нос может выйти за край пастбища не больше чем на столько. */
const NOSE_OUT = 0.6
/** Точек выпаса у одного животного. */
const GRAZE_NODES = 5

export interface Grazer {
  key: string
  /** Рост до макушки, метры. */
  height: number
  /** Пасётся (голова опущена) или чаще просто стоит. */
  grazing: boolean
  /** Пастбище: «glade» — поляна оленей, иначе номер луга. */
  ground: string
  /** Точки выпаса; первая — своё место, там животное стоит вначале. */
  nodes: Point[]
  /** Куда из каждой точки можно пройти по прямой, не выходя с пастбища. */
  links: number[][]
  /** Куда смотрит вначале, радианы. */
  turn: number
}

/** Точка на пастбище: margin — отступ внутрь от края (отрицательный — можно выйти за край). */
export function onGround(ground: string, x: number, z: number, margin = 0): boolean {
  if (ground === 'glade') return Math.hypot(x - GLADE.x, z - GLADE.z) <= GLADE_ROOM - margin
  const meadow = MEADOWS.find((m) => m.id === ground)
  return !!meadow && inMeadow(meadow, x, z, margin)
}

/**
 * Выпас: где каждое животное пасётся и между какими точками бродит.
 * Олени — на своей поляне, домашние — на лугах у реки. Пастбище делится между животными,
 * чтобы они не ходили друг сквозь друга; точки и переходы между ними держат на пастбище всё тело.
 */
export function grazing(spots: AnimalSpot[]): Grazer[] {
  // Кому какое пастбище.
  const load = new Map<string, number>()
  const grounds = spots.map((spot) => {
    if (spot.key === 'a/deer') return 'glade'
    const wishes = PASTURE[spot.key] ?? MEADOWS.map((m) => m.id)
    const ground = wishes.find((id) => (load.get(id) ?? 0) < (MEADOWS.find((m) => m.id === id)?.room ?? 0)) ?? wishes[wishes.length - 1]
    load.set(ground, (load.get(ground) ?? 0) + 1)
    return ground
  })

  return spots.map((spot, index) => {
    const ground = grounds[index]
    const body = bodyOf(spot.key, spot.height)
    const reach = body.back + 0.15
    const mates = spots.map((_, i) => i).filter((i) => grounds[i] === ground)
    const place = mates.indexOf(index)
    const meadow = MEADOWS.find((m) => m.id === ground)

    // Своя доля пастбища и своё место на ней.
    let home: Point
    let mine: (x: number, z: number, margin: number) => boolean
    let box: Rect
    if (meadow) {
      // Луг делится полосами с запада на восток: крупному животному — полоса шире.
      const need = (i: number) => bodyOf(spots[i].key, spots[i].height).back * 2 + 2.7
      const total = mates.reduce((sum, i) => sum + need(i), 0)
      const width = ((meadow.maxX - meadow.minX) * need(index)) / total
      const left = meadow.minX + ((meadow.maxX - meadow.minX) * mates.slice(0, place).reduce((sum, i) => sum + need(i), 0)) / total
      const middle = left + width / 2
      home = [middle, (meadow.minZ + meadowEdge(middle)) / 2]
      mine = (x, _z, margin) => x >= left + (place > 0 ? margin : -9) && x <= left + width - (place < mates.length - 1 ? margin : -9)
      box = { minX: left, maxX: left + width, minZ: meadow.minZ, maxZ: meadowEdge(middle) + 2 }
    } else {
      home = [spot.x, spot.z]
      const others = mates.filter((i) => i !== index).map((i): Point => [spots[i].x, spots[i].z])
      // Ближе к своему месту, чем к чужому, с запасом: половина зазора между соседями.
      mine = (x, z, margin) => others.every((other) => Math.hypot(x - home[0], z - home[1]) + margin * 2 <= Math.hypot(x - other[0], z - other[1]))
      box = { minX: GLADE.x - GLADE_ROOM, maxX: GLADE.x + GLADE_ROOM, minZ: GLADE.z - GLADE_ROOM, maxZ: GLADE.z + GLADE_ROOM }
    }
    const allowed = (x: number, z: number) => onGround(ground, x, z, reach) && mine(x, z, reach)

    // Кандидаты по сетке со сдвигом, чтобы точки не ложились рядами.
    const random = seeded(3301 + index * 97 + Math.round(spot.height * 100))
    const candidates: Point[] = []
    for (let z = box.minZ; z <= box.maxZ; z += 0.6) {
      for (let x = box.minX; x <= box.maxX; x += 0.6) {
        const point: Point = [x + (random() - 0.5) * 0.3, z + (random() - 0.5) * 0.3]
        if (allowed(point[0], point[1])) candidates.push(point)
      }
    }
    const turn = (spot.turn * Math.PI) / 180
    if (!candidates.length) return { key: spot.key, height: spot.height, grazing: spot.grazing, ground, nodes: [home], links: [[]], turn }

    // Первая точка — ближайшая к своему месту, каждая следующая — самая далёкая от уже выбранных.
    const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
    const nodes: Point[] = [candidates.reduce((best, point) => (distance(point, home) < distance(best, home) ? point : best))]
    while (nodes.length < GRAZE_NODES) {
      let far: Point | null = null
      let gap = 1.4
      for (const point of candidates) {
        const near = Math.min(...nodes.map((node) => distance(node, point)))
        if (near > gap) {
          gap = near
          far = point
        }
      }
      if (!far) break
      nodes.push(far)
    }

    // Переход годится, если по дороге и в конце всё тело остаётся на своей доле: нос — с небольшим выходом за край.
    const passable = (from: Point, to: Point) => {
      const length = distance(from, to)
      const dx = (to[0] - from[0]) / length
      const dz = (to[1] - from[1]) / length
      for (let t = 0; t <= length; t += 0.4) if (!allowed(from[0] + dx * t, from[1] + dz * t)) return false
      const nose: Point = [to[0] + dx * body.front, to[1] + dz * body.front]
      return onGround(ground, nose[0], nose[1], -NOSE_OUT) && mine(nose[0], nose[1], -NOSE_OUT / 2)
    }
    const links = nodes.map((from, i) => nodes.map((_, j) => j).filter((j) => j !== i && passable(from, nodes[j]) && passable(nodes[j], from)))

    // Начинать нужно там, откуда есть куда идти: иначе животное так и простоит.
    const start = links[0].length ? 0 : links.findIndex((list) => list.length > 0)
    if (start > 0) {
      const swap = (i: number) => (i === 0 ? start : i === start ? 0 : i)
      const moved = nodes.map((_, i) => nodes[swap(i)])
      const relinked = nodes.map((_, i) => links[swap(i)].map(swap))
      return { key: spot.key, height: spot.height, grazing: spot.grazing, ground, nodes: moved, links: relinked, turn }
    }
    return { key: spot.key, height: spot.height, grazing: spot.grazing, ground, nodes, links, turn }
  })
}
