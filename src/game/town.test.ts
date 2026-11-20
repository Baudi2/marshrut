import { BLUEPRINT_TESTS, RARE, TRADE_COINS, blueprintsFor, tradeYield } from './town'
import { describe, expect, it } from 'vitest'
import { pickBroken, repairPrice } from './repair'
import { pausedDays, toISO, type ConditionLevel } from './rules'
import { SHOP } from './shop'
import { BUILDINGS, COMFORT, TIERS, arrivalPace, blockers, buildCost, buildHours, buildingType, comfortRoom, maxLevel, moodOf, replayTown, type Means, type Town, type TownAction } from './town'

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
    expect(replayTown([], [], noon(0)).comfort).toEqual({ total: 1, center: 1, wells: 0, tavern: 0, decor: 0, rare: 0 })
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
    expect(built.comfort).toEqual({ total: 15, center: 1, wells: 4, tavern: 4, decor: 6, rare: 0 })
  })

  it('довольство — уют на одного жителя; без жителей оно полное', () => {
    expect(moodOf({ comfort: { total: 1, center: 1, wells: 0, tavern: 0, decor: 0, rare: 0 }, population: 0 })).toBe(100)
    const at = (total: number, population: number) => ({ comfort: { total, center: total, wells: 0, tavern: 0, decor: 0, rare: 0 }, population })
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

// --- Поломки после долгого перерыва ---

describe('поломки после перерыва', () => {
  // Ноябрь 2026: 2-е — понедельник. Занятия 2, 3 и 4 ноября, дальше перерыв.
  // К 10.11 пропущено 3 рабочих дня, к 11.11 — 4 (ломается одна вещь), к 17.11 — 8 (две).
  const start = ['2026-11-02', '2026-11-03', '2026-11-04']
  const at = (date: string, time: string, action: Omit<TownAction, 'at'>): TownAction => ({ at: `${date}T${time}:00`, ...action })
  /** Постройки первого уровня, поставленные вечером 2 ноября: к утру все стоят. Журнал правила стройки не проверяет. */
  const builds = (...types: string[]) => types.map((type, i) => at('2026-11-02', `18:0${i}`, { do: 'build', type }))
  interface Setup {
    /** Занятия после перерыва; без них перерыв ещё идёт. */
    back?: string[]
    /** Занятия до перерыва, если нужны не три первых дня ноября. */
    days?: string[]
    decor?: { item: string; date: string }[]
    paused?: Set<string>
    forcedLevel?: ConditionLevel | null
    /** Час, на который считается город; по умолчанию — вечер. */
    clock?: string
  }
  /** Город в день today. */
  const play = (actions: TownAction[], today: string, setup: Setup = {}): Town =>
    replayTown(actions, [...(setup.days ?? start), ...(setup.back ?? [])], new Date(`${today}T${setup.clock ?? '23:00'}:00`), setup.decor ?? [], {
      today,
      paused: setup.paused,
      forcedLevel: setup.forcedLevel,
    })
  const broken = (town: Town) => town.buildings.filter((b) => b.broken).map((b) => b.id)
  /** Всё сломанное: постройки и украшения. */
  const all = (town: Town) => [...broken(town), ...town.damage.map((d) => d.item)].sort()
  const trio = builds('house', 'garden', 'sawmill')
  const workdays = (from: string, to: string) => {
    const list: string[] = []
    for (const cursor = new Date(`${from}T12:00:00`); toISO(cursor) <= to; cursor.setDate(cursor.getDate() + 1)) {
      if (cursor.getDay() !== 0 && cursor.getDay() !== 6) list.push(toISO(cursor))
    }
    return list
  }

  it('перерыв в 4–7 рабочих дней ломает одну постройку, от 8 — две, короче — ничего', () => {
    expect(broken(play(trio, '2026-11-04'))).toEqual([])
    expect(broken(play(trio, '2026-11-10'))).toEqual([])
    expect(broken(play(trio, '2026-11-11'))).toHaveLength(1)
    expect(broken(play(trio, '2026-11-17'))).toHaveLength(2)
    // после возвращения — столько же
    expect(broken(play(trio, '2026-11-10', { back: ['2026-11-10'] }))).toEqual([])
    expect(broken(play(trio, '2026-11-11', { back: ['2026-11-11'] }))).toHaveLength(1)
    expect(broken(play(trio, '2026-11-17', { back: ['2026-11-17'] }))).toHaveLength(2)
  })

  it('без сегодняшней даты считаются только прошедшие перерывы', () => {
    const late = new Date('2026-11-17T23:00:00')
    expect(broken(replayTown(trio, start, late))).toEqual([])
    expect(broken(replayTown(trio, [...start, '2026-11-17'], late))).toHaveLength(2)
  })

  it('украшения и постройки — один список: вместе ломается не больше двух вещей, экипировка цела', () => {
    const decor = [
      { item: 'pot', date: '2026-11-02' },
      { item: 'bench', date: '2026-11-02' },
      { item: 'hat', date: '2026-11-02' },
    ]
    expect(all(play(trio, '2026-11-11', { decor }))).toHaveLength(1)
    const two = all(play(trio, '2026-11-17', { decor }))
    expect(two).toHaveLength(2)
    // выбор — то же правило, что у украшений: порядок зависит только от перерыва и вещи
    expect(two).toEqual(pickBroken('2026-11-04', ['pot', 'bench', 'house-1', 'garden-1', 'sawmill-1'], 3, false).sort())
  })

  it('пока перерыв длится, выбор не перетасовывается; после возвращения сломано то же', () => {
    const one = all(play(trio, '2026-11-11'))
    const two = all(play(trio, '2026-11-17'))
    expect(two).toContain(one[0])
    expect(all(play(trio, '2026-11-13'))).toEqual(one)
    expect(all(play(trio, '2026-11-20'))).toEqual(two)
    expect(all(play(trio, '2026-11-17', { back: ['2026-11-17'] }))).toEqual(two)
  })

  it('сломанная лесопилка не даёт дерева два хода и чинится на третьем занятии', () => {
    const mill = builds('sawmill')
    // до перерыва — два хода с лесопилкой
    expect(play(mill, '2026-11-04')).toMatchObject({ wood: 4, perTurn: { wood: 2 } })
    // пока перерыв идёт, поломка уже видна, срок починки неизвестен
    const away = play(mill, '2026-11-11')
    expect(away.buildings[0].broken).toEqual({ since: '2026-11-04', healsIn: null, cost: 10 })
    expect(away.perTurn.wood).toBe(0)
    const first = play(mill, '2026-11-11', { back: ['2026-11-11'] })
    expect(first).toMatchObject({ wood: 4, perTurn: { wood: 0 } })
    expect(first.buildings[0].broken).toEqual({ since: '2026-11-04', healsIn: 2, cost: 10 })
    const second = play(mill, '2026-11-12', { back: ['2026-11-11', '2026-11-12'] })
    expect(second.wood).toBe(4)
    expect(second.buildings[0].broken?.healsIn).toBe(1)
    const third = play(mill, '2026-11-13', { back: ['2026-11-11', '2026-11-12', '2026-11-13'] })
    expect(third).toMatchObject({ wood: 6, perTurn: { wood: 2 } })
    expect(third.buildings[0].broken).toBeNull()
  })

  it('починка за монеты сразу возвращает работу и списывает пятую часть цены', () => {
    const mill = builds('sawmill')
    const fix = (date: string, time: string) => at(date, time, { do: 'repair', id: 'sawmill-1' })
    expect([20, 50, 240, 600].map(repairPrice)).toEqual([10, 10, 50, 120])
    // починили вечером в день возвращения: ход этого дня прошёл без лесопилки, следующий — уже с ней
    const after = play([...mill, fix('2026-11-11', '18:00')], '2026-11-12', { back: ['2026-11-11', '2026-11-12'] })
    expect(after).toMatchObject({ wood: 6, spent: { coins: 60 } })
    expect(after.buildings[0].broken).toBeNull()
    // починили, пока перерыв ещё шёл: к возвращению лесопилка цела и ход идёт с ней
    const early = [...mill, fix('2026-11-12', '12:00')]
    const back = play(early, '2026-11-17', { back: ['2026-11-17'] })
    expect(back).toMatchObject({ wood: 6, spent: { coins: 60 } })
    expect(back.buildings[0].broken).toBeNull()
    // перерыв продолжается — починенное этим перерывом заново не ломается
    expect(play(early, '2026-11-20').buildings[0].broken).toBeNull()
  })

  it('починка целой постройки — пустое действие: ничего не стоит и от будущего перерыва не защищает', () => {
    const mill = [...builds('sawmill'), at('2026-11-03', '18:00', { do: 'repair', id: 'sawmill-1' }), at('2026-11-04', '18:00', { do: 'repair', id: 'sawmill-1' })]
    const town = play(mill, '2026-11-04')
    expect(town.spent.coins).toBe(50)
    expect(blockers(town, { do: 'repair', id: 'sawmill-1' }, rich)).toEqual(['постройка цела'])
    expect(blockers(town, { do: 'repair', id: 'well-7' }, rich)).toEqual(['такой постройки нет'])
    const later = play(mill, '2026-11-11')
    expect(broken(later)).toEqual(['sawmill-1'])
    expect(later.spent.coins).toBe(50)
    expect(blockers(later, { do: 'repair', id: 'sawmill-1' }, rich)).toEqual([])
    expect(blockers(later, { do: 'repair', id: 'sawmill-1' }, { coins: 4, gems: 0, specials: 0 })).toEqual(['не хватает монет: 6'])
    // строители починке не нужны
    later.builders = { total: 1, busy: 1 }
    expect(blockers(later, { do: 'repair', id: 'sawmill-1' }, rich)).toEqual([])
  })

  it('сломанную постройку нельзя улучшать, пока она не починена', () => {
    const mill = builds('sawmill')
    const upgrade = at('2026-11-11', '18:10', { do: 'upgrade', id: 'sawmill-1' })
    const back = { back: ['2026-11-11'] }
    expect(blockers(play(mill, '2026-11-11', back), { do: 'upgrade', id: 'sawmill-1' }, rich)).toEqual(['постройка сломана: сначала почини её'])
    // запись в журнале правило не обходит
    expect(play([...mill, upgrade], '2026-11-11', back)).toMatchObject({ spent: { coins: 50 }, buildings: [{ level: 1, pending: null }] })
    const fixed = play([...mill, at('2026-11-11', '18:00', { do: 'repair', id: 'sawmill-1' }), upgrade], '2026-11-11', back)
    expect(fixed.buildings[0]).toMatchObject({ level: 2, broken: null })
  })

  it('жильё сломанного жилища остаётся: жители не уходят', () => {
    const home = builds('house', 'garden')
    expect(play(home, '2026-11-04')).toMatchObject({ population: 2, housing: 2, food: 4 })
    const after = play(home, '2026-11-17', { back: ['2026-11-17'] })
    expect(broken(after)).toEqual(['house-1', 'garden-1'])
    // огород сломан — еды за ход нет, двое едят из запаса; жилище сломано только на вид
    expect(after).toMatchObject({ population: 2, housing: 2, food: 2, perTurn: { food: 0, eaten: 2 } })
  })

  it('запасы в сломанном амбаре и на сломанном складе не пропадают', () => {
    // рабочие дни с 5 октября по 4 ноября: постройки стоят с первого вечера, запасы копятся 22 хода
    const days = workdays('2026-10-05', '2026-11-04')
    const early = (...types: string[]) => types.map((type, i) => at('2026-10-05', `18:0${i}`, { do: 'build', type }))
    const back = { days, back: ['2026-11-17', '2026-11-18'] }
    const food = early('barn', 'garden')
    expect(play(food, '2026-11-04', { days })).toMatchObject({ food: 60, foodCap: 60 })
    const pantry = play(food, '2026-11-18', back)
    expect(broken(pantry)).toEqual(['barn-1', 'garden-1'])
    expect(pantry).toMatchObject({ food: 60, foodCap: 60 })
    const wood = early('store', 'sawmill')
    expect(play(wood, '2026-11-04', { days })).toMatchObject({ wood: 44, materialCap: 70 })
    const yard = play(wood, '2026-11-18', back)
    expect(broken(yard)).toEqual(['store-1', 'sawmill-1'])
    expect(yard).toMatchObject({ wood: 44, materialCap: 70 })
  })

  it('центр поселения не ломается', () => {
    const town = play([at('2026-11-02', '18:00', { do: 'tier' })], '2026-11-17', { back: ['2026-11-17'] })
    expect(town).toMatchObject({ tier: 1, buildings: [], damage: [] })
    expect(play([at('2026-11-02', '18:00', { do: 'tier' })], '2026-11-17').idle.level).toBe(3)
  })

  it('строящееся и улучшаемое не ломается', () => {
    // жилище улучшают за полчаса до полуночи перед возвращением: в день возвращения оно в лесах
    const house = [...builds('house'), at('2026-11-10', '23:30', { do: 'upgrade', id: 'house-1' })]
    expect(play(house, '2026-11-11', { back: ['2026-11-11'] }).buildings[0]).toMatchObject({ level: 2, broken: null })
    expect(broken(play(builds('house'), '2026-11-11', { back: ['2026-11-11'] }))).toEqual(['house-1'])
    // стройка, начатая за две минуты до полуночи, в день возвращения ещё идёт
    const fresh = [at('2026-11-10', '23:58', { do: 'build', type: 'house' })]
    expect(play(fresh, '2026-11-11', { back: ['2026-11-11'] }).buildings[0]).toMatchObject({ level: 1, broken: null })
    // перерыв ещё идёт: в лесах постройка цела, а достроенная уже может сломаться
    expect(play(house, '2026-11-11', { clock: '00:10' }).buildings[0]).toMatchObject({ level: 1, pending: { level: 2 }, broken: null })
    expect(broken(play(house, '2026-11-11'))).toEqual(['house-1'])
  })

  it('запас дров прикрывает перерыв одинаково, идёт он или уже прошёл', () => {
    const bare = builds('house')
    const stocked = builds('house', 'woodshed')
    // 4 пропущенных рабочих дня: без дров ломается одна вещь, с запасом на день — ничего
    expect(all(play(bare, '2026-11-11'))).toHaveLength(1)
    expect(all(play(bare, '2026-11-11', { back: ['2026-11-11'] }))).toHaveLength(1)
    expect(play(stocked, '2026-11-11')).toMatchObject({ firewood: 1, idle: { missed: 4, covered: 1, level: 1 } })
    expect(all(play(stocked, '2026-11-11'))).toEqual([])
    expect(all(play(stocked, '2026-11-11', { back: ['2026-11-11'] }))).toEqual([])
    // 5 дней: один прикрыт, остальные четыре ломают одну вещь
    expect(all(play(stocked, '2026-11-12'))).toHaveLength(1)
    expect(all(play(stocked, '2026-11-12', { back: ['2026-11-12'] }))).toHaveLength(1)
  })

  it('запас считается по дровнику до перерыва: сломавшись в этот перерыв, дровник его всё равно прикрывает', () => {
    const shed = builds('woodshed')
    const five = play(shed, '2026-11-12')
    expect(broken(five)).toEqual(['woodshed-1'])
    expect(five).toMatchObject({ firewood: 0, idle: { missed: 5, covered: 1, level: 2 } })
    // 8 дней: без прикрытого дня это было бы третье запустение
    expect(play(shed, '2026-11-17').idle).toEqual({ missed: 8, covered: 1, level: 2 })
  })

  it('дровник, сломанный прошлым перерывом, следующий перерыв не прикрывает', () => {
    // первый перерыв (5 дней) ломает дровник; 12.11 возвращение, вечером ставят жилище; дальше ещё 4 пропуска
    const town = [...builds('woodshed'), at('2026-11-12', '18:00', { do: 'build', type: 'house' })]
    const second = (actions: TownAction[]) => play(actions, '2026-11-19', { back: ['2026-11-12'] })
    const open = second(town)
    expect(open.idle).toEqual({ missed: 4, covered: 0, level: 2 })
    expect(open.buildings.filter((b) => b.broken?.since === '2026-11-12')).toHaveLength(1)
    // дровник починили за монеты в день возвращения — запас снова работает
    const mended = second([...town, at('2026-11-12', '18:10', { do: 'repair', id: 'woodshed-1' })])
    expect(mended.idle).toEqual({ missed: 4, covered: 1, level: 1 })
    expect(broken(mended)).toEqual([])
  })

  it('плановый перерыв пропуском не считается: ничего не ломается', () => {
    const paused = pausedDays([{ from: '2026-11-05', to: '2026-11-13' }])
    expect(all(play(trio, '2026-11-17'))).toHaveLength(2)
    expect(play(trio, '2026-11-17', { paused }).idle).toEqual({ missed: 1, covered: 0, level: 0 })
    expect(all(play(trio, '2026-11-17', { paused }))).toEqual([])
    expect(all(play(trio, '2026-11-17', { paused, back: ['2026-11-17'] }))).toEqual([])
  })

  it('сторожевая башня: под её присмотром ломается одна вещь, а не две', () => {
    const guarded = builds('house', 'garden', 'tower')
    expect(all(play(trio, '2026-11-17'))).toHaveLength(2)
    expect(all(play(guarded, '2026-11-17'))).toHaveLength(1)
    expect(all(play(guarded, '2026-11-17', { back: ['2026-11-17'] }))).toHaveLength(1)
  })

  it('сломанная башня не сторожит: следующий перерыв ломает две вещи', () => {
    // первый перерыв ломает башню — больше ломаться нечему; 17.11 возвращение, вечером ставят два жилища
    const town = [...builds('tower'), at('2026-11-17', '18:00', { do: 'build', type: 'house' }), at('2026-11-17', '18:01', { do: 'build', type: 'house' })]
    expect(play(town, '2026-11-17', { back: ['2026-11-17'] }).buildings[0].broken).toMatchObject({ since: '2026-11-04', healsIn: 2 })
    // к 30.11 — ещё 8 пропущенных рабочих дней
    const second = (actions: TownAction[]) => play(actions, '2026-11-30', { back: ['2026-11-17'] }).buildings.filter((b) => b.broken?.since === '2026-11-17')
    expect(second(town)).toHaveLength(2)
    // башню починили за монеты в день возвращения — она снова сторожит
    expect(second([...town, at('2026-11-17', '18:02', { do: 'repair', id: 'tower-1' })])).toHaveLength(1)
  })

  it('сломанное не работает: уют, строители, хлеб', () => {
    // в каждом городе одна постройка — она и ломается
    const lone = (type: string, today = '2026-11-11') => play(builds(type), today)
    expect(lone('well', '2026-11-04').comfort).toMatchObject({ wells: 2, total: 3 })
    expect(lone('well').comfort).toMatchObject({ wells: 0, total: 1 })
    expect(lone('tavern', '2026-11-04').comfort.tavern).toBe(4)
    expect(lone('tavern').comfort.tavern).toBe(0)
    const shop = lone('workshop', '2026-11-04')
    expect(shop.builders.total).toBe(2)
    expect(buildHours(shop, 2)).toBeCloseTo(0.94)
    expect(lone('workshop').builders.total).toBe(1)
    expect(buildHours(lone('workshop'), 2)).toBe(1)
    // мельница и пекарня: что бы из двух ни сломалось, хлеба нет
    const bread = builds('mill', 'bakery')
    expect(play(bread, '2026-11-04').perTurn.food).toBe(15)
    const stale = play(bread, '2026-11-11')
    expect(broken(stale)).toHaveLength(1)
    expect(stale.perTurn.food).toBe(0)
  })

  it('сломанный рынок не торгует, пока его не починят', () => {
    const market = builds('market')
    const trade = at('2026-11-11', '12:00', { do: 'trade', type: 'food' })
    const town = play([...market, trade], '2026-11-11')
    expect(town).toMatchObject({ food: 0, spent: { coins: 350 } })
    expect(blockers(town, { do: 'trade', type: 'food' }, rich)).toEqual(['рынок сломан: сначала почини его'])
    const mended = play([...market, at('2026-11-11', '11:00', { do: 'repair', id: 'market-1' }), trade], '2026-11-11')
    expect(mended).toMatchObject({ food: 10, spent: { coins: 350 + 70 + TRADE_COINS } })
  })

  it('сломанный колодец не поит новых жителей: сверх шести не приходят, но никто не уходит', () => {
    // Четверг 29.10: две ступени (уют 5 и без колодца), колодец, пять жилищ, четыре огорода. За четыре хода приходят восемь жителей.
    const days = ['2026-10-29', '2026-10-30', ...start]
    const first = (time: string, action: Omit<TownAction, 'at'>) => at('2026-10-29', time, action)
    const town = [
      first('18:00', { do: 'tier' }),
      first('18:10', { do: 'tier' }),
      first('18:11', { do: 'build', type: 'well' }),
      ...[1, 2, 3, 4, 5].map((i) => first(`18:2${i}`, { do: 'build', type: 'house' })),
      ...[1, 2, 3, 4].map((i) => first(`18:3${i}`, { do: 'build', type: 'garden' })),
    ]
    expect(play(town, '2026-11-04', { days })).toMatchObject({ tier: 2, population: 8, housing: 10 })
    // без перерыва девятый житель приходит на следующем же ходу
    expect(play(town, '2026-11-05', { days, back: ['2026-11-05'] }).population).toBe(9)
    // Жилища и огороды улучшают за полчаса до возвращения: в лесах они не ломаются, остаётся колодец.
    const ids = [...[1, 2, 3, 4, 5].map((i) => `house-${i}`), ...[1, 2, 3, 4].map((i) => `garden-${i}`)]
    const scaffold = ids.map((id, i) => at('2026-11-10', `23:3${i}`, { do: 'upgrade', id }))
    const after = play([...town, ...scaffold], '2026-11-11', { days, back: ['2026-11-11'] })
    expect(broken(after)).toEqual(['well-1'])
    // уюта без колодца хватило бы и девятому — не пускает именно сломанный колодец
    expect(after).toMatchObject({ population: 8, housing: 15, comfort: { wells: 0, total: 5 } })
    expect(arrivalPace(after)).toBe('normal')
  })

  it('предпросмотр: как будто идущий перерыв уже дошёл до нужного уровня', () => {
    const look = (today: string, forcedLevel: ConditionLevel | null) => all(play(trio, today, { forcedLevel }))
    expect(look('2026-11-04', null)).toEqual([])
    expect(look('2026-11-04', 2)).toHaveLength(1)
    expect(look('2026-11-04', 3)).toHaveLength(2)
    expect(look('2026-11-04', 3)).toEqual(look('2026-11-17', null))
    expect(look('2026-11-17', 0)).toEqual([])
  })
})

describe('чертежи и редкие постройки', () => {
  // Лагерь в первый день, хутор — к десятому: редким постройкам нужна ступень.
  const camp = [evening(0, { do: 'tier' })]
  const hamlet = [...camp, evening(2, { do: 'tier' })]
  const withPlans = (blueprints: number): Means => ({ coins: 5000, gems: 99, specials: 99, blueprints })
  const at = (actions: TownAction[], n = 12) => replayTown(actions, days(n), noon(n))

  it('чертёж дают за первый и за третий сданный тест', () => {
    expect(BLUEPRINT_TESTS).toEqual([1, 3])
    expect([0, 1, 2, 3, 4, 6].map(blueprintsFor)).toEqual([0, 1, 1, 2, 2, 2])
  })

  it('у каждого чертежа две постройки, и они называют друг друга', () => {
    for (const type of RARE) {
      const pair = buildingType(type.rare!.pair)!
      expect(pair.rare).toEqual({ offer: type.rare!.offer, pair: type.id })
      expect(pair.tier).toBe(type.tier)
      expect(pair.base).toBe(type.base)
    }
    expect(RARE.map((t) => t.rare!.offer).sort()).toEqual([1, 1, 2, 2])
    // Редких построек нет в обычном списке: план местности и темп игры считают только обычные.
    expect(BUILDINGS.some((t) => t.rare)).toBe(false)
  })

  it('без чертежа редкую постройку не поставить, с чертежом — можно', () => {
    const town = at(camp)
    expect(blockers(town, { do: 'build', type: 'apiary' }, withPlans(0)).join(' ')).toContain('нужен чертёж')
    expect(blockers(town, { do: 'build', type: 'apiary' }, withPlans(1))).toEqual([])
    expect(blockers(town, { do: 'build', type: 'dovecote' }, withPlans(1))).toEqual([])
    // Без поля blueprints — как без чертежей: прежние вызовы не ломаются.
    expect(blockers(town, { do: 'build', type: 'apiary' }, rich).join(' ')).toContain('нужен чертёж')
  })

  it('первому чертежу хватает лагеря, второму нужен хутор и третий тест', () => {
    expect(blockers(at([]), { do: 'build', type: 'apiary' }, withPlans(2)).join(' ')).toContain('Лагерь')
    expect(blockers(at(camp), { do: 'build', type: 'pottery' }, withPlans(2)).join(' ')).toContain('Хутор')
    expect(blockers(at(hamlet), { do: 'build', type: 'pottery' }, withPlans(1)).join(' ')).toContain('3-й')
    expect(blockers(at(hamlet), { do: 'build', type: 'pottery' }, withPlans(2))).toEqual([])
  })

  it('выбор окончательный: поставил пасеку — голубятня уже не строится', () => {
    const town = at([...camp, evening(1, { do: 'build', type: 'apiary' })])
    expect(town.buildings.map((b) => b.id)).toEqual(['apiary-1'])
    expect(blockers(town, { do: 'build', type: 'dovecote' }, withPlans(2)).join(' ')).toContain('уже стоит другая постройка: пасека')
    expect(blockers(town, { do: 'build', type: 'apiary' }, withPlans(2)).join(' ')).toContain('больше нельзя')
    // Журнал, в котором записаны обе, строит только первую и за вторую не берёт монет.
    const both = at([...camp, evening(1, { do: 'build', type: 'apiary' }), evening(2, { do: 'build', type: 'dovecote' }), evening(3, { do: 'build', type: 'apiary' })])
    expect(both.buildings.map((b) => b.id)).toEqual(['apiary-1'])
    expect(both.spent.coins).toBe(town.spent.coins)
  })

  it('пасека даёт еду без работников, голубятня — уют', () => {
    const bare = at(camp)
    const apiary = at([...camp, evening(1, { do: 'build', type: 'apiary' })])
    expect(apiary.perTurn.food - bare.perTurn.food).toBe(3)
    expect(apiary.comfort.rare).toBe(0)
    const dovecote = at([...camp, evening(1, { do: 'build', type: 'dovecote' })])
    expect(dovecote.comfort.rare).toBe(4)
    expect(dovecote.comfort.total - bare.comfort.total).toBe(4)
    expect(dovecote.perTurn.food).toBe(bare.perTurn.food)
  })

  it('гончарня даёт кирпич, лодочный сарай — еду', () => {
    const bare = at(hamlet)
    expect(at([...hamlet, evening(3, { do: 'build', type: 'pottery' })]).perTurn.brick - bare.perTurn.brick).toBe(2)
    expect(at([...hamlet, evening(3, { do: 'build', type: 'boathouse' })]).perTurn.food - bare.perTurn.food).toBe(4)
  })

  it('редкая постройка стоит монет, строится пять минут и не улучшается', () => {
    const cost = buildCost(buildingType('apiary')!, 1)
    expect(cost).toMatchObject({ coins: 90, wood: 0, brick: 0 })
    expect(buildCost(buildingType('boathouse')!, 1).coins).toBe(180)
    const town = at([...camp, evening(1, { do: 'build', type: 'apiary' })])
    expect(town.buildings[0]).toMatchObject({ level: 1, pending: null })
    expect(blockers(town, { do: 'upgrade', id: 'apiary-1' }, withPlans(2))).toEqual(['редкая постройка не улучшается'])
    const tried = at([...camp, evening(1, { do: 'build', type: 'apiary' }), evening(2, { do: 'upgrade', id: 'apiary-1' })])
    expect(tried.buildings[0]).toMatchObject({ level: 1, pending: null })
    expect(tried.spent.coins).toBe(town.spent.coins)
  })

  it('редкая постройка ломается после долгого перерыва, как обычная, и тогда ничего не даёт', () => {
    const study = ['2026-11-18', '2026-11-19', '2026-11-20']
    const actions = [{ at: '2026-11-18T18:00:00', do: 'tier' as const }, { at: '2026-11-19T18:00:00', do: 'build' as const, type: 'apiary' }]
    const town = replayTown(actions, study, new Date(2026, 11, 10, 12), [], { today: '2026-12-10' })
    expect(town.buildings[0].broken).not.toBeNull()
    expect(town.perTurn.food).toBe(0)
    expect(town.buildings[0].broken!.cost).toBe(20)
  })
})
