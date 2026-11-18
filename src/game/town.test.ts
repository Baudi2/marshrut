import { describe, expect, it } from 'vitest'
import { toISO } from './rules'
import { BUILDINGS, TIERS, blockers, buildCost, buildingType, maxLevel, replayTown, type Means, type Town, type TownAction } from './town'

const day = (n: number) => toISO(new Date(2026, 10, 18 + n))
/** Действие в 18:00 дня n. */
const evening = (n: number, action: Omit<TownAction, 'at'>): TownAction => ({ at: `${day(n)}T18:00:00`, ...action })
const days = (count: number) => Array.from({ length: count }, (_, i) => day(i))
const noon = (n: number) => new Date(2026, 10, 18 + n, 12)
const rich: Means = { coins: 99999, gems: 99, specials: 99 }

describe('правила города', () => {
  it('всё начинается со стоянки: ни построек, ни жителей', () => {
    const town = replayTown([], [], noon(0))
    expect(town).toMatchObject({ tier: 0, population: 0, housing: 0, food: 0, buildings: [] })
    expect(town.builders).toEqual({ total: 1, busy: 0 })
  })

  it('цена растёт по уровням, дерево нужно со второго уровня, кирпич с четвёртого', () => {
    const house = buildingType('house')!
    expect([1, 2, 3, 4, 5].map((level) => buildCost(house, level))).toEqual([
      { coins: 20, gems: 0, food: 0, wood: 0, brick: 0 },
      { coins: 35, gems: 0, food: 0, wood: 4, brick: 0 },
      { coins: 65, gems: 0, food: 0, wood: 6, brick: 0 },
      { coins: 115, gems: 0, food: 0, wood: 12, brick: 5 },
      { coins: 210, gems: 0, food: 0, wood: 21, brick: 8 },
    ])
  })

  it('первая ступень занимает пять минут и стоит 60 монет', () => {
    const actions = [evening(0, { do: 'tier' })]
    expect(replayTown(actions, [], new Date(2026, 10, 18, 18, 4))).toMatchObject({ tier: 0, builders: { busy: 1 } })
    expect(replayTown(actions, [], new Date(2026, 10, 18, 18, 5))).toMatchObject({ tier: 1, spent: { coins: 60, gems: 0 } })
  })

  it('ход: путник вскапывает огород, еда появляется, приходит житель', () => {
    const actions = [
      evening(0, { do: 'tier' }),
      evening(0, { do: 'build', type: 'house' }),
      { at: `${day(0)}T18:10:00`, do: 'build' as const, type: 'garden' },
    ]
    const town = replayTown(actions, [day(1)], noon(1))
    expect(town).toMatchObject({ turns: 1, population: 1, food: 3, housing: 2 })
    expect(town.perTurn).toMatchObject({ food: 3, eaten: 1 })
    // второй ход: приходит второй житель, одна порция за ход остаётся в запас
    expect(replayTown(actions, [day(1), day(2)], noon(2))).toMatchObject({ population: 2, food: 5 })
  })

  it('без занятий ходов нет: простой ничего не даёт и ничего не отнимает', () => {
    const actions = [evening(0, { do: 'tier' }), evening(0, { do: 'build', type: 'house' })]
    const soon = replayTown(actions, [day(1), day(2)], noon(2))
    const later = replayTown(actions, [day(1), day(2)], noon(60))
    expect(later).toEqual(soon)
  })

  it('голода нет: без еды жители не приходят, но и не уходят', () => {
    // жилище есть, огорода нет
    const actions = [evening(0, { do: 'build', type: 'house' })]
    expect(replayTown(actions, days(10), noon(10)).population).toBe(0)
    // огород даёт три порции: живут двое, одна порция идёт в запас
    const fed = [
      evening(0, { do: 'tier' }),
      evening(0, { do: 'build', type: 'house' }),
      evening(1, { do: 'build', type: 'house' }),
      evening(2, { do: 'build', type: 'garden' }),
    ]
    const town = replayTown(fed, days(40), noon(40))
    expect(town.housing).toBe(4)
    expect(town.population).toBe(2)
    expect(town.food).toBe(20)
  })

  it('во время улучшения постройка работает на прежнем уровне', () => {
    const actions = [
      evening(0, { do: 'tier' }),
      evening(0, { do: 'build', type: 'house' }),
      evening(1, { do: 'upgrade', id: 'house-1' }),
    ]
    const during = replayTown(actions, [], new Date(2026, 10, 19, 18, 30))
    expect(during.buildings[0]).toMatchObject({ level: 1, pending: { level: 2 } })
    expect(during.housing).toBe(2)
    expect(replayTown(actions, [], new Date(2026, 10, 19, 19, 0)).housing).toBe(3)
  })

  it('стройка не дольше суток', () => {
    const town = replayTown([], [], noon(0))
    expect(Math.max(...TIERS.map((t) => t.hours))).toBeLessThanOrEqual(24)
    expect(blockers(town, { do: 'build', type: 'bakery' }, rich)).toContain('откроется на ступени «Городок»')
  })

  it('ступень требует жителей и особых построек, а не только монет', () => {
    const town = replayTown([evening(0, { do: 'tier' })], [], noon(1))
    expect(blockers(town, { do: 'tier' }, { coins: 9999, gems: 99, specials: 2 })).toEqual([
      'нужно жителей: 5, сейчас 0',
      'нужно особых построек: 5, сейчас 2',
      'не хватает запаса еды: 15',
    ])
  })

  it('уровень построек ограничен ступенью, число построек — тоже', () => {
    const actions = [evening(0, { do: 'tier' }), evening(0, { do: 'build', type: 'house' }), evening(1, { do: 'upgrade', id: 'house-1' })]
    const town = replayTown([...actions, evening(2, { do: 'build', type: 'house' })], [], noon(4))
    expect(maxLevel(1)).toBe(2)
    expect(blockers(town, { do: 'upgrade', id: 'house-1' }, rich)).toEqual(['выше уровень откроет следующая ступень'])
    expect(blockers(town, { do: 'build', type: 'house' }, rich)).toEqual(['на этой ступени больше нельзя'])
  })
})

