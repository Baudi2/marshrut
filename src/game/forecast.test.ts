import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: прогнозов в нём нет.
import progress from './fixtures/progress-2026-11-18.json'
import type { Attempt, Plan, PlanDay, Progress, RawCycle, WeeklyTest } from '../data/types'
import { buildWorld } from './engine'
import {
  MIN_PAIRS,
  MIN_TREND_PAIRS,
  amount,
  attemptKind,
  forecastReport,
  gapText,
  pairTitle,
  type ForecastPair,
} from './forecast'

const snapshot: RawCycle = {
  dir: '01-basic-month',
  plan: plan as unknown as Plan,
  progress: progress as unknown as Progress,
}

const planDay = (day: number, week: number): PlanDay => ({
  day,
  week,
  plannedDate: '2027-01-04',
  plannedWeekday: 'пн',
  track: `A · день ${day}`,
  trackCode: 'A',
  mode: 'light',
  plannedMinutes: 30,
  minimum: null,
  extension: null,
  steps: [{ n: 1, text: 'шаг', minutes: 30 }],
  resources: [],
  leetcode: { new: [], repeatFromEmptyEditor: [], pairIfFast: [], noHints: [] },
})

const noAssessment = { algorithms: null, systemDesign: null, gradle: null, cicd: null, aiTutorAndTests: null }

/** Маленький цикл, собранный руками: две недели, два дня, задачи 1 и 217 в плане. */
function tiny(n: number, patch: (p: Progress) => void): RawCycle {
  const id = `0${n}-tiny`
  const cycle: RawCycle = {
    dir: id,
    plan: {
      meta: { title: 'Проба', cycle: { n, id, name: `Проба ${n}`, summit: 'Вершина', rankOnComplete: 'Прошёл пробу' } },
      tracks: [{ code: 'A', name: 'Алгоритмы', startLevel: '', sessions: '', budget: '', target: '' }],
      weeks: [
        { n: 1, title: 'первая', goal: '', checkpoint: '' },
        { n: 2, title: 'вторая', goal: '', checkpoint: '' },
      ],
      days: [planDay(1, 1), planDay(2, 2)],
      leetcode: [
        { id: 1, title: 'Two Sum', url: '', difficulty: 'Easy', pattern: 'хеш-таблица', role: 'main', plannedDay: 1 },
        { id: 217, title: 'Contains Duplicate', url: '', difficulty: 'Easy', pattern: 'хеш-таблица', role: 'main', plannedDay: 2 },
      ],
    },
    progress: {
      meta: { updatedAt: '2027-01-08' },
      position: { currentDay: 1, currentStep: 1, daysDone: 0, daysTotal: 2, startedAt: '2027-01-04', pauses: [] },
      days: [],
      sessions: [],
      leetcode: [],
      baseline: {
        start: { day: 1, problemId: 1, minutes: null, result: null, selfAssessment: noAssessment },
        final: { day: 2, problemId: 217, minutes: null, result: null, selfAssessment: noAssessment },
      },
      mistakes: [],
      knowledgeChecks: [],
      openItems: [],
      observations: [],
    },
  }
  patch(cycle.progress)
  return cycle
}

const report = (...cycles: RawCycle[]) => forecastReport(buildWorld(cycles, [], '2027-03-01').cycles)

const weekly = (date: string, forecast: number | undefined, score: number, week = 1): WeeklyTest => ({
  week,
  date,
  score,
  max: 20,
  ...(forecast === undefined ? {} : { forecast }),
})

const attempt = (date: string, forecast: number | undefined, minutes: number | null, over: Partial<Attempt> = {}): Attempt => ({
  date,
  kind: 'timed-20',
  minutes,
  result: 'solved',
  selfSolved: true,
  ...(forecast === undefined ? {} : { forecast }),
  ...over,
})

/** Цикл с недельными тестами: [дата, прогноз, баллы]. */
const withTests = (...tests: [string, number | undefined, number][]) =>
  tiny(1, (p) => (p.weeklyTests = tests.map(([date, forecast, score]) => weekly(date, forecast, score))))

