// Облики построек. У каждого уровня — свой: от навеса из жердей до каменного дома.
// Основа — модели Quaternius (CC0); чего в наборах нет, собрано из простых фигур в тех же красках.
// Мир обычный: без храмов, магии и военных построек.
import type { Painter } from './kit'
import { KIND } from './kit'
import { modelDims, type LookBuilder, type LookFn } from './look'

const C = {
  wood: '#876a44',
  woodLight: '#a38658',
  woodDark: '#6b5236',
  stone: '#86877f',
  stoneLight: '#b2b3a8',
  tile: '#af5a46',
  canvas: '#e2d9c2',
  canvasShade: '#cfc5ab',
  thatch: '#b99b5c',
  shingle: '#7a6352',
  brick: '#b0644a',
  brickDark: '#94523d',
  plaster: '#d9d0b8',
  iron: '#55575c',
  dark: '#3a3128',
  clay: '#8a6a4f',
  rope: '#b8a67a',
  bread: '#c99a55',
}

// ——— Детали из простых фигур ———

/** Палатка: конёк вдоль оси Z, вход смотрит на юг. */
function tent(b: LookBuilder, w = 3.2, d = 3.8, h = 2.3, color = C.canvas) {
  const x = w / 2
  const z = d / 2
  b.sheet([-x, 0, -z], [-x, 0, z], [0, h, z], [0, h, -z], color)
  b.sheet([x, 0, z], [x, 0, -z], [0, h, -z], [0, h, z], C.canvasShade)
  b.poly([[x, 0, -z], [-x, 0, -z], [0, h, -z]], color)
  b.poly([[-x, 0, z], [-x * 0.3, 0, z], [0, h, z]], color)
  b.poly([[x * 0.3, 0, z], [x, 0, z], [0, h, z]], C.canvasShade)
  b.poly([[-x * 0.3, 0, z - 0.06], [x * 0.3, 0, z - 0.06], [0, h * 0.9, z - 0.06]], C.dark)
  b.beam([0, 0, z + 0.06], [0, h, z + 0.06], 0.1, C.wood)
  b.beam([0, 0, -z - 0.06], [0, h, -z - 0.06], 0.1, C.wood)
  b.beam([0, h, -z - 0.06], [0, h, z + 0.06], 0.09, C.wood)
  for (const side of [-1, 1]) {
    for (const along of [-0.8, 0, 0.8]) b.beam([side * (x + 0.35), 0, along * z], [side * (x + 0.05), 0.5, along * z], 0.05, C.rope)
  }
}

/** Навес на четырёх жердях: односкатная крыша, перед выше. */
function shelter(b: LookBuilder, w: number, d: number, h: number, roof = C.thatch, post = C.wood) {
  const x = w / 2
  const z = d / 2
  const back = h * 0.78
  for (const [px, pz, ph] of [[-x, -z, back], [x, -z, back], [-x, z, h], [x, z, h]]) b.beam([px, 0, pz], [px, ph, pz], 0.18, post)
  const o = 0.4
  b.sheet([-x - o, h + 0.1, z + o], [x + o, h + 0.1, z + o], [x + o, back - 0.05, -z - o], [-x - o, back - 0.05, -z - o], roof)
  b.sheet([-x - o, h + 0.22, z + o], [x + o, h + 0.22, z + o], [x + o, back + 0.07, -z - o], [-x - o, back + 0.07, -z - o], roof)
  b.box(0, h + 0.02, z + o, w + o * 2, 0.22, 0.12, post)
  b.beam([-x, back, -z], [x, back, -z], 0.12, post)
  b.beam([-x, h, z], [x, h, z], 0.12, post)
}

/** Изгородь из готовых звеньев от точки до точки. */
function fence(b: LookBuilder, x0: number, z0: number, x1: number, z1: number) {
  const length = Math.hypot(x1 - x0, z1 - z0)
  const n = Math.max(1, Math.round(length / 1.74))
  const rot = (Math.atan2(-(z1 - z0), x1 - x0) * 180) / Math.PI
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    b.model('v/fence', { at: [x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t], rot, s: length / n / 1.74 })
  }
}

/** Изгородь по прямоугольнику с проёмом спереди. */
function fenceAround(b: LookBuilder, w: number, d: number, gap = 2) {
  const x = w / 2
  const z = d / 2
  fence(b, -x, -z, x, -z)
  fence(b, -x, -z, -x, z)
  fence(b, x, -z, x, z)
  fence(b, -x, z, -gap / 2, z)
  fence(b, gap / 2, z, x, z)
}

/** Фонарь на столбе: ночью светится и кладёт тёплое пятно. */
function lantern(b: LookBuilder, x: number, z: number, h = 2.6) {
  if (b.ctx.lamps === false) return
  const dark = b.ctx.lamps === 'dark'
  b.beam([x, 0, z], [x, h, z], 0.12, C.woodDark)
  b.beam([x, h, z], [x + 0.5, h, z], 0.08, C.woodDark)
  b.box(x + 0.5, h - 0.55, z, 0.26, 0.36, 0.26, dark ? '#6f6a60' : '#d9c7a0', dark ? KIND.plain : KIND.lamp)
  b.box(x + 0.5, h - 0.2, z, 0.34, 0.06, 0.34, C.iron)
  if (!dark) b.lampAt(x + 0.5, 0, z)
}

/** Вывеска на столбе. */
function sign(b: LookBuilder, x: number, z: number, color: string, h = 2.4) {
  b.beam([x, 0, z], [x, h, z], 0.13, C.woodDark)
  b.beam([x, h, z], [x + 0.9, h, z], 0.09, C.woodDark)
  b.box(x + 0.55, h - 0.85, z, 0.62, 0.55, 0.07, color)
  b.box(x + 0.55, h - 0.88, z, 0.7, 0.05, 0.1, C.woodDark)
}

/** Поленница: ряд торцов светлее, сверху темнее. */
function woodRow(b: LookBuilder, x: number, z: number, w: number, h: number, d = 0.7) {
  b.box(x, 0, z, w, h, d, C.wood)
  b.box(x, 0.05, z + d / 2, w - 0.1, h - 0.1, 0.05, C.woodLight)
  for (let i = 0; i < Math.floor(w / 0.45); i++) b.box(x - w / 2 + 0.25 + i * 0.45, h, z, 0.3, 0.14, d * 0.9, i % 2 ? C.woodDark : C.wood)
}

/** Штабель кирпича. */
function bricks(b: LookBuilder, x: number, z: number, w = 1.3, h = 0.7, d = 0.8) {
  b.box(x, 0, z, w, h, d, C.brick)
  b.box(x, h * 0.48, z, w + 0.02, 0.04, d + 0.02, C.brickDark)
  b.box(x, h, z, w * 0.6, 0.2, d * 0.7, C.brick)
}

/** Купол из трёх поясов. */
function dome(b: LookBuilder, x: number, y: number, z: number, r: number, h: number, color: string, sides = 8) {
  b.cylinder(x, y, z, r, r * 0.86, h * 0.45, sides, color)
  b.cylinder(x, y + h * 0.45, z, r * 0.86, r * 0.52, h * 0.35, sides, color)
  b.cylinder(x, y + h * 0.8, z, r * 0.52, 0.05, h * 0.2, sides, color)
}

/** Печь для обжига: кирпичный улей с трубой и огнём в устье. */
function kiln(b: LookBuilder, x: number, z: number, r = 1.4, h = 2.2) {
  b.cylinder(x, 0, z, r + 0.15, r + 0.1, 0.3, 10, C.stone)
  dome(b, x, 0.3, z, r, h, C.brick, 10)
  b.cylinder(x, h * 0.9, z, 0.32, 0.26, 1.1, 6, C.brickDark)
  b.box(x, 0.3, z + r * 0.93, 0.7, 0.75, 0.25, C.dark)
  b.box(x, 0.32, z + r * 0.95, 0.5, 0.42, 0.22, '#ff8f2e', KIND.fire)
  b.smokeAt(x, h * 0.9 + 1.2, z)
  b.lampAt(x, 0, z + r + 0.6)
}

/** Хлебная печь: белёный купол на каменном основании. */
function oven(b: LookBuilder, x: number, z: number, r = 1.1) {
  b.box(x, 0, z, r * 2.3, 0.6, r * 2.3, C.stone)
  dome(b, x, 0.6, z, r, 1.3, C.plaster, 8)
  b.box(x, 0.6, z + r * 0.9, 0.62, 0.6, 0.2, C.dark)
  b.box(x, 0.62, z + r * 0.92, 0.42, 0.3, 0.16, '#ff8f2e', KIND.fire)
  b.cylinder(x, 1.55, z - r * 0.4, 0.24, 0.2, 1.3, 6, C.brick)
  b.smokeAt(x, 2.95, z - r * 0.4)
  b.lampAt(x, 0, z + r + 0.5)
}

