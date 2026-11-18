import { TRADE_COINS, tradeYield } from './town'
import { describe, expect, it } from 'vitest'
import { toISO } from './rules'
import { SHOP } from './shop'
import { BUILDINGS, COMFORT, TIERS, arrivalPace, blockers, buildCost, buildingType, comfortRoom, maxLevel, moodOf, replayTown, type Means, type Town, type TownAction } from './town'

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

  it('ход: путник вскапывает огород, еда появляется, приходят жители', () => {
    const actions = [
      evening(0, { do: 'tier' }),
      evening(0, { do: 'build', type: 'house' }),
      { at: `${day(0)}T18:10:00`, do: 'build' as const, type: 'garden' },
    ]
    const town = replayTown(actions, [day(1)], noon(1))
    // в пустом лагере уюта хватает с запасом: в первый же ход приходят двое
    expect(town).toMatchObject({ turns: 1, population: 2, food: 3, housing: 2 })
    expect(town.perTurn).toMatchObject({ food: 3, eaten: 2 })
    // второй ход: мест больше нет, одна порция за ход остаётся в запас
    expect(replayTown(actions, [day(1), day(2)], noon(2))).toMatchObject({ population: 2, food: 4 })
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

describe('довольство', () => {
  // Журнал правила не проверяет, поэтому жилища и огороды можно поставить прямо на стоянке:
  // так уют от ступени самый маленький и видно его действие.
  const crowded = [
    evening(0, { do: 'build', type: 'house' }),
    { at: `${day(0)}T18:01:00`, do: 'build' as const, type: 'house' },
    { at: `${day(0)}T18:02:00`, do: 'build' as const, type: 'garden' },
    { at: `${day(0)}T18:03:00`, do: 'build' as const, type: 'garden' },
  ]

  it('уют складывается из ступени, колодцев, таверны и украшений', () => {
    expect(replayTown([], [], noon(0)).comfort).toEqual({ total: 1, center: 1, wells: 0, tavern: 0, decor: 0 })
    const camp = replayTown([evening(0, { do: 'tier' })], [], noon(1))
    expect(camp.comfort.total).toBe(COMFORT.base + COMFORT.tier)
    const built = replayTown(
      [evening(0, { do: 'build', type: 'well' }), evening(1, { do: 'upgrade', id: 'well-1' }), evening(0, { do: 'build', type: 'tavern' })],
      [],
      noon(3),
      [
        { item: 'bench', date: day(0) },
        { item: 'lamps', date: day(1) },
        { item: 'bench', date: day(2) },
        { item: 'hat', date: day(0) },
      ],
    )
    // колодец второго уровня — 4, таверна — 4, скамьи (один раз) и фонари — 6; шляпа уюта не даёт
    expect(built.comfort).toEqual({ total: 15, center: 1, wells: 4, tavern: 4, decor: 6 })
  })

  it('довольство — уют на одного жителя; без жителей оно полное', () => {
    expect(moodOf({ comfort: { total: 1, center: 1, wells: 0, tavern: 0, decor: 0 }, population: 0 })).toBe(100)
    const at = (total: number, population: number) => ({ comfort: { total, center: total, wells: 0, tavern: 0, decor: 0 }, population })
    expect(moodOf(at(5, 8))).toBe(63)
    expect(moodOf(at(9, 4))).toBe(100)
    expect([arrivalPace(at(5, 4)), arrivalPace(at(5, 5)), arrivalPace(at(5, 9)), arrivalPace(at(5, 10))]).toEqual(['fast', 'normal', 'normal', 'stopped'])
    expect(comfortRoom(at(5, 0))).toBe(10)
  })

  it('когда уюта мало, новые жители не приходят, хотя место и еда есть', () => {
    const town = replayTown(crowded, days(20), noon(20))
    expect(town.housing).toBe(4)
    expect(town.perTurn.food).toBeGreaterThanOrEqual(town.population + 2)
    expect(town.population).toBe(2)
    expect(arrivalPace(town)).toBe('stopped')
    expect(moodOf(town)).toBe(50)
  })

  it('украшения добавляют уют — и жители приходят снова, со следующего хода после покупки', () => {
    const decor = [
      { item: 'pot', date: day(10) },
      { item: 'signpost', date: day(10) },
    ]
    // ход десятого дня прошёл до покупки
    expect(replayTown(crowded, days(11), noon(10), decor)).toMatchObject({ population: 2, comfort: { total: 3, decor: 2 } })
    // уют 3 на двоих — с запасом: на одиннадцатый день приходят сразу двое
    expect(replayTown(crowded, days(12), noon(11), decor).population).toBe(4)
  })

  it('пока уюта хватает с запасом, за ход приходит на одного жителя больше', () => {
    const two = [day(1), day(2)]
    // после первого хода жителей двое. Котелок: уют 2 на двоих, без запаса — приходит один.
    expect(replayTown(crowded, two, noon(2), [{ item: 'pot', date: day(0) }]).population).toBe(3)
    // Фонари: уют 5, с запасом — приходят двое.
    expect(replayTown(crowded, two, noon(2), [{ item: 'lamps', date: day(0) }]).population).toBe(4)
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
  // Украшения из лавки: модель берёт их за монеты, когда уюта не хватает, а колодец и таверну улучшить нечем.
  const decor: { item: string; date: string }[] = []
  let decorCoins = 0
  const reached: Record<number, number> = {}
  let town: Town = replayTown([], [], noon(0))
  for (let d = 1; d <= studyDays; d++) {
    const dates = days(d + 1).slice(1)
    for (let slot = 0; slot < 3; slot++) {
      const time = new Date(2026, 10, 18 + d, 18, slot)
      town = replayTown(actions, dates, time, decor)
      const means: Means = { coins: COINS_PER_DAY * d - town.spent.coins - decorCoins, gems: gemsBy(d) - town.spent.gems, specials: specialsBy(d) }
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
      // Уют нужен, только пока жителей не хватает для следующей ступени.
      const cramped = arrivalPace(town) === 'stopped' && town.population < town.housing && (!next || town.population < next.residents)
      if (cramped && !can({ do: 'tier' }) && !grow('well') && !grow('tavern')) {
        const item = SHOP.find(
          (i) => i.comfort && i.coins && (i.tier ?? 0) <= town.tier && means.coins >= i.coins && !decor.some((x) => x.item === i.id),
        )
        if (item) {
          decor.push({ item: item.id, date: day(d) })
          decorCoins += item.coins!
          continue
        }
      }
      const wants: (Omit<TownAction, 'at'> | null)[] = [
        can({ do: 'tier' }) ? { do: 'tier' } : null,
        town.population >= 5 && !town.buildings.some((b) => b.type === 'well') ? grow('well') : null,
        cramped ? (grow('well') ?? grow('tavern')) : null,
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
    town = replayTown(actions, dates, new Date(2026, 10, 18 + d, 23), decor)
    const tierNow = town.tierPending?.n ?? town.tier
    if (reached[tierNow] === undefined) reached[tierNow] = d
  }
  const levels = town.buildings.reduce((sum, b) => sum + b.level, 0)
  const possible = BUILDINGS.reduce((sum, t) => sum + t.count[5] * 5, 0)
  const purse: Means = {
    coins: COINS_PER_DAY * studyDays - town.spent.coins - decorCoins,
    gems: gemsBy(studyDays) - town.spent.gems,
    specials: specialsBy(studyDays),
  }
  return { reached, town, levels, possible, actions: actions.length, purse, decor, stuck: blockers(town, { do: 'tier' }, purse) }
}

describe('темп развития', () => {
  const run = simulate(280)
  // eslint-disable-next-line no-console
  console.log(
    'ступени по учебным дням:', run.reached,
    '| уровней построено:', run.levels, 'из', run.possible,
    '| жителей:', run.town.population, 'уют:', run.town.comfort.total,
    '| украшения:', run.decor.map((x) => `${x.item} ${x.date}`).join(', '),
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

describe('рынок', () => {
  const start = '2026-01-05T09:00:00'
  // Город с рынком первого уровня: ступень и стройка поставлены задним числом, журнал правила не проверяет.
  const withMarket = (extra: { at: string; do: 'trade'; type: string }[] = []) =>
    replayTown([{ at: start, do: 'build' as const, type: 'market' }, ...extra], [], new Date('2026-01-06T12:00:00'))
  const rich = { coins: 500, gems: 0, specials: 0 }

  it('партия товара стоит двадцать монет и растёт с уровнем рынка', () => {
    expect(TRADE_COINS).toBe(20)
    expect([1, 3, 5].map((level) => tradeYield(level, 'food'))).toEqual([10, 14, 18])
    expect([1, 3, 5].map((level) => tradeYield(level, 'wood'))).toEqual([5, 7, 9])
    expect([1, 3, 5].map((level) => tradeYield(level, 'brick'))).toEqual([3, 5, 7])
    expect(tradeYield(0, 'food')).toBe(0)
  })

  it('обмен списывает монеты и кладёт товар на склад', () => {
    const before = withMarket()
    const after = withMarket([
      { at: '2026-01-06T10:00:00', do: 'trade', type: 'food' },
      { at: '2026-01-06T10:01:00', do: 'trade', type: 'wood' },
    ])
    expect(after.food - before.food).toBe(10)
    expect(after.wood - before.wood).toBe(5)
    expect(after.spent.coins - before.spent.coins).toBe(TRADE_COINS * 2)
  })

  it('без рынка торговать нельзя; полный склад и пустой кошелёк тоже не дают', () => {
    const empty = replayTown([], [], new Date('2026-01-06T12:00:00'))
    expect(blockers(empty, { do: 'trade', type: 'food' }, rich)).toEqual(['нужен рынок'])
    const town = withMarket()
    expect(blockers(town, { do: 'trade', type: 'food' }, rich)).toEqual([])
    expect(blockers(town, { do: 'trade', type: 'food' }, { ...rich, coins: 5 })).toEqual(['не хватает монет: 15'])
    // склад еды без амбара — 20: две партии по десять помещаются, третья уже нет
    const full = withMarket([
      { at: '2026-01-06T10:00:00', do: 'trade', type: 'food' },
      { at: '2026-01-06T10:01:00', do: 'trade', type: 'food' },
    ])
    expect(full.food).toBe(20)
    expect(blockers(full, { do: 'trade', type: 'food' }, rich)[0]).toMatch(/не поместится/)
  })

  it('строители торговле не нужны', () => {
    const busy = withMarket([])
    busy.builders = { total: 1, busy: 1 }
    expect(blockers(busy, { do: 'trade', type: 'wood' }, rich)).toEqual([])
  })
})