/** Цикл с попытками по задаче 217. */
const withAttempts = (...attempts: Attempt[]) =>
  tiny(1, (p) => p.leetcode.push({ id: 217, title: 'Contains Duplicate', status: 'solved-self', attempts }))

const day = (n: number) => `2027-01-${String(n).padStart(2, '0')}`

describe('прогнозов нет', () => {
  it('снимок на 18.11.2026: отчёт пустой и без ошибок', () => {
    const r = forecastReport(buildWorld([snapshot], [], '2026-11-18').cycles)
    expect(r.pairs).toEqual([])
    for (const scale of [r.tests, r.timed]) {
      expect(scale).toMatchObject({
        pairs: [],
        measured: 0,
        directed: 0,
        more: 0,
        less: 0,
        exact: 0,
        unsolved: 0,
        unmeasured: 0,
        meanGap: null,
        lean: null,
        trend: null,
        lines: [],
        note: null,
      })
    }
  })

  it('тесты и попытки без прогноза парами не считаются', () => {
    const r = report(
      tiny(1, (p) => {
        p.weeklyTests = [weekly(day(8), undefined, 16)]
        p.leetcode.push({ id: 217, title: 'Contains Duplicate', status: 'solved-self', attempts: [attempt(day(5), undefined, 14)] })
      }),
    )
    expect(r.pairs).toEqual([])
    expect(r.tests.lines).toEqual([])
  })

  it('прогноз, записанный не числом, пропускается', () => {
    const broken = tiny(1, (p) => {
      p.weeklyTests = [{ ...weekly(day(8), undefined, 16), forecast: '15' as unknown as number }]
    })
    expect(report(broken).pairs).toEqual([])
  })
})

describe('одна пара', () => {
  it('недельный тест: прогноз, факт и разница в баллах', () => {
    const r = report(withTests([day(8), 15, 19]))
    expect(r.pairs).toHaveLength(1)
    expect(r.pairs[0]).toMatchObject({
      key: '01-tiny:test:1:1',
      cycle: '01-tiny',
      cycleName: 'Проба 1',
      date: day(8),
      unit: 'points',
      week: 1,
      attempt: 1,
      max: 20,
      forecast: 15,
      fact: 19,
      diff: 4,
      side: 'more',
    })
    expect(pairTitle(r.pairs[0])).toBe('Тест недели 1')
    expect(gapText(r.pairs[0])).toBe('на 4 балла больше прогноза')
  })

  it('задача на таймере: прогноз, факт и разница в минутах', () => {
    const r = report(withAttempts(attempt(day(5), 12, 14)))
    expect(r.pairs[0]).toMatchObject({
      key: '01-tiny:problem:217:0',
      unit: 'minutes',
      problemId: 217,
      title: 'Contains Duplicate',
      kind: 'timed-20',
      limit: 20,
      solved: true,
      spent: 14,
      forecast: 12,
      fact: 14,
      diff: 2,
      side: 'more',
    })
    expect(pairTitle(r.pairs[0])).toBe('№217 Contains Duplicate')
    expect(gapText(r.pairs[0])).toBe('на 2 мин дольше прогноза')
  })

  it('по одной и по двум парам судить рано, но средняя разница уже известна', () => {
    const one = report(withTests([day(8), 15, 19])).tests
    expect(one).toMatchObject({ measured: 1, directed: 1, more: 1, meanGap: 4, lean: null, trend: null, note: null })
    expect(one.lines).toEqual([`Пока 1 пара: куда ты обычно ошибаешься, судить рано — нужно хотя бы ${MIN_PAIRS}.`])

    const two = report(withTests([day(8), 15, 19], [day(9), 18, 16])).tests
    expect(two).toMatchObject({ measured: 2, more: 1, less: 1, meanGap: 3, lean: null })
    expect(two.lines).toEqual([`Пока 2 пары: куда ты обычно ошибаешься, судить рано — нужно хотя бы ${MIN_PAIRS}.`])
  })
})