/** Стол или верстак. */
function table(b: LookBuilder, x: number, z: number, w = 2, d = 0.8, h = 0.85, top = C.woodLight) {
  b.box(x, h - 0.1, z, w, 0.1, d, top)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), 0.1, h - 0.1, 0.1, C.woodDark)
}

/** Пугало: мешок на шесте в шляпе, рукава висят вниз. Перекладины крестом у него нет. */
function scarecrow(b: LookBuilder, x: number, z: number) {
  b.beam([x, 0, z], [x, 1.1, z], 0.1, C.woodDark)
  b.cylinder(x, 0.95, z, 0.36, 0.3, 0.8, 7, '#9a7b52')
  b.beam([x - 0.3, 1.7, z], [x - 0.62, 1.05, z], 0.14, '#9a7b52')
  b.beam([x + 0.3, 1.7, z], [x + 0.62, 1.05, z], 0.14, '#9a7b52')
  b.cylinder(x, 1.75, z, 0.22, 0.2, 0.36, 6, C.canvas)
  b.cylinder(x, 2.08, z, 0.46, 0.05, 0.3, 6, C.thatch)
}

/** Строительные леса вокруг участка w × d высотой h. */
function scaffold(b: LookBuilder, w: number, d: number, h: number) {
  const x = w / 2
  const z = d / 2
  for (const [px, pz] of [[-x, -z], [x, -z], [-x, z], [x, z], [0, z], [0, -z]]) b.beam([px, 0, pz], [px, h + 0.4, pz], 0.12, C.woodLight)
  for (let y = 1.3; y <= h; y += 1.3) {
    b.beam([-x, y, z], [x, y, z], 0.09, C.woodLight)
    b.beam([-x, y, -z], [x, y, -z], 0.09, C.woodLight)
    b.beam([-x, y, -z], [-x, y, z], 0.09, C.woodLight)
    b.beam([x, y, -z], [x, y, z], 0.09, C.woodLight)
  }
  b.beam([-x, 0, z], [0, Math.min(h, 2.6), z], 0.07, C.wood)
  b.beam([x, 0, -z], [x, Math.min(h, 2.6), z], 0.07, C.wood)
  b.box(0, Math.min(h, 1.3) + 0.04, z + 0.25, w, 0.07, 0.6, C.woodLight)
}

/** Каменный колодезный сруб с водой. */
function stoneRing(b: LookBuilder, x: number, z: number, r = 0.9, h = 0.8, color = C.stoneLight) {
  b.cylinder(x, 0, z, r + 0.12, r + 0.08, 0.18, 10, C.stone)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    b.group([x + Math.sin(a) * r, 0.18, z + Math.cos(a) * r], (a * 180) / Math.PI, () => b.box(0, 0, 0, r * 0.66, h - 0.18, 0.26, i % 2 ? color : C.stone))
  }
  b.cylinder(x, 0.45, z, r - 0.12, r - 0.12, 0.05, 10, '#4f7f8c', KIND.water)
}

/** Ведро. */
function bucket(b: LookBuilder, x: number, z: number) {
  b.cylinder(x, 0, z, 0.2, 0.24, 0.34, 7, C.woodLight)
  b.cylinder(x, 0.28, z, 0.25, 0.25, 0.04, 7, C.iron)
}

// Модели казарм красивы как большие дома, но над входом у них оружие: его убираем.
const peaceful: Painter = (material) => (material === 'Metal_Light' || material === 'Gold' || material === 'White' ? { drop: true } : null)

// ——— Стандартные постройки ———

export interface Level {
  name: string
  look: (variant: number) => LookFn
}

export interface TypeLooks {
  /** Смысл уровней одной строкой: что растёт. */
  levels: Level[]
}

const one = (fn: LookFn) => () => fn

