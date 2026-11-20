import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: живой progress.json меняется после каждого занятия.
import progress from './fixtures/progress-2026-11-18.json'
import type { Attempt, Plan, PlanDay, Progress, ProgressDay, ProgressProblem, RawCycle, WeeklyTest } from '../data/types'
import { buildWorld } from './engine'
import { cycleCaption, cycleSummary, deltaText, fullDate, fullPeriod, shortPeriod, summaryLines, summaryText } from './summary'

const PLAN = plan as unknown as Plan
const SNAPSHOT = progress as unknown as Progress

const raw: RawCycle = { dir: '01-basic-month', plan: PLAN, progress: SNAPSHOT }

/** Итог единственного цикла мира. */
function summaryOf(cycle: RawCycle, today: string) {
  const world = buildWorld([cycle], [], today)
  return { world, cycle: world.active, summary: cycleSummary(world, world.active) }
}

const dateOf = (day: number) => PLAN.days.find((d) => d.day === day)!.plannedDate
const lastDayOf = (week: number) => PLAN.days.filter((d) => d.week === week).slice(-1)[0].day

/** Недельный тест на 10 вопросов; lost — сколько вопросов трека потеряли по баллу. */
function weeklyTest(week: number, lost: Record<string, number> = {}): WeeklyTest {
  const left = { ...lost }
  const questions = ['A', 'A', 'A', 'B', 'B', 'C1', 'C1', 'C2', 'C2', 'E'].map((track, i) => {
    const minus = (left[track] ?? 0) > 0 ? 1 : 0
    if (minus) left[track]--
    return { q: `Неделя ${week}, вопрос ${i + 1}`, track, points: 2 - minus }
  })
  return {
    week,
    date: dateOf(lastDayOf(week)),
    score: questions.reduce((total, q) => total + q.points, 0),
    max: 20,
    questions,
  }
}

/**
 * Цикл снимка, закрытый программно: каждый день — в свою плановую дату, одно занятие на час.
 * День 4 закрыт на минимуме, день 6 — с расширением, остальные ядром. Все файлы сохранены, недели закрыты,
 * тесты сданы, основные задачи решены, повторены и решены без подсказок; 217 решена после разбора.
 */