// --- Симуляция темпа: насколько долго хватает развития ---

/** Доход за учебный день в цикле 1: около 2250 монет на 30 дней. */
const COINS_PER_DAY = 75
/** Камни за 30 дней цикла: шесть перевалов по одному и шесть тестов по два. */
const gemsBy = (d: number) => {
  const passes = [2, 7, 20, 28, 29, 30]
  const tests = [4, 8, 13, 18, 23, 30]
  const inCycle = (list: number[], upTo: number) => list.filter((x) => x <= upTo).length
  const full = Math.floor(d / 30)
  const rest = d % 30
  return full * 18 + inCycle(passes, rest) + inCycle(tests, rest) * 2
}
/** Особые постройки: два файла есть сразу, дальше примерно два за три занятия. */
const specialsBy = (d: number) => 2 + Math.floor(d * 0.66)

function simulate(studyDays: number) {
  const actions: TownAction[] = []
  const reached: Record<number, number> = {}
  let town: Town = replayTown([], [], noon(0))
  for (let d = 1; d <= studyDays; d++) {
    const dates = days(d + 1).slice(1)
    for (let slot = 0; slot < 3; slot++) {
      const time = new Date(2026, 10, 18 + d, 18, slot)
      town = replayTown(actions, dates, time)
      const means: Means = { coins: COINS_PER_DAY * d - town.spent.coins, gems: gemsBy(d) - town.spent.gems, specials: specialsBy(d) }
      const can = (a: Omit<TownAction, 'at'>) => blockers(town, a, means).length === 0
      const lowest = (type: string) =>
        town.buildings.filter((b) => b.type === type && !b.pending).sort((a, b) => a.level - b.level)[0]
      const grow = (type: string): Omit<TownAction, 'at'> | null => {
        if (can({ do: 'build', type })) return { do: 'build', type }
        const b = lowest(type)
        return b && can({ do: 'upgrade', id: b.id }) ? { do: 'upgrade', id: b.id } : null
      }
      const next = TIERS[town.tier + 1]
      // Игрок копит на ступень, когда остальные её условия уже выполнены.
      const saving = !!next && !town.tierPending && town.population >= next.residents && means.specials >= next.specials
      const wants: (Omit<TownAction, 'at'> | null)[] = [
        can({ do: 'tier' }) ? { do: 'tier' } : null,
        town.population >= 5 && !town.buildings.some((b) => b.type === 'well') ? grow('well') : null,
        town.population >= town.housing - 1 ? grow('house') : null,
        town.perTurn.food <= town.population + 2 ? (grow('garden') ?? grow('pier') ?? grow('bakery')) : null,
        town.food >= town.foodCap - 2 || (!!next && town.foodCap < next.food) ? grow('barn') : null,
        ...['sawmill', 'store', 'brickyard', 'workshop', 'mill', 'tavern', 'market', 'tower', 'woodshed'].map((type) =>
          town.buildings.some((b) => b.type === type) ? null : can({ do: 'build', type }) ? { do: 'build' as const, type } : null,
        ),
        saving ? null : (BUILDINGS.map((t) => grow(t.id)).find(Boolean) ?? null),
      ]
      const pick = wants.find(Boolean)
      if (!pick) break
      actions.push({ at: time.toISOString(), ...pick })
    }
    town = replayTown(actions, dates, new Date(2026, 10, 18 + d, 23))
    const tierNow = town.tierPending?.n ?? town.tier
    if (reached[tierNow] === undefined) reached[tierNow] = d
  }
  const levels = town.buildings.reduce((sum, b) => sum + b.level, 0)
  const possible = BUILDINGS.reduce((sum, t) => sum + t.count[5] * 5, 0)
  const purse: Means = {
    coins: COINS_PER_DAY * studyDays - town.spent.coins,
    gems: gemsBy(studyDays) - town.spent.gems,
    specials: specialsBy(studyDays),
  }
  return { reached, town, levels, possible, actions: actions.length, purse, stuck: blockers(town, { do: 'tier' }, purse) }
}