export const LOOKS: Record<string, TypeLooks> = {
  house: {
    levels: [
      {
        name: 'Палатка',
        look: (v) => (b) => {
          b.group([-0.6, 0, -0.4], v % 2 ? 14 : -10, () => tent(b))
          b.model('r/crate', { at: [2.3, 0, 1.2], rot: 20, s: 1.2 })
          b.model('v/bonfire', { at: [2.2, 0, 2.9], s: 1.3 })
          b.model('v/bag', { at: [-2.6, 0, 2], s: 2.2, rot: 40 })
        },
      },
      {
        name: 'Шалаш',
        look: (v) => (b) => {
          b.model(v % 2 ? 'r/houses_first_age_1_level_2' : 'r/houses_first_age_1_level_1', { center: true, at: [-0.5, 0, -0.4] })
          b.model('r/logs', { at: [3, 0, 1.6], s: 0.32, rot: 70 })
          b.model('r/barrel', { at: [2.6, 0, -1.4], s: 1.2 })
          bucket(b, -3, 2.2)
        },
      },
      {
        name: 'Хижина',
        look: (v) => (b) => {
          const model = ['r/houses_first_age_2_level_3', 'r/houses_first_age_1_level_3', 'r/houses_first_age_3_level_3'][v % 3]
          b.model(model, { center: true, at: [0, 0, -0.6] })
          fence(b, -4.2, 4, -1.2, 4)
          fence(b, 1.2, 4, 4.2, 4)
          b.model('r/barrel', { at: [3.6, 0, 2.6], s: 1.2 })
          b.model('r/crate_stack_1', { at: [-3.7, 0, 2.5], s: 1.1, rot: 15 })
          lantern(b, 1.4, 3.4, 2.2)
        },
      },
      {
        name: 'Дом',
        look: (v) => (b) => {
          const model = ['r/houses_second_age_1_level_2', 'r/houses_second_age_2_level_1', 'r/houses_second_age_1_level_1'][v % 3]
          b.model(model, { center: true, at: [0, 0, -0.8], s: 1.12 })
          fenceAround(b, 9, 8.6, 2.4)
          b.model('r/crate_stack_2', { at: [-3.4, 0, 2.2], s: 1.1 })
          b.model('v/bench_1', { at: [2.6, 0, 2.9], rot: 180 })
          lantern(b, -1.6, 3.6)
        },
      },
      {
        name: 'Двухэтажный дом',
        look: (v) => (b) => {
          if (v % 3 === 2) {
            b.model('r/houses_second_age_1_level_3', { center: true, at: [-1.2, 0, -0.6], s: 1.2 })
            b.model('r/houses_second_age_3_level_1', { center: true, at: [2.9, 0, -1.6] })
          } else {
            b.model(v % 3 ? 'v/house_2' : 'v/house_1', { center: true, at: [0, 0, -0.6], s: 1.05 })
            b.smokeAt(0.9, 7.6, -1.2)
          }
          fenceAround(b, 9.2, 9, 2.6)
          b.model('v/bench_1', { at: [-3, 0, 3.2], rot: 180 })
          b.model('r/barrel', { at: [3.6, 0, 2.6], s: 1.2 })
          lantern(b, 1.7, 3.9, 2.8)
          lantern(b, -3.9, -3.6, 2.8)
        },
      },
    ],
  },

  garden: {
    levels: [
      {
        name: 'Грядки',
        look: one((b) => {
          b.model('r/farm_first_age_level_2', { center: true, s: 0.72 })
          b.model('r/farm_first_age_level_2_wheat', { center: 'r/farm_first_age_level_2', s: [0.72, 0.5, 0.72] })
          bucket(b, 3.6, 2.6)
          b.beam([-3.6, 0, 2.8], [-3.3, 1.2, 2.6], 0.07, C.woodDark)
        }),
      },
      {
        name: 'Огород',
        look: one((b) => {
          b.model('r/farm_dirt_level_2', { center: true, s: 0.9 })
          fenceAround(b, 9, 7.6, 2)
          bucket(b, 3.4, 3.2)
          b.model('r/crate', { at: [-3.5, 0, 3.1], s: 1.2 })
        }),
      },
      {
        name: 'Огород с курятником',
        look: one((b) => {
          b.model('r/farm_dirt_level_3', { center: true, at: [-1.1, 0, 0.6], s: [0.72, 0.9, 0.86] })
          b.model('f/chicken_coop', { center: true, at: [3.4, 0, -2.4], rot: -90, s: 1.05 })
          fenceAround(b, 9.4, 8.6, 2)
          scarecrow(b, -1.2, -3.2)
          b.model('r/barrel', { at: [3.6, 0, 2.6], s: 1.2 })
        }),
      },
      {
        name: 'Ферма',
        look: one((b) => {
          b.model('r/farm_second_age_level_1', { center: true, at: [0, 0, -0.4], s: 0.98 })
          b.model('r/farm_second_age_level_1_wheat', { center: 'r/farm_second_age_level_1', at: [0, 0, -0.4], s: 0.98 })
          b.model('r/farm_dirt_level_3', { center: true, at: [0, 0, 3.3], s: [0.9, 0.9, 0.34] })
          scarecrow(b, 3.6, 1.2)
          b.model('v/hay', { at: [-4, 0, 1.4], s: 3 })
          lantern(b, -4.2, -3.4, 2.4)
        }),
      },
      {
        name: 'Большая ферма',
        look: one((b) => {
          b.model('r/farm_second_age_level_3', { center: true, s: 0.94 })
          b.model('r/farm_second_age_level_3_wheat', { center: 'r/farm_second_age_level_3', s: 0.94 })
          b.model('v/cart', { at: [3.9, 0, 3.6], rot: 110 })
          b.model('v/hay', { at: [-4.2, 0, 3.6], s: 3.2 })
          b.model('v/hay', { at: [-3.3, 0, 4.1], s: 2.8, rot: 40 })
          scarecrow(b, 0.6, 3.9)
          lantern(b, -4.4, -4, 2.6)
        }),
      },
    ],
  },

  barn: {
    levels: [
      {
        name: 'Навес с сеном',
        look: one((b) => {
          shelter(b, 4.2, 3.2, 2.7)
          b.model('v/hay', { at: [-1.1, 0, -0.3], s: 3.6 })
          b.model('v/hay', { at: [0.2, 0, -0.5], s: 3.9 })
          b.model('v/hay', { at: [1.3, 0, 0.1], s: 3.3 })
          b.model('v/bags', { at: [2.9, 0, 2.2], s: 2.4, rot: 30 })
        }),
      },
      {
        name: 'Лабаз на сваях',
        look: one((b) => {
          b.model('r/houses_first_age_3_level_1', { center: true, at: [0, 0, -0.5], s: 1.35 })
          b.beam([1.2, 0, 2.6], [1.0, 2.1, 1.6], 0.09, C.woodDark)
          b.beam([1.8, 0, 2.6], [1.6, 2.1, 1.6], 0.09, C.woodDark)
          for (let i = 1; i <= 3; i++) b.beam([1.15 - i * 0.02, i * 0.5, 2.6 - i * 0.24], [1.75 - i * 0.02, i * 0.5, 2.6 - i * 0.24], 0.07, C.woodDark)
          b.model('v/bags', { at: [-2.9, 0, 2.3], s: 2.4 })
          b.model('v/hay', { at: [3.2, 0, 1.6], s: 3.3 })
        }),
      },
      {
        name: 'Сенной сарай',
        look: one((b) => {
          b.model('f/open_barn', { center: true, at: [0, 0, -0.6], s: 1.08 })
          b.model('v/hay', { at: [-1.4, 0, -0.6], s: 4 })
          b.model('v/hay', { at: [0.9, 0, -1.2], s: 4.3 })
          b.model('v/bags', { at: [3.9, 0, 3.5], s: 2.4, rot: 60 })
          fence(b, -4.6, 4.2, -1.6, 4.2)
        }),
      },
      {
        name: 'Амбар',
        look: one((b) => {
          b.model('f/small_barn', { center: true, at: [0, 0, -0.8], s: 1.15 })
          b.model('v/cart', { at: [3.7, 0, 3.8], rot: 100 })
          b.model('v/hay', { at: [-4, 0, 3.6], s: 3.4 })
          b.model('v/bags', { at: [-2.8, 0, 3.9], s: 2.4 })
          lantern(b, 1.9, 3.7)
        }),
      },
      {
        name: 'Большой амбар',
        look: one((b) => {
          b.model('f/big_barn', { center: true, at: [0, 0, -0.7], s: 1.08 })
          b.model('v/cart', { at: [3.9, 0, 4.3], rot: 95 })
          b.model('v/hay', { at: [-4.3, 0, 4], s: 3.6 })
          b.model('v/hay', { at: [-3.4, 0, 4.5], s: 3.2, rot: 30 })
          b.model('r/crate_big_stack_2', { at: [-1.6, 0, 4.4], s: 0.8 })
          lantern(b, 2.2, 4.2, 2.9)
          lantern(b, -2.4, 4.2, 2.9)
        }),
      },
    ],
  },

  sawmill: {
    levels: [
      {
        name: 'Пильные козлы',
        look: one((b) => {
          b.model('v/sawmillsaw', { center: true, at: [0.4, 0, 0], rot: 90, s: 1.25 })
          b.model('r/logs', { at: [-2.6, 0, -2], s: 0.42, rot: 20 })
          b.model('r/resource_tree_group_cut', { center: true, at: [1.6, 0, -2.8], s: 0.5 })
          b.cylinder(-2.6, 0, 2.2, 0.45, 0.4, 0.5, 8, C.wood)
        }),
      },
      {
        name: 'Пильный навес',
        look: one((b) => {
          shelter(b, 5.6, 3.6, 3)
          b.model('v/sawmillsaw', { center: true, at: [0, 0, 0], rot: 90, s: 1.3 })
          b.model('r/logs', { at: [-3.2, 0, 3.3], s: 0.42, rot: 10 })
          b.model('r/logs', { at: [3.1, 0, -3.2], s: 0.36, rot: 90 })
          woodRow(b, 2.8, 3.4, 2.2, 0.7)
        }),
      },
      {
        name: 'Пильный сарай',
        look: one((b) => {
          b.model('r/houses_first_age_2_level_1', { center: true, at: [-1.3, 0, -1], s: 1.25 })
          b.model('v/sawmillsaw', { center: true, at: [2.9, 0, -0.4], s: 1.3 })
          b.model('r/logs', { at: [2.9, 0, 3.4], s: 0.45, rot: 5 })
          b.model('r/resource_pine_tree_group_cut', { center: true, at: [-2.4, 0, 3.4], s: 0.42 })
          woodRow(b, -1.5, 2.2, 2.6, 0.8)
          lantern(b, 0.8, 2.6, 2.4)
        }),
      },
      {
        name: 'Лесопилка',
        look: one((b) => {
          b.model('v/sawmill', { center: true, at: [0, 0, -0.8], s: 0.82 })
          b.model('r/logs', { at: [-3, 0, 3.7], s: 0.5, rot: 8 })
          woodRow(b, 2.6, 3.9, 3, 0.9)
          b.smokeAt(-1.7, 6.2, -1.6)
          lantern(b, 0.4, 3.4)
        }),
      },
      {
        name: 'Лесопильный двор',
        look: one((b) => {
          b.model('v/sawmill', { center: true, at: [-0.4, 0, -1.3], s: 0.92 })
          b.model('r/logs', { at: [-3.4, 0, 4], s: 0.5, rot: 5 })
          b.model('r/logs', { at: [-0.4, 0, 4.2], s: 0.44, rot: -6 })
          woodRow(b, 3.3, 4.1, 2.6, 1.1)
          woodRow(b, 3.3, 3.2, 2.6, 0.8)
          b.model('v/cart', { at: [4.2, 0, 1.2], rot: 190 })
          b.smokeAt(-2.4, 6.9, -2.2)
          lantern(b, 1.2, 3.2, 2.8)
          lantern(b, -4.5, 2.6, 2.8)
        }),
      },
    ],
  },

  woodshed: {
    levels: [
      {
        name: 'Поленница',
        look: one((b) => {
          woodRow(b, 0, -0.6, 3.2, 0.9)
          b.cylinder(1.4, 0, 1.6, 0.42, 0.38, 0.5, 8, C.wood)
          b.beam([1.4, 0.5, 1.6], [1.75, 1.2, 1.45], 0.06, C.woodDark)
          b.box(1.78, 1.1, 1.44, 0.3, 0.16, 0.05, C.iron)
          b.model('r/logs', { at: [-2.4, 0, 2.2], s: 0.3, rot: 30 })
        }),
      },
      {
        name: 'Навес для дров',
        look: one((b) => {
          shelter(b, 4, 2.4, 2.4)
          woodRow(b, 0, -0.5, 3.4, 1.1)
          woodRow(b, 0, 0.4, 3.4, 0.8)
          b.cylinder(2.9, 0, 2.6, 0.42, 0.38, 0.5, 8, C.wood)
          b.model('r/logs', { at: [-3, 0, 2.6], s: 0.3, rot: 20 })
        }),
      },
      {
        name: 'Дровяной сарай',
        look: one((b) => {
          b.box(0, 0, -1.5, 5.2, 2.2, 0.16, C.woodLight)
          b.box(-2.6, 0, -0.2, 0.16, 2.4, 2.8, C.woodLight)
          b.box(2.6, 0, -0.2, 0.16, 2.4, 2.8, C.woodLight)
          b.sheet([-3, 2.9, 1.7], [3, 2.9, 1.7], [3, 2.15, -1.9], [-3, 2.15, -1.9], C.shingle)
          b.box(0, 2.78, 1.7, 6, 0.16, 0.14, C.woodDark)
          b.beam([-2.6, 0, 1.2], [-2.6, 2.75, 1.2], 0.16, C.woodDark)
          b.beam([2.6, 0, 1.2], [2.6, 2.75, 1.2], 0.16, C.woodDark)
          woodRow(b, 0, -1, 4.8, 1.5)
          woodRow(b, 0, -0.1, 4.8, 1.2)
          woodRow(b, 0, 0.8, 4.8, 0.8)
          b.cylinder(3.6, 0, 2.6, 0.42, 0.38, 0.5, 8, C.wood)
          b.model('r/logs', { at: [-3.6, 0, 3], s: 0.32, rot: 15 })
        }),
      },
      {
        name: 'Дровник',
        look: one((b) => {
          b.box(0, 0, -0.4, 6.4, 0.35, 4.2, C.stone)
          b.box(0, 0.35, -2.3, 6, 2.1, 0.18, C.woodLight)
          b.box(-3, 0.35, -0.4, 0.18, 2.1, 3.8, C.woodLight)
          b.box(3, 0.35, -0.4, 0.18, 2.1, 3.8, C.woodLight)
          for (const x of [-3, 0, 3]) b.beam([x, 0.35, 1.5], [x, 2.45, 1.5], 0.18, C.woodDark)
          b.gable(0, 2.45, -0.4, 7, 1.5, 4.8, C.shingle)
          for (let i = 0; i < 4; i++) woodRow(b, 0, -1.7 + i * 0.85, 5.6, 1.7 - i * 0.25)
          b.cylinder(4.2, 0, 3, 0.42, 0.38, 0.5, 8, C.wood)
          lantern(b, -4.2, 2.6, 2.4)
        }),
      },
      {
        name: 'Большой дровник',
        look: one((b) => {
          b.box(0, 0, -0.5, 8.8, 0.4, 4.8, C.stone)
          b.box(0, 0.4, -2.7, 8.4, 2.4, 0.2, C.plaster)
          b.box(-4.2, 0.4, -0.5, 0.2, 2.4, 4.4, C.plaster)
          b.box(4.2, 0.4, -0.5, 0.2, 2.4, 4.4, C.plaster)
          b.box(0, 0.4, -0.5, 0.2, 2.4, 4.4, C.woodLight)
          for (const x of [-4.2, 0, 4.2]) b.beam([x, 0.4, 1.7], [x, 2.8, 1.7], 0.2, C.woodDark)
          b.gable(0, 2.8, -0.5, 9.4, 1.9, 5.4, C.tile)
          for (const side of [-2.1, 2.1]) for (let i = 0; i < 5; i++) woodRow(b, side, -2.2 + i * 0.8, 3.6, 2 - i * 0.28)
          b.model('v/cart', { at: [3.4, 0, 3.9], rot: 100 })
          b.model('r/logs', { at: [-3, 0, 3.9], s: 0.36, rot: 5 })
          lantern(b, 0.3, 2.8, 2.8)
        }),
      },
    ],
  },

  well: {
    levels: [
      {
        name: 'Копаный колодец',
        look: one((b) => {
          for (const [x0, z0, x1, z1] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
            b.beam([x0, 0.12, z0], [x1, 0.12, z1], 0.26, C.wood)
            b.beam([x0, 0.4, z0], [x1, 0.4, z1], 0.24, C.woodDark)
          }
          b.box(0, 0.2, 0, 1.8, 0.05, 1.8, '#4f7f8c', KIND.water)
          bucket(b, 1.9, 0.8)
          b.beam([-1.6, 0, 1.4], [-1.2, 1.5, 0.9], 0.07, C.woodDark)
        }),
      },
      {
        name: 'Колодец с воротом',
        look: one((b) => {
          stoneRing(b, 0, 0)
          b.beam([-1.15, 0, 0], [-1.15, 1.85, 0], 0.16, C.woodDark)
          b.beam([1.15, 0, 0], [1.15, 1.85, 0], 0.16, C.woodDark)
          b.beam([-1.23, 1.85, 0], [1.23, 1.85, 0], 0.2, C.wood)
          b.beam([1.23, 1.85, 0], [1.55, 1.5, 0.2], 0.07, C.iron)
          b.beam([0, 1.7, 0], [0, 0.9, 0], 0.04, C.rope)
          bucket(b, 1.9, 1.3)
        }),
      },
      {
        name: 'Колодец под крышей',
        look: one((b) => {
          b.model('v/well', { center: true, s: 1.5 })
          bucket(b, 1.9, 1.5)
          b.box(-2.2, 0, 1.2, 1.6, 0.4, 0.6, C.woodDark)
          b.box(-2.2, 0.3, 1.2, 1.4, 0.06, 0.4, '#4f7f8c', KIND.water)
        }),
      },
      {
        name: 'Каменный колодец',
        look: one((b) => {
          b.cylinder(0, 0, 0, 2.6, 2.6, 0.12, 12, C.stoneLight)
          b.model('f/well', { center: true, s: 1.6 })
          b.box(-2.4, 0.12, 1.5, 1.8, 0.45, 0.7, C.stone)
          b.box(-2.4, 0.5, 1.5, 1.6, 0.06, 0.5, '#4f7f8c', KIND.water)
          bucket(b, 2.1, 1.7)
          lantern(b, 2.6, -1.8, 2.4)
        }),
      },
      {
        name: 'Колодезный павильон',
        look: one((b) => {
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) b.model('v/path_square', { at: [i * 1.25, 0, j * 1.25], s: 1.18, rot: ((i + j) & 1) * 90 })
          stoneRing(b, 0, 0, 1, 0.9)
          b.model('v/gazebo', { center: true, s: 1.5 })
          b.model('v/bench_1', { at: [-3.6, 0, 0], rot: 90 })
          b.model('v/bench_1', { at: [3.6, 0, 0], rot: -90 })
          b.box(0, 0, 3.4, 2, 0.45, 0.7, C.stone)
          b.box(0, 0.38, 3.4, 1.8, 0.06, 0.5, '#4f7f8c', KIND.water)
          lantern(b, -3.4, 3.4, 2.6)
          lantern(b, 3.4, -3.4, 2.6)
        }),
      },
    ],
  },

  store: {
    levels: [
      {
        name: 'Навес для припасов',
        look: one((b) => {
          shelter(b, 5, 3.6, 2.9)
          b.model('r/crate_big_stack_2', { at: [-1.2, 0, -0.4], s: 0.9 })
          b.model('r/crate_stack_2', { at: [0.6, 0, -0.6], s: 1.3 })
          b.model('r/barrel', { at: [1.7, 0, 0.5], s: 1.3 })
          b.model('r/barrel', { at: [1.9, 0, -0.5], s: 1.3 })
          b.model('r/logs', { at: [-3.4, 0, 3], s: 0.3, rot: 15 })
          bricks(b, 3.3, 2.9)
        }),
      },
      {
        name: 'Сарай',
        look: one((b) => {
          b.model('r/storage_first_age_level_1', { center: true, at: [0, 0, -0.6] })
          b.model('r/crate_stack_1', { at: [3.6, 0, 3.4], s: 1.2 })
          b.model('r/barrel', { at: [-3.8, 0, 3.4], s: 1.2 })
        }),
      },
      {
        name: 'Склад с двором',
        look: one((b) => {
          b.model('r/storage_first_age_leve_3', { center: true, at: [0, 0, -0.4] })
          bricks(b, 3.6, 4)
          b.model('r/logs', { at: [-3.4, 0, 4.1], s: 0.34, rot: 5 })
          lantern(b, -0.6, 4.3, 2.4)
        }),
      },
      {
        name: 'Каменный склад',
        look: one((b) => {
          b.model('r/storage_second_age_level_2', { center: true, at: [0, 0, -0.6], s: 1.08 })
          b.model('r/crate_big_stack_2', { at: [3.7, 0, 3.6], s: 0.8 })
          bricks(b, -3.6, 3.7)
          bricks(b, -3.6, 2.7, 1.1, 0.5)
          lantern(b, 0.9, 3.8)
        }),
      },
      {
        name: 'Большой склад',
        look: one((b) => {
          b.model('r/storage_second_age_level_3', { center: true, at: [0, 0, -0.5], s: 1.04 })
          b.model('v/cart', { at: [3.9, 0, 4.1], rot: 100 })
          bricks(b, -3.8, 4.1)
          b.model('r/logs', { at: [-1, 0, 4.3], s: 0.34, rot: 3 })
          lantern(b, 1.5, 4, 2.8)
          lantern(b, -4.5, 1.4, 2.8)
        }),
      },
    ],
  },

  brickyard: {
    levels: [
      {
        name: 'Яма с глиной',
        look: one((b) => {
          b.cylinder(-2, 0, -1, 1.9, 1.7, 0.08, 9, C.clay)
          b.cylinder(-2, 0.08, -1, 1.3, 1.1, 0.04, 9, '#6f5540')
          b.box(1.8, 0, -1.6, 2.2, 0.12, 1.2, C.woodLight)
          for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.box(1.05 + i * 0.5, 0.12, -1.9 + j * 0.55, 0.36, 0.14, 0.2, C.clay)
          b.box(1.8, 0, 1.8, 1.5, 0.9, 1.1, C.brick)
          b.box(1.8, 0.05, 2.36, 0.5, 0.4, 0.06, '#ff8f2e', KIND.fire)
          b.smokeAt(1.8, 1, 1.8)
          b.lampAt(1.8, 0, 2.9)
          bucket(b, -3.4, 2)
          b.beam([-0.6, 0, 1.6], [-0.3, 1.3, 1.3], 0.07, C.woodDark)
        }),
      },
      {
        name: 'Обжиговая печь',
        look: one((b) => {
          kiln(b, -1.8, -0.8, 1.3, 2)
          b.group([2.3, 0, -0.6], 0, () => {
            shelter(b, 3, 2.6, 2.4)
            bricks(b, -0.6, 0)
            bricks(b, 0.8, -0.2, 1.1, 0.5)
          })
          b.cylinder(-2.4, 0, 3, 1.3, 1.1, 0.08, 8, C.clay)
          bricks(b, 2.2, 3.2, 1.2, 0.5)
        }),
      },
      {
        name: 'Кирпичный двор',
        look: one((b) => {
          kiln(b, -2.2, -1.2, 1.6, 2.6)
          b.model('r/houses_first_age_3_level_3', { center: true, at: [2.5, 0, -1.6], s: 0.62 })
          bricks(b, -3, 3.4)
          bricks(b, -1.2, 3.6, 1.2, 0.5)
          bricks(b, 1.2, 2.8, 1.3, 0.9)
          b.cylinder(3.4, 0, 3.4, 1.2, 1, 0.08, 8, C.clay)
          lantern(b, 0.4, 3.9, 2.4)
        }),
      },
      {
        name: 'Кирпичная мастерская',
        look: one((b) => {
          b.box(1.9, 0, -1.6, 4.6, 0.4, 4.2, C.stone)
          b.box(1.9, 0.4, -1.6, 4.3, 2.4, 3.9, C.brick)
          b.box(1.9, 1.5, -1.6, 4.34, 0.06, 3.94, C.brickDark)
          b.gable(1.9, 2.8, -1.6, 5, 1.5, 4.7, C.shingle)
          b.box(1.9, 0.4, 0.37, 1, 1.7, 0.08, C.dark)
          b.box(3.3, 1.3, 0.37, 0.6, 0.7, 0.08, '#454d55', KIND.window)
          kiln(b, -2.4, -2, 1.5, 2.4)
          kiln(b, -2.6, 1.6, 1.2, 1.9)
          bricks(b, 1.2, 3.4)
          bricks(b, 3, 3.6, 1.2, 0.5)
          lantern(b, 0.2, 1.4, 2.5)
        }),
      },
      {
        name: 'Кирпичный завод',
        look: one((b) => {
          b.box(0.8, 0, -1.8, 7, 0.45, 4.6, C.stone)
          b.box(0.8, 0.45, -1.8, 6.7, 2.9, 4.3, C.brick)
          b.box(0.8, 1.8, -1.8, 6.74, 0.07, 4.34, C.brickDark)
          b.gable(0.8, 3.35, -1.8, 7.5, 1.8, 5.2, C.tile)
          b.box(-0.6, 0.45, 0.37, 1.3, 2, 0.08, C.dark)
          for (const x of [1.4, 2.8]) b.box(x, 1.6, 0.37, 0.7, 0.9, 0.08, '#454d55', KIND.window)
          b.cylinder(3.6, 0.45, -3.2, 0.6, 0.42, 7.2, 8, C.brickDark)
          b.cylinder(3.6, 7.6, -3.2, 0.5, 0.5, 0.2, 8, C.brick)
          b.smokeAt(3.6, 7.9, -3.2)
          kiln(b, -3.4, 2.4, 1.3, 2)
          bricks(b, 0.2, 3.6)
          bricks(b, 1.9, 3.8, 1.3, 0.9)
          bricks(b, 3.6, 3.5, 1.2, 0.5)
          b.model('v/cart', { at: [3.9, 0, 1.8], rot: 150 })
          lantern(b, -1.8, 1.1, 2.8)
        }),
      },
    ],
  },

  workshop: {
    levels: [
      {
        name: 'Верстак под навесом',
        look: one((b) => {
          shelter(b, 4.4, 3, 2.7)
          table(b, -0.4, -0.3, 2.4, 0.9)
          b.box(-1, 0.85, -0.3, 0.5, 0.12, 0.3, C.iron)
          b.cylinder(1.6, 0, 0.3, 0.4, 0.36, 0.55, 8, C.wood)
          b.box(1.6, 0.55, 0.3, 0.5, 0.22, 0.26, C.iron)
          b.box(0, 1.2, -1.45, 3, 0.9, 0.08, C.woodLight)
          for (let i = 0; i < 4; i++) b.box(-1.1 + i * 0.7, 1.4, -1.38, 0.1, 0.55, 0.06, C.iron)
          b.model('r/crate', { at: [3, 0, 2.2], s: 1.3 })
        }),
      },
      {
        name: 'Времянка мастера',
        look: one((b) => {
          b.model('r/houses_first_age_2_level_1', { center: true, at: [-0.8, 0, -0.8], s: 1.25 })
          table(b, 2.9, 0.6, 2, 0.9)
          b.cylinder(2.6, 0, 2.6, 0.4, 0.36, 0.55, 8, C.wood)
          b.box(2.6, 0.55, 2.6, 0.5, 0.22, 0.26, C.iron)
          b.model('r/crate_stack_1', { at: [-3.6, 0, 3], s: 1.2 })
          sign(b, -1.6, 3.6, C.iron, 2.2)
        }),
      },
      {
        name: 'Мастерская',
        look: one((b) => {
          b.model('r/houses_first_age_2_level_3', { center: true, at: [0, 0, -1], s: 1.12 })
          table(b, -2.6, 3.2, 2.2, 0.9)
          b.cylinder(1.4, 0, 3.2, 0.4, 0.36, 0.55, 8, C.wood)
          b.box(1.4, 0.55, 3.2, 0.5, 0.22, 0.26, C.iron)
          b.model('r/crate_stack_2', { at: [3.7, 0, 3], s: 1.2 })
          sign(b, 0, 3.9, C.iron)
          lantern(b, -4.2, 1.4, 2.4)
        }),
      },
      {
        name: 'Кузница',
        look: one((b) => {
          b.model('v/blacksmith', { center: true, at: [0, 0, -0.6], s: 0.9 })
          b.smokeAt(-2.4, 6.4, -1.4)
          b.cylinder(3.3, 0, 3.4, 0.4, 0.36, 0.55, 8, C.wood)
          b.box(3.3, 0.55, 3.4, 0.5, 0.22, 0.26, C.iron)
          b.model('r/barrel', { at: [-3.9, 0, 3.6], s: 1.3 })
          lantern(b, 0.9, 3.8)
        }),
      },
      {
        name: 'Большая мастерская',
        look: one((b) => {
          b.model('v/blacksmith', { center: true, at: [-0.8, 0, -1], s: 0.98 })
          b.smokeAt(-3.4, 7, -1.9)
          b.model('r/storage_first_age_level_1', { center: true, at: [3.2, 0, 2.6], s: 0.5, rot: -90 })
          table(b, -2.6, 4, 2.4, 0.9)
          b.model('v/cart', { at: [0.6, 0, 4.2], rot: 80 })
          sign(b, -4.4, 2.6, C.iron, 2.8)
          lantern(b, 1.6, 2.6, 2.8)
        }),
      },
    ],
  },

  pier: {
    levels: [
      {
        name: 'Мостки',
        look: one((b) => {
          b.model('r/dock_first_age', { center: true, at: [0, 0, SHORE - 3.05] })
          b.model('s/boat', { at: [2.6, WATER, SHORE - 1.6], rot: 20 })
          b.model('r/crate', { at: [-1.6, 0, 0.6], s: 1.2 })
          b.beam([1.7, 0, 0.4], [1.7, 2.2, 0.4], 0.1, C.woodDark)
          b.beam([-0.6, 0, 0.4], [-0.6, 2.2, 0.4], 0.1, C.woodDark)
          b.beam([-0.6, 2.2, 0.4], [1.7, 2.2, 0.4], 0.07, C.rope)
        }),
      },
      { name: 'Рыбацкий причал', look: one((b) => port(b, 'r/port_first_age_level_1', 1)) },
      { name: 'Причал с сушильней', look: one((b) => port(b, 'r/port_first_age_level_3', 2)) },
      { name: 'Пристань', look: one((b) => port(b, 'r/port_second_age_level_1', 2)) },
      { name: 'Рыбная пристань', look: one((b) => port(b, 'r/port_second_age_level_3', 3)) },
    ],
  },

  mill: {
    levels: [
      {
        name: 'Ветряк',
        look: one((b) => {
          b.model('r/windmill_first_age', { s: 0.8, at: [0, 0, -0.6], rotor: { where: (_x, y, z) => z > 0.33 && y > 0.3, pivot: [0.015, 1.245, 0.36] } })
          b.model('v/bags', { at: [2.6, 0, 2], s: 2.4 })
          b.model('v/bag', { at: [-2.4, 0, 2.2], s: 2.4, rot: 50 })
        }),
      },
      {
        name: 'Мельница с лабазом',
        look: one((b) => {
          b.model('r/windmill_first_age', { at: [-1.6, 0, -1], rotor: { where: (_x, y, z) => z > 0.33 && y > 0.3, pivot: [0.015, 1.245, 0.36] } })
          b.model('r/houses_first_age_3_level_1', { center: true, at: [3, 0, -1.4], s: 1.1 })
          fence(b, -4.6, 4, -1.4, 4)
          fence(b, 1.4, 4, 4.6, 4)
          b.model('v/bags', { at: [2.8, 0, 2.4], s: 2.4 })
          b.model('v/cart', { at: [-3.2, 0, 2.6], rot: 60 })
        }),
      },
      {
        name: 'Каменная мельница',
        look: one((b) => {
          b.model('r/windmill_second_age', {
            s: 1.15,
            at: [0, 0, -0.8],
            rotor: { where: (x, y, z) => z > 0.33 && y > 0.2 && !(x > 0.2 && y < 0.32), pivot: [0, 0.915, 0.36] },
          })
          b.model('v/bags', { at: [-3.2, 0, 2.8], s: 2.4 })
          b.model('v/hay', { at: [3.4, 0, 2.6], s: 3.2 })
          lantern(b, 2.6, 3.6, 2.4)
        }),
      },
      {
        name: 'Мельница с двором',
        look: one((b) => {
          b.model('v/mill', { s: 0.86, at: [0, 0, -1.2], rotor: { node: /Blades/, speed: 0.8 } })
          fence(b, -4.6, 4.2, -1.4, 4.2)
          fence(b, 1.4, 4.2, 4.6, 4.2)
          b.model('v/bags', { at: [-3, 0, 2.8], s: 2.4 })
          b.model('v/cart', { at: [3.4, 0, 2.6], rot: 110 })
          lantern(b, 1, 3.6, 2.6)
        }),
      },
      {
        name: 'Большая мельница',
        look: one((b) => {
          b.model('f/tower_windmill', { s: 0.82, at: [-0.4, 0, -1.4], rotor: { node: /Blades/, speed: 0.7 } })
          b.model('r/houses_first_age_3_level_3', { center: true, at: [3.4, 0, 2.2], s: 0.55, rot: -90 })
          b.model('v/bags', { at: [-3.4, 0, 3.4], s: 2.6 })
          b.model('v/cart', { at: [-0.6, 0, 4.2], rot: 80 })
          lantern(b, 1.2, 3.9, 2.8)
          lantern(b, -4.4, 0.8, 2.8)
        }),
      },
    ],
  },

  tavern: {
    levels: [
      {
        name: 'Харчевня под навесом',
        look: one((b) => {
          b.group([0, 0, -2], 0, () => {
            shelter(b, 5, 2.6, 2.8, C.canvas)
            b.model('r/barrel', { at: [-1.6, 0, -0.3], s: 1.4 })
            b.model('r/barrel', { at: [-0.7, 0, -0.5], s: 1.4 })
            table(b, 1.2, -0.2, 2, 0.8)
          })
          for (const x of [-2.2, 2.2]) {
            table(b, x, 2, 2.4, 0.9, 0.8)
            b.model('v/bench_2', { at: [x, 0, 1.1], s: 1.4 })
            b.model('v/bench_2', { at: [x, 0, 2.9], s: 1.4 })
          }
          b.model('v/bonfire_lit', { at: [0, 0, 4], s: 1.5 })
          b.model('v/cauldron', { at: [0, 0.35, 4], s: 1.2 })
          b.fireAt(0, 0.4, 4)
        }),
      },
      {
        name: 'Корчма',
        look: one((b) => {
          b.model('r/barracks_first_age_level_1', { center: true, at: [0, 0, -1.2], s: 1.25, painter: peaceful })
          table(b, -2.8, 3.4, 2.4, 0.9, 0.8)
          b.model('v/bench_2', { at: [-2.8, 0, 4.3], s: 1.4 })
          b.model('r/barrel', { at: [2.6, 0, 3.2], s: 1.4 })
          b.model('r/barrel', { at: [3.5, 0, 3.5], s: 1.4 })
          sign(b, 0.6, 3.8, C.tile)
          lantern(b, -4.4, 1, 2.4)
        }),
      },
      {
        name: 'Трактир',
        look: one((b) => {
          b.model('r/houses_second_age_2_level_2', { center: true, at: [0, 0, -1], s: 1.12 })
          table(b, -2.6, 3.6, 2.4, 0.9, 0.8)
          b.model('v/bench_1', { at: [-2.6, 0, 4.5], rot: 180 })
          b.model('r/barrel', { at: [3.4, 0, 3.6], s: 1.4 })
          sign(b, 1.2, 4, C.tile)
          lantern(b, -4.5, 2, 2.6)
          lantern(b, 4.4, 1.4, 2.6)
        }),
      },
      {
        name: 'Таверна',
        look: one((b) => {
          b.model('v/inn', { center: true, at: [0, 0, -0.8], s: 0.84 })
          b.smokeAt(2.2, 7.4, -1.6)
          b.model('r/barrel', { at: [-3.9, 0, 3.8], s: 1.4 })
          b.model('v/bench_1', { at: [3, 0, 4.1], rot: 180 })
          sign(b, -1.9, 4, C.tile, 2.8)
          lantern(b, 1.2, 4.2, 2.8)
        }),
      },
      {
        name: 'Постоялый двор',
        look: one((b) => {
          b.model('v/inn', { center: true, at: [-0.6, 0, -1.2], s: 0.92 })
          b.smokeAt(1.8, 8.1, -2.1)
          b.group([3.5, 0, 3.4], 0, () => {
            shelter(b, 2.6, 2.2, 2.5, C.canvas)
            table(b, 0, 0, 1.8, 0.8, 0.8)
          })
          table(b, -2.8, 4.1, 2.4, 0.9, 0.8)
          b.model('v/bench_1', { at: [-2.8, 0, 4.9], rot: 180 })
          b.model('r/barrel', { at: [-4.6, 0, 2.4], s: 1.4 })
          sign(b, 0.2, 4.4, C.tile, 3)
          lantern(b, -4.6, 4.4, 2.8)
          lantern(b, 1.6, 4.6, 2.8)
        }),
      },
    ],
  },

  market: {
    levels: [
      {
        name: 'Лоток',
        look: one((b) => {
          b.model('r/market_first_age_level_1', { center: true, s: 1.05 })
          b.model('r/crate', { at: [3.2, 0, 2.4], s: 1.2 })
        }),
      },
      {
        name: 'Торговый ряд',
        look: one((b) => {
          b.model('r/market_first_age_level_2', { center: true, s: 0.98 })
        }),
      },
      {
        name: 'Базар',
        look: one((b) => {
          b.model('r/market_first_age_level_3', { center: true, s: 0.92 })
          lantern(b, 0, 0.2, 2.8)
        }),
      },
      {
        name: 'Крытые ряды',
        look: one((b) => {
          b.model('r/market_second_age_level_2', { center: true, s: 0.94 })
          lantern(b, -4.6, 4.4, 2.8)
          lantern(b, 4.4, -4.4, 2.8)
        }),
      },
      {
        name: 'Рыночная площадь',
        look: one((b) => {
          b.model('r/market_second_age_level_3', { center: true, s: 0.96 })
          b.model('v/cart', { at: [4.4, 0, 4.4], rot: 120 })
          lantern(b, -4.7, 4.6, 3)
          lantern(b, 4.6, -4.6, 3)
          lantern(b, -4.7, -4.6, 3)
        }),
      },
    ],
  },

  bakery: {
    levels: [
      {
        name: 'Хлебная печь',
        look: one((b) => {
          oven(b, -1.6, -0.8)
          b.group([2, 0, -0.6], 0, () => {
            shelter(b, 3, 2.4, 2.5)
            table(b, 0, 0, 2.2, 0.9)
            for (let i = 0; i < 3; i++) b.cylinder(-0.6 + i * 0.6, 0.85, 0, 0.2, 0.16, 0.14, 7, C.bread)
          })
          woodRow(b, -1.6, 2.6, 2, 0.6)
          b.model('v/bags', { at: [2.6, 0, 2.8], s: 2.2 })
        }),
      },
      {
        name: 'Пекарня-хижина',
        look: one((b) => {
          b.model('r/houses_first_age_1_level_3', { center: true, at: [-1, 0, -0.8], s: 1.1 })
          oven(b, 3, 1.2, 1)
          woodRow(b, 3, -2.4, 2, 0.7)
          b.model('v/bags', { at: [-3.4, 0, 3.4], s: 2.2 })
          sign(b, -0.2, 3.6, C.bread, 2.2)
        }),
      },
      {
        name: 'Пекарня',
        look: one((b) => {
          b.model('r/houses_second_age_1_level_1', { center: true, at: [-1, 0, -1], s: 1.2 })
          oven(b, 3.2, 0.6)
          woodRow(b, 3.2, -2.8, 2.2, 0.8)
          table(b, -2.6, 3.4, 2.2, 0.8)
          for (let i = 0; i < 3; i++) b.cylinder(-3.2 + i * 0.6, 0.85, 3.4, 0.2, 0.16, 0.14, 7, C.bread)
          sign(b, 0.4, 3.8, C.bread)
          lantern(b, -4.4, 1.2, 2.4)
        }),
      },
      {
        name: 'Пекарня с лавкой',
        look: one((b) => {
          b.model('r/houses_second_age_3_level_2', { center: true, at: [-0.6, 0, -1], s: 1.05 })
          oven(b, 3.4, 2.6, 1)
          b.model('v/market_stand_1', { at: [-2.8, 0, 3.6], rot: 0 })
          for (let i = 0; i < 3; i++) b.cylinder(-3.3 + i * 0.5, 1.05, 3.5, 0.18, 0.14, 0.13, 7, C.bread)
          sign(b, 0.2, 4.2, C.bread, 2.8)
          lantern(b, 1.4, 4.4, 2.6)
        }),
      },
      {
        name: 'Большая пекарня',
        look: one((b) => {
          b.model('v/house_2', { center: true, at: [-0.8, 0, -0.8], s: 1.05 })
          b.smokeAt(-0.4, 7.4, -1.6)
          oven(b, 3.6, 2.4, 1.1)
          b.model('v/market_stand_1', { at: [-3, 0, 4.2] })
          for (let i = 0; i < 3; i++) b.cylinder(-3.5 + i * 0.5, 1.05, 4.1, 0.18, 0.14, 0.13, 7, C.bread)
          woodRow(b, 3.6, -3.4, 2.2, 0.9)
          sign(b, 0, 4.6, C.bread, 3)
          lantern(b, 1.6, 4.6, 2.8)
        }),
      },
    ],
  },

  tower: {
    levels: [
      { name: 'Вышка', look: one((b) => watch(b, 'r/watch_tower_first_age_level_1', 1.2)) },
      { name: 'Высокая вышка', look: one((b) => watch(b, 'r/watch_tower_first_age_level_2', 1.15)) },
      { name: 'Дозорная башня', look: one((b) => watch(b, 'r/watch_tower_first_age_level_3', 1.1)) },
      { name: 'Каменная башня', look: one((b) => watch(b, 'r/watch_tower_second_age_level_1', 1.25)) },
      { name: 'Сторожевая башня', look: one((b) => watch(b, 'r/watch_tower_second_age_level_3', 1.3)) },
    ],
  },
}

