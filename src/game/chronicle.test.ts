import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Пробный набор «цикл пройден, город — хутор»: журнал цикла, покупки, город, колода и записи вне плана.
import closedProgress from '../../fixtures/closed-cycle/data/cycles/01-basic-month/progress.json'
import closedDeck from '../../fixtures/closed-cycle/data/deck.json'
import closedOffplan from '../../fixtures/closed-cycle/data/offplan.json'
import closedPurchases from '../../fixtures/closed-cycle/data/purchases.json'
import closedTown from '../../fixtures/closed-cycle/data/town.json'
import { offplan as liveOffplan, rawCycles as liveCycles, repoCards, repoPurchases, repoRedeemed, repoRepairs, repoReviews, repoRewards, repoSigns, repoTownActions } from '../data/load'
import type { Ledger, OffplanEntry, Plan, Progress, RawCycle, Session } from '../data/types'
import {
  chronicle,
  dateText,
  dayClosedText,
  earnedText,
  gapText,
  lastTurn,
  monthText,
  nextUp,
  residentsText,
  whenText,
  type ChronicleEntry,
  type LevelNamer,
} from './chronicle'
import { buildWorld } from './engine'
// Снимок прогресса на 18.11.2026 — тот же, на котором считают тесты движка.
import snapshot from './fixtures/progress-2026-11-18.json'
import { sliceInputs, worldAt, type WorldInputs } from './history'
import { GOODS, buildCost, buildingType, type TownAction } from './town'

const thePlan = plan as unknown as Plan
const raw: RawCycle = { dir: '01-basic-month', plan: thePlan, progress: snapshot as unknown as Progress }
const early: WorldInputs = { rawCycles: [raw], offplan: [], ledger: { purchases: [], repairs: [] } }

const closed: WorldInputs = {
  rawCycles: [{ dir: '01-basic-month', plan: thePlan, progress: closedProgress as unknown as Progress }],
  offplan: closedOffplan.entries as OffplanEntry[],
  ledger: {
    ...(closedPurchases as unknown as Ledger),
    town: closedTown.actions as Ledger['town'],
    reviews: closedDeck.reviews,
    cards: closedDeck.cards as Ledger['cards'],
  },
}
const CLOSED_TODAY = '2027-01-06'

const texts = (entry: ChronicleEntry) => [...entry.study, ...entry.town].map((line) => line.text)
const byDate = (entries: ChronicleEntry[], date: string) => entries.find((e) => e.date === date)!
/** От старых записей к новым: так удобнее сверять одну с другой. */
const oldFirst = (entries: ChronicleEntry[]) => [...entries].reverse()
const session = (date: string, day: number, extra: Partial<Session> = {}): Session => ({ date, from: null, to: null, day, topics: ['тема'], ...extra })

/** Снимок с правкой журнала и своим журналом города. */
function scene(patch: (p: Progress) => void, ledger: Partial<Ledger> = {}, offplan: OffplanEntry[] = []): WorldInputs {
  const copy = structuredClone(raw)
  patch(copy.progress)
  return { rawCycles: [copy], offplan, ledger: { purchases: [], repairs: [], ...ledger } }
}

/** Ни в одной записи нет NaN, undefined, пустых строк и пустых записей. */
function expectClean(entries: ChronicleEntry[]) {
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'number') expect(Number.isFinite(value), path).toBe(true)
    else if (typeof value === 'string') {
      expect(value.trim().length, path).toBeGreaterThan(0)
      expect(value, path).not.toMatch(/NaN|undefined|null|\[object/)
    } else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`))
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`)
    else expect(value === null && /\.(gap|source)$/.test(path), path).toBe(true)
  }
  for (const entry of entries) {
    walk(entry, entry.date)
    // у записи есть о чём сказать: темы занятия, запись вне плана или хотя бы одна строка
    expect(entry.topics.length + entry.side.length + entry.study.length + entry.town.length, entry.date).toBeGreaterThan(0)
  }
}

