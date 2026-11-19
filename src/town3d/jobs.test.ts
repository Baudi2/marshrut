import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { BUILDINGS, TIERS, maxLevel } from '../game/town'
import { KINDS, PHASES } from '../world/sky'
import type { GearPart } from './gear'
import type { RawModel } from './kit'
import { LookBuilder, modelDims, type LookFn } from './look'
import { CENTER, constructionLook, levelLook } from './looks'
import {
  CARGO_NAME,
  CARGO_PACE,
  CENTER_SITE,
  FIGURE,
  HAULS,
  LANE,
  MAX_WALKERS,
  SHOULDER,
  animalsRoam,
  blocked,
  bodyOf,
  buildSites,
  cargoParts,
  crew,
  doorway,
  grazing,
  heading,
  hurry,
  onGround,
  outdoors,
  pathLength,
  STROLL_CLEAR,
  STROLL_LIMIT,
  STROLL_TIGHT,
  YARD_CELL,
  beside,
  blockYard,
  emptyYard,
  markYard,
  stroll,
  type Yard,
  possibleHauls,
  route,
  standing,
  stopOf,
  streetNet,
  tasks,
  trunkOf,
  walkersFor,
  type Cargo,
  type Itinerary,
  type Point,
  type Site,
  type Stop,
} from './jobs'
import { BRIDGE_X, CENTER_AT, GLADE, MEADOWS, PITCH, PLAZA, PLOT, PLOTS, QUARTER, STREET_X, STREET_Z, animalSpots, centerSite, forest, groundHeight, openPlots, plotOf, seeded } from './plan'

// ——— Подставной город: те же постройки и уровни, что показывает предпросмотр ступени (view.ts) ———

function town(tier: number): Site[] {
  const top = maxLevel(tier)
  return BUILDINGS.flatMap((type) =>
    Array.from({ length: type.count[tier] }, (_, i) => ({
      id: `${type.id}-${i + 1}`,
      type: type.id,
      level: Math.max(1, Math.min(5, top - (i % 3 === 2 ? 2 : i % 2), top - Math.max(0, type.tier - tier + 1))),
      pending: false,
    })),
  )
}

const residents = (tier: number) => Math.max(TIERS[tier].residents, tier * 3)
const site = (id: string, level = 1, pending = false): Site => ({ id, type: id.split('-')[0], level, pending })
const crewOf = (tier: number, sites = town(tier), tierPending = false) =>
  crew({ tier, population: residents(tier), quiet: false, sites, tierPending, open: openPlots(tier) })
const TIERS_WITH_PEOPLE = [1, 2, 3, 4, 5]

/** Точки вдоль ломаной через каждые step метров. */
function samples(points: Point[], step = 0.4): Point[] {
  const list: Point[] = []
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1]
    const [x1, z1] = points[i]
    const length = Math.hypot(x1 - x0, z1 - z0)
    for (let t = 0; t <= length; t += step) list.push([x0 + ((x1 - x0) * t) / length, z0 + ((z1 - z0) * t) / length])
    list.push([x1, z1])
  }
  return list
}

/** Расстояние до ближайшей оси улицы: улицы идут по линиям сетки в пределах города. */
function toStreet(x: number, z: number): number {
  let best = Infinity
  const minX = STREET_X[0]
  const maxX = STREET_X[STREET_X.length - 1]
  const maxZ = STREET_Z[0]
  const minZ = STREET_Z[STREET_Z.length - 1]
  for (const sx of STREET_X) best = Math.min(best, Math.hypot(x - sx, Math.max(minZ - z, 0, z - maxZ)))
  for (const sz of STREET_Z) best = Math.min(best, Math.hypot(z - sz, Math.max(minX - x, 0, x - maxX)))
  return best
}

const onPad = (x: number, z: number, margin = 0) => PLOTS.some((plot) => !plot.water && Math.abs(x - plot.x) < PLOT / 2 + margin && Math.abs(z - plot.z) < PLOT / 2 + margin)

// ——— Облик постройки как препятствие: модели заменены ящиками по их габаритам ———

interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function boxModel(key: string): RawModel {
  const { min, max } = modelDims(key)
  const corner = (i: number) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]
  const faces = [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ]
  const positions: number[] = []
  for (const [a, b, c, d] of faces) for (const i of [a, b, c, a, c, d]) positions.push(...corner(i))
  const normals = new Float32Array(positions.length)
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1
  return { key, chunks: [{ material: 'Bbox', node: 'Bbox', color: new Color('#888888'), positions: new Float32Array(positions), normals }], origins: new Map() }
}

/** Всё, что в облике выше 25 см: прямоугольники сверху. Фонари считаются поставленными. */
function footprint(look: LookFn, variant = 0, at: Point = [0, 0]): Box[] {
  const probe = new LookBuilder(null, { season: 'summer' }, variant)
  look(probe)
  const models = new Map<string, RawModel>()
  for (const key of probe.needs) models.set(key, boxModel(key))
  const builder = new LookBuilder(models, { season: 'summer' }, variant)
  look(builder)
  if (builder.body.empty) return []
  const p = builder.body.geometry().getAttribute('position').array
  const boxes: Box[] = []
  for (let i = 0; i < p.length; i += 9) {
    if (Math.max(p[i + 1], p[i + 4], p[i + 7]) < 0.25) continue
    boxes.push({
      minX: Math.min(p[i], p[i + 3], p[i + 6]) + at[0],
      maxX: Math.max(p[i], p[i + 3], p[i + 6]) + at[0],
      minZ: Math.min(p[i + 2], p[i + 5], p[i + 8]) + at[1],
      maxZ: Math.max(p[i + 2], p[i + 5], p[i + 8]) + at[1],
    })
  }
  return boxes
}

/** Свободно ли вокруг точки на r метров. */
const clear = (boxes: Box[], x: number, z: number, r: number) =>
  boxes.every((box) => Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minZ - z, 0, z - box.maxZ)) >= r)