/** Уровень воды относительно берега и расстояние от середины участка до кромки воды. */
const WATER = -0.7
const SHORE = 8.6

function port(b: LookBuilder, key: string, boats: number) {
  // Дальний край причала выносится за кромку воды, какой бы длины ни была модель.
  const dims = modelDims(key)
  const depth = (dims.max[2] - dims.min[2]) * 5
  b.model(key, { center: true, at: [0, 0, SHORE - depth / 2] })
  b.model('s/boat', { at: [4.6, WATER, SHORE - 1.4], rot: 15 })
  if (boats >= 2) b.model('s/boat_w_sail', { at: [-5, WATER, SHORE - 0.6], rot: -25 })
  if (boats >= 3) b.model('s/boat', { at: [-6.4, WATER, SHORE - 2.6], rot: 80 })
  b.model('r/barrel', { at: [3.4, 0, -0.6], s: 1.2 })
  // Вешала с рыбой.
  b.beam([-3.6, 0, -1], [-3.6, 2, -1], 0.1, C.woodDark)
  b.beam([-1.4, 0, -1], [-1.4, 2, -1], 0.1, C.woodDark)
  b.beam([-3.6, 2, -1], [-1.4, 2, -1], 0.07, C.rope)
  for (let i = 0; i < 5; i++) b.box(-3.3 + i * 0.42, 1.35, -1, 0.14, 0.5, 0.05, '#aab2b4')
  if (boats >= 2) lantern(b, 1.2, -0.6, 2.4)
}