/** Жители и запасы сходятся от записи к записи. */
function expectChained(entries: ChronicleEntry[]) {
  let population = 0
  let stock = { food: 0, wood: 0, brick: 0 }
  for (const entry of oldFirst(entries)) {
    const s = entry.state
    expect(s.population, entry.date).toBe(population + s.arrived)
    for (const g of GOODS) expect(s.stock[g.id], `${entry.date} ${g.id}`).toBe(stock[g.id] + s.gained[g.id] - s.used[g.id])
    population = s.population
    stock = s.stock
  }
}

describe('летопись: снимок 18.11.2026', () => {
  const entries = chronicle(early, '2026-11-18')

  it('по записи на каждый день с занятием, новые сверху', () => {
    const dates = [...new Set(raw.progress.sessions.map((s) => s.date))].sort()
    expect(entries.map((e) => e.date)).toEqual([...dates].reverse())
    expect(entries.map((e) => e.turn)).toEqual(dates.map((_, i) => dates.length - i))
    expectClean(entries)
    expectChained(entries)
  })

  it('первая запись: день 1 закрыт, постройки-файлы построены', () => {
    const first = byDate(entries, '2026-10-27')
    expect(first).toMatchObject({ turn: 1, title: 'День 1 · Старт + B · архитектура 1', gap: null, earned: { xp: 70, coins: 70, gems: 0 } })
    expect(first.days).toEqual([{ cycle: '01-basic-month', n: 1, trackCode: 'B', track: 'Старт + B · архитектура 1' }])
    expect(first.topics).toContain('схема слоёв')
    expect(texts(first)).toEqual(['День 1 закрыт ядром', 'Построены постройки-файлы: «Штаб: репозиторий prep-basic», «Мастерская: pet-проект»'])
  })

  it('перерыв перед занятием — одной строкой, без упрёка', () => {
    const back = byDate(entries, '2026-11-11')
    expect(back.gap).toBe('Перерыв 10 рабочих дней')
    expect(texts(back)).toContain('Возвращение после паузы: 14 дней')
    expect(texts(back)).toContain('Получен трофей: «Возвращение»')
    expect(back.earned).toEqual({ xp: 20, coins: 0, gems: 1 })
    // занятия два дня подряд — перерыва нет
    expect(byDate(entries, '2026-11-12').gap).toBeNull()
    expect(byDate(entries, '2026-11-17').gap).toBe('Перерыв 2 рабочих дня')
  })

  it('день закрыт в свой последний день: перевал, задача, замер', () => {
    const day2 = byDate(entries, '2026-11-12')
    expect(texts(day2)).toEqual(
      expect.arrayContaining(['День 2 закрыт ядром', 'Пройден перевал «Baseline»', 'Задача 1512 «Number of Good Pairs» решена с разбором', 'Стартовый замер: задача 1512 за 14 мин']),
    )
    // сначала что сделано, потом что это дало
    expect(day2.study[0].text).toBe('День 2 закрыт ядром')
    expect(day2.earned).toEqual({ xp: 40, coins: 40, gems: 1 })
  })

  it('заработанное по записям сходится с итогом', () => {
    const world = worldAt(early, '2026-11-18')
    expect(entries.reduce((sum, e) => sum + e.earned.xp, 0)).toBe(world.totalXp)
    expect(entries.reduce((sum, e) => sum + e.earned.coins, 0)).toBe(world.wallet.coinsEarned)
    expect(entries.reduce((sum, e) => sum + e.earned.gems, 0)).toBe(world.wallet.gemsEarned)
  })

  it('итог последнего занятия — последняя запись летописи', () => {
    const last = lastTurn(early, '2026-11-18')!
    expect(last.entry).toEqual(entries[0])
    // позже, без новых занятий, запись та же
    expect(lastTurn(early, '2026-11-25')!.entry).toEqual(entries[0])
    expect(last.highlights.length).toBeLessThanOrEqual(5)
    expect(last.highlights).toEqual(texts(entries[0]).slice(0, 5))
  })

  it('пока занятий не было, летописи нет', () => {
    const before = sliceInputs(early, '2026-10-26')
    expect(chronicle(before, '2026-11-18')).toEqual([])
    expect(lastTurn(before, '2026-11-18')).toBeNull()
    expect(chronicle(early, '2026-10-26')).toEqual([])
  })
})

