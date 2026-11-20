import { describe, expect, it } from 'vitest'
import type { BuildingView } from '../game/engine'
import { MONUMENT, QUARTER, QUARTER_SLOTS, RIVER, forest, groundHeight, monumentSpot, quarterSlot, riverCenter } from './plan'
import { folded, monumentsOf, specialsOf } from './view'

const file = (id: string, stage: BuildingView['stage'] = 2): BuildingView =>
  ({ item: { id, kind: 'cabin', track: 'A', title: `Файл ${id}` }, stage, recorded: null }) as unknown as BuildingView

const cycle = (n: number, done: boolean, files: number) => ({
  id: `0${n}-plan`,
  n,
  name: `План ${n}`,
  done,
  buildings: Array.from({ length: files }, (_, i) => file(`f${n}-${i}`)),
})

describe('памятник закрытого цикла', () => {
  it('пока цикл идёт, памятника нет, а его файлы стоят в слободе', () => {
    const world = { cycles: [cycle(1, false, 22)] }
    expect(monumentsOf(world)).toEqual([])
    expect(specialsOf(world)).toHaveLength(22)
  })

  it('цикл закрыт, следующего ещё нет: памятник уже стоит, файлы остаются в слободе', () => {
    const world = { cycles: [cycle(1, true, 22)] }
    expect(monumentsOf(world)).toEqual([{ id: 'cycle:01-plan', n: 1, title: 'Памятник цикла 1: План 1' }])
    expect(folded(world.cycles[0], world.cycles)).toBe(false)
    expect(specialsOf(world)).toHaveLength(22)
  })

  it('начат следующий цикл: файлы закрытого сворачиваются в памятник и освобождают слободу', () => {
    const world = { cycles: [cycle(1, true, 22), cycle(2, false, 20)] }
    expect(folded(world.cycles[0], world.cycles)).toBe(true)
    const specials = specialsOf(world)
    expect(specials).toHaveLength(20)
    expect(specials.every((s) => s.id.startsWith('file:02-plan:'))).toBe(true)
    expect(monumentsOf(world).map((m) => m.n)).toEqual([1])
  })

  it('без сворачивания два цикла в слободу не помещаются, со сворачиванием — да', () => {
    expect(22 + 20).toBeGreaterThan(QUARTER_SLOTS)
    expect(specialsOf({ cycles: [cycle(1, true, 22), cycle(2, true, 20), cycle(3, false, 24)] })).toHaveLength(24)
  })

  it('памятники идут по порядку циклов, по одному на закрытый', () => {
    const world = { cycles: [cycle(2, true, 3), cycle(1, true, 3), cycle(3, false, 3)] }
    expect(monumentsOf(world).map((m) => m.id)).toEqual(['cycle:01-plan', 'cycle:02-plan'])
  })
})

describe('место памятников', () => {
  const spots = Array.from({ length: 8 }, (_, i) => monumentSpot(i))

  it('стоят на ровной земле южного берега, не в русле', () => {
    for (const spot of spots) {
      const half = MONUMENT.size / 2
      for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
        expect(groundHeight(spot.x + dx, spot.z + dz)).toBe(0)
      }
      expect(spot.z).toBeGreaterThan(riverCenter(spot.x) + RIVER.half)
    }
  })

  it('не задевают участки слободы и аллею у моста', () => {
    for (const spot of spots) {
      expect(spot.x + MONUMENT.size / 2).toBeLessThan(-3)
      for (let i = 0; i < QUARTER_SLOTS; i++) {
        const slot = quarterSlot(i)
        const apart = Math.abs(spot.x - slot.x) >= (MONUMENT.size + QUARTER.plot) / 2 || Math.abs(spot.z - slot.z) >= (MONUMENT.size + QUARTER.plot) / 2
        expect(apart, `памятник ${spot.x.toFixed(1)} и место ${i}`).toBe(true)
      }
    }
  })

  it('друг друга не касаются', () => {
    for (let i = 1; i < spots.length; i++) expect(spots[i - 1].x - spots[i].x).toBeGreaterThan(MONUMENT.size + 1)
  })

  it('лес отступает от памятников и дорожки к ним', () => {
    const count = 3
    const trees = forest(1, 0, count)
    for (let i = 0; i < count; i++) {
      const spot = monumentSpot(i)
      for (const tree of trees) expect(Math.hypot(tree.x - spot.x, tree.z - spot.z)).toBeGreaterThan(MONUMENT.size / 2 + 2)
    }
    // Без памятников лес на этом месте растёт: расчистка — только под них.
    const wild = forest(1, 0, 0)
    expect(wild.length).toBeGreaterThan(trees.length)
  })
})