function watch(b: LookBuilder, key: string, s: number) {
  b.model(key, { center: true, s })
  fence(b, -3.2, 3.2, -0.9, 3.2)
  fence(b, 0.9, 3.2, 3.2, 3.2)
  lantern(b, 2.2, 2.2, 2.4)
}

export const levelLook = (type: string, level: number, variant = 0): LookFn => LOOKS[type].levels[Math.max(1, Math.min(5, level)) - 1].look(variant)
export const levelName = (type: string, level: number) => LOOKS[type]?.levels[Math.max(1, Math.min(5, level)) - 1]?.name ?? ''

// ——— Центр поселения ———

export const CENTER: { name: string; look: LookFn }[] = [
  {
    name: 'Костёр',
    look: (b) => {
      b.model('v/bonfire_lit', { center: true, s: 2.3 })
      b.fireAt(0, 0.5, 0)
    },
  },
  {
    name: 'Очаг с навесом',
    look: (b) => {
      b.cylinder(0, 0, 0, 3.6, 3.6, 0.1, 12, C.stoneLight)
      b.model('v/gazebo', { center: true, s: 2.1 })
      stoneRing(b, 0, 0, 0.9, 0.5, C.stone)
      b.model('v/bonfire_lit', { center: true, at: [0, 0.3, 0], s: 1.7 })
      b.fireAt(0, 0.9, 0)
      b.model('r/logs', { at: [4.2, 0, -3.6], s: 0.3, rot: 30 })
    },
  },
  {
    name: 'Дом собраний',
    look: (b) => {
      b.model('r/barracks_first_age_level_2', { center: true, s: 1.3, painter: peaceful })
      lantern(b, -2.4, 5.4, 2.8)
      lantern(b, 2.4, 5.4, 2.8)
    },
  },
  {
    name: 'Ратуша',
    look: (b) => {
      b.model('r/barracks_second_age_level_1', { center: true, s: 1.6, painter: peaceful })
      b.flagAt(0, 8.6, 0, C.tile, 1.5, 0.9)
      b.beam([0, 6.6, 0], [0, 9.7, 0], 0.1, C.woodDark)
      lantern(b, -3.6, 6, 3)
      lantern(b, 3.6, 6, 3)
    },
  },
  {
    name: 'Ратуша с башней',
    look: (b) => {
      b.model('r/tower_house_second_age', { center: true, s: 1.7 })
      lantern(b, -4.4, 5.6, 3)
      lantern(b, 4.4, 5.6, 3)
    },
  },
  {
    name: 'Ратуша с часами',
    look: (b) => {
      b.model('r/tower_house_second_age', { center: true, at: [-2.2, 0, 0], s: 1.7 })
      b.model('v/bell_tower', { center: true, at: [5.2, 0, 0.4], s: 1.3 })
      // Циферблаты на двух видимых гранях башни.
      for (const [x, z, rot] of [[5.2, 3.6, 0], [8.1, 0.4, 90]] as const) {
        b.group([x, 8.6, z], rot, () => {
          b.poly(Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * 1.05, Math.sin((i / 12) * Math.PI * 2) * 1.05, 0]), C.plaster)
          b.poly([[-0.05, 0, 0.03], [0.05, 0, 0.03], [0.05, 0.75, 0.03], [-0.05, 0.75, 0.03]], C.dark)
          b.poly([[0, -0.05, 0.03], [0.55, -0.05, 0.03], [0.55, 0.05, 0.03], [0, 0.05, 0.03]], C.dark)
        })
      }
      lantern(b, -5, 5.8, 3)
      lantern(b, 2, 5.8, 3)
    },
  },
]