describe('летопись: пробный набор «цикл пройден, город — хутор»', () => {
  const started = performance.now()
  const entries = chronicle(closed, CLOSED_TODAY)
  const took = performance.now() - started
  const live = buildWorld(closed.rawCycles, closed.offplan, CLOSED_TODAY, closed.ledger)
  const dates = [...new Set(live.sessionDates)].sort()
  const all = entries.flatMap(texts)

  it('записей столько же, сколько дней с занятиями', () => {
    expect(entries).toHaveLength(dates.length)
    expect(oldFirst(entries).map((e) => e.date)).toEqual(dates)
    expect(oldFirst(entries).map((e) => e.turn)).toEqual(dates.map((_, i) => i + 1))
    expect(entries[0].turn).toBe(worldAt(closed, entries[0].date).town.turns)
  })

  it('в записях нет NaN, undefined и пустых', () => {
    expectClean(entries)
  })

  it('в летописи есть ступени, стройки, жители, перевалы и тесты', () => {
    expect(all).toContain('Новая ступень: «Лагерь». В центре — очаг с навесом')
    expect(all).toContain('Новая ступень: «Хутор». В центре — дом собраний')
    expect(all.filter((t) => t.startsWith('Достроено: ')).length).toBeGreaterThan(5)
    expect(all.filter((t) => t.startsWith('Улучшено: ')).length).toBeGreaterThan(2)
    expect(all.filter((t) => /^Приш(ёл|ло) \d+ жител/.test(t)).length).toBeGreaterThan(3)
    expect(all.filter((t) => t.startsWith('Ход принёс: ')).length).toBeGreaterThan(10)
    expect(all.filter((t) => t.startsWith('Пройден перевал ')).length).toBe(thePlan.keyPoints!.length)
    expect(all.filter((t) => /^(Сдан|Пересдан) тест недели \d: \d+ из 20$/.test(t)).length).toBe(closed.rawCycles[0].progress.weeklyTests!.length)
    expect(all.filter((t) => /^День \d+ закрыт/.test(t)).length).toBe(thePlan.days.length)
    expect(all.filter((t) => t.startsWith('Маршрут «Базовый месяц» пройден'))).toHaveLength(1)
    expect(all).toContain('Куплено для города: котелок')
    expect(all).toContain('Выкуплена своя награда: «Вечер кино»')
  })

  it('жители и запасы сходятся от записи к записи и с итогом', () => {
    expectChained(entries)
    const last = worldAt(closed, entries[0].date).town
    expect(entries[0].state).toMatchObject({ tier: last.tier, population: last.population, stock: { food: last.food, wood: last.wood, brick: last.brick } })
    expect(entries.reduce((sum, e) => sum + e.state.arrived, 0)).toBe(last.population)
    // после последнего занятия ходов не было: жителей на сегодня столько же
    expect(live.town.population).toBe(last.population)
    // дерево и кирпич тратятся только на стройку: расход по записям равен цене всего, что построено и строится
    const spent = (pick: 'wood' | 'brick') =>
      last.buildings.reduce((sum, b) => {
        const top = b.pending?.level ?? b.level
        return sum + Array.from({ length: top }, (_, i) => buildCost(buildingType(b.type)!, i + 1)[pick]).reduce((a, c) => a + c, 0)
      }, 0)
    expect(entries.reduce((sum, e) => sum + e.state.used.wood, 0)).toBe(spent('wood'))
    expect(entries.reduce((sum, e) => sum + e.state.used.brick, 0)).toBe(spent('brick'))
    expect(entries.reduce((sum, e) => sum + e.state.gained.wood, 0) - spent('wood')).toBe(last.wood)
  })

  it('заработанное по записям сходится с итогом', () => {
    expect(entries.reduce((sum, e) => sum + e.earned.xp, 0)).toBe(live.totalXp)
    expect(entries.reduce((sum, e) => sum + e.earned.coins, 0)).toBe(live.wallet.coinsEarned)
    expect(entries.reduce((sum, e) => sum + e.earned.gems, 0)).toBe(live.wallet.gemsEarned)
    for (const entry of entries) {
      expect(entry.earned.xp, entry.date).toBeGreaterThanOrEqual(0)
      expect(entry.earned.gems, entry.date).toBeGreaterThanOrEqual(0)
    }
  })

  it('своя строка занятия попадает в запись его дня', () => {
    const sessions = closed.rawCycles[0].progress.sessions
    for (const s of sessions) {
      if (s.insight) expect(byDate(entries, s.date).insights, s.date).toContain(s.insight)
    }
    const without = entries.filter((e) => e.insights.length === 0).map((e) => e.date)
    expect(without).toEqual(without.filter((date) => !sessions.some((s) => s.date === date && s.insight)))
  })

  it('плановый перерыв назван плановым', () => {
    expect(byDate(entries, '2026-12-18').gap).toBe('Плановый перерыв 3 рабочих дня (командировка)')
    // 01.01 — один пропущенный рабочий день: это не перерыв
    expect(byDate(entries, '2027-01-04').gap).toBeNull()
    expect(gapText(2, 3, ['отпуск'])).toBe('Плановый перерыв 3 рабочих дня (отпуск), сверх него — 2 рабочих дня')
  })

  it('с названиями обликов постройки названы точнее', () => {
    const levelName: LevelNamer = (type, level) => (type === 'house' ? ['Палатка', 'Шалаш'][level - 1] : (buildingType(type)?.name ?? ''))
    const named = chronicle(closed, CLOSED_TODAY, { levelName }).flatMap(texts)
    expect(named).toContain('Достроено: жилище (палатка)')
    expect(named).toContain('Улучшено: жилище до уровня 2 (шалаш)')
    // облик, названный так же, как постройка, не повторяется
    expect(named).toContain('Достроено: огород, амбар')
  })

  it('итог последнего занятия: последняя запись и что будет готово дальше', () => {
    const last = lastTurn(closed, CLOSED_TODAY)!
    expect(last.entry).toEqual(entries[0])
    expect(last.highlights).toHaveLength(5)
    expect(last.highlights[0]).toBe('Маршрут «Базовый месяц» пройден. Звание: «Прошёл базовый маршрут»')
    // уже посчитанный сегодняшний мир можно отдать готовым
    expect(lastTurn(closed, CLOSED_TODAY, { world: live })).toEqual(last)
    for (const line of last.next) expect(line).not.toMatch(/NaN|undefined|null/)
    expect(last.next.some((line) => line.startsWith('Следующий ход принесёт: '))).toBe(true)
    // в полдень 06.01 улучшения амбара и причала ещё идут
    const noon = lastTurn(closed, CLOSED_TODAY, { now: new Date(2027, 0, 6, 12, 0) })!
    expect(noon.next.slice(0, 2)).toEqual(['Амбар улучшится до уровня 2 сегодня в 12:36', 'Рыбацкий причал улучшится до уровня 2 сегодня в 12:41'])
    expect(noon.entry).toEqual(entries[0])
  })

  it('летопись считается быстро', () => {
    // Вся летопись — десятки вызовов buildWorld. Время печатается, чтобы было видно, сколько это стоит.
    console.info(`летопись: ${entries.length} записей за ${took.toFixed(1)} мс`)
    expect(took).toBeLessThan(2000)
  })
})