describe('три пары и больше', () => {
  it('на тестах ждёт меньше, чем выходит', () => {
    const s = report(withTests([day(8), 12, 16], [day(9), 14, 17], [day(10), 18, 17])).tests
    expect(s).toMatchObject({ measured: 3, directed: 3, more: 2, less: 1, exact: 0, meanGap: 2.7, lean: 'more', trend: null })
    expect(s.lines).toEqual(['На тестах ты чаще ждёшь меньше, чем выходит: 2 раза из 3. Средняя разница — 2,7 балла.'])
    expect(s.note).toBe(`Становится ли прогноз точнее, судить рано: нужно хотя бы ${MIN_TREND_PAIRS} пар, сейчас 3.`)
  })

  it('на тестах ждёт больше, чем выходит', () => {
    const s = report(withTests([day(8), 18, 14], [day(9), 17, 15], [day(10), 16, 16], [day(11), 19, 16])).tests
    expect(s).toMatchObject({ more: 0, less: 3, exact: 1, meanGap: 2.3, lean: 'less' })
    expect(s.lines[0]).toBe('На тестах ты чаще ждёшь больше, чем выходит: 3 раза из 4. Средняя разница — 2,3 балла.')
  })

  it('по времени ждёт меньше, чем уходит, и больше, чем уходит', () => {
    const under = report(withAttempts(attempt(day(5), 10, 18), attempt(day(6), 12, 15), attempt(day(7), 10, 19), attempt(day(8), 15, 14))).timed
    expect(under).toMatchObject({ more: 3, less: 1, meanGap: 5.3, lean: 'more' })
    expect(under.lines[0]).toBe('По времени ты чаще ждёшь меньше, чем уходит: 3 раза из 4. Средняя разница — 5,3 мин.')

    const over = report(withAttempts(attempt(day(5), 20, 12), attempt(day(6), 15, 11), attempt(day(7), 18, 14))).timed
    expect(over).toMatchObject({ more: 0, less: 3, meanGap: 5.3, lean: 'less' })
    expect(over.lines[0]).toBe('По времени ты чаще ждёшь больше, чем уходит: 3 раза из 3. Средняя разница — 5,3 мин.')
  })

  it('ни в одну сторону нет больше половины пар — перекоса нет', () => {
    const s = report(withTests([day(8), 12, 16], [day(9), 14, 17], [day(10), 18, 14], [day(11), 17, 15], [day(12), 16, 16])).tests
    expect(s).toMatchObject({ more: 2, less: 2, exact: 1, lean: 'even', meanGap: 2.6 })
    expect(s.lines[0]).toBe('На тестах перекоса нет: меньше, чем вышло, ждал 2 раза, больше — 2, точно — 1. Средняя разница — 2,6 балла.')
  })

  it('прогноз чаще совпадает с фактом', () => {
    const s = report(withAttempts(attempt(day(5), 12, 12), attempt(day(6), 15, 15), attempt(day(7), 10, 13))).timed
    expect(s).toMatchObject({ exact: 2, more: 1, lean: 'exact', meanGap: 1 })
    expect(s.lines[0]).toBe('По времени прогноз чаще совпадает с фактом: 2 раза из 3. Средняя разница — 1 мин.')
  })

  it('баллы и минуты считаются порознь', () => {
    const r = report(
      tiny(1, (p) => {
        p.weeklyTests = [weekly(day(8), 12, 16), weekly(day(9), 13, 17), weekly(day(10), 14, 18)]
        p.leetcode.push({
          id: 217,
          title: 'Contains Duplicate',
          status: 'solved-self',
          attempts: [attempt(day(5), 20, 10), attempt(day(6), 20, 10), attempt(day(7), 20, 10)],
        })
      }),
    )
    expect(r.pairs).toHaveLength(6)
    expect(r.tests).toMatchObject({ unit: 'points', measured: 3, meanGap: 4, lean: 'more' })
    expect(r.timed).toMatchObject({ unit: 'minutes', measured: 3, meanGap: 10, lean: 'less' })
    expect(r.tests.pairs.every((p) => p.unit === 'points')).toBe(true)
    expect(r.timed.pairs.every((p) => p.unit === 'minutes')).toBe(true)
  })
})