// ——— Украшения: покупаются в лавке ———

/** Облик украшения по ступени. Ставится у общего костра или на своём месте: см. town.ts. */
export const DECOR: Record<string, (tier: number) => LookFn> = {
  pot: (tier) => (b) => {
    if (tier === 1) {
      // В лагере котелок висит под навесом очага.
      b.model('v/cauldron', { center: true, at: [0, 1.25, 0], s: 1.3 })
      b.beam([0, 1.9, 0], [0, 4, 0], 0.05, C.iron)
      return
    }
    for (const a of [0.4, 2.5, 4.6]) b.beam([Math.sin(a) * 1.25, 0, Math.cos(a) * 1.25], [0, 2.5, 0], 0.09, C.woodDark)
    b.beam([0, 1.45, 0], [0, 2.45, 0], 0.04, C.iron)
    b.model('v/cauldron', { center: true, at: [0, 0.85, 0], s: 1.25 })
  },
  bench: (tier) => (b) => {
    if (tier === 0) {
      b.model('v/bench_2', { at: [-2.6, 0, 0.6], rot: 70, s: 1.4 })
      b.model('v/bench_2', { at: [0.4, 0, -2.6], rot: 5, s: 1.4 })
      return
    }
    const r = tier === 1 ? 4.4 : 2.9
    b.model('v/bench_1', { at: [-r, 0, 0.2], rot: 90 })
    b.model('v/bench_1', { at: [r, 0, 0.2], rot: -90 })
    b.model('v/bench_1', { at: [0, 0, r], rot: 180 })
  },
  signpost: () => (b) => {
    b.cylinder(0, 0, 0, 0.42, 0.34, 0.22, 7, C.stone)
    b.beam([0, 0, 0], [0, 2.9, 0], 0.16, C.woodDark)
    // Стрелки смотрят в разные стороны и висят на разной высоте, друг друга не пересекая.
    b.group([0, 2.35, 0], 20, () => b.box(0.62, 0, 0.1, 1.2, 0.3, 0.07, C.woodLight))
    b.group([0, 1.9, 0], 200, () => b.box(0.58, 0, 0.1, 1.1, 0.28, 0.07, C.plaster))
    b.group([0, 1.47, 0], 110, () => b.box(0.52, 0, 0.1, 1, 0.26, 0.07, C.woodLight))
  },
  flagpole: () => (b) => {
    b.cylinder(0, 0, 0, 0.7, 0.6, 0.35, 8, C.stoneLight)
    b.cylinder(0, 0.35, 0, 0.11, 0.07, 8.2, 6, C.woodDark)
    b.flagAt(0.06, 6.6, 0, C.tile, 2.2, 1.4)
  },
}