describe('летопись: отдельные случаи', () => {
  it('день без действий в городе: в записи только учёба', () => {
    const entries = chronicle(early, '2026-11-18')
    for (const entry of entries) {
      expect(entry.town, entry.date).toEqual([])
      expect(entry.state, entry.date).toEqual({
        tier: 0,
        population: 0,
        arrived: 0,
        stock: { food: 0, wood: 0, brick: 0 },
        gained: { food: 0, wood: 0, brick: 0 },
        used: { food: 0, wood: 0, brick: 0 },
      })
    }
    // занятие, после которого ничего не закрыто: остаются темы
    const quiet = byDate(entries, '2026-11-18')
    expect(quiet.topics.length).toBeGreaterThan(0)
    expect(quiet.earned).toEqual({ xp: 0, coins: 0, gems: 0 })
    expect(earnedText(quiet.earned)).toBe('')
  })

  it('два занятия в один день — одна запись и один ход', () => {
    const inputs = scene((p) => {
      p.sessions.push(session('2026-11-18', 3, { from: '20:00', to: '20:40', topics: ['версии SDK', 'app/build.gradle.kts'], insight: 'Вторая мысль за день.' }))
      p.sessions.find((s) => s.date === '2026-11-18' && s.from === '15:30')!.insight = 'Первая мысль за день.'
    })
    const entries = chronicle(inputs, '2026-11-18')
    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({ date: '2026-11-18', turn: 5, title: 'День 3 · C · Gradle 1' })
    expect(entries[0].days).toHaveLength(1)
    expect(entries[0].insights).toEqual(['Первая мысль за день.', 'Вторая мысль за день.'])
    expect(entries[0].topics).toEqual(['app/build.gradle.kts', 'идея сайта с геймификацией', 'версии SDK'])
    expect(worldAt(inputs, '2026-11-18').town.turns).toBe(5)
  })

  it('два дня плана в один день — оба в заголовке', () => {
    const inputs = scene((p) => {
      p.sessions.push(session('2026-11-18', 4, { from: '21:00' }))
    })
    const entry = chronicle(inputs, '2026-11-18')[0]
    expect(entry.title).toBe('День 3 · C · Gradle 1; День 4 · Ревью + E · репетитор и первый workflow')
    expect(entry.days.map((d) => d.trackCode)).toEqual(['C1', 'E'])
  })

  // Город для случаев ниже: 23.11 стоянка становится лагерем и ставится жилище; 24.11 — огород.
  const camp: TownAction[] = [
    { at: '2026-11-23T18:00:00', do: 'tier' },
    { at: '2026-11-23T18:10:00', do: 'build', type: 'house' },
    { at: '2026-11-24T18:00:00', do: 'build', type: 'garden' },
  ]
  /** Занятия 23 и 24.11, потом шесть пропущенных рабочих дней и возвращение 03.12. */
  const afterBreak = (ledger: Partial<Ledger> = {}) =>
    scene((p) => {
      for (const date of ['2026-11-23', '2026-11-24', '2026-12-03', '2026-12-04', '2026-12-07']) p.sessions.push(session(date, 3))
    }, { town: camp, ...ledger })

  it('занятие после долгого перерыва: поломка видна в день возвращения, починка — на третьем занятии', () => {
    const inputs = afterBreak()
    const entries = chronicle(inputs, '2026-12-07')
    expectClean(entries)
    expectChained(entries)
    const back = byDate(entries, '2026-12-03')
    expect(back.gap).toBe('Перерыв 6 рабочих дней')
    const broken = back.town.find((line) => line.text.startsWith('После перерыва сломалось: '))!
    expect(['После перерыва сломалось: жилище', 'После перерыва сломалось: огород']).toContain(broken.text)
    expect(back.town[0]).toBe(broken)
    const thing = broken.text.split(': ')[1]
    // на втором занятии постройка ещё сломана, на третьем чинится сама
    expect(texts(byDate(entries, '2026-12-04')).some((t) => t.startsWith('Почин'))).toBe(false)
    expect(texts(byDate(entries, '2026-12-07'))).toContain(`Починилось само: ${thing}`)
    // пока сломано, итог занятия говорит, когда починится
    expect(lastTurn(inputs, '2026-12-03')!.next).toContain(`Починится само через 2 занятия: ${thing}`)
    expect(lastTurn(inputs, '2026-12-04')!.next).toContain(`Починится само на следующем занятии: ${thing}`)
    expect(lastTurn(inputs, '2026-12-07')!.next.some((line) => line.startsWith('Починится'))).toBe(false)
  })

  it('починка за монеты в день возвращения: и поломка, и починка в одной записи', () => {
    const free = afterBreak()
    const brokenId = worldAt(free, '2026-12-03').town.buildings.find((b) => b.broken)!.id
    const thing = buildingType(brokenId.split('-')[0])!.name.toLowerCase()
    const inputs = afterBreak({ town: [...camp, { at: '2026-12-03T19:00:00', do: 'repair', id: brokenId }] })
    const entries = chronicle(inputs, '2026-12-07')
    const back = texts(byDate(entries, '2026-12-03'))
    expect(back).toContain(`После перерыва сломалось: ${thing}`)
    expect(back).toContain(`Починено за монеты: ${thing}`)
    expect(entries.flatMap(texts).some((t) => t.startsWith('Починилось само'))).toBe(false)
    // починка целой постройки — пустое действие: в летопись не попадает
    const idle = afterBreak({ town: [...camp, { at: '2026-11-24T19:00:00', do: 'repair', id: 'house-1' }] })
    expect(chronicle(idle, '2026-11-24').flatMap(texts).some((t) => t.startsWith('Починено'))).toBe(false)
  })

  it('сломанное и починенное в тот же день украшение не теряется', () => {
    const decor = { purchases: [{ item: 'pot', date: '2026-11-23' }], repairs: [{ item: 'pot', date: '2026-12-03' }] }
    // башни нет, построек две и украшение: что сломается, решает правило; проверяем только согласованность записи
    const inputs = afterBreak(decor)
    const back = texts(byDate(chronicle(inputs, '2026-12-07'), '2026-12-03'))
    const struck = back.find((t) => t.startsWith('После перерыва сломалось: '))!
    expect(struck).toBeDefined()
    expect(back.includes('Починено за монеты: котелок')).toBe(struck.includes('котелок'))
  })

  it('стройка: что заложено и что достроено, и что принёс ход', () => {
    const inputs = afterBreak()
    const entries = chronicle(inputs, '2026-12-07')
    const first = byDate(entries, '2026-11-23')
    expect(texts(first)).toEqual(expect.arrayContaining(['Новая ступень: «Лагерь». В центре — очаг с навесом', 'Достроено: жилище']))
    expect(texts(byDate(entries, '2026-11-24'))).toContain('Достроено: огород')
    // огород построен вечером 24.11: первый урожай — на следующем ходу
    const turn = byDate(entries, '2026-12-03').state
    const world = worldAt(inputs, '2026-12-03').town
    expect(turn.stock).toEqual({ food: world.food, wood: world.wood, brick: world.brick })
    expect(turn.arrived).toBe(world.population)
    // вечером того же дня стройка ещё идёт — «заложено», а не «достроено»
    const evening = lastTurn(inputs, '2026-11-24', { now: new Date(2026, 10, 24, 18, 2) })!
    expect(evening.entry.town.map((line) => line.text)).toContain('Заложено: огород')
    expect(evening.next[0]).toBe('Огород достроится сегодня в 18:05')
  })

  /** Неделя занятий с понедельника 23.11 и понедельник 30.11; в лагере жилище, огород и лесопилка. */
  const week = (extra: TownAction[]) =>
    scene((p) => {
      for (const date of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30']) p.sessions.push(session(date, 3))
    }, { town: [...camp, { at: '2026-11-24T18:10:00', do: 'build', type: 'sawmill' }, ...extra] })
  const houseWood = buildCost(buildingType('house')!, 2).wood

  it('«ход принёс» считается отдельно от трат: стройка вечером того же дня', () => {
    const inputs = week([{ at: '2026-11-27T18:00:00', do: 'upgrade', id: 'house-1' }])
    const entries = chronicle(inputs, '2026-11-30')
    expectChained(entries)
    // что даст ход 27.11, известно накануне: город к вечеру 26.11 уже тот же
    const eve = worldAt(inputs, '2026-11-26').town
    const friday = byDate(entries, '2026-11-27')
    expect(eve.perTurn.wood).toBeGreaterThan(0)
    expect(friday.state.gained).toEqual({ food: eve.perTurn.food - eve.perTurn.eaten, wood: eve.perTurn.wood, brick: eve.perTurn.brick })
    expect(friday.state.used).toEqual({ food: 0, wood: houseWood, brick: 0 })
    expect(friday.state.stock.wood).toBe(eve.wood + eve.perTurn.wood - houseWood)
    expect(texts(friday)).toEqual(expect.arrayContaining(['Улучшено: жилище до уровня 2', `Ход принёс: еда +${friday.state.gained.food}, дерево +${eve.perTurn.wood}`, `На стройку ушло: дерево ${houseWood}`]))
  })

  it('стройка в день без занятия попадает в запись следующего учебного дня', () => {
    // 28.11 — суббота: улучшение жилища съедает дерево до хода 30.11
    const inputs = week([{ at: '2026-11-28T12:00:00', do: 'upgrade', id: 'house-1' }])
    const entries = chronicle(inputs, '2026-11-30')
    expectChained(entries)
    const friday = byDate(entries, '2026-11-27')
    const monday = byDate(entries, '2026-11-30')
    expect(friday.state.used).toEqual({ food: 0, wood: 0, brick: 0 })
    expect(texts(friday).some((t) => t.startsWith('Улучшено'))).toBe(false)
    const eve = worldAt(inputs, '2026-11-27').town
    expect(monday.state.gained.wood).toBe(eve.perTurn.wood)
    expect(monday.state.used).toEqual({ food: 0, wood: houseWood, brick: 0 })
    expect(monday.state.stock.wood).toBe(friday.state.stock.wood + eve.perTurn.wood - houseWood)
    expect(texts(monday)).toEqual(expect.arrayContaining(['Улучшено: жилище до уровня 2', `На стройку ушло: дерево ${houseWood}`]))
    // итог последнего занятия считает ту же запись, не строя всю летопись
    expect(lastTurn(inputs, '2026-11-30')!.entry).toEqual(monday)
  })

  it('запись вне плана — тоже учебный день', () => {
    const offplan: OffplanEntry[] = [
      { date: '2026-11-21', kind: 'video', title: 'Доклад про Gradle', source: 'YouTube', track: 'C1', takeaways: ['кэш конфигурации экономит фазу configuration', 'buildSrc ломает кэш'] },
      // без выводов запись не засчитана: дня занятий и хода она не даёт
      { date: '2026-11-22', kind: 'article', title: 'Статья без выводов' },
    ]
    const inputs = scene(() => {}, {}, offplan)
    const entries = chronicle(inputs, '2026-11-25')
    expect(entries.map((e) => e.date)).toEqual(['2026-11-21', '2026-11-18', '2026-11-17', '2026-11-12', '2026-11-11', '2026-10-27'])
    expect(entries[0]).toMatchObject({
      turn: 6,
      title: 'Вне плана',
      days: [],
      topics: [],
      gap: 'Перерыв 2 рабочих дня',
      side: [{ label: 'Видео или доклад: Доклад про Gradle', source: 'YouTube', takeaways: ['кэш конфигурации экономит фазу configuration', 'buildSrc ломает кэш'] }],
      earned: { xp: 10, coins: 10, gems: 0 },
    })
    expectClean(entries)
    expect(lastTurn(inputs, '2026-11-25')!.entry).toEqual(entries[0])
  })
})

describe('летопись: живые данные', () => {
  it('записи чистые, сходятся между собой и с итогом', () => {
    const inputs: WorldInputs = {
      rawCycles: liveCycles,
      offplan: liveOffplan,
      ledger: {
        purchases: repoPurchases,
        repairs: repoRepairs,
        town: repoTownActions,
        rewards: repoRewards,
        redeemed: repoRedeemed,
        signs: repoSigns,
        reviews: repoReviews,
        cards: repoCards,
      },
    }
    // дата позже всех записей: в летопись входят все занятия журнала
    const far = '2030-01-01'
    const entries = chronicle(inputs, far)
    const world = worldAt(inputs, far)
    expect(oldFirst(entries).map((e) => e.date)).toEqual([...new Set(world.sessionDates)].sort())
    expectClean(entries)
    expectChained(entries)
    expect(entries.reduce((sum, e) => sum + e.earned.xp, 0)).toBe(world.totalXp)
    expect(entries.reduce((sum, e) => sum + e.earned.coins, 0)).toBe(world.wallet.coinsEarned)
    expect(entries.reduce((sum, e) => sum + e.earned.gems, 0)).toBe(world.wallet.gemsEarned)
    expect(entries.reduce((sum, e) => sum + e.state.arrived, 0)).toBe(world.town.population)
    expect(lastTurn(inputs, far)?.entry ?? null).toEqual(entries[0] ?? null)
  })
})

describe('летопись: тексты', () => {
  it('перерыв', () => {
    expect(gapText(0, 0, [])).toBeNull()
    // один пропущенный рабочий день ничего не меняет в мире — и в летописи его нет
    expect(gapText(1, 0, [])).toBeNull()
    expect(gapText(2, 0, [])).toBe('Перерыв 2 рабочих дня')
    expect(gapText(6, 0, [])).toBe('Перерыв 6 рабочих дней')
    expect(gapText(21, 0, [])).toBe('Перерыв 21 рабочий день')
    expect(gapText(1, 2, ['болезнь'])).toBe('Плановый перерыв 2 рабочих дня (болезнь)')
    expect(gapText(0, 2, [])).toBe('Плановый перерыв 2 рабочих дня')
    expect(gapText(0, 5, ['отпуск', 'болезнь'])).toBe('Плановый перерыв 5 рабочих дней (отпуск, болезнь)')
  })

  it('закрытый день и жители', () => {
    expect(['minimum', 'core', 'extension'].map((state) => dayClosedText(7, state))).toEqual(['День 7 закрыт на минимуме', 'День 7 закрыт ядром', 'День 7 закрыт ядром и расширением'])
    expect([1, 2, 5, 11, 21].map((n) => residentsText(n, 30))).toEqual([
      'Пришёл 1 житель, теперь их 30',
      'Пришло 2 жителя, теперь их 30',
      'Пришло 5 жителей, теперь их 30',
      'Пришло 11 жителей, теперь их 30',
      'Пришёл 21 житель, теперь их 30',
    ])
  })

  it('даты и заработанное', () => {
    expect(dateText('2026-11-19')).toBe('19 ноября, чт')
    expect(monthText('2027-01-05')).toBe('Январь 2027')
    expect(earnedText({ xp: 60, coins: 60, gems: 1 })).toBe('60 XP · 60 монет · 1 камень')
    expect(earnedText({ xp: 20, coins: 0, gems: 0 })).toBe('20 XP')
    expect(whenText(new Date(2026, 10, 24, 18, 5).getTime(), '2026-11-24')).toBe('сегодня в 18:05')
    expect(whenText(new Date(2026, 10, 25, 7, 0).getTime(), '2026-11-24')).toBe('завтра в 07:00')
    expect(whenText(new Date(2026, 10, 27, 7, 0).getTime(), '2026-11-24')).toBe('27.11 в 07:00')
  })

  it('что будет готово дальше: колода к следующему рабочему дню', () => {
    // пятница 20.11: следующий рабочий день — понедельник 23.11
    const world = worldAt(early, '2026-11-20')
    const due = world.deck.filter((card) => card.due <= '2026-11-23').length
    expect(due).toBeGreaterThan(0)
    expect(nextUp(world, '2026-11-20').at(-1)).toMatch(new RegExp(`^Колода: 23\\.11 к повтору будет ${due} карточ`))
  })
})