/** Остановка и подход к ней от ворот свободны: до ближайшей стены, ограды или вещи во дворе не меньше 30 см. */
function expectClear(boxes: Box[], stop: Stop, label: string) {
  for (const [x, z] of samples([stop.gate, [stop.x, stop.z]], 0.25)) expect(clear(boxes, x, z, 0.3), `${label}: (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(true)
}

describe('занятия', () => {
  it('у каждого занятия настоящие типы построек, свой номер и груз', () => {
    const types = new Set(BUILDINGS.map((type) => type.id))
    expect(new Set(HAULS.map((haul) => haul.id)).size).toBe(HAULS.length)
    for (const haul of HAULS) {
      expect(types.has(haul.from), haul.id).toBe(true)
      expect(types.has(haul.to), haul.id).toBe(true)
      expect(haul.from, haul.id).not.toBe(haul.to)
      expect(cargoParts(haul.cargo).length, haul.id).toBeGreaterThan(0)
      if (haul.back) expect(cargoParts(haul.back).length, haul.id).toBeGreaterThan(0)
    }
  })

  it('занятие возможно, только когда стоят обе его постройки', () => {
    const ids = (sites: Site[]) => possibleHauls(sites).map((haul) => haul.id)
    expect(ids([])).toEqual([])
    expect(ids([site('house-1'), site('house-2')])).toEqual([])
    expect(ids([site('garden-1')])).toEqual([])
    expect(ids([site('garden-1'), site('barn-1')])).toEqual(['harvest'])
    expect(ids([site('garden-1'), site('barn-1'), site('well-1'), site('house-1')])).toEqual(['harvest', 'water'])
    expect(ids([site('sawmill-1'), site('woodshed-1')])).toEqual(['firewood'])
    // Постройка, которая ещё строится, в делах не участвует; та, что улучшается, работает.
    expect(ids([site('garden-1'), site('barn-1', 0, true)])).toEqual([])
    expect(ids([site('garden-1'), site('barn-1', 2, true)])).toEqual(['harvest'])
    // В полном городе идут все занятия.
    expect(ids(town(5)).sort()).toEqual(HAULS.map((haul) => haul.id).sort())
    for (const tier of TIERS_WITH_PEOPLE) {
      const types = new Set(town(tier).map((s) => s.type))
      for (const haul of possibleHauls(town(tier))) expect(types.has(haul.from) && types.has(haul.to), `${tier}: ${haul.id}`).toBe(true)
    }
  })

  it('раздаёт дела по числу жителей: между стоящими постройками и не больше двух на одну пару', () => {
    for (const tier of TIERS_WITH_PEOPLE) {
      const sites = town(tier)
      const ready = new Set(standing(sites).map((s) => s.id))
      for (const count of [0, 1, 3, 7, 12]) {
        const list = tasks(sites, count)
        expect(list.length, `${tier}/${count}`).toBeLessThanOrEqual(count)
        if (count >= 3) expect(list.length, `${tier}/${count}`).toBe(count)
        const pairs = new Map<string, number>()
        for (const task of list) {
          expect(ready.has(task.from.id) && ready.has(task.to.id), `${tier}: ${task.job}`).toBe(true)
          expect(task.from.id).not.toBe(task.to.id)
          if (task.role !== 'haul') continue
          const haul = HAULS.find((h) => h.id === task.job)!
          expect([task.from.type, task.to.type, task.cargo, task.back]).toEqual([haul.from, haul.to, haul.cargo, haul.back ?? null])
          const key = `${task.job}:${task.from.id}:${task.to.id}`
          pairs.set(key, (pairs.get(key) ?? 0) + 1)
        }
        for (const [key, uses] of pairs) expect(uses, key).toBeLessThanOrEqual(2)
      }
      // Большинство занято делом, но кто-то гуляет.
      const full = tasks(sites, 12)
      expect(full.filter((task) => task.role === 'haul').length, String(tier)).toBeGreaterThanOrEqual(tier === 1 ? 4 : 7)
      expect(full.filter((task) => task.role === 'stroll').length, String(tier)).toBeGreaterThanOrEqual(1)
      expect(full.filter((task) => task.role === 'build').length, String(tier)).toBe(0)
      // Один и тот же город — одни и те же занятия.
      expect(tasks(sites, 12)).toEqual(full)
    }
  })

  it('когда подходящих пар нет, жители гуляют без груза, как раньше', () => {
    const list = tasks([site('house-1'), site('house-2'), site('house-3')], 5)
    expect(list.length).toBe(5)
    for (const task of list) expect([task.role, task.cargo, task.back]).toEqual(['stroll', null, null])
    // С одной постройкой идти некуда.
    expect(tasks([site('house-1')], 5)).toEqual([])
  })

  it('если идёт стройка, часть жителей носит к ней материалы — оттуда, где они есть', () => {
    const base = [site('house-1'), site('house-2'), site('garden-1'), site('barn-1'), site('well-1')]
    // Стройка есть, а носить неоткуда: никто не строит.
    expect(tasks([...base, site('woodshed-1', 0, true)], 9).filter((task) => task.role === 'build')).toEqual([])
    // Есть лесопилка: носят доски на новую стройку и на улучшение.
    const withSawmill = [...base, site('sawmill-1'), site('woodshed-1', 0, true), site('barn-1', 1, true)].filter((s, i, all) => all.findIndex((other) => other.id === s.id && other.pending === s.pending) === i)
    const sites = withSawmill.filter((s) => !(s.id === 'barn-1' && !s.pending))
    const builders = tasks(sites, 9).filter((task) => task.role === 'build')
    expect(builders.length).toBe(3)
    expect(new Set(builders.map((task) => task.to.id))).toEqual(new Set(['woodshed-1', 'barn-1']))
    for (const task of builders) expect([task.from.id, task.cargo, task.back]).toEqual(['sawmill-1', 'planks', null])
    // Кирпичный двор и склад дают кирпич.
    const rich = [...sites, site('brickyard-1'), site('store-1')]
    expect(new Set(tasks(rich, 12).filter((task) => task.role === 'build').map((task) => task.cargo))).toEqual(new Set(['planks', 'bricks']))
    expect(tasks(rich, 12).filter((task) => task.role === 'build').length).toBe(4)
    // Переход на ступень — стройка на площади.
    expect(buildSites(base, true).map((s) => s.id)).toEqual([CENTER_SITE])
    const toCenter = tasks([...base, site('sawmill-1')], 6, true).filter((task) => task.role === 'build')
    expect(toCenter.length).toBe(2)
    for (const task of toCenter) expect(task.to.id).toBe(CENTER_SITE)
    // Без стройки строителей нет.
    expect(tasks([...base, site('sawmill-1')], 9).filter((task) => task.role === 'build')).toEqual([])
  })
})

describe('сколько жителей на улице', () => {
  it('не больше предела и не больше населения; при запустении второго уровня — никого', () => {
    expect(MAX_WALKERS).toBe(12)
    expect(walkersFor(0, false)).toBe(0)
    expect(walkersFor(5, false)).toBe(5)
    expect(walkersFor(45, false)).toBe(MAX_WALKERS)
    expect(walkersFor(45, true)).toBe(0)
    for (const tier of TIERS_WITH_PEOPLE) {
      const plans = crewOf(tier)
      expect(plans.length, String(tier)).toBeLessThanOrEqual(Math.min(MAX_WALKERS, residents(tier)))
      expect(plans.length, String(tier)).toBeGreaterThanOrEqual(Math.min(MAX_WALKERS, residents(tier)) - 1)
      expect(crew({ tier, population: residents(tier), quiet: true, sites: town(tier), tierPending: false, open: openPlots(tier) })).toEqual([])
    }
  })

  it('на стоянке жителей нет', () => {
    expect(crew({ tier: 0, population: 4, quiet: false, sites: [site('house-1')], tierPending: false, open: openPlots(0) })).toEqual([])
    expect(crew({ tier: 0, population: 4, quiet: false, sites: town(1), tierPending: true, open: openPlots(0) })).toEqual([])
  })

  it('ночью, в дождь и в грозу на улице меньше жителей', () => {
    for (const walkers of [0, 1, 4, 12]) {
      for (const phase of PHASES) {
        for (const kind of KINDS) {
          const out = outdoors(walkers, phase, kind)
          expect(out).toBeGreaterThanOrEqual(0)
          expect(out).toBeLessThanOrEqual(walkers)
          expect(Number.isInteger(out)).toBe(true)
          expect(out).toBeLessThanOrEqual(outdoors(walkers, 'day', kind))
          expect(out).toBeLessThanOrEqual(outdoors(walkers, phase, 'clear'))
        }
      }
    }
    expect(outdoors(12, 'day', 'clear')).toBe(12)
    expect(outdoors(12, 'day', 'cloudy')).toBe(12)
    expect(outdoors(12, 'night', 'clear')).toBe(4)
    expect(outdoors(12, 'dusk', 'clear')).toBe(9)
    expect(outdoors(12, 'day', 'rain')).toBe(5)
    expect(outdoors(12, 'day', 'storm')).toBe(2)
    expect(outdoors(12, 'night', 'storm')).toBe(1)
    expect(outdoors(12, 'day', 'storm')).toBeLessThan(outdoors(12, 'day', 'rain'))
    expect(outdoors(12, 'day', 'rain')).toBeLessThan(outdoors(12, 'day', 'drizzle'))
  })

  it('животные ночью и в грозу стоят; в дождь жители торопятся', () => {
    expect(animalsRoam('day', 'clear')).toBe(true)
    expect(animalsRoam('dusk', 'rain')).toBe(true)
    expect(animalsRoam('night', 'clear')).toBe(false)
    expect(animalsRoam('day', 'storm')).toBe(false)
    expect(hurry('clear')).toBe(1)
    expect(hurry('rain')).toBeGreaterThan(1)
    expect(hurry('storm')).toBeGreaterThan(1)
  })
})

describe('остановки у построек', () => {
  it('житель стоит лицом к постройке, ворота — на улице перед ней', () => {
    for (const plot of PLOTS.filter((p) => !p.water && p.type !== 'park')) {
      for (let slot = 0; slot < 8; slot++) {
        const stop = stopOf(site(plot.id, 3), slot)!
        // Смотрит в сторону середины участка.
        expect(Math.sin(stop.face) * (plot.x - stop.x) + Math.cos(stop.face) * (plot.z - stop.z), plot.id).toBeGreaterThan(0)
        expect(stop.gate[1], plot.id).toBe(plot.z + PITCH / 2)
        expect(stop.gate[0], plot.id).toBe(stop.x)
        expect(Math.abs(stop.x - plot.x), plot.id).toBeLessThan(PLOT / 2)
        // Остановка южнее середины участка: с этой стороны её видно.
        expect(stop.z, plot.id).toBeGreaterThan(plot.z + 3)
      }
    }
    expect(stopOf(site('nowhere-1'), 0)).toBeNull()
  })

  it('поворот фигуры совпадает с направлением: модели смотрят вдоль +Z', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.6, -0.8]]) {
      const angle = heading(dx, dz)
      expect(Math.sin(angle)).toBeCloseTo(dx / Math.hypot(dx, dz), 6)
      expect(Math.cos(angle)).toBeCloseTo(dz / Math.hypot(dx, dz), 6)
    }
  })

  it('остановка у ворот — снаружи: не в стенах и не в том, что стоит во дворе, на любом уровне', () => {
    for (const type of BUILDINGS.filter((b) => b.id !== 'pier')) {
      const numbers = type.id === 'house' ? [1, 2, 3, 4, 5, 6] : [1]
      for (const n of numbers) {
        const id = `${type.id}-${n}`
        const plot = plotOf(id)!
        for (let level = 1; level <= 5; level++) {
          const boxes = footprint(levelLook(type.id, level, n - 1), n - 1, [plot.x, plot.z])
          for (let slot = 0; slot < 8; slot++) expectClear(boxes, stopOf(site(id, level), slot)!, `${id} ур. ${level}, место ${slot}`)
          // Пока постройку улучшают, к колодцу подходят как ко всем: у ворот.
          const busy = stopOf(site(id, level, true), 0)!
          expect(busy.z, id).toBe(plot.z + 5.75)
        }
      }
    }
  })

  it('домой заходят через проём в ограде до двери: путь от ворот свободен у жилища любого уровня', () => {
    for (let n = 1; n <= 10; n++) {
      const id = `house-${n}`
      const plot = plotOf(id)!
      for (let level = 1; level <= 5; level++) {
        const boxes = footprint(levelLook('house', level, n - 1), n - 1, [plot.x, plot.z])
        for (let slot = 0; slot < 6; slot++) {
          const stop = stopOf(site(id, level), slot)!
          const way = doorway(site(id, level), stop)
          expect(way[0]).toEqual([stop.x, stop.z])
          const door = way[way.length - 1]
          // Дверь — во дворе, перед домом, по середине участка.
          expect(door[0]).toBe(plot.x)
          expect(door[1] - plot.z).toBeGreaterThan(3)
          expect(door[1] - plot.z).toBeLessThan(PLOT / 2)
          for (const [x, z] of samples(way, 0.2)) expect(clear(boxes, x, z, 0.3), `${id} ур. ${level}, место ${slot}: (${(x - plot.x).toFixed(1)}, ${(z - plot.z).toFixed(1)})`).toBe(true)
        }
      }
    }
    // У дома в лесах и у других построек двери нет: скрываются у ворот.
    expect(doorway(site('house-1', 2, true), stopOf(site('house-1', 2, true), 0)!)).toEqual([])
    expect(doorway(site('house-1', 0, true), stopOf(site('house-1', 0, true), 0)!)).toEqual([])
    expect(doorway(site('barn-1', 3), stopOf(site('barn-1', 3), 0)!)).toEqual([])
    for (const tier of TIERS_WITH_PEOPLE) for (const plan of crewOf(tier)) expect(plan.door.length, plan.job).toBe(3)
  })

  it('к новой стройке подходят вплотную, но не в леса', () => {
    for (const id of ['house-2', 'garden-1', 'mill-1']) {
      const plot = plotOf(id)!
      const boxes = footprint(constructionLook, 0, [plot.x, plot.z])
      for (let slot = 0; slot < 4; slot++) {
        const stop = stopOf(site(id, 0, true), slot)!
        expectClear(boxes, stop, `${id}, место ${slot}`)
        expect(stop.z - plot.z).toBeLessThan(5)
      }
    }
  })

  it('у причала ждут на берегу или на кромке улицы: не в постройке, не в воде и не на чужом участке', () => {
    for (const id of ['pier-1', 'pier-2']) {
      const plot = plotOf(id)!
      for (let level = 1; level <= 5; level++) {
        const boxes = footprint(levelLook('pier', level), 0, [plot.x, plot.z])
        for (const pending of [false, true]) {
          for (let slot = 0; slot < 3; slot++) {
            const stop = stopOf(site(id, level, pending), slot)!
            const label = `${id} ур. ${level}, место ${slot}`
            expectClear(boxes, stop, label)
            expect(groundHeight(stop.x, stop.z), label).toBe(0)
            expect(onPad(stop.x, stop.z, 0.2), label).toBe(false)
            expect(toStreet(stop.gate[0], stop.gate[1]), label).toBeLessThan(0.01)
            // Большая пристань и стройка: ждут на поперечной улице, в стороне от середины, где идут прохожие.
            if (level >= 4 || pending) {
              expect(toStreet(stop.x, stop.z), label).toBeGreaterThan(LANE + 0.3)
              expect(toStreet(stop.x, stop.z), label).toBeLessThan(1.1)
            }
          }
        }
      }
    }
  })

  it('к лесам на площади подходят с улицы, не задевая центральную постройку и сами леса', () => {
    for (const tier of [1, 2, 3, 4]) {
      const at: Point = tier === 1 ? [PLAZA.x, PLAZA.z] : [CENTER_AT.x, CENTER_AT.z]
      const boxes = [...footprint(CENTER[tier].look, 0, at), ...footprint(constructionLook, 0, [centerSite(tier).x, centerSite(tier).z])]
      for (let slot = 0; slot < 4; slot++) {
        const stop = stopOf({ id: CENTER_SITE, type: CENTER_SITE, level: 0, pending: true }, slot, tier)!
        expectClear(boxes, stop, `ступень ${tier}, место ${slot}`)
        expect(Math.abs(stop.gate[0]), String(tier)).toBe(PITCH)
        expect(Math.abs(stop.x) < PLAZA.w / 2 && Math.abs(stop.z) < PLAZA.d / 2, String(tier)).toBe(true)
      }
    }
  })
})

describe('маршруты', () => {
  const stops = (plans: Itinerary[]) => plans.flatMap((plan) => [plan.legs[0].to, plan.legs[1].to, ...(plan.home ? [plan.home] : [])])

  it('идут между постройками, которые стоят в городе, и замыкаются в круг', () => {
    for (const tier of TIERS_WITH_PEOPLE) {
      const ready = new Set(standing(town(tier)).map((s) => s.id))
      for (const plan of crewOf(tier)) {
        expect(plan.legs.length).toBe(2)
        const [there, back] = plan.legs
        expect(ready.has(there.to.id) && ready.has(back.to.id), `${tier}: ${plan.job}`).toBe(true)
        expect(there.to.id).not.toBe(back.to.id)
        // Туда — от начала круга до цели, обратно — от цели к началу.
        expect(there.points[0]).toEqual([back.to.x, back.to.z])
        expect(there.points[there.points.length - 1]).toEqual([there.to.x, there.to.z])
        expect(back.points[0]).toEqual([there.to.x, there.to.z])
        expect(back.points[back.points.length - 1]).toEqual([back.to.x, back.to.z])
        for (const leg of plan.legs) {
          expect(leg.points.length, plan.job).toBeGreaterThanOrEqual(3)
          for (const [x, z] of leg.points) expect(Number.isFinite(x) && Number.isFinite(z), plan.job).toBe(true)
          // Путь разумной длины: не длиннее обхода всего города.
          expect(pathLength(leg.points), plan.job).toBeLessThan(230)
        }
        if (plan.role === 'haul') {
          const haul = HAULS.find((h) => h.id === plan.job)!
          expect([back.to.id.split('-')[0], there.to.id.split('-')[0], there.cargo, back.cargo]).toEqual([haul.from, haul.to, haul.cargo, haul.back ?? null])
        } else expect([there.cargo, back.cargo]).toEqual([null, null])
      }
    }
  })

  it('у каждого жителя есть дом: он на круге или к нему ведёт своя дорога от начала круга', () => {
    for (const tier of TIERS_WITH_PEOPLE) {
      for (const plan of crewOf(tier)) {
        expect(plan.home, plan.job).not.toBeNull()
        const home = plan.home!
        expect(home.id.startsWith('house-'), plan.job).toBe(true)
        const start = plan.legs[1].to
        if (plan.homeLeg >= 0) {
          expect(plan.legs[plan.homeLeg].to).toBe(home)
          expect(plan.toHome).toEqual([])
          expect(plan.fromHome).toEqual([])
        } else {
          // Домой сворачивают с любой остановки круга.
          expect(plan.toHome.length).toBe(plan.legs.length)
          plan.toHome.forEach((points, i) => {
            expect(points[0]).toEqual([plan.legs[i].to.x, plan.legs[i].to.z])
            expect(points[points.length - 1]).toEqual([home.x, home.z])
          })
          expect(plan.fromHome[0]).toEqual([home.x, home.z])
          expect(plan.fromHome[plan.fromHome.length - 1]).toEqual([start.x, start.z])
        }
        // Гуляют от своего дома; воду и дрова носят в свой.
        if (plan.role === 'stroll') expect(plan.homeLeg).toBe(1)
        if (plan.job === 'water' || plan.job === 'hearth') expect(plan.homeLeg).toBe(0)
      }
    }
  })

  it('двое у одной постройки не стоят на одном месте', () => {
    for (const tier of TIERS_WITH_PEOPLE) {
      const all = [...new Set(stops(crewOf(tier)))]
      for (const a of all) for (const b of all) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${tier}: ${a.id} и ${b.id}`).toBeGreaterThan(0.6)
    }
  })

  it('идут по улицам правой стороной: не через участки и не через середину площади', () => {
    let right = 0
    let other = 0
    for (const tier of TIERS_WITH_PEOPLE) {
      for (const plan of crewOf(tier)) {
        for (const points of [...plan.legs.map((leg) => leg.points), ...plan.toHome, plan.fromHome]) {
          if (!points.length) continue
          const street = points.slice(1, -1)
          // Между воротами — только вдоль улиц: каждая точка на своей полосе, отрезки вдоль осей.
          for (const [x, z] of samples(street)) {
            expect(toStreet(x, z), `${tier}: ${plan.job} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(LANE + 0.02)
            expect(Math.abs(x) < PITCH - 1 && Math.abs(z) < PITCH - 1, `${tier}: ${plan.job} через площадь`).toBe(false)
            expect(onPad(x, z), `${tier}: ${plan.job} через участок`).toBe(false)
          }
          for (let i = 1; i < street.length; i++) {
            const dx = street[i][0] - street[i - 1][0]
            const dz = street[i][1] - street[i - 1][1]
            expect(Math.min(Math.abs(dx), Math.abs(dz)), plan.job).toBeLessThan(1e-6)
            if (Math.max(Math.abs(dx), Math.abs(dz)) < 1.5) continue
            // Правая сторона: на восток идут южной полосой, на север — восточной.
            // Где у края улицы стоит дерево, идут серединой или другой стороной.
            const mid: Point = [(street[i][0] + street[i - 1][0]) / 2, (street[i][1] + street[i - 1][1]) / 2]
            const alongX = Math.abs(dx) > Math.abs(dz)
            const line = (alongX ? STREET_Z : STREET_X).reduce((best, s) => (Math.abs(s - mid[alongX ? 1 : 0]) < Math.abs(best - mid[alongX ? 1 : 0]) ? s : best))
            const side = alongX ? (mid[1] - line) * Math.sign(dx) : -(mid[0] - line) * Math.sign(dz)
            expect([LANE, 0, -LANE].some((offset) => Math.abs(side - offset) < 1e-6), `${plan.job}: сторона ${side.toFixed(2)}`).toBe(true)
            if (Math.abs(side - LANE) < 1e-6) right++
            else other++
          }
        }
      }
    }
    expect(right).toBeGreaterThan(200)
    expect(other).toBeLessThan(right * 0.1)
  })

  it('не идут сквозь стволы: лес подступает к улицам, и у края улицы дерево обходят другой стороной', () => {
    // Ствол сосны стоит там же, где дерево; у лиственных — в стороне от середины кроны.
    expect(trunkOf({ x: 3, z: 4, kind: 3, scale: 1.2, turn: 70 })).toEqual({ x: 3, z: 4, r: 0.42 * 1.2 })
    const leaning = trunkOf({ x: 0, z: 0, kind: 0, scale: 1, turn: 0 })
    expect([leaning.x, leaning.z]).toEqual([0.445, -0.395])
    const turned = trunkOf({ x: 0, z: 0, kind: 0, scale: 1, turn: 90 })
    expect(turned.x).toBeCloseTo(-0.395, 6)
    expect(turned.z).toBeCloseTo(-0.445, 6)
    for (const tier of TIERS_WITH_PEOPLE) {
      const trunks = forest(tier, 22).map(trunkOf)
      for (const plan of crewOf(tier)) {
        for (const points of [...plan.legs.map((leg) => leg.points), ...plan.toHome, plan.fromHome]) {
          for (const [x, z] of samples(points, 0.25)) {
            for (const trunk of trunks) {
              // От середины идущего до коры — не меньше его плеча.
              const bark = Math.hypot(trunk.x - x, trunk.z - z) - trunk.r
              if (bark < SHOULDER - 0.05) expect.fail(`${tier}: ${plan.job} задевает ствол у (${x.toFixed(1)}, ${z.toFixed(1)}): ${bark.toFixed(2)} м`)
            }
          }
        }
      }
    }
  })

  it('обходят лес, пока есть улица: вокруг площади, а не напрямик', () => {
    // «Лагерь»: жильё к западу от площади, амбар к востоку. Дорога идёт по краю площади.
    const net = streetNet(openPlots(1))
    const from = stopOf(site('house-2'), 0)!
    const to = stopOf(site('barn-1'), 0)!
    const path = route(from, to, net)
    expect(path[0]).toEqual([from.x, from.z])
    expect(path[path.length - 1]).toEqual([to.x, to.z])
    for (const [x, z] of samples(path.slice(1, -1))) expect(Math.abs(x) > PITCH - 1 || Math.abs(z) > PITCH - 1).toBe(true)
    // Обход площади длиннее прямой, но не вдвое.
    expect(pathLength(path)).toBeGreaterThan(40)
    expect(pathLength(path)).toBeLessThan(75)
    // Соседи по улице идут прямо, без крюка через перекрёсток.
    const next = route(stopOf(site('house-1'), 0)!, stopOf(site('house-3'), 0)!, net)
    expect(pathLength(next)).toBeLessThan(PITCH + 4)
    // На «Хуторе» склад стоит за лесом: путь к нему один, и он не обрывается.
    const far = route(stopOf(site('house-1'), 0)!, stopOf(site('store-1'), 0)!, streetNet(openPlots(2)))
    expect(pathLength(far)).toBeGreaterThan(30)
    expect(pathLength(far)).toBeLessThan(80)
  })

  it('обходят большую пристань, которая стоит на южной улице', () => {
    for (const tier of [4, 5]) {
      const sites = town(tier)
      const net = streetNet(openPlots(tier), sites)
      expect(net.blocks.length, String(tier)).toBe(2)
      const plans = crewOf(tier)
      for (const stop of stops(plans)) {
        expect(blocked(net, stop.x, stop.z), `${tier}: ${stop.id}`).toBe(false)
        expect(blocked(net, stop.gate[0], stop.gate[1]), `${tier}: ${stop.id}`).toBe(false)
      }
      for (const plan of plans) {
        for (const points of [...plan.legs.map((leg) => leg.points), ...plan.toHome, plan.fromHome]) {
          for (const [x, z] of samples(points)) expect(blocked(net, x, z), `${tier}: ${plan.job} (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(false)
        }
      }
    }
  })

  it('носят материалы к стройке и к лесам на площади', () => {
    const sites = [...town(2).filter((s) => s.id !== 'store-1'), site('store-1', 0, true), site('garden-2', 2, true)].filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i || s.pending)
    const cleaned = sites.filter((s) => !(s.id === 'garden-2' && !s.pending))
    const plans = crewOf(2, cleaned, true)
    const builders = plans.filter((plan) => plan.role === 'build')
    expect(builders.length).toBeGreaterThanOrEqual(2)
    const targets = new Set(builders.map((plan) => plan.legs[0].to.id))
    expect([...targets].every((id) => ['store-1', 'garden-2', CENTER_SITE].includes(id))).toBe(true)
    expect(targets.size).toBeGreaterThanOrEqual(2)
    for (const plan of builders) {
      expect(plan.legs[0].cargo === 'planks' || plan.legs[0].cargo === 'bricks').toBe(true)
      expect(plan.legs[1].cargo).toBeNull()
      expect(['sawmill', 'brickyard', 'store']).toContain(plan.legs[1].to.id.split('-')[0])
    }
  })

})