describe('пересдача теста', () => {
  it('у каждой попытки свой прогноз и своя пара', () => {
    const r = report(withTests([day(8), 16, 11], [day(12), 13, 17]))
    expect(r.tests.pairs).toMatchObject([
      { key: '01-tiny:test:1:1', attempt: 1, forecast: 16, fact: 11, diff: -5, side: 'less' },
      { key: '01-tiny:test:1:2', attempt: 2, forecast: 13, fact: 17, diff: 4, side: 'more' },
    ])
    expect(r.tests.pairs.map(pairTitle)).toEqual(['Тест недели 1', 'Тест недели 1, пересдача'])
    expect(r.tests.pairs.map(gapText)).toEqual(['на 5 баллов меньше прогноза', 'на 4 балла больше прогноза'])
  })

  it('первая попытка без прогноза в пары не идёт, но вторая остаётся пересдачей', () => {
    const r = report(withTests([day(8), undefined, 11], [day(12), 13, 17]))
    expect(r.tests.pairs).toHaveLength(1)
    expect(r.tests.pairs[0]).toMatchObject({ attempt: 2, forecast: 13, fact: 17 })
    expect(pairTitle(r.tests.pairs[0])).toBe('Тест недели 1, пересдача')
  })

  it('тесты разных недель — не пересдачи', () => {
    const r = report(tiny(1, (p) => (p.weeklyTests = [weekly(day(8), 15, 15, 1), weekly(day(15), 15, 16, 2)])))
    expect(r.tests.pairs.map(pairTitle)).toEqual(['Тест недели 1', 'Тест недели 2'])
    expect(gapText(r.tests.pairs[0])).toBe('как и ждал')
  })
})

describe('нерешённая задача', () => {
  const unsolved = (date: string, forecast: number, minutes: number | null) =>
    attempt(date, forecast, minutes, { result: 'not-solved', selfSolved: false })

  it('это факт без числа: в списке есть, в среднюю не входит', () => {
    const r = report(withAttempts(unsolved(day(5), 12, 20)))
    expect(r.pairs[0]).toMatchObject({ solved: false, spent: 20, forecast: 12, fact: null, diff: null, side: 'more' })
    expect(gapText(r.pairs[0])).toBe('ушло 20 мин')
    expect(r.timed).toMatchObject({ measured: 0, directed: 1, more: 1, unsolved: 1, meanGap: null, lean: null })
    expect(r.timed.note).toBe('Нерешённых задач с прогнозом — 1: в среднюю она не входит.')
  })

  it('ушло не меньше прогноза — прогноза не хватило; бросил раньше или минут нет — сторона неизвестна', () => {
    const sides = (minutes: number | null) => report(withAttempts(unsolved(day(5), 12, minutes))).timed.pairs[0].side
    expect(sides(12)).toBe('more')
    expect(sides(20)).toBe('more')
    expect(sides(8)).toBeNull()
    expect(sides(null)).toBeNull()
  })

  it('в счёт «ждёшь меньше, чем уходит» идёт, средняя считается по решённым', () => {
    const s = report(withAttempts(attempt(day(5), 10, 14), unsolved(day(6), 12, 20), attempt(day(7), 10, 16), unsolved(day(8), 15, 20))).timed
    expect(s).toMatchObject({ measured: 2, directed: 4, more: 4, unsolved: 2, meanGap: 5, lean: 'more' })
    expect(s.lines).toEqual(['По времени ты чаще ждёшь меньше, чем уходит: 4 раза из 4. Средняя разница — 5 мин.'])
    expect(s.note).toBe(
      `Становится ли прогноз точнее, судить рано: нужно хотя бы ${MIN_TREND_PAIRS} пар с числом, сейчас 2. Нерешённых задач с прогнозом — 2: в среднюю они не входят.`,
    )
  })

  it('нерешённая без минут и решённая без минут в счёт не идут', () => {
    const s = report(withAttempts(unsolved(day(5), 12, null), attempt(day(6), 12, null), attempt(day(7), 12, 15))).timed
    expect(s).toMatchObject({ measured: 1, directed: 1, unsolved: 1, unmeasured: 1, meanGap: 3, lean: null })
    expect(s.pairs.map(gapText)).toEqual(['', 'время не записано', 'на 3 мин дольше прогноза'])
    expect(s.lines).toEqual([`Сравнить пока можно 1 пару из 3: куда ты обычно ошибаешься, судить рано — нужно хотя бы ${MIN_PAIRS}.`])
    expect(s.note).toBe('Нерешённых задач с прогнозом — 1: в среднюю она не входит. Попыток без записанных минут — 1: сравнить не с чем.')
  })

  it('одни нерешённые: сторона есть, средней нет', () => {
    const s = report(withAttempts(unsolved(day(5), 12, 20), unsolved(day(6), 10, 20), unsolved(day(7), 15, 20))).timed
    expect(s).toMatchObject({ measured: 0, directed: 3, more: 3, meanGap: null, lean: 'more' })
    expect(s.lines[0]).toBe('По времени ты чаще ждёшь меньше, чем уходит: 3 раза из 3.')
  })
})

