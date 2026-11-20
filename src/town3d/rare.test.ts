import { describe, expect, it } from 'vitest'
import { RARE, buildingType } from '../game/town'
import { LookBuilder } from './look'
import { LOOKS, levelLook, levelName } from './looks'
import { LEVEL_NAMES, levelNameOf } from './names'
import index from './models.gen.json'
import { BRIDGE_X, MEADOWS, PITCH, PLOTS, RARE_HALF, RARE_PLOTS, RIVER, STREET_Z, forest, groundHeight, openPlots, plotOf, riverCenter } from './plan'
import { streetNet } from './jobs'

const models = index as unknown as Record<string, unknown>

/** Какие модели просит облик и какой у него след на земле: прогон вхолостую, без загрузки. */
function needs(look: (b: LookBuilder) => void): string[] {
  const probe = new LookBuilder(null, { season: 'summer' })
  look(probe)
  return [...probe.needs]
}

describe('названия обликов', () => {
  it('лёгкий список названий совпадает с обликами: его читают страницы, которым сцена не нужна', () => {
    expect(LEVEL_NAMES).toEqual(Object.fromEntries(Object.entries(LOOKS).map(([type, looks]) => [type, looks.levels.map((level) => level.name)])))
    expect(levelNameOf('house', 2)).toBe(levelName('house', 2))
    expect(levelNameOf('apiary', 1)).toBe('Пасека')
    expect(levelNameOf('нет такой', 1)).toBe('')
  })
})

describe('редкие постройки на карте', () => {
  it('у каждой есть место, облик и название; модели облика лежат в public/models', () => {
    for (const type of RARE) {
      const plot = plotOf(`${type.id}-1`)
      expect(plot, type.id).toBeDefined()
      expect(plot!.rare).toBe(true)
      expect(LOOKS[type.id].levels).toHaveLength(1)
      expect(levelName(type.id, 1)).toBe(type.name)
      for (const key of needs(levelLook(type.id, 1))) expect(models[key], `${type.id}: ${key}`).toBeDefined()
    }
  })

  it('две постройки одного чертежа стоят на одном месте, разные чертежи — на разных', () => {
    for (const type of RARE) {
      const mine = plotOf(`${type.id}-1`)!
      const other = plotOf(`${type.rare!.pair}-1`)!
      expect([mine.x, mine.z]).toEqual([other.x, other.z])
    }
    const spots = new Set(RARE_PLOTS.map((plot) => `${plot.x}:${plot.z}`))
    expect(spots.size).toBe(2)
  })

  it('в сетку участков редкие места не входят: улиц и площадок под них нет, носильщики туда не ходят', () => {
    for (const plot of RARE_PLOTS) expect(PLOTS.some((p) => p.id === plot.id)).toBe(false)
    for (let tier = 0; tier <= 5; tier++) expect(openPlots(tier).some((plot) => plot.rare)).toBe(false)
    expect(streetNet(openPlots(2)).open.size).toBe(openPlots(2).filter((plot) => !plot.water).length)
  })

  it('пасека и голубятня: на ровном лужке между южной улицей и берегом, не на тропе к мосту и не на выпасе', () => {
    const plot = plotOf('apiary-1')!
    const half = 2.6
    // Южная улица кончается в полутора метрах от своей середины.
    expect(plot.z - 2.2).toBeGreaterThan(STREET_Z[0] + 1.5)
    expect(plot.x - half).toBeGreaterThan(BRIDGE_X + 3)
    for (const meadow of MEADOWS) expect(plot.x + half <= meadow.minX || plot.x - half >= meadow.maxX, meadow.id).toBe(true)
    for (const [dx, dz] of [[-half, -2.2], [half, -2.2], [-half, 2.2], [half, 2.2]]) expect(groundHeight(plot.x + dx, plot.z + dz)).toBe(0)
  })

  it('гончарня и лодочный сарай: на берегу между причалами, место выходит к воде, как у причалов', () => {
    const plot = plotOf('pottery-1')!
    const piers = PLOTS.filter((p) => p.water)
    expect(piers).toHaveLength(2)
    // Пристань пятого уровня шире своего участка: 6,7 м от середины в каждую сторону.
    for (const pier of piers) expect(Math.abs(plot.x - pier.x), pier.id).toBeGreaterThan(4.5 + 6.7)
    expect(plot.z).toBeCloseTo(riverCenter(plot.x) - RIVER.half - 4.4)
    expect(plot.z - 3.5).toBeGreaterThan(STREET_Z[0] + 1.5)
    // Суша под гончарней ровная; дальше берег уходит к воде — там сарай стоит на сваях.
    expect(groundHeight(plot.x, plot.z + 2)).toBe(0)
    expect(groundHeight(plot.x, plot.z + 6)).toBeLessThan(0)
    expect(Math.abs(plot.x) + 4.5).toBeLessThan(PITCH * 4)
  })

  it('лес расчищается под редкой постройкой, только когда она стоит', () => {
    for (const tier of [1, 2, 5]) {
      const rare = RARE_PLOTS.filter((plot) => (buildingType(plot.type)?.tier ?? 9) <= tier)
      const cleared = forest(tier, 0, 0, rare)
      for (const plot of rare) {
        for (const tree of cleared) expect(Math.abs(tree.x - plot.x) < RARE_HALF && Math.abs(tree.z - plot.z) < RARE_HALF, `${tier}: ${plot.id}`).toBe(false)
      }
      expect(forest(tier, 0, 0).length).toBeGreaterThanOrEqual(cleared.length)
    }
  })
})
