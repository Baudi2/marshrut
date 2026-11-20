import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Пробный набор «цикл пройден, город — хутор»: журнал цикла, покупки, город, колода и записи вне плана.
import closedProgress from '../../fixtures/closed-cycle/data/cycles/01-basic-month/progress.json'
import closedDeck from '../../fixtures/closed-cycle/data/deck.json'
import closedOffplan from '../../fixtures/closed-cycle/data/offplan.json'
import closedPurchases from '../../fixtures/closed-cycle/data/purchases.json'
import closedTown from '../../fixtures/closed-cycle/data/town.json'
import { offplan, rawCycles, repoCards, repoPurchases, repoRedeemed, repoRepairs, repoReviews, repoRewards, repoSigns, repoTownActions } from '../data/load'
import type { Ledger, OffplanEntry, Plan, Progress, RawCycle } from '../data/types'
import { buildWorld } from './engine'
// Снимок прогресса на 18.11.2026 — тот же, на котором считают тесты движка.
import snapshot from './fixtures/progress-2026-11-18.json'
import { ATTEMPTED, endOfDay, sliceCycle, sliceInputs, sliceLedger, sliceProgress, worldAt, type WorldInputs } from './history'

const thePlan = plan as unknown as Plan
const raw: RawCycle = { dir: '01-basic-month', plan: thePlan, progress: snapshot as unknown as Progress }
const early: WorldInputs = { rawCycles: [raw], offplan: [], ledger: { purchases: [], repairs: [] } }

const closedLedger: Ledger = {
  ...(closedPurchases as unknown as Ledger),
  town: closedTown.actions as Ledger['town'],
  reviews: closedDeck.reviews,
  cards: closedDeck.cards as Ledger['cards'],
}
const closed: WorldInputs = {
  rawCycles: [{ dir: '01-basic-month', plan: thePlan, progress: closedProgress as unknown as Progress }],
  offplan: closedOffplan.entries as OffplanEntry[],
  ledger: closedLedger,
}
const CLOSED_TODAY = '2027-01-06'

/** Копия снимка с правкой журнала. */
function patched(patch: (p: Progress) => void): RawCycle {
  const copy = structuredClone(raw)
  patch(copy.progress)
  return copy
}

const at = (inputs: WorldInputs, date: string) => worldAt(inputs, date)
const journal = (inputs: WorldInputs, date: string) => sliceCycle(inputs.rawCycles[0], date).progress