function closedCycle(patch: (p: Progress) => void = () => {}): RawCycle {
  const days: ProgressDay[] = PLAN.days.map((d) => ({
    day: d.day,
    status: d.day === 4 ? 'minimum' : d.day === 6 ? 'extension' : 'core',
    dates: [d.plannedDate],
    artifacts: (PLAN.camp ?? [])
      .filter((item) => item.day === d.day)
      .map((item) => ({ repo: item.repo, path: item.path.replace('*', '1512-number-of-good-pairs'), state: 'committed' })),
  }))
  const solved = (day: number, kind: string, minutes: number): Attempt => ({
    date: dateOf(day),
    kind,
    minutes,
    result: 'solved',
    selfSolved: true,
  })
  const leetcode: ProgressProblem[] = PLAN.leetcode
    .filter((p) => p.role === 'main' || p.role === 'baseline' || p.role === 'baseline-final')
    .map((p) => {
      const attempts: Attempt[] =
        p.id === 217
          ? [
              { date: dateOf(p.plannedDay), kind: 'timed-20', minutes: 20, result: 'not-solved', selfSolved: false },
              { date: dateOf(p.plannedDay), kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved', selfSolved: false },
            ]
          : [solved(p.plannedDay, 'timed-20', p.id === 349 ? 11 : 12)]
      if (p.repeatDay) attempts.push(solved(p.repeatDay, 'from-empty-editor', 7))
      if (p.noHintsDay) attempts.push(solved(p.noHintsDay, 'no-hints', 9))
      return {
        id: p.id,
        title: p.title,
        status: p.noHintsDay ? 'solved-no-hints' : p.repeatDay ? 'repeated-from-empty' : 'solved-self',
        attempts,
      }
    })
  const closed: Progress = {
    meta: { updatedAt: '2026-12-08' },
    position: { currentDay: 30, currentStep: 1, daysDone: 30, daysTotal: 30, startedAt: '2026-10-27', pauses: [] },
    days,
    sessions: PLAN.days.map((d) => ({ date: d.plannedDate, from: '18:00', to: '19:00', day: d.day, topics: ['занятие'] })),
    leetcode,
    baseline: {
      start: {
        day: 2,
        date: dateOf(2),
        problemId: 1512,
        minutes: 14,
        result: 'решил перебором',
        selfAssessment: { algorithms: 2, systemDesign: 1, gradle: 2, cicd: 1, aiTutorAndTests: 3 },
      },
      final: {
        day: 28,
        date: dateOf(28),
        problemId: 349,
        minutes: 11,
        result: 'решил сам',
        selfAssessment: { algorithms: 4, systemDesign: 3, gradle: 4, cicd: 3, aiTutorAndTests: 4 },
      },
    },
    mistakes: SNAPSHOT.mistakes.map((m, i) => (i < 2 ? { ...m, beaten: true } : m)),
    knowledgeChecks: SNAPSHOT.knowledgeChecks,
    petProject: { ci: { helloWorldWorkflow: 'green', buildWorkflow: 'green' } },
    openItems: [],
    observations: [],
    // 4.11 в исходном графике — праздник между днями 6 и 7.
    breaks: [{ from: '2026-11-04', to: '2026-11-04', reason: 'праздник' }],
    weeks: PLAN.weeks.map((w) => ({ n: w.n, closed: true, date: dateOf(lastDayOf(w.n)) })),
    weeklyTests: [
      weeklyTest(1, { A: 1, B: 1 }),
      weeklyTest(2, { C1: 2 }),
      weeklyTest(3),
      weeklyTest(4, { A: 2, C2: 2 }),
      weeklyTest(5, { A: 3, B: 2, E: 1 }),
      weeklyTest(6),
    ],
  }
  patch(closed)
  return { dir: '01-basic-month', plan: PLAN, progress: closed }
}

const planDay = (day: number, week: number, trackCode: string, plannedMinutes: number): PlanDay => ({
  day,
  week,
  plannedDate: '2027-01-04',
  plannedWeekday: 'пн',
  track: `${trackCode} · день ${day}`,
  trackCode,
  mode: 'light',
  plannedMinutes,
  minimum: null,
  extension: null,
  steps: [{ n: 1, text: 'шаг', minutes: plannedMinutes }],
  resources: [],
  leetcode: { new: [], repeatFromEmptyEditor: [], pairIfFast: [], noHints: [] },
})

const noAssessment = { algorithms: null, systemDesign: null, gradle: null, cicd: null, aiTutorAndTests: null }

/** Маленький цикл без задач, файлов, перевалов и рангов: две недели, четыре дня, два трека. */
function tiny(patch: (p: Progress) => void = () => {}): RawCycle {
  const cycle: RawCycle = {
    dir: '09-tiny',
    plan: {
      meta: { title: 'Проба', cycle: { n: 9, id: '09-tiny', name: 'Проба', summit: 'Вершина', rankOnComplete: 'Прошёл пробу' } },
      tracks: [
        { code: 'A', name: 'Алгоритмы', startLevel: '', sessions: '', budget: '', target: '' },
        { code: 'B', name: 'Дизайн', startLevel: '', sessions: '', budget: '', target: '' },
      ],
      weeks: [
        { n: 1, title: 'первая', goal: '', checkpoint: '' },
        { n: 2, title: 'вторая', goal: '', checkpoint: '' },
      ],
      days: [planDay(1, 1, 'A', 30), planDay(2, 1, 'B', 60), planDay(3, 2, 'A', 45), planDay(4, 2, 'B', 60)],
      leetcode: [],
    },
    progress: {
      meta: { updatedAt: '2027-01-08' },
      position: { currentDay: 1, currentStep: 1, daysDone: 0, daysTotal: 4, startedAt: '2027-01-04', pauses: [] },
      days: [],
      sessions: [],
      leetcode: [],
      baseline: {
        start: { day: 1, problemId: 1, minutes: null, result: null, selfAssessment: noAssessment },
        final: { day: 4, problemId: 2, minutes: null, result: null, selfAssessment: noAssessment },
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

/** Все числа итога, где бы они ни лежали. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(numbersIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn)
  return []
}

describe('даты итога', () => {
  it('у итога цикла дата с годом, год начала пишется, только если он другой', () => {
    expect(fullDate('2026-11-18')).toBe('18.11.2026')
    expect(fullPeriod('2026-10-27', '2026-11-18')).toBe('27.10–18.11.2026')
    expect(fullPeriod('2026-12-27', '2027-01-05')).toBe('27.12.2026–05.01.2027')
    expect(fullPeriod('2026-11-18', '2026-11-18')).toBe('18.11.2026')
    expect(shortPeriod('2026-10-28', '2026-11-10')).toBe('28.10–10.11')
    expect(shortPeriod('2026-11-04', '2026-11-04')).toBe('04.11')
  })

  it('разница замеров названа без оценки', () => {
    expect([-3, 2, 0].map(deltaText)).toEqual(['на 3 мин быстрее', 'на 2 мин дольше', 'столько же'])
  })
})

describe('итог цикла на 18.11.2026: цикл идёт, день 3 из 30', () => {
  const { world, cycle, summary: s } = summaryOf(raw, '2026-11-19')

  it('заголовок: цикл идёт, звания ещё нет', () => {
    expect(s).toMatchObject({
      id: '01-basic-month',
      n: 1,
      name: 'Базовый месяц',
      status: 'running',
      active: true,
      rank: null,
      rankOnComplete: 'Прошёл базовый маршрут',
      summit: 'База восстановлена',
      currentDay: 3,
      asOf: '2026-11-18',
    })
    expect(cycleCaption(cycle)).toBe('Цикл на сегодня: день 3 из 30')
  })

  it('сроки: 23 календарных дня, из них 14 — привал', () => {
    expect(s.dates).toEqual({
      first: '2026-10-27',
      last: '2026-11-18',
      calendarDays: 23,
      activeDays: 5,
      sessions: 5,
      rests: [{ from: '2026-10-28', to: '2026-11-10', days: 14, planned: false, note: 'пауза после дня 1; вернулся и продолжил с дня 2' }],
      restDays: 14,
      breakWorkdays: 0,
      breakLimit: 10,
    })
  })

  it('дни: два закрыты ядром, третий в работе', () => {
    expect(s.days).toEqual({ total: 30, closed: 2, minimum: 0, core: 2, extension: 0, skipped: 0, inProgress: [3], left: 28 })
  })

  it('время — то же, что в карточке «Время: план и факт»', () => {
    expect(s.time).toMatchObject({ days: 2, measured: 2, unmeasured: 0, planned: 105, fact: 281, plannedAll: 1469 })
  })

  it('недели: началась только первая, тестов нет', () => {
    expect(s.weeks).toHaveLength(6)
    expect(s.weeks[0]).toEqual({ n: 1, started: true, daysDone: 2, daysTotal: 4, closed: false, test: null })
    expect(s.weeks.slice(1).every((w) => !w.started && w.daysDone === 0 && w.test === null)).toBe(true)
    expect(s.tests).toEqual({ taken: 0, score: 0, max: 0 })
  })

  it('треки: дни, очки цикла и зачёт на ранг', () => {
    expect(s.tracks.map((t) => [t.code, t.daysDone, t.daysTotal, t.xp, t.rank?.met, t.rank?.total, t.rank?.done])).toEqual([
      ['A', 1, 11, 40, 0, 6, false],
      ['B', 1, 6, 50, 0, 3, false],
      ['C1', 0, 3, 0, 0, 3, false],
      ['C2', 0, 3, 0, 0, 4, false],
      ['E', 0, 6, 0, 0, 3, false],
    ])
    expect(s.tracks[0].time).toEqual({ planned: 45, fact: 104, measured: 1 })
    // Два общих файла и возвращение после паузы — без трека.
    expect(s.offTrackXp).toBe(40)
  })

  it('задачи: одна с разбором, одна до плана; пары в «не начато» не идут', () => {
    expect(s.problems).toEqual({
      total: 23,
      planned: 12,
      notStarted: 11,
      unsolved: 0,
      states: [
        { state: 'walkthrough', label: 'решена с разбором', count: 1 },
        { state: 'before', label: 'решена до плана', count: 1 },
      ],
      first: { self: 0, walkthrough: 1 },
      repeated: { have: 0, of: 9 },
      noHints: { have: 0, of: 3 },
      timed: { tried: 1, inLimit: 1 },
    })
  })

  it('замер: начало есть, конец впереди, самооценки нет', () => {
    expect(s.baseline.start).toEqual({
      day: 2,
      date: '2026-11-12',
      problemId: 1512,
      title: 'Number of Good Pairs',
      minutes: 14,
      limit: 20,
      result: 'решил перебором; оптимальное решение сам не написал',
      done: true,
    })
    expect(s.baseline.final).toMatchObject({ day: 28, problemId: 349, minutes: null, done: false })
    expect(s.baseline.delta).toBeNull()
    expect(s.baseline.assessed).toBe(false)
    expect(s.baseline.self.map((t) => t.code)).toEqual(['A', 'B', 'C1', 'C2', 'E'])
  })

  it('проверки понимания и журнал ошибок', () => {
    expect(s.checks).toEqual({ correct: 3, partial: 3, wrong: 4, total: 10 })
    expect(s.mistakes).toEqual({ total: 5, beaten: 0 })
  })

  it('файлы: два построены, шесть в стройке', () => {
    expect(s.files).toMatchObject({ built: 2, inWork: 6, total: 22 })
    expect(s.files.list[0]).toEqual({
      id: 'hq',
      title: 'Штаб: репозиторий prep-basic',
      path: 'prep-basic',
      track: null,
      stage: 2,
      stageLabel: 'построен',
    })
    expect(s.files.list.find((f) => f.id === 'layers')).toMatchObject({ path: 'design/00-layers.md', track: 'B', stage: 1, stageLabel: 'стройка' })
  })

  it('заработано: очки и монеты цикла, камень за перевал; трофеи в камни цикла не входят', () => {
    expect(s.passes.map((p) => [p.day, p.done])).toEqual([[2, true], [7, false], [20, false], [28, false], [29, false], [30, false]])
    expect(s.earned).toEqual({ xp: 130, coins: 110, gems: { passes: 1, passesOf: 6, tests: 0, testsOf: 18, total: 1 } })
    // У мира камней больше: трофей «Возвращение» к циклу не привязан.
    expect(world.wallet.gemsEarned).toBe(2)
    expect(s.allTime).toMatchObject({ xp: 130, level: 1, trophies: { earned: 1, gems: 1 } })
  })

  it('текст итога: строки с цифрами журнала, треки впереди — одной строкой', () => {
    expect(summaryLines(s)).toEqual([
      'Цикл 1 «Базовый месяц» на 18.11.2026: день 3 из 30.',
      'Сроки: 27.10–18.11.2026 — 23 календарных дня, из них 14 на паузах (привал 28.10–10.11). Дней с занятиями — 5, занятий — 5.',
      'Дни: закрыто 2 из 30 (ядром — 2), осталось — 28; день 3 в работе.',
      'Время: план 1 ч 45 мин, факт 4 ч 41 мин — по 2 закрытым дням с замером.',
      'Недели: по чекпоинту закрыто 0 из 6; недельных тестов пока нет.',
      'Трек A «Алгоритмы с нуля»: дней 1 из 11, 40 XP, условий ранга «База» выполнено 0 из 6.',
      'Трек B «System Design с основ»: дней 1 из 6, 50 XP, условий ранга «База» выполнено 0 из 3.',
      'Треки C1, C2, E ещё впереди.',
      'Задачи LeetCode: решена с разбором — 1, решена до плана — 1; из 12 основных не начато — 11; на таймере в лимит — 1 из 1.',
      'Замер: в начале — 14 мин из 20 (задача 1512, день 2); замер в конце цикла ещё не сделан. Самооценка по трекам не записана.',
      'Проверки понимания, первый ответ: верно — 3, частично — 3, неверно — 4. Журнал ошибок: 5 записей, побеждено — 0.',
      'Файлы цикла: построено 2 из 22 («Штаб: репозиторий prep-basic», «Мастерская: pet-проект»), в стройке — 6.',
      'Заработано за цикл: 130 XP, 110 монет, 1 камень (перевалы — 1, недельные тесты — 0). Общий уровень — 1, всего 130 XP.',
    ])
    expect(summaryText(s)).toBe(summaryLines(s).join('\n'))
  })

  it('текст обычный: без разметки, эмодзи и пустых дробей', () => {
    expect(summaryText(s)).not.toMatch(/[*_#`<>]|\p{Extended_Pictographic}/u)
    expect(summaryText(s)).not.toMatch(/NaN|undefined|null|\b0 из 0\b/)
  })

  it('итог не зависит от сегодняшнего дня: считается по журналу', () => {
    expect(summaryOf(raw, '2026-12-31').summary).toEqual(s)
  })
})

describe('итог закрытого цикла', () => {
  const { world, cycle, summary: s } = summaryOf(closedCycle(), '2026-12-08')

  it('цикл пройден: звание и вершина', () => {
    expect(cycle.done).toBe(true)
    expect(s).toMatchObject({ status: 'done', rank: 'Прошёл базовый маршрут', summit: 'База восстановлена', currentDay: null, asOf: '2026-12-08' })
    expect(cycleCaption(cycle)).toBe('Цикл пройден')
    expect(world.ranksEarned).toEqual(['Прошёл базовый маршрут'])
  })

  it('сроки: 43 календарных дня, 30 дней с занятиями, один день планового перерыва', () => {
    expect(s.dates).toEqual({
      first: '2026-10-27',
      last: '2026-12-08',
      calendarDays: 43,
      activeDays: 30,
      sessions: 30,
      rests: [{ from: '2026-11-04', to: '2026-11-04', days: 1, planned: true, note: 'праздник' }],
      restDays: 1,
      breakWorkdays: 1,
      breakLimit: 10,
    })
  })

  it('дни: все тридцать закрыты, уровни закрытия порознь', () => {
    expect(s.days).toEqual({ total: 30, closed: 30, minimum: 1, core: 28, extension: 1, skipped: 0, inProgress: [], left: 0 })
  })

  it('время: 30 часов при плане 24 ч 29 мин', () => {
    expect(s.time).toEqual({ days: 30, measured: 30, unmeasured: 0, planned: 1469, fact: 1800, offCore: 2, plannedClosed: 1469, plannedAll: 1469 })
  })

  it('недели: все закрыты, у каждой лучший тест и камни за него', () => {
    expect(s.weeks.map((w) => [w.n, w.daysDone, w.daysTotal, w.closed, w.test?.score, w.test?.gems])).toEqual([
      [1, 4, 4, true, 18, 3],
      [2, 4, 4, true, 18, 3],
      [3, 5, 5, true, 20, 3],
      [4, 5, 5, true, 16, 2],
      [5, 5, 5, true, 14, 2],
      [6, 7, 7, true, 20, 3],
    ])
    expect(s.tests).toEqual({ taken: 6, score: 106, max: 120 })
  })

  it('пересдача: в итог идёт лучшая попытка', () => {
    const retake = summaryOf(
      closedCycle((p) => p.weeklyTests!.push({ ...weeklyTest(5), date: '2026-12-01' })),
      '2026-12-08',
    ).summary
    expect(retake.weeks[4].test).toEqual({ score: 20, max: 20, date: '2026-12-01', attempts: 2, gems: 3 })
    expect(retake.tests).toEqual({ taken: 6, score: 112, max: 120 })
    expect(retake.earned.gems).toMatchObject({ tests: 17, total: 23 })
  })

  it('треки: все дни пройдены, ранг получен у каждого, очки сходятся с общей суммой', () => {
    expect(s.tracks.map((t) => [t.code, t.daysDone, t.daysTotal, t.xp, t.rank])).toEqual([
      ['A', 11, 11, 825, { name: 'База', done: true, met: 6, total: 6 }],
      ['B', 6, 6, 395, { name: 'База', done: true, met: 3, total: 3 }],
      ['C1', 3, 3, 170, { name: 'База', done: true, met: 3, total: 3 }],
      ['C2', 3, 3, 210, { name: 'База', done: true, met: 4, total: 4 }],
      ['E', 6, 6, 200, { name: 'База', done: true, met: 3, total: 3 }],
    ])
    // Вне треков: ретро, три общих файла и шесть недельных чекпоинтов.
    expect(s.offTrackXp).toBe(380)
    expect(s.tracks.reduce((total, t) => total + t.xp, 0) + s.offTrackXp).toBe(s.earned.xp)
    expect(s.tracks.map((t) => t.time.fact)).toEqual([660, 360, 180, 180, 360])
  })

  it('без зелёного CI ранг трека C2 не получен, остальные на месте', () => {
    const red = summaryOf(
      closedCycle((p) => {
        p.petProject = { ci: { helloWorldWorkflow: null, buildWorkflow: 'red' } }
      }),
      '2026-12-08',
    ).summary
    expect(red.tracks.map((t) => [t.code, t.rank?.done, t.rank?.met])).toEqual([
      ['A', true, 6],
      ['B', true, 3],
      ['C1', true, 3],
      ['C2', false, 3],
      ['E', true, 3],
    ])
    expect(summaryLines(red)).toContain('Трек C2 «CI/CD»: дней 3 из 3, 170 XP, условий ранга «База» выполнено 3 из 4.')
  })

  it('задачи: состояния, первое решение, повторы и таймер', () => {
    expect(s.problems).toEqual({
      total: 22,
      planned: 12,
      notStarted: 0,
      unsolved: 0,
      states: [
        { state: 'self', label: 'решена сама', count: 3 },
        { state: 'repeated', label: 'повторена с пустого редактора', count: 6 },
        { state: 'nohints', label: 'решена без подсказок', count: 3 },
      ],
      // 217 решена после разбора и на таймере в лимит не уложилась.
      first: { self: 11, walkthrough: 1 },
      repeated: { have: 9, of: 9 },
      noHints: { have: 3, of: 3 },
      timed: { tried: 12, inLimit: 11 },
    })
  })

  it('замер: было 14 минут, стало 11; самооценка по каждому треку', () => {
    expect(s.baseline.start).toMatchObject({ minutes: 14, limit: 20, done: true })
    expect(s.baseline.final).toMatchObject({ day: 28, date: '2026-12-04', problemId: 349, minutes: 11, limit: 20, done: true })
    expect(s.baseline.delta).toBe(-3)
    expect(s.baseline.assessed).toBe(true)
    expect(s.baseline.self.map((t) => [t.code, t.start, t.final])).toEqual([
      ['A', 2, 4],
      ['B', 1, 3],
      ['C1', 2, 4],
      ['C2', 1, 3],
      ['E', 3, 4],
    ])
  })

  it('ошибки: две из пяти побеждены', () => {
    expect(s.checks).toEqual({ correct: 3, partial: 3, wrong: 4, total: 10 })
    expect(s.mistakes).toEqual({ total: 5, beaten: 2 })
  })

  it('файлы: построены все, с пристройкой — те, что дописывались', () => {
    expect(s.files).toMatchObject({ built: 22, inWork: 0, total: 22 })
    expect(s.files.list.filter((f) => f.stage === 3).map((f) => f.id)).toEqual([
      'pet',
      'cheatsheet',
      'solutions',
      'algo-mistakes',
      'baseline',
      'gradle-anatomy',
      'ci-notes',
      'workflow',
      'tests',
      'design-mistakes',
    ])
    expect(s.files.list.every((f) => f.stageLabel === (f.stage === 3 ? 'с пристройкой' : 'построен'))).toBe(true)
  })

  it('заработано: 2180 XP, 1880 монет, 22 камня — шесть перевалов и шестнадцать за тесты', () => {
    expect(s.passes.every((p) => p.done)).toBe(true)
    expect(s.earned).toEqual({ xp: 2180, coins: 1880, gems: { passes: 6, passesOf: 6, tests: 16, testsOf: 18, total: 22 } })
    expect(s.allTime).toMatchObject({ xp: 2180, level: 5 })
  })

  it('очки, монеты и камни цикла сходятся с журналами мира', () => {
    expect(s.earned.xp).toBe(world.totalXp)
    expect(s.earned.coins).toBe(world.wallet.coinsEarned)
    const cycleGems = world.gemLog.filter((g) => /^(Перевал|Тест недели)/.test(g.label)).reduce((total, g) => total + g.gems, 0)
    expect(s.earned.gems.total).toBe(cycleGems)
    // Остальные камни мира — трофеи: они показаны отдельно и в итог цикла не входят.
    expect(world.wallet.gemsEarned - cycleGems).toBe(s.allTime.trophies.gems)
  })

  it('текст итога закрытого цикла', () => {
    expect(summaryLines(s)).toEqual([
      'Цикл 1 «Базовый месяц» пройден. Звание: «Прошёл базовый маршрут». Вершина: «База восстановлена».',
      'Сроки: 27.10–08.12.2026 — 43 календарных дня, из них 1 на паузах (плановый перерыв 04.11). Дней с занятиями — 30, занятий — 30.',
      'Дни: закрыты все 30 (на минимуме — 1, ядром — 28, с расширением — 1).',
      'Время: план 24 ч 29 мин, факт 30 ч — по 30 закрытым дням с замером.',
      'Недели: по чекпоинту закрыто 6 из 6. Недельные тесты: неделя 1 — 18 из 20, неделя 2 — 18 из 20, неделя 3 — 20 из 20, неделя 4 — 16 из 20, неделя 5 — 14 из 20, неделя 6 — 20 из 20.',
      'Трек A «Алгоритмы с нуля»: дней 11 из 11, 825 XP, ранг «База» получен.',
      'Трек B «System Design с основ»: дней 6 из 6, 395 XP, ранг «База» получен.',
      'Трек C1 «Gradle»: дней 3 из 3, 170 XP, ранг «База» получен.',
      'Трек C2 «CI/CD»: дней 3 из 3, 210 XP, ранг «База» получен.',
      'Трек E «ИИ-репетитор и тесты»: дней 6 из 6, 200 XP, ранг «База» получен.',
      'Задачи LeetCode: решена сама — 3, повторена с пустого редактора — 6, решена без подсказок — 3; повторено с пустого редактора — 9 из 9; без подсказок — 3 из 3; на таймере в лимит — 11 из 12.',
      'Замер: было 14 мин из 20 (задача 1512, день 2), стало 11 мин из 20 (задача 349, день 28) — на 3 мин быстрее. Самооценка, было → стало: A 2 → 4, B 1 → 3, C1 2 → 4, C2 1 → 3, E 3 → 4.',
      'Проверки понимания, первый ответ: верно — 3, частично — 3, неверно — 4. Журнал ошибок: 5 записей, побеждено — 2.',
      'Файлы цикла: построено 22 из 22 («Штаб: репозиторий prep-basic», «Мастерская: pet-проект», «Схема слоёв рабочего приложения», «Шпаргалка Kotlin для задач», «Решения задач», «Журнал ошибок: алгоритмы», «Замер: начало и конец», «Анатомия Gradle» и ещё 14).',
      'Заработано за цикл: 2180 XP, 1880 монет, 22 камня (перевалы — 6, недельные тесты — 16). Общий уровень — 5, всего 2180 XP.',
    ])
    expect(summaryText(s)).not.toMatch(/[*_#`<>]|\p{Extended_Pictographic}/u)
  })

  it('пройденный цикл рядом с новым: итог считается по своему журналу, а не по активному циклу', () => {
    const world = buildWorld([closedCycle(), tiny()], [], '2027-01-08')
    expect(world.active.id).toBe('09-tiny')
    const first = cycleSummary(world, world.cycles[0])
    expect(first).toMatchObject({ id: '01-basic-month', status: 'done', active: false })
    expect(first.baseline.self.map((t) => t.final)).toEqual([4, 3, 4, 3, 4])
    expect(first.earned).toEqual(s.earned)
    expect(cycleSummary(world, world.active)).toMatchObject({ id: '09-tiny', status: 'ahead', active: true })
  })
})

describe('итог цикла: собранные руками данные', () => {
  it('цикл без единого занятия: ничего не падает, чисел NaN нет, текст — одна строка', () => {
    const { cycle, summary: s } = summaryOf(tiny(), '2027-01-08')
    expect(s.status).toBe('ahead')
    expect(cycleCaption(cycle)).toBe('Цикл ещё не начат')
    expect(numbersIn(s).every(Number.isFinite)).toBe(true)
    expect(s.dates).toMatchObject({ first: null, last: null, calendarDays: 0, activeDays: 0, sessions: 0, rests: [], restDays: 0 })
    expect(s.days).toEqual({ total: 4, closed: 0, minimum: 0, core: 0, extension: 0, skipped: 0, inProgress: [], left: 4 })
    expect(s.problems).toMatchObject({ total: 0, planned: 0, notStarted: 0, states: [], timed: { tried: 0, inLimit: 0 } })
    expect(s.files).toEqual({ built: 0, inWork: 0, total: 0, list: [] })
    expect(s.tracks.map((t) => t.rank)).toEqual([null, null])
    expect(s.earned).toEqual({ xp: 0, coins: 0, gems: { passes: 0, passesOf: 0, tests: 0, testsOf: 6, total: 0 } })
    expect(summaryLines(s)).toEqual(['Цикл 9 «Проба» ещё не начат: занятий не записано. По плану — 4 дня, 2 недели, 3 ч 15 мин ядра.'])
  })

  it('пропущенный день назван без оценки; строк о том, чего в цикле нет, не пишется', () => {
    const { cycle, summary: s } = summaryOf(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'skipped', dates: [] },
          { day: 2, status: 'core', dates: ['2027-01-05'] },
        ]
        p.sessions = [{ date: '2027-01-05', from: null, to: null, day: 2, topics: ['а'] }]
        p.position.currentDay = 3
      }),
      '2027-01-08',
    )
    expect(cycleCaption(cycle)).toBe('Цикл на сегодня: день 3 из 4')
    expect(s.days).toMatchObject({ closed: 1, skipped: 1, left: 2 })
    expect(numbersIn(s).every(Number.isFinite)).toBe(true)
    expect(summaryLines(s)).toEqual([
      'Цикл 9 «Проба» на 08.01.2027: день 3 из 4.',
      'Сроки: 05.01.2027 — 1 календарный день. Дней с занятиями — 1, занятий — 1.',
      'Дни: закрыто 1 из 4 (ядром — 1), пропущено — 1, осталось — 2.',
      'Время: у закрытых дней нет замера, план с фактом пока не сравнить.',
      'Недели: по чекпоинту закрыто 0 из 2; недельных тестов пока нет.',
      'Трек B «Дизайн»: дней 1 из 2, 30 XP.',
      'Трек A ещё впереди.',
      'Замер ещё не сделан. Самооценка по трекам не записана.',
      'Заработано за цикл: 30 XP, 30 монет, 0 камней. Общий уровень — 1, всего 30 XP.',
    ])
    expect(summaryText(s)).not.toMatch(/NaN|undefined|null|\b0 из 0\b/)
  })

  it('остались только пропущенные дни: подпись говорит, сколько закрыто', () => {
    const { cycle, summary: s } = summaryOf(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'core', dates: ['2027-01-04'] },
          { day: 2, status: 'skipped', dates: [] },
          { day: 3, status: 'core', dates: ['2027-01-06'] },
          { day: 4, status: 'core', dates: ['2027-01-07'] },
        ]
        p.sessions = [1, 3, 4].map((day) => ({ date: `2027-01-0${day + 3}`, from: '10:00', to: '11:00', day, topics: ['а'] }))
        p.position.currentDay = 4
      }),
      '2027-01-08',
    )
    expect(s).toMatchObject({ status: 'running', currentDay: null })
    expect(cycleCaption(cycle)).toBe('Цикл на сегодня: закрыто 3 из 4 дней')
    expect(summaryLines(s)[0]).toBe('Цикл 9 «Проба» на 08.01.2027: закрыто 3 из 4 дней.')
  })

  it('привал и плановый перерыв, которые пересеклись, в днях на паузах не задваиваются; будущий перерыв не считается', () => {
    const { summary: s } = summaryOf(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'core', dates: ['2027-01-04'] },
          { day: 2, status: 'core', dates: ['2027-01-20'] },
        ]
        p.sessions = [
          { date: '2027-01-04', from: '10:00', to: '10:30', day: 1, topics: ['а'] },
          { date: '2027-01-20', from: '10:00', to: '11:00', day: 2, topics: ['б'] },
        ]
        p.position.currentDay = 3
        p.position.pauses = [{ from: '2027-01-05', to: '2027-01-14', days: 10 }]
        p.breaks = [
          { from: '2027-01-11', to: '2027-01-19', reason: 'отпуск' },
          { from: '2027-02-01', to: '2027-02-05' },
        ]
      }),
      '2027-01-20',
    )
    expect(s.dates).toMatchObject({ calendarDays: 17, activeDays: 2, restDays: 15, breakWorkdays: 10 })
    expect(s.dates.rests).toEqual([
      { from: '2027-01-05', to: '2027-01-14', days: 10, planned: false, note: null },
      { from: '2027-01-11', to: '2027-01-19', days: 9, planned: true, note: 'отпуск' },
    ])
    expect(summaryLines(s)[1]).toBe(
      'Сроки: 04.01–20.01.2027 — 17 календарных дней, из них 15 на паузах (привал 05.01–14.01, плановый перерыв 11.01–19.01). Дней с занятиями — 2, занятий — 2.',
    )
  })
})