// ——— Особые постройки: файлы ———

const dressed = (accent: string): Painter => (material) => {
  if (material === 'Main') return { color: accent }
  if (material === 'Walls') return { color: '#dcd5c6' }
  if (material === 'Stone') return { color: '#bdb6a6' }
  if (material === 'Stone_Light') return { color: '#d0cabb' }
  return null
}

const SPECIAL_MODELS: Record<string, [string, number, string, number]> = {
  cabin: ['r/houses_second_age_3_level_1', 1.15, 'r/houses_second_age_3_level_2', 0.95],
  hall: ['r/storage_second_age_level_2', 0.86, 'r/storage_second_age_level_3', 0.8],
  tower: ['r/watch_tower_second_age_level_1', 1.25, 'r/tower_house_second_age', 0.95],
}

/** Особая постройка по стадии: 0 — участок, 1 — стройка, 2 — построена, 3 — с пристройкой. */
export function specialLook(kind: string, stage: number): LookFn {
  return (b) => {
    const accent = b.ctx.accent ?? '#8c8672'
    const [base, baseScale, grown, grownScale] = SPECIAL_MODELS[kind] ?? SPECIAL_MODELS.cabin
    if (stage === 0) {
      for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) b.beam([x, 0, z], [x, 0.8, z], 0.12, C.woodLight)
      for (const [x0, z0, x1, z1] of [[-2.6, -2.6, 2.6, -2.6], [2.6, -2.6, 2.6, 2.6], [2.6, 2.6, -2.6, 2.6], [-2.6, 2.6, -2.6, -2.6]]) b.beam([x0, 0.7, z0], [x1, 0.7, z1], 0.04, C.rope)
      b.beam([0, 0, 2.9], [0, 1.5, 2.9], 0.1, C.woodDark)
      b.box(0, 0.9, 2.95, 0.9, 0.6, 0.07, accent)
      return
    }
    if (stage === 1) {
      b.box(0, 0, 0, 5.6, 0.3, 5, '#bdb6a6')
      b.box(0, 0.3, -2.3, 5.2, 1.5, 0.3, '#dcd5c6')
      b.box(-2.45, 0.3, 0, 0.3, 1.2, 4.6, '#dcd5c6')
      b.box(2.45, 0.3, 0, 0.3, 0.9, 4.6, '#dcd5c6')
      scaffold(b, 6.2, 5.6, 3.4)
      bricks(b, 3.4, 3.6, 1.1, 0.5, 0.7)
      b.beam([-3.1, 3.8, 2.8], [-3.1, 5.2, 2.8], 0.07, C.woodDark)
      b.flagAt(-3.1, 4.5, 2.8, accent, 0.9, 0.6)
      return
    }
    const painter = dressed(accent)
    if (stage >= 3) b.model(grown, { center: true, at: [0, 0, -0.4], s: grownScale, painter })
    else b.model(base, { center: true, at: [0, 0, -0.4], s: baseScale, painter })
    b.beam([-3.2, 0, 3], [-3.2, 4.4, 3], 0.1, C.woodDark)
    b.flagAt(-3.2, 3.1, 3, accent, 1.5, 1.1)
    lantern(b, 2.8, 3, 2.4)
    if (stage >= 3) {
      b.box(0, 0, 3.4, 3, 0.5, 0.5, '#5f8f4c')
      b.box(3.2, 0, 0.8, 0.5, 0.5, 3, '#5f8f4c')
    }
  }
}