describe('пары из двух циклов', () => {
  const first = tiny(1, (p) => {
    p.weeklyTests = [weekly('2027-01-08', 12, 16), weekly('2027-01-15', 14, 17, 2)]
    p.leetcode.push({ id: 217, title: 'Contains Duplicate', status: 'solved-self', attempts: [attempt('2027-01-08', 12, 14)] })
  })
  const second = tiny(2, (p) => {
    p.weeklyTests = [weekly('2027-02-12', 15, 18)]
    p.leetcode.push({ id: 1, title: 'Two Sum', status: 'solved-self', attempts: [attempt('2027-02-10', 10, 9, { kind: 'duel' })] })
  })

  it('копятся через циклы и идут по порядку дат', () => {
    // Порядок циклов на входе не важен; в один день задача стоит раньше теста.
    const r = report(second, first)
    expect(r.pairs.map((p: ForecastPair) => [p.cycle, p.date, pairTitle(p)])).toEqual([
      ['01-tiny', '2027-01-08', '№217 Contains Duplicate'],
      ['01-tiny', '2027-01-08', 'Тест недели 1'],
      ['01-tiny', '2027-01-15', 'Тест недели 2'],
      ['02-tiny', '2027-02-10', '№1 Two Sum'],
      ['02-tiny', '2027-02-12', 'Тест недели 1'],
    ])
    expect(new Set(r.pairs.map((p) => p.key)).size).toBe(5)
  })

  it('сводка считается по всем циклам сразу', () => {
    // В каждом цикле тестов меньше трёх, вместе — три.
    expect(report(first).tests.lean).toBeNull()
    expect(report(second).tests.lean).toBeNull()
    const r = report(first, second)
    expect(r.tests).toMatchObject({ measured: 3, more: 3, meanGap: 3.3, lean: 'more' })
    expect(r.timed).toMatchObject({ measured: 2, more: 1, less: 1, lean: null })
    expect(r.timed.pairs[1]).toMatchObject({ cycle: '02-tiny', cycleName: 'Проба 2', kind: 'duel', limit: null, diff: -1, side: 'less' })
    expect(gapText(r.timed.pairs[1])).toBe('на 1 мин быстрее прогноза')
  })

  it('тест первой недели второго цикла — не пересдача теста первого', () => {
    const r = report(first, second)
    expect(r.tests.pairs.map((p) => [p.cycle, p.week, p.attempt])).toEqual([
      ['01-tiny', 1, 1],
      ['01-tiny', 2, 1],
      ['02-tiny', 1, 1],
    ])
  })
})