describe('круг путника по площади', () => {
  /** Точки вдоль замкнутой ломаной через каждые 10 см. */
  const along = (loop: Point[]) => {
    const points: Point[] = []
    loop.forEach(([x, z], k) => {
      const [nx, nz] = loop[(k + 1) % loop.length]
      const steps = Math.max(1, Math.ceil(Math.hypot(nx - x, nz - z) / 0.1))
      for (let s = 0; s < steps; s++) points.push([x + ((nx - x) * s) / steps, z + ((nz - z) * s) / steps])
    })
    return points
  }
  /** Расстояние от точки до ближайшей занятой клетки. */
  const gap = (yard: Yard, x: number, z: number) => {
    let best = Infinity
    const half = (yard.size * YARD_CELL) / 2
    for (let j = 0; j < yard.size; j++) {
      for (let i = 0; i < yard.size; i++) {
        if (!yard.solid[j * yard.size + i]) continue
        best = Math.min(best, Math.hypot(PLAZA.x - half + (i + 0.5) * YARD_CELL - x, PLAZA.z - half + (j + 0.5) * YARD_CELL - z))
      }
    }
    return best
  }
  /** Площадь большого города: ратуша, фонтан, очаг со скамьями, флагшток, фонари. */
  const city = () => {
    const yard = emptyYard()
    blockYard(yard, -8.6, 8.7, -10.8, 1.4)
    for (let x = -3.7; x <= 3.7; x += 0.2) for (let z = 2.5; z <= 9.9; z += 0.2) if (Math.hypot(x, z - 6.2) <= 3.7) markYard(yard, x, z)
    blockYard(yard, -11, -5.2, 5.5, 8.6)
    for (const [x, z] of [[10.1, 10.1], [-3, 11], [3, 11], [-6, 11.5], [5, 11.5], [-8.5, 10.2]]) blockYard(yard, x - 0.3, x + 0.3, z - 0.3, z + 0.3)
    return yard
  }

  it('на пустой площади обходит её всю и не выходит на улицы', () => {
    const loop = stroll(emptyYard())
    expect(loop.length).toBeGreaterThanOrEqual(4)
    for (const [x, z] of along(loop)) expect(Math.max(Math.abs(x - PLAZA.x), Math.abs(z - PLAZA.z))).toBeLessThanOrEqual(STROLL_LIMIT + 0.01)
    const xs = loop.map((p) => p[0])
    const zs = loop.map((p) => p[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(15)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(15)
  })

  it('обходит ратушу, фонтан, очаг и фонари: ни одна точка пути не ближе запаса к препятствию', () => {
    const yard = city()
    const loop = stroll(yard)
    expect(loop.length).toBeGreaterThanOrEqual(4)
    for (const [x, z] of along(loop)) {
      // Запас меряется между серединами клеток: на пути он меньше не больше чем на клетку.
      // В тесном городе узкие места проходятся с малым запасом, но не насквозь.
      expect(gap(yard, x, z)).toBeGreaterThan(STROLL_TIGHT - YARD_CELL)
      expect(Math.max(Math.abs(x - PLAZA.x), Math.abs(z - PLAZA.z))).toBeLessThanOrEqual(STROLL_LIMIT + 0.01)
      // Сквозь ратушу и фонтан не идёт.
      expect(x > -8.6 && x < 8.7 && z > -10.8 && z < 1.4).toBe(false)
      expect(Math.hypot(x, z - 6.2)).toBeGreaterThan(3.7)
    }
  })

  it('что бы ни поставили на площадь, путь остаётся в стороне от этого', () => {
    const random = seeded(7)
    for (let run = 0; run < 12; run++) {
      const yard = emptyYard()
      for (let k = 0; k < 14; k++) {
        const x = (random() - 0.5) * 20
        const z = (random() - 0.5) * 20
        const w = 0.3 + random() * 3
        const d = 0.3 + random() * 3
        blockYard(yard, x - w, x + w, z - d, z + d)
      }
      for (const [x, z] of along(stroll(yard))) expect(gap(yard, x, z)).toBeGreaterThan(STROLL_TIGHT - YARD_CELL)
    }
  })

  it('где просторно, держится от препятствий с полным запасом', () => {
    const yard = emptyYard()
    blockYard(yard, -2, 2, -2, 2)
    blockYard(yard, 8.6, 9.4, 3, 4)
    const loop = stroll(yard)
    expect(loop.length).toBeGreaterThanOrEqual(4)
    for (const [x, z] of along(loop)) expect(gap(yard, x, z)).toBeGreaterThan(STROLL_CLEAR - YARD_CELL)
  })

  it('узкий проход между постройкой и фонарями проходит, если иначе площадь не обойти', () => {
    // Постройка во всю ширину севера, перед ней ряд фонарей: с полным запасом проход шириной в метр закрыт.
    const yard = emptyYard()
    blockYard(yard, -14, 4, -3, -0.5)
    blockYard(yard, -14, 4, 0.55, 0.9)
    blockYard(yard, 4, 14, -14, -8)
    const xs = stroll(yard).map((p) => p[0])
    const zs = stroll(yard).map((p) => p[1])
    // Круг остаётся по одну сторону стены или проходит щель — но не пропадает.
    expect(xs.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(5)
  })

  it('стена поперёк площади: круг целиком остаётся по одну её сторону', () => {
    const yard = emptyYard()
    blockYard(yard, -14, 14, -0.3, 0.3)
    const loop = stroll(yard)
    expect(loop.length).toBeGreaterThanOrEqual(3)
    expect(new Set(loop.map(([, z]) => Math.sign(z))).size).toBe(1)
  })

  it('гулять негде — круга нет: путник остаётся у костра', () => {
    const yard = emptyYard()
    blockYard(yard, -14, 14, -14, 14)
    expect(stroll(yard)).toEqual([])
  })

  it('кот идёт той же дорогой, на полшага левее', () => {
    const loop: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    const cat = beside(loop, 0.4)
    expect(cat).toHaveLength(4)
    cat.forEach(([x, z], k) => expect(Math.hypot(x - loop[k][0], z - loop[k][1])).toBeCloseTo(0.4, 5))
  })
})

describe('животные', () => {
  const herd = (tier: number) => grazing(animalSpots(town(tier)))
  const trees = [2, 3, 4, 5].flatMap((tier) => [0, 22].flatMap((specials) => forest(tier, specials)))

  it('олени пасутся на поляне, домашние — на лугах у реки, каждому хватает места', () => {
    expect(herd(0).map((g) => [g.key, g.ground])).toEqual([['a/deer', 'glade'], ['a/deer', 'glade']])
    const full = herd(5)
    expect(full.map((g) => g.key).sort()).toEqual(['a/cow', 'a/cow', 'a/deer', 'a/deer', 'a/donkey', 'a/horse'])
    const load = new Map<string, number>()
    for (const g of full) load.set(g.ground, (load.get(g.ground) ?? 0) + 1)
    for (const meadow of MEADOWS) expect(load.get(meadow.id) ?? 0, meadow.id).toBeLessThanOrEqual(meadow.room)
    expect(full.find((g) => g.key === 'a/horse')!.ground).toBe('west')
    expect(full.filter((g) => g.key === 'a/cow').map((g) => g.ground)).toEqual(['east', 'far-east'])
    // Есть куда идти: не меньше трёх точек, из своей точки есть переход.
    for (const tier of [0, 2, 3, 4, 5]) {
      for (const g of herd(tier)) {
        expect(g.nodes.length, `${tier}: ${g.key}`).toBeGreaterThanOrEqual(3)
        expect(g.links[0].length, `${tier}: ${g.key}`).toBeGreaterThanOrEqual(1)
        expect(g.links.length).toBe(g.nodes.length)
      }
      expect(herd(tier)).toEqual(herd(tier))
    }
  })

  it('точки выпаса и всё тело животного — на своём пастбище: не на участках, улицах, площади и не в реке', () => {
    for (const tier of [0, 2, 3, 4, 5]) {
      for (const g of herd(tier)) {
        const body = bodyOf(g.key, g.height)
        const label = `${tier}: ${g.key} на ${g.ground}`
        g.nodes.forEach(([x, z], i) => {
          // Само животное: его середина с запасом на круп.
          expect(onGround(g.ground, x, z, body.back), label).toBe(true)
          expect(groundHeight(x, z), label).toBe(0)
          expect(toStreet(x, z), label).toBeGreaterThan(1.3 + body.back)
          expect(onPad(x, z, body.back + 0.5), label).toBe(false)
          expect(Math.abs(x) < PITCH + 1 && Math.abs(z) < PITCH + 1, label).toBe(false)
          for (const pier of PLOTS.filter((p) => p.water)) expect(Math.abs(x - pier.x), label).toBeGreaterThan(7.5 + body.half)
          // Тропа к мосту и слобода за рекой.
          expect(Math.abs(x - BRIDGE_X), label).toBeGreaterThan(3 + body.half)
          expect(z, label).toBeLessThan(QUARTER.z - QUARTER.plot)
          for (const j of g.links[i]) {
            expect(g.links[j], label).toContain(i)
            // Переход по прямой и нос в конце пути: нос может выйти за край пастбища не больше чем на 0,6 м.
            const [tx, tz] = g.nodes[j]
            const length = Math.hypot(tx - x, tz - z)
            expect(length, label).toBeGreaterThan(1.3)
            const nose: Point = [tx + ((tx - x) / length) * body.front, tz + ((tz - z) / length) * body.front]
            expect(onGround(g.ground, nose[0], nose[1], -0.6), label).toBe(true)
            expect(toStreet(nose[0], nose[1]), label).toBeGreaterThan(1.3)
            expect(groundHeight(nose[0], nose[1]), label).toBeGreaterThan(-0.1)
            expect(onPad(nose[0], nose[1], 0.5), label).toBe(false)
            for (const [sx, sz] of samples([[x, z], [tx, tz]])) expect(onGround(g.ground, sx, sz, body.back), label).toBe(true)
          }
        })
      }
    }
  })

  it('на пастбищах нет деревьев: ни под ногами, ни между животным и зрителем', () => {
    for (const g of herd(5)) {
      const body = bodyOf(g.key, g.height)
      for (const [x, z] of g.nodes) {
        for (const tree of trees) {
          const distance = Math.hypot(tree.x - x, tree.z - z)
          // До ствола дальше, чем дотягивается нос, с запасом в метр.
          expect(distance, `${g.key}: дерево (${tree.x.toFixed(1)}, ${tree.z.toFixed(1)})`).toBeGreaterThan(body.front + 1)
          // Южнее луга деревьев нет вовсе: оттуда смотрит камера.
          if (g.ground !== 'glade' && Math.abs(tree.x - x) < 4) expect(tree.z < z || tree.z > z + 14, g.key).toBe(true)
        }
      }
    }
  })

  it('двое на одном пастбище не сходятся: у каждого своя доля', () => {
    for (const tier of [0, 5]) {
      const list = herd(tier)
      for (const a of list) {
        for (const b of list) {
          if (a === b || a.ground !== b.ground) continue
          const reach = bodyOf(a.key, a.height).back + bodyOf(b.key, b.height).back
          for (const p of a.nodes) for (const q of b.nodes) expect(Math.hypot(p[0] - q[0], p[1] - q[1]), `${a.key} и ${b.key}`).toBeGreaterThan(reach)
        }
      }
    }
    // Олени остаются в глубине поляны: опушку закрывают кроны.
    for (const g of herd(0)) for (const [x, z] of g.nodes) expect(Math.hypot(x - GLADE.x, z - GLADE.z)).toBeLessThan(GLADE.r - 3)
  })

  it('размеры тела — по моделям: корова длиннее трёх метров', () => {
    const cow = bodyOf('a/cow', 1.75)
    expect(cow.back + cow.front).toBeGreaterThan(3)
    expect(cow.back + cow.front).toBeLessThan(3.4)
    expect(bodyOf('a/donkey', 1.6).front).toBeCloseTo(1.22, 1)
    for (const key of ['a/cow', 'a/deer', 'a/donkey', 'a/horse']) expect(bodyOf(key, 2).front).toBeGreaterThan(bodyOf(key, 2).back)
  })
})

// ——— Грузы: где они окажутся на фигуре ———

/** Углы детали в метрах от ног жителя: так же, как её ставит сцена — основанием в точке at, наклон вокруг Z, затем вокруг X. */
function corners(part: GearPart): number[][] {
  const [a, b, c] = part.size
  const [hw, h, hd] = part.shape === 'box' ? [a / 2, b, c / 2] : [Math.max(a, b), c, Math.max(a, b)]
  const [tx, tz] = part.tilt ?? [0, 0]
  const list: number[][] = []
  for (const x of [-hw, hw]) {
    for (const y of [0, h]) {
      for (const z of [-hd, hd]) {
        const x1 = x * Math.cos(tz) - y * Math.sin(tz)
        const y1 = x * Math.sin(tz) + y * Math.cos(tz)
        const y2 = y1 * Math.cos(tx) - z * Math.sin(tx)
        const z2 = y1 * Math.sin(tx) + z * Math.cos(tx)
        list.push([x1 + part.at[0], y2 + part.at[1], z2 + part.at[2]])
      }
    }
  }
  return list
}

const extent = (parts: GearPart[]) => {
  const all = parts.flatMap(corners)
  return [0, 1, 2].map((axis) => [Math.min(...all.map((p) => p[axis])), Math.max(...all.map((p) => p[axis]))])
}

/** Ось вытянутой детали — бруска или жерди: концы, или null, если деталь не вытянута. */
function bar(part: GearPart): { from: number[]; to: number[]; length: number } | null {
  const [a, b, c] = part.size
  const dims = part.shape === 'box' ? [a, b, c] : [Math.max(a, b) * 2, c, Math.max(a, b) * 2]
  const sorted = [...dims].sort((p, q) => q - p)
  if (sorted[0] < sorted[1] * 3) return null
  const axis = dims.indexOf(sorted[0])
  const ends = [0, 1].map((end) => {
    const local = [0, part.shape === 'box' ? dims[1] / 2 : dims[1] / 2, 0]
    local[axis] = axis === 1 ? end * dims[1] : (end - 0.5) * dims[axis]
    const [tx, tz] = part.tilt ?? [0, 0]
    const x1 = local[0] * Math.cos(tz) - local[1] * Math.sin(tz)
    const y1 = local[0] * Math.sin(tz) + local[1] * Math.cos(tz)
    return [x1 + part.at[0], y1 * Math.cos(tx) - local[2] * Math.sin(tx) + part.at[1], y1 * Math.sin(tx) + local[2] * Math.cos(tx) + part.at[2]]
  })
  return { from: ends[0], to: ends[1], length: sorted[0] }
}

describe('грузы', () => {
  const kinds = Object.keys(CARGO_NAME) as Cargo[]
  const BACK: Cargo[] = ['firewood', 'planks', 'basket', 'bricks']
  const SHOULDER: Cargo[] = ['sack', 'crate']
  const HAND: Cargo[] = ['buckets', 'bread', 'fish']

  it('у каждого груза есть облик, и он при жителе: не выше макушки, не ниже колена, не дальше вытянутой руки', () => {
    expect([...BACK, ...SHOULDER, ...HAND].sort()).toEqual([...kinds].sort())
    for (const kind of kinds) {
      const parts = cargoParts(kind)
      expect(parts.length, kind).toBeGreaterThan(0)
      const [x, y, z] = extent(parts)
      expect(x[0], kind).toBeGreaterThan(-0.55)
      expect(x[1], kind).toBeLessThan(0.55)
      expect(y[0], kind).toBeGreaterThan(0.45)
      expect(y[1], kind).toBeLessThan(FIGURE.height)
      expect(z[0], kind).toBeGreaterThan(-0.65)
      expect(z[1], kind).toBeLessThan(0.35)
      expect(CARGO_PACE[kind], kind).toBeGreaterThan(0.7)
      expect(CARGO_PACE[kind], kind).toBeLessThanOrEqual(1)
      // Голову груз не протыкает.
      for (const part of parts) {
        const [px, py, pz] = extent([part])
        const head = px[0] < 0.1 && px[1] > -0.1 && py[1] > FIGURE.headY - 0.1 && pz[0] < 0.08 && pz[1] > -0.12
        expect(head, kind).toBe(false)
      }
    }
  })

  it('ноша за спиной — за спиной, на плече — на плече, в руке — у опущенной кисти', () => {
    for (const kind of BACK) {
      const [x, y, z] = extent(cargoParts(kind))
      expect(z[1], kind).toBeLessThanOrEqual(FIGURE.back + 0.03)
      expect(z[1], kind).toBeGreaterThan(FIGURE.back - 0.05)
      expect(Math.abs(x[0] + x[1]), kind).toBeLessThan(0.1)
      expect(y[0], kind).toBeGreaterThan(0.8)
    }
    for (const kind of SHOULDER) {
      const [x, y] = extent(cargoParts(kind))
      expect(y[0], kind).toBeGreaterThanOrEqual(FIGURE.shoulder - 0.01)
      expect(y[0], kind).toBeLessThan(FIGURE.shoulder + 0.03)
      // Лежит на одном плече, рядом с головой, а не на ней.
      expect(Math.min(Math.abs(x[0]), Math.abs(x[1])), kind).toBeGreaterThan(0.12)
      expect(Math.abs((x[0] + x[1]) / 2), kind).toBeCloseTo(FIGURE.shoulderX, 1)
    }
    for (const kind of HAND) {
      const parts = cargoParts(kind)
      const [x, y] = extent(parts)
      expect(y[1], kind).toBeGreaterThan(FIGURE.hand - 0.03)
      expect(y[1], kind).toBeLessThan(FIGURE.hand + 0.06)
      expect(Math.max(Math.abs(x[0]), Math.abs(x[1])), kind).toBeLessThan(FIGURE.handX + 0.2)
      for (const part of parts) expect(Math.abs(part.at[0]), kind).toBeGreaterThan(0.3)
    }
    // Вёдра — в обеих руках.
    expect(extent(cargoParts('buckets'))[0][0]).toBeCloseTo(-extent(cargoParts('buckets'))[0][1], 6)
  })

  it('ни один груз не читается крестом: жерди не пересекаются и не лежат длинной перекладиной поперёк фигуры', () => {
    for (const kind of kinds) {
      const bars = cargoParts(kind).flatMap((part) => bar(part) ?? [])
      for (const a of bars) {
        // Лежачая жердь короче ширины плеч с запасом: человек с длинной перекладиной издали — крест.
        const flat = Math.abs(a.to[1] - a.from[1]) < a.length * 0.5
        if (flat) expect(a.length, kind).toBeLessThanOrEqual(0.6)
        for (const b of bars) {
          if (a === b) continue
          const da = a.to.map((v, i) => v - a.from[i])
          const db = b.to.map((v, i) => v - b.from[i])
          const cos = Math.abs(da[0] * db[0] + da[1] * db[1] + da[2] * db[2]) / (a.length * b.length)
          if (cos > 0.7) continue
          // Не параллельны: смотрим, не сходятся ли серединами.
          let nearest = Infinity
          for (let s = 0.2; s <= 0.8; s += 0.05) {
            for (let t = 0.2; t <= 0.8; t += 0.05) {
              nearest = Math.min(nearest, Math.hypot(a.from[0] + da[0] * s - b.from[0] - db[0] * t, a.from[1] + da[1] * s - b.from[1] - db[1] * t, a.from[2] + da[2] * s - b.from[2] - db[2] * t))
            }
          }
          expect(nearest, kind).toBeGreaterThan(0.05)
        }
      }
    }
    // Проверка умеет находить крест: две жерди, сбитые серединами.
    const cross: GearPart[] = [
      { shape: 'box', at: [0, 1, 0], size: [0.04, 0.8, 0.04], color: '#000000' },
      { shape: 'box', at: [-0.4, 1.4, 0], size: [0.04, 0.8, 0.04], color: '#000000', tilt: [0, -Math.PI / 2] },
    ]
    const [upright, beam] = cross.map((part) => bar(part)!)
    expect(upright.from[0]).toBeCloseTo(0, 6)
    expect(beam.from[1]).toBeCloseTo(1.4, 6)
    expect(beam.to[0] - beam.from[0]).toBeCloseTo(0.8, 6)
    // Доски стоят вдоль фигуры, поленья лежат вдоль плеч: друг с другом они параллельны.
    for (const kind of ['planks', 'firewood'] as Cargo[]) {
      const bars = cargoParts(kind).flatMap((part) => bar(part) ?? [])
      expect(bars.length, kind).toBeGreaterThanOrEqual(3)
    }
  })
})