// ——— Стройка ———

/** Новая постройка: фундамент, леса, штабель досок. */
export const constructionLook: LookFn = (b) => {
  b.box(0, 0, -0.4, 6, 0.3, 5, C.stone)
  b.box(0, 0.3, -2.7, 5.6, 1.1, 0.25, C.woodLight)
  b.box(-2.7, 0.3, -0.4, 0.25, 0.8, 4.4, C.woodLight)
  scaffold(b, 6.6, 5.6, 3.2)
  for (let i = 0; i < 4; i++) b.box(3.9, i * 0.09, 3 - i * 0.05, 0.5, 0.08, 2.6, i % 2 ? C.wood : C.woodLight)
  b.model('r/logs', { at: [-3.6, 0, 3.4], s: 0.26, rot: 20 })
}

/** Леса вокруг постройки, которую улучшают. */
export const upgradeLook = (w: number, d: number, h: number): LookFn => (b) => {
  scaffold(b, w + 0.8, d + 0.8, Math.min(h, 7))
  for (let i = 0; i < 4; i++) b.box(w / 2 + 1.3, i * 0.09, d / 2 - 0.4 - i * 0.05, 0.5, 0.08, 2.4, i % 2 ? C.wood : C.woodLight)
}

export { tent, lantern, fence }