describe('мир на дату: снимок 18.11.2026', () => {
  it('на последнюю дату журнала это тот же мир, что строит buildWorld', () => {
    expect(at(early, '2026-11-18')).toEqual(buildWorld([raw], [], '2026-11-18'))
    // позже последней записи журнал уже не режется: меняется только «сегодня»
    expect(at(early, '2026-11-27')).toEqual(buildWorld([raw], [], '2026-11-27'))
  })

  it('раньше первого занятия мир пустой', () => {
    const world = at(early, '2026-10-26')
    expect(world.totalXp).toBe(0)
    expect(world.events).toEqual([])
    expect(world.wallet).toMatchObject({ coins: 0, gems: 0, coinsEarned: 0, gemsEarned: 0 })
    expect(world.sessionDates).toEqual([])
    expect(world.lastActivity).toBeNull()
    expect(world.active.daysDone).toBe(0)
    expect(world.active.current?.day.n).toBe(1)
    expect(world.active.buildings.every((b) => b.stage < 2)).toBe(true)
    expect(world.town).toMatchObject({ turns: 0, tier: 0, population: 0, buildings: [] })
    expect(world.trophies.some((t) => t.earned)).toBe(false)
    expect(world.deck).toEqual([])
  })

  it('очки приходят в тот день, когда заработаны', () => {
    // 27.10 — день 1 ядром и два файла; 11.11 — возвращение после паузы; 12.11 — день 2 и задача с разбором
    expect(['2026-10-27', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-18'].map((date) => at(early, date).totalXp)).toEqual([70, 70, 90, 130, 130])
  })

  it('день, начатый, но не закрытый к дате, — «в работе», без итога и файлов', () => {
    const days = journal(early, '2026-11-11').days
    expect(days.map((d) => [d.day, d.status])).toEqual([
      [1, 'core'],
      [2, 'in_progress'],
    ])
    expect(days[1]).toEqual({ day: 2, status: 'in_progress', dates: ['2026-11-11'], confirmed: true, plannedMinutes: 45 })
    const world = at(early, '2026-11-11')
    expect(world.active.current?.day.n).toBe(2)
    expect(world.active.days[1].state).toBe('current')
    // день, к которому ещё не приступали, в журнале не записан
    expect(journal(early, '2026-10-27').days.map((d) => d.day)).toEqual([1])
  })

  it('позиция на дату — первый день, не закрытый к ней; на последнюю дату позиция журнала', () => {
    const position = (date: string) => journal(early, date).position
    expect(position('2026-10-27')).toMatchObject({ currentDay: 2, currentStep: 1, daysDone: 1 })
    expect(position('2026-11-12')).toMatchObject({ currentDay: 3, currentStep: 1, daysDone: 2 })
    expect(position('2026-11-18')).toEqual(raw.progress.position)
    // привал известен, когда остался позади
    expect(position('2026-11-10').pauses).toEqual([])
    expect(position('2026-11-11').pauses).toHaveLength(1)
  })

  it('в журнале на дату нет ничего более позднего', () => {
    const cut = journal(early, '2026-11-11')
    expect(cut.sessions.map((s) => s.date)).toEqual(['2026-10-27', '2026-11-11'])
    expect(cut.knowledgeChecks).toEqual([])
    expect(cut.mistakes).toEqual([])
    expect(cut.leetcode.flatMap((p) => p.attempts)).toEqual([])
    // «решена до плана» — не попытка с датой: такой задача была с самого начала
    expect(cut.leetcode.map((p) => [p.id, p.status])).toEqual([[1, 'solved-before-plan']])
    expect(cut.baseline.start).toMatchObject({ minutes: null, result: null, selfAssessment: { algorithms: null } })
    expect(cut.meta.updatedAt).toBe('2026-11-11')
    // хвосты и наблюдения без дат — состояние «на сейчас»: в прошлом их нет
    expect(cut.openItems).toEqual([])
    expect(journal(early, '2026-11-18').openItems).toEqual(raw.progress.openItems)
  })

  it('исходные данные не меняются', () => {
    const before = structuredClone(early)
    for (const date of ['2026-10-26', '2026-10-27', '2026-11-11', '2026-11-12', '2026-11-18']) at(early, date)
    expect(early).toEqual(before)
  })
})

describe('мир на дату: пробный набор «цикл пройден»', () => {
  const live = buildWorld(closed.rawCycles, closed.offplan, CLOSED_TODAY, closed.ledger)
  const dates = [...new Set(live.sessionDates)].sort()

  it('на последнюю дату совпадает с buildWorld', () => {
    expect(at(closed, CLOSED_TODAY)).toEqual(live)
    expect(at(closed, '2027-02-01')).toEqual(buildWorld(closed.rawCycles, closed.offplan, '2027-02-01', closed.ledger))
  })

  it('ключевое совпадает: очки, кошелёк, город, постройки-файлы, закрытые дни', () => {
    const world = at(closed, CLOSED_TODAY)
    expect(world.totalXp).toBe(live.totalXp)
    expect(world.wallet).toEqual(live.wallet)
    expect(world.town).toEqual(live.town)
    expect(world.active.buildings.map((b) => b.stage)).toEqual(live.active.buildings.map((b) => b.stage))
    expect(world.active.days.map((d) => d.state)).toEqual(live.active.days.map((d) => d.state))
  })

  it('раньше первого занятия мир пустой, хотя журналы полны', () => {
    const world = at(closed, '2026-10-26')
    expect(world.totalXp).toBe(0)
    expect(world.wallet).toMatchObject({ coins: 0, gems: 0 })
    expect(world.owned).toEqual([])
    expect(world.signs).toEqual([])
    expect(world.redeemed).toEqual([])
    expect(world.deck).toEqual([])
    expect(world.side).toEqual([])
    expect(world.town).toMatchObject({ turns: 0, tier: 0, buildings: [], spent: { coins: 0, gems: 0 } })
    expect(world.active.daysDone).toBe(0)
  })

  it('от дня к дню ничего не убывает, а кошелёк не уходит в минус', () => {
    let prev = at(closed, '2026-10-26')
    for (const date of dates) {
      const world = at(closed, date)
      expect(world.totalXp, date).toBeGreaterThanOrEqual(prev.totalXp)
      expect(world.active.daysDone, date).toBeGreaterThanOrEqual(prev.active.daysDone)
      expect(world.wallet.coinsEarned, date).toBeGreaterThanOrEqual(prev.wallet.coinsEarned)
      expect(world.wallet.gemsEarned, date).toBeGreaterThanOrEqual(prev.wallet.gemsEarned)
      expect(world.town.population, date).toBeGreaterThanOrEqual(prev.town.population)
      expect(world.town.tier, date).toBeGreaterThanOrEqual(prev.town.tier)
      expect(world.wallet.coins, date).toBeGreaterThanOrEqual(0)
      expect(world.wallet.gems, date).toBeGreaterThanOrEqual(0)
      // ход города — один на учебный день
      expect(world.town.turns, date).toBe(dates.indexOf(date) + 1)
      expect(world.lastActivity).toBe(date)
      prev = world
    }
  })

  it('статус задачи на дату следует из попыток, сделанных к ней', () => {
    const status = (date: string, id: number) => journal(closed, date).leetcode.find((p) => p.id === id)?.status
    expect(status('2026-11-11', 1512)).toBeUndefined()
    expect(status('2026-11-12', 1512)).toBe('solved-with-walkthrough')
    expect(status('2026-11-20', 1512)).toBe('repeated-from-empty')
    expect(status(CLOSED_TODAY, 1512)).toBe(closed.rawCycles[0].progress.leetcode.find((p) => p.id === 1512)!.status)
  })

  it('ошибка побеждена с первого решения той же задачи после неё', () => {
    const beaten = (date: string) => journal(closed, date).mistakes.filter((m) => m.beaten).length
    expect(beaten('2026-11-19')).toBe(0)
    expect(beaten('2026-11-20')).toBe(1)
  })

  it('зелёный CI считается с первого события ci-fixed', () => {
    const ci = (date: string) => journal(closed, date).petProject?.ci
    expect(ci('2026-11-19')).toEqual({ helloWorldWorkflow: null, buildWorkflow: null })
    expect(ci('2026-11-20')).toEqual(closed.rawCycles[0].progress.petProject!.ci)
    expect(at(closed, '2026-11-19').trophies.find((t) => t.id === 'green')!.earned).toBe(false)
    expect(at(closed, '2026-11-20').trophies.find((t) => t.id === 'green')!.earned).toBe(true)
  })

  it('недели, тесты, замеры и плановые перерывы появляются в свой день', () => {
    expect(journal(closed, '2026-11-19').weeks).toEqual([])
    expect(journal(closed, '2026-11-20').weeks).toEqual([{ n: 1, closed: true, date: '2026-11-20' }])
    expect(journal(closed, '2026-11-20').weeklyTests?.map((t) => t.score)).toEqual([15])
    expect(journal(closed, '2026-11-23').weeklyTests?.map((t) => t.score)).toEqual([15, 19])
    expect(journal(closed, '2026-12-30').baseline.final.minutes).toBeNull()
    expect(journal(closed, '2026-12-31').baseline.final.minutes).toBe(11)
    expect(journal(closed, '2026-12-14').breaks).toEqual([])
    expect(journal(closed, '2026-12-15').breaks).toHaveLength(1)
  })

  it('журнал браузера режется по дню, а записи с часом — по моменту', () => {
    expect(sliceLedger(closedLedger, '2026-11-25')).toMatchObject({ purchases: [], town: [], redeemed: [], signs: [], reviews: [], cards: closedDeck.cards.filter((c) => c.date <= '2026-11-25') })
    const evening = sliceLedger(closedLedger, '2026-11-26')
    expect(evening.purchases.map((p) => p.item)).toEqual(['scarf', 'pot'])
    expect(evening.town?.map((a) => a.do)).toEqual(['tier', 'build'])
    // в 18:10 ступень уже начата, а жилище ещё не заложено
    expect(sliceLedger(closedLedger, '2026-11-26', new Date(2026, 10, 26, 18, 10)).town?.map((a) => a.do)).toEqual(['tier'])
    // список своих наград — не журнал: он не режется
    expect(evening.rewards).toEqual(closedLedger.rewards)
    expect(sliceLedger(closedLedger, CLOSED_TODAY)).toEqual(closedLedger)
  })

  it('город на утро: стройка, которая закончится вечером, ещё идёт', () => {
    // 06.01 в 11:40 начато улучшение амбара, часовое
    const noon = worldAt(closed, CLOSED_TODAY, new Date(2027, 0, 6, 12, 0)).town
    expect(noon.buildings.find((b) => b.id === 'barn-1')).toMatchObject({ level: 1, pending: { level: 2 } })
    expect(at(closed, CLOSED_TODAY).town.buildings.find((b) => b.id === 'barn-1')).toMatchObject({ level: 2, pending: null })
    // момент позже конца дня не раздвигает день
    expect(worldAt(closed, '2026-12-01', new Date(2027, 0, 6, 12, 0))).toEqual(at(closed, '2026-12-01'))
  })

  it('записи вне плана режутся по дате', () => {
    expect(sliceInputs(closed, '2026-11-21').offplan.map((e) => e.date)).toEqual(['2026-11-21'])
    expect(at(closed, '2026-11-20').side).toEqual([])
    expect(at(closed, '2026-11-22').side.filter((s) => s.counted)).toHaveLength(3)
  })

  it('исходные данные не меняются', () => {
    const before = structuredClone(closed)
    for (const date of dates) at(closed, date)
    expect(closed).toEqual(before)
  })
})

describe('мир на дату: приближения', () => {
  it('пропущенный день без дат известен с первого занятия следующего дня', () => {
    const cycle = patched((p) => {
      p.days = [
        { day: 1, status: 'core', dates: ['2026-10-27'] },
        { day: 2, status: 'skipped', dates: [] },
        { day: 3, status: 'in_progress', dates: ['2026-11-17'] },
      ]
      p.sessions = p.sessions.filter((s) => s.day !== 2)
      p.position.currentDay = 3
    })
    const days = (date: string) => sliceCycle(cycle, date).progress.days.map((d) => `${d.day}:${d.status}`)
    expect(days('2026-10-27')).toEqual(['1:core'])
    expect(days('2026-11-17')).toEqual(['1:core', '2:skipped', '3:in_progress'])
    expect(sliceCycle(cycle, '2026-10-27').progress.position.currentDay).toBe(2)
    expect(sliceCycle(cycle, '2026-11-17').progress.position.currentDay).toBe(3)
  })

  it('неделя без даты закрытия считается закрытой, когда закрыты все её дни', () => {
    const week = thePlan.days.filter((d) => d.week === 1).map((d) => d.day)
    const cycle = patched((p) => {
      p.days = week.map((day, i) => ({ day, status: 'core' as const, dates: [`2026-11-${String(10 + i).padStart(2, '0')}`] }))
      p.sessions = week.map((day, i) => ({ date: `2026-11-${String(10 + i).padStart(2, '0')}`, from: null, to: null, day, topics: ['тема'] }))
      p.weeks = [{ n: 1, closed: true }]
    })
    const last = `2026-11-${String(10 + week.length - 1).padStart(2, '0')}`
    expect(sliceCycle(cycle, '2026-11-10').progress.weeks).toEqual([])
    expect(sliceCycle(cycle, last).progress.weeks).toEqual([{ n: 1, closed: true }])
  })

  it('попытка без решения: задача в журнале есть, но сайт читает её как не начатую', () => {
    const cycle = patched((p) => {
      p.leetcode.push({
        id: 217,
        title: 'Contains Duplicate',
        status: 'solved-with-walkthrough',
        attempts: [
          { date: '2026-11-17', kind: 'timed-20', minutes: 20, result: 'not-solved', selfSolved: false },
          { date: '2026-11-18', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved', selfSolved: false },
        ],
        nextRepeat: { day: 6, kind: 'from-empty-editor' },
      })
    })
    const cut = sliceCycle(cycle, '2026-11-17').progress.leetcode.find((p) => p.id === 217)!
    expect(cut).toMatchObject({ status: ATTEMPTED, attempts: [{ kind: 'timed-20' }] })
    expect(cut.nextRepeat).toBeUndefined()
    const inputs: WorldInputs = { ...early, rawCycles: [cycle] }
    expect(at(inputs, '2026-11-17').active.problems.find((p) => p.id === 217)!.state).toBe('none')
    expect(at(inputs, '2026-11-18').totalXp - at(inputs, '2026-11-17').totalXp).toBe(10)
  })

  it('файлы дня относятся к его последней дате', () => {
    // день 2 шёл 11.11 и 12.11: файлы, записанные в нём, появляются 12.11
    const builtOn = (date: string) => at(early, date).active.buildings.filter((b) => b.stage >= 2).map((b) => b.item.id)
    expect(builtOn('2026-11-11')).toEqual(['hq', 'pet'])
    expect(sliceProgress(raw.progress, '2026-11-11', thePlan).days[1].artifacts).toBeUndefined()
    expect(sliceProgress(raw.progress, '2026-11-12', thePlan).days[1].artifacts).toEqual(raw.progress.days[1].artifacts)
  })

  it('побеждённая ошибка без задачи и зелёный CI без опоры известны с последнего дня занятий', () => {
    const cycle = patched((p) => {
      p.mistakes.push({ date: '2026-11-17', track: 'C1', problemId: null, text: 'спутал фазы сборки', beaten: true })
      p.petProject = { ...p.petProject, ci: { helloWorldWorkflow: 'green', buildWorkflow: null } }
    })
    const cut = (date: string) => sliceCycle(cycle, date).progress
    expect(cut('2026-11-17').mistakes.some((m) => m.beaten)).toBe(false)
    expect(cut('2026-11-18').mistakes.filter((m) => m.beaten).map((m) => m.text)).toEqual(['спутал фазы сборки'])
    expect(cut('2026-11-17').petProject?.ci?.helloWorldWorkflow).toBeNull()
    expect(cut('2026-11-18').petProject?.ci?.helloWorldWorkflow).toBe('green')
  })

  it('без плана позиция считается по записям дней', () => {
    expect(sliceProgress(raw.progress, '2026-10-27').position.currentDay).toBe(2)
    expect(sliceProgress(raw.progress, '2026-11-11').position.currentDay).toBe(2)
    expect(sliceProgress(raw.progress, '2026-11-18')).toEqual(sliceProgress(raw.progress, '2026-11-18', thePlan))
  })

  it('конец дня — тот же момент, что у buildWorld по умолчанию', () => {
    expect(endOfDay('2026-11-18')).toEqual(new Date(2026, 10, 18, 23, 59, 59))
  })
})

describe('мир на дату: живые данные', () => {
  it('на дату позже всех записей совпадает с buildWorld', () => {
    const ledger: Ledger = {
      purchases: repoPurchases,
      repairs: repoRepairs,
      town: repoTownActions,
      rewards: repoRewards,
      redeemed: repoRedeemed,
      signs: repoSigns,
      reviews: repoReviews,
      cards: repoCards,
    }
    const inputs: WorldInputs = { rawCycles, offplan, ledger }
    const far = '2030-01-01'
    const world = worldAt(inputs, far)
    const live = buildWorld(rawCycles, offplan, far, ledger)
    expect(world.totalXp).toBe(live.totalXp)
    expect(world.wallet).toEqual(live.wallet)
    expect(world.town).toEqual(live.town)
    expect(world.cycles.map((c) => c.buildings.map((b) => b.stage))).toEqual(live.cycles.map((c) => c.buildings.map((b) => b.stage)))
    expect(world.cycles.map((c) => c.days.map((d) => d.state))).toEqual(live.cycles.map((c) => c.days.map((d) => d.state)))
  })
})