describe('темп развития', () => {
  const run = simulate(280)
  // eslint-disable-next-line no-console
  console.log(
    'ступени по учебным дням:', run.reached,
    '| уровней построено:', run.levels, 'из', run.possible,
    '| жителей:', run.town.population,
    '| осталось монет:', run.purse.coins, 'камней:', run.purse.gems,
    '| еда:', run.town.food, '/', run.town.foodCap,
    '| что мешает следующей ступени:', run.stuck,
    '| постройки:', run.town.buildings.map((b) => `${b.id}:${b.level}`).join(' '),
  )

  it('начать можно в первый же день', () => {
    expect(run.reached[1]).toBe(1)
  })

  it('хутор — в первые недели, деревня — к концу первого цикла или в начале второго', () => {
    expect(run.reached[2]).toBeGreaterThanOrEqual(6)
    expect(run.reached[2]).toBeLessThanOrEqual(16)
    expect(run.reached[3]).toBeGreaterThanOrEqual(22)
    expect(run.reached[3]).toBeLessThanOrEqual(45)
  })

  it('городок — не раньше второго цикла, город — не раньше третьего', () => {
    expect(run.reached[4]).toBeGreaterThan(45)
    expect(run.reached[5]).toBeGreaterThan(75)
  })

  it('за 280 учебных дней город построен, но улучшать ещё есть что', () => {
    expect(run.reached[5]).toBeLessThanOrEqual(280)
    expect(run.levels).toBeLessThan(run.possible)
  })
})