describe('становится ли прогноз точнее', () => {
  /** Попытки с прогнозом 10 минут и заданной разницей, по одной в день. */
  const gaps = (...diffs: number[]) => report(withAttempts(...diffs.map((diff, i) => attempt(day(i + 1), 10, 10 + diff)))).timed

  it('меньше шести пар с числом — судить рано', () => {
    const s = gaps(8, 6, 4, 2, 1)
    expect(s.trend).toBeNull()
    expect(s.lines).toHaveLength(1)
    expect(s.note).toBe(`Становится ли прогноз точнее, судить рано: нужно хотя бы ${MIN_TREND_PAIRS} пар, сейчас 5.`)
  })

  it('вторая половина ближе к факту — прогноз становится точнее', () => {
    const s = gaps(8, 6, 7, 3, 2, 1)
    expect(s.trend).toEqual({ size: 3, first: 7, second: 2, verdict: 'closer' })
    expect(s.lines[1]).toBe('В первых 3 парах средняя разница — 7 мин, в последних 3 — 2 мин: прогноз становится точнее.')
  })

  it('вторая половина дальше от факта — разница растёт, без оценки', () => {
    const s = gaps(1, 2, 3, 6, 5, 7)
    expect(s.trend).toEqual({ size: 3, first: 2, second: 6, verdict: 'farther' })
    expect(s.lines[1]).toBe('В первых 3 парах средняя разница — 2 мин, в последних 3 — 6 мин: разница растёт.')
  })

  it('перемена меньше единицы или меньше четверти прежней разницы — перемены нет', () => {
    // 2 → 1,3: меньше единицы.
    expect(gaps(2, 2, 2, 1, 1, 2).trend).toMatchObject({ first: 2, second: 1.3, verdict: 'same' })
    // 8 → 6,3: больше единицы, но меньше четверти от 8.
    expect(gaps(8, 8, 8, 6, 6, 7).trend).toMatchObject({ first: 8, second: 6.3, verdict: 'same' })
    expect(gaps(8, 8, 8, 6, 6, 6).trend).toMatchObject({ first: 8, second: 6, verdict: 'closer' })
    expect(gaps(2, 2, 2, 1, 1, 2).lines[1]).toBe('В первых 3 парах средняя разница — 2 мин, в последних 3 — 1,3 мин: заметной перемены нет.')
  })

  it('знак разницы не важен, при нечётном числе средняя пара не входит ни в одну половину', () => {
    const s = gaps(-6, 6, -6, 100, 1, -1, 1)
    expect(s.trend).toEqual({ size: 3, first: 6, second: 1, verdict: 'closer' })
  })

  it('нерешённые в половины не входят', () => {
    const solved = [8, 6, 7, 3, 2].map((diff, i) => attempt(day(i + 1), 10, 10 + diff))
    const s = report(withAttempts(...solved, attempt(day(9), 10, 20, { result: 'not-solved', selfSolved: false }))).timed
    expect(s).toMatchObject({ measured: 5, directed: 6, trend: null })
  })
})

describe('слова', () => {
  it('число согласуется с единицей шкалы', () => {
    expect([1, 2, 5, 2.5, 0].map((n) => amount(n, 'points'))).toEqual(['1 балл', '2 балла', '5 баллов', '2,5 балла', '0 баллов'])
    expect([1, 2.25, 14].map((n) => amount(n, 'minutes'))).toEqual(['1 мин', '2,3 мин', '14 мин'])
  })

  it('вид попытки называется коротко', () => {
    expect(['timed-20', 'optimal-10', 'duel', 'from-empty-editor', 'no-hints', 'другое'].map(attemptKind)).toEqual([
      'таймер 20 мин',
      'оптимальное решение, 10 мин',
      'дуэль с собой',
      'с пустого редактора',
      'без подсказок',
      'другое',
    ])
  })
})
