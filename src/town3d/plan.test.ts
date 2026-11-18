import { describe, expect, it } from 'vitest'
import { BUILDINGS, TIERS, maxLevel } from '../game/town'
import { LookBuilder } from './look'
import { CENTER, LOOKS, constructionLook, levelLook, specialLook, upgradeLook } from './looks'
import index from './models.gen.json'
import { PITCH, PLAZA, PLOTS, QUARTER_SLOTS, RIVER, forest, groundHeight, openPlots, plotOf, quarterSlot, riverCenter } from './plan'

const models = index as unknown as Record<string, unknown>

/** Какие модели просит облик: прогон вхолостую, без загрузки. */
function needs(look: (b: LookBuilder) => void): string[] {
  const probe = new LookBuilder(null, { season: 'summer', accent: '#2f6db5', emblem: 'A' })
  look(probe)
  return [...probe.needs]
}

describe('план города', () => {
  it('у каждой постройки, которую разрешают правила, есть свой участок', () => {
    for (const type of BUILDINGS) {
      for (let n = 1; n <= type.count[5]; n++) {
        expect(plotOf(`${type.id}-${n}`), `${type.id}-${n}`).toBeDefined()
      }
    }
  })

  it('участки не накладываются друг на друга, на площадь и на реку', () => {
    const land = PLOTS.filter((plot) => !plot.water)
    for (const a of land) {
      for (const b of land) {
        if (a === b) continue
        expect(Math.abs(a.x - b.x) >= PITCH - 0.01 || Math.abs(a.z - b.z) >= PITCH - 0.01, `${a.id} и ${b.id}`).toBe(true)
      }
      const onPlaza = Math.abs(a.x - PLAZA.x) < PLAZA.w / 2 && Math.abs(a.z - PLAZA.z) < PLAZA.d / 2
      expect(onPlaza, a.id).toBe(false)
      expect(Math.abs(a.z - riverCenter(a.x)), a.id).toBeGreaterThan(RIVER.half + 6)
    }
  })

  it('причалы стоят на берегу: под серединой участка суша, в восьми метрах к югу — вода', () => {
    for (const plot of PLOTS.filter((p) => p.water)) {
      expect(groundHeight(plot.x, plot.z)).toBe(0)
      expect(groundHeight(plot.x, plot.z + 8)).toBeLessThan(-0.7)
    }
  })

  it('ступень открывает ровно столько участков, сколько построек разрешают правила', () => {
    for (const tier of TIERS) {
      const open = openPlots(tier.n).filter((plot) => plot.type !== 'park')
      const allowed = BUILDINGS.reduce((sum, type) => sum + type.count[tier.n], 0)
      expect(open.length, tier.name).toBe(allowed)
    }
  })

  it('места слободы не повторяются и лежат за рекой', () => {
    const seen = new Set<string>()
    for (let i = 0; i < QUARTER_SLOTS; i++) {
      const slot = quarterSlot(i)
      seen.add(`${slot.x}:${slot.z}`)
      expect(slot.z - riverCenter(slot.x)).toBeGreaterThan(RIVER.half + 6)
    }
    expect(seen.size).toBe(QUARTER_SLOTS)
  })

  it('лес не растёт на открытых участках и на площади и не меняется от запуска к запуску', () => {
    const trees = forest(3, 22)
    expect(trees.length).toBeGreaterThan(300)
    expect(forest(3, 22)).toEqual(trees)
    const open = openPlots(3)
    for (const tree of trees) {
      for (const plot of open) {
        expect(Math.abs(tree.x - plot.x) < PITCH / 2 && Math.abs(tree.z - plot.z) < PITCH / 2, plot.id).toBe(false)
      }
      expect(Math.abs(tree.x) < PLAZA.w / 2 && Math.abs(tree.z) < PLAZA.d / 2).toBe(false)
    }
    // Чем выше ступень, тем меньше леса: город его расчищает.
    expect(forest(5, 22).length).toBeLessThan(forest(0, 22).length)
  })
})

describe('облики построек', () => {
  it('у каждого типа пять уровней, у каждого уровня своё название', () => {
    for (const type of BUILDINGS) {
      const looks = LOOKS[type.id]
      expect(looks, type.id).toBeDefined()
      expect(looks.levels.length, type.id).toBe(5)
      expect(new Set(looks.levels.map((level) => level.name)).size, type.id).toBe(5)
    }
    expect(CENTER.length).toBe(TIERS.length)
  })

  it('у каждого уровня свой облик: другой набор моделей или другие детали, а не та же постройка покрупнее', () => {
    for (const type of BUILDINGS) {
      const signatures = LOOKS[type.id].levels.map((level) => {
        // Пустой набор моделей: модели пропускаются, а детали из простых фигур строятся по-настоящему.
        const builder = new LookBuilder(new Map(), { season: 'summer' })
        level.look(0)(builder)
        const drawn = builder.body.empty ? 0 : builder.body.geometry().getAttribute('position').count
        return [...builder.needs].sort().join(',') + '|' + drawn
      })
      expect(new Set(signatures).size, type.id).toBe(5)
    }
  })

  it('все модели, на которые ссылаются облики, лежат в public/models', () => {
    const asked = new Set<string>()
    for (const type of BUILDINGS) {
      for (let level = 1; level <= 5; level++) for (const variant of [0, 1, 2]) needs(levelLook(type.id, level, variant)).forEach((key) => asked.add(key))
    }
    for (const step of CENTER) needs(step.look).forEach((key) => asked.add(key))
    for (const kind of ['cabin', 'hall', 'tower']) for (const stage of [0, 1, 2, 3]) needs(specialLook(kind, stage)).forEach((key) => asked.add(key))
    needs(constructionLook).forEach((key) => asked.add(key))
    needs(upgradeLook(6, 6, 4)).forEach((key) => asked.add(key))
    expect(asked.size).toBeGreaterThan(60)
    for (const key of asked) expect(models[key], key).toBeDefined()
  })

  it('в мире нет храмов, «чудес», военных построек и крестообразного фонтана', () => {
    for (const key of Object.keys(models)) expect(key).not.toMatch(/temple|wonder|archery|wall_towers|town_center/)
  })

  it('предельный уровень на ступени не выше пяти и растёт со ступенью', () => {
    expect(TIERS.map((tier) => maxLevel(tier.n))).toEqual([1, 2, 3, 4, 5, 5])
  })
})
