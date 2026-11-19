import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: живой progress.json меняется после каждого занятия.
import progress from './fixtures/progress-2026-11-18.json'
import type { Plan, PlanDay, Progress, RawCycle } from '../data/types'
import { buildWorld } from './engine'
import { defaultReportWeek, fmtMinutes, reportWeeks, sessionMinutes, timeReport, weekReport } from './report'

const raw: RawCycle = {
  dir: '01-basic-month',
  plan: plan as unknown as Plan,
  progress: progress as unknown as Progress,
}

const cycleOf = (cycle: RawCycle, today = '2026-11-19') => buildWorld([cycle], [], today).active

/** Копия цикла с правкой прогресса — чтобы проверять будущие состояния. */
function withProgress(patch: (p: Progress) => void) {
  const copy = structuredClone(raw)
  patch(copy.progress)
  return cycleOf(copy)
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

/** Маленький цикл, собранный руками: две недели, четыре дня, два трека. */
function tiny(patch: (p: Progress) => void) {
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
  return cycleOf(cycle, '2027-01-08')
}

describe('минуты занятия', () => {
  it('считаются по часам от начала до конца', () => {
    expect(sessionMinutes({ from: '15:28', to: '18:25' })).toBe(177)
    expect(sessionMinutes({ from: '17:48', to: '18:10' })).toBe(22)
  })

  it('занятие за полночь не даёт отрицательного времени', () => {
    expect(sessionMinutes({ from: '23:40', to: '00:25' })).toBe(45)
  })

  it('без начала, без конца или с тем же временем — без замера, а не ноль', () => {
    expect(sessionMinutes({ from: '15:30', to: null })).toBeNull()
    expect(sessionMinutes({ from: null, to: '16:00' })).toBeNull()
    expect(sessionMinutes({ from: null, to: null })).toBeNull()
    expect(sessionMinutes({ from: '16:00', to: '16:00' })).toBeNull()
    expect(sessionMinutes({ from: 'вечером', to: '25:00' })).toBeNull()
  })

  it('минуты пишутся часами, когда их больше часа', () => {
    expect([0, 45, 60, 104, 353].map(fmtMinutes)).toEqual(['0 мин', '45 мин', '1 ч', '1 ч 44 мин', '5 ч 53 мин'])
  })
})

describe('время: план и факт на 18.11.2026', () => {
  const time = timeReport(cycleOf(raw))
  const day = (n: number) => time.days.find((d) => d.n === n)!

  it('факт дня — сумма его занятий по часам', () => {
    expect(day(1)).toMatchObject({ planned: 60, fact: 177, source: 'sessions', sessions: 1, unmeasured: 0, done: true })
    // У дня 2 вручную записано 100 минут, но оба занятия замерены: верим часам.
    expect(day(2)).toMatchObject({ planned: 45, fact: 104, source: 'sessions', sessions: 2, unmeasured: 0, done: true })
  })

  it('день с занятием без времени конца — без замера, а не ноль', () => {
    expect(day(3)).toMatchObject({ planned: 60, fact: null, source: null, sessions: 2, unmeasured: 1, measured: 72, done: false })
  })

  it('начатый день в итог не входит и лежит отдельно', () => {
    expect(time.open.map((d) => d.n)).toEqual([3])
  })

  it('у дней впереди факта нет', () => {
    expect(day(4)).toMatchObject({ planned: 40, fact: null, sessions: 0, done: false })
    expect(time.days).toHaveLength(30)
  })

  it('итог: два закрытых дня, 281 минута при плане 105', () => {
    expect(time.total).toEqual({
      days: 2,
      measured: 2,
      unmeasured: 0,
      planned: 105,
      fact: 281,
      offCore: 0,
      plannedClosed: 105,
      plannedAll: 1469,
    })
  })

  it('по трекам: суммы по закрытым дням трека', () => {
    const tracks = Object.fromEntries(time.tracks.map((t) => [t.code, t]))
    expect(Object.keys(tracks)).toEqual(['A', 'B', 'C1', 'C2', 'E', 'retro'])
    expect(tracks.B).toMatchObject({ name: 'System Design с основ', days: 1, measured: 1, planned: 60, fact: 177 })
    expect(tracks.A).toMatchObject({ days: 1, measured: 1, planned: 45, fact: 104 })
    expect(tracks.C1).toMatchObject({ days: 0, measured: 0, planned: 0, fact: 0, plannedAll: 180 })
    expect(tracks.retro).toMatchObject({ name: 'Ретро', days: 0, plannedAll: 45 })
  })

  it('план цикла — сумма планов всех дней и всех треков', () => {
    expect(time.tracks.reduce((sum, t) => sum + t.plannedAll, 0)).toBe(time.total.plannedAll)
    expect(time.tracks.reduce((sum, t) => sum + t.fact, 0)).toBe(time.total.fact)
  })
})

describe('время: собранные руками данные', () => {
  it('закрытый день без замера не попадает ни в план, ни в факт', () => {
    const time = timeReport(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'core', dates: ['2027-01-04'] },
          { day: 2, status: 'core', dates: ['2027-01-05'] },
        ]
        p.sessions = [
          { date: '2027-01-04', from: '10:00', to: '10:40', day: 1, topics: ['а'] },
          { date: '2027-01-05', from: '10:00', to: null, day: 2, topics: ['б'] },
        ]
        p.position.currentDay = 3
      }),
    )
    expect(time.days[1]).toMatchObject({ fact: null, source: null, sessions: 1, unmeasured: 1 })
    expect(time.total).toMatchObject({ days: 2, measured: 1, unmeasured: 1, planned: 30, fact: 40, plannedClosed: 90, plannedAll: 195 })
    expect(time.tracks.find((t) => t.code === 'B')).toMatchObject({ days: 1, measured: 0, unmeasured: 1, planned: 0, fact: 0 })
    expect(time.open).toEqual([])
  })

  it('итог дня, записанный вручную, идёт в дело, только когда часов занятий не хватает', () => {
    const time = timeReport(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'core', dates: ['2027-01-04'], wallClockMinutes: 50 },
          { day: 2, status: 'core', dates: ['2027-01-05'], wallClockMinutes: 90 },
          { day: 3, status: 'core', dates: ['2027-01-06'], wallClockMinutes: 55 },
        ]
        p.sessions = [
          { date: '2027-01-04', from: '10:00', to: '10:40', day: 1, topics: ['а'] },
          { date: '2027-01-05', from: '10:00', to: '10:30', day: 2, topics: ['б'] },
          { date: '2027-01-05', from: '19:00', to: null, day: 2, topics: ['в'] },
        ]
        p.position.currentDay = 4
      }),
    )
    expect(time.days[0]).toMatchObject({ fact: 40, source: 'sessions' })
    expect(time.days[1]).toMatchObject({ fact: 90, source: 'day', measured: 30, unmeasured: 1 })
    // Занятий у дня не записано вовсе — остаётся ручной итог.
    expect(time.days[2]).toMatchObject({ fact: 55, source: 'day', sessions: 0 })
    expect(time.total).toMatchObject({ days: 3, measured: 3, unmeasured: 0, planned: 135, fact: 185 })
  })

  it('дни на минимуме и с расширением считаются, но помечены: план у них — ядро', () => {
    const time = timeReport(
      tiny((p) => {
        p.days = [
          { day: 1, status: 'minimum', dates: ['2027-01-04'] },
          { day: 2, status: 'extension', dates: ['2027-01-05'] },
          { day: 3, status: 'skipped', dates: [] },
        ]
        p.sessions = [
          { date: '2027-01-04', from: '10:00', to: '10:12', day: 1, topics: ['а'] },
          { date: '2027-01-05', from: '10:00', to: '12:05', day: 2, topics: ['б'] },
        ]
        p.position.currentDay = 4
      }),
    )
    expect(time.total).toMatchObject({ days: 2, measured: 2, planned: 90, fact: 137, offCore: 2 })
    expect(time.days[2]).toMatchObject({ done: false, fact: null })
  })

  it('пока ничего не закрыто, итог пустой', () => {
    const time = timeReport(tiny(() => {}))
    expect(time.total).toEqual({ days: 0, measured: 0, unmeasured: 0, planned: 0, fact: 0, offCore: 0, plannedClosed: 0, plannedAll: 195 })
    expect(time.open).toEqual([])
  })
})

describe('отчёт недели на 18.11.2026', () => {
  const cycle = cycleOf(raw)

  it('началась только первая неделя, она и выбрана', () => {
    expect(reportWeeks(cycle)).toEqual([
      { n: 1, started: true },
      { n: 2, started: false },
      { n: 3, started: false },
      { n: 4, started: false },
      { n: 5, started: false },
      { n: 6, started: false },
    ])
    expect(defaultReportWeek(cycle)).toBe(1)
  })

  it('неделя 1: пять строк, цифры как в журнале', () => {
    const report = weekReport(cycle, 1)
    expect(report.active).toBe(true)
    expect(report.lines).toEqual([
      'Неделя 1 из 6, цикл «Базовый месяц» (27.10–18.11, с привалом 28.10–10.11): закрыто 2 дня из 4 (ядром — 2), день 3 в работе. Занятий — 5, по часам 5 ч 53 мин (без замера — 1, в сумму не вошло).',
      'Задачи LeetCode: сам — 0, после разбора — 1 (№1512); повторов с пустого редактора не было.',
      'Сохранено 2 артефакта: репозиторий и папки, новый проект Empty Activity. Пройден перевал «Baseline».',
      'Не получилось или осталось: ошибок в журнале — 5; из 10 первых ответов на проверках понимания неверных — 4, частичных — 3; файлов не сохранено или не подтверждено — 5; в списке хвостов сейчас 4 записи.',
      'Дальше: день 3 «C · Gradle 1», шаг 2 из 3; после него в этой неделе остаётся день 4 «Ревью + E · репетитор и первый workflow».',
    ])
    expect(report.text).toBe(report.lines.join('\n'))
  })

  it('текст обычный: без разметки и эмодзи', () => {
    expect(weekReport(cycle, 1).text).not.toMatch(/[*_#`<>]|\p{Extended_Pictographic}/u)
  })

  it('неделя, которая не началась, — одна спокойная строка', () => {
    const report = weekReport(cycle, 2)
    expect(report.active).toBe(false)
    expect(report.lines).toEqual([
      'Неделя 2 из 6, цикл «Базовый месяц»: занятий на этой неделе не было. Дальше: неделя 1, день 3 «C · Gradle 1», шаг 2 из 3.',
    ])
  })

  it('недели вне плана нет', () => {
    expect(weekReport(cycle, 9).lines).toEqual(['В плане цикла «Базовый месяц» нет недели 9.'])
  })
})

describe('отчёт недели: будущие состояния', () => {
  /** Неделя 1 закрыта, на неделе 2 решена задача 217 и повторена 1512. */
  const later = (extra: (p: Progress) => void = () => {}) =>
    withProgress((p) => {
      const day3 = p.days.find((d) => d.day === 3)!
      day3.status = 'core'
      day3.stepsDone = [1, 2, 3]
      delete day3.stepsOpen
      p.sessions[p.sessions.length - 1].to = '16:20'
      p.days.push(
        { day: 4, status: 'minimum', dates: ['2026-11-20'] },
        { day: 5, status: 'core', dates: ['2026-11-23'], artifacts: [{ repo: 'prep-basic', path: 'algo/217-contains-duplicate.kt', state: 'committed' }] },
      )
      p.sessions.push(
        { date: '2026-11-20', from: '18:00', to: '18:15', day: 4, topics: ['ревью'] },
        { date: '2026-11-23', from: '18:00', to: '18:50', day: 5, topics: ['217'] },
      )
      p.leetcode.push({
        id: 217,
        title: 'Contains Duplicate',
        status: 'solved-self',
        attempts: [{ date: '2026-11-23', kind: 'timed-20', minutes: 12, result: 'solved', selfSolved: true }],
      })
      const first = p.leetcode.find((item) => item.id === 1512)!
      first.status = 'repeated-from-empty'
      first.attempts.push({ date: '2026-11-23', kind: 'from-empty-editor', minutes: 9, result: 'solved', selfSolved: true })
      p.position.currentDay = 6
      p.position.currentStep = 1
      p.openItems = []
      extra(p)
    })

  it('«сам» и «после разбора» не смешиваются, повтор считается отдельно', () => {
    const cycle = later()
    expect(defaultReportWeek(cycle)).toBe(2)
    expect(weekReport(cycle, 2).lines).toEqual([
      'Неделя 2 из 6, цикл «Базовый месяц» (23.11): закрыт 1 день из 4 (ядром — 1). Занятий — 1, по часам 50 мин.',
      'Задачи LeetCode: сам — 1 (№217), после разбора — 0; повторы с пустого редактора — удалось 1 (№1512), не удалось 0.',
      'Сохранён 1 артефакт: algo/217-contains-duplicate.kt.',
      'Ошибок, неверных ответов и хвостов за неделю не записано.',
      'Дальше: день 6 «B · архитектура 2»; после него в этой неделе остаются ещё 2 дня.',
    ])
  })

  it('задача, переписанная после разбора, остаётся «после разбора» и после удачного повтора', () => {
    const lines = weekReport(later(), 1).lines
    expect(lines[1]).toBe('Задачи LeetCode: сам — 0, после разбора — 1 (№1512); повторов с пустого редактора не было.')
  })

  it('закрытая неделя: уровни закрытия названы порознь, дальше — следующая неделя и открытый тест', () => {
    const lines = weekReport(later(), 1).lines
    expect(lines[0]).toBe(
      'Неделя 1 из 6, цикл «Базовый месяц» (27.10–20.11, с привалом 28.10–10.11): закрыто 4 дня из 4 (на минимуме — 1, ядром — 3). Занятий — 6, по часам 6 ч 58 мин.',
    )
    // Хвосты и зелёный CI — состояние на сейчас: в отчёт прошедшей недели они не идут.
    expect(lines[3]).toBe(
      'Не получилось или осталось: ошибок в журнале — 5; из 10 первых ответов на проверках понимания неверных — 4, частичных — 3; файлов не сохранено или не подтверждено — 5.',
    )
    expect(lines[4]).toBe('Дальше: неделя 2, день 6 «B · архитектура 2». Недельный тест за неделю 1 открыт.')
  })

  it('неудачный повтор, задача без решения и побеждённая ошибка названы как есть', () => {
    const cycle = later((p) => {
      p.leetcode.find((item) => item.id === 1512)!.attempts.pop()
      p.leetcode.find((item) => item.id === 1512)!.attempts.push({
        date: '2026-11-23',
        kind: 'from-empty-editor',
        minutes: 15,
        result: 'not-solved',
        selfSolved: false,
      })
      p.leetcode.find((item) => item.id === 217)!.attempts[0].result = 'not-solved'
      p.leetcode.find((item) => item.id === 217)!.status = 'not-started'
      p.mistakes.push({ date: '2026-11-23', track: 'A', problemId: 217, text: 'забыл про HashSet', beaten: true })
      p.openItems = ['День 5: дописать заметку']
    })
    const lines = weekReport(cycle, 2).lines
    expect(lines[1]).toBe(
      'Задачи LeetCode: начато без решения — 1 (№217); повторы с пустого редактора — удалось 0, не удалось 1 (№1512).',
    )
    expect(lines[3]).toBe('Не получилось или осталось: ошибок в журнале — 1 (побеждено — 1); в списке хвостов сейчас 1 запись.')
  })

  it('зелёный CI, починка, чекпоинт и тест попадают в строку о сохранённом', () => {
    const cycle = later((p) => {
      p.petProject!.ci = { helloWorldWorkflow: 'green', buildWorkflow: null }
      p.events = [{ date: '2026-11-23', type: 'ci-fixed' }]
      p.weeks = [{ n: 1, closed: true, date: '2026-11-20' }]
      p.weeklyTests = [{ week: 1, date: '2026-11-21', score: 16, max: 20 }]
    })
    expect(weekReport(cycle, 1).lines[2]).toBe(
      'Сохранено 2 артефакта: репозиторий и папки, новый проект Empty Activity. Пройден перевал «Baseline». Неделя закрыта по чекпоинту. Недельный тест — 16 из 20.',
    )
    expect(weekReport(cycle, 2).lines[2]).toBe(
      'Сохранён 1 артефакт: algo/217-contains-duplicate.kt. Красный CI починен. Workflow в GitHub Actions сейчас зелёный.',
    )
  })

  it('все проверки верные — так и сказано, без слова «не получилось»', () => {
    const cycle = later((p) => {
      p.knowledgeChecks.push({ date: '2026-11-23', track: 'A', question: 'Зачем HashSet?', firstAnswer: 'быстрый поиск', verdict: 'correct', answer: 'Поиск за O(1).' })
    })
    expect(weekReport(cycle, 2).lines[3]).toBe(
      'Ошибок и хвостов за неделю не записано; на проверках понимания неверных и частичных ответов нет (вопросов — 1).',
    )
  })
})

describe('отчёт недели: собранные руками данные', () => {
  it('пока цикл не начат, доступна первая неделя, и в ней одна строка', () => {
    const cycle = tiny(() => {})
    expect(reportWeeks(cycle)).toEqual([
      { n: 1, started: false },
      { n: 2, started: false },
    ])
    expect(defaultReportWeek(cycle)).toBe(1)
    expect(weekReport(cycle, 1).lines).toEqual(['Неделя 1 из 2, цикл «Проба»: занятий на этой неделе не было. Дальше: день 1 «A · день 1»; после него в этой неделе остаётся день 2 «B · день 2».'])
  })

  it('пропущенные дни названы без оценки; занятия без замера не превращаются в ноль минут', () => {
    const cycle = tiny((p) => {
      p.days = [
        { day: 1, status: 'skipped', dates: [] },
        { day: 2, status: 'in_progress', dates: ['2027-01-05'], stepsDone: [] },
      ]
      p.sessions = [{ date: '2027-01-05', from: null, to: null, day: 2, topics: ['а'] }]
      p.position.currentDay = 2
    })
    const lines = weekReport(cycle, 1).lines
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe('Неделя 1 из 2, цикл «Проба» (05.01): из 2 дней пока не закрыт ни один, пропущено — 1, день 2 в работе. Занятий — 1, время не замерялось.')
    expect(lines[1]).toBe('Задачи LeetCode: на этой неделе не решались.')
    expect(lines[2]).toBe('Новых сохранённых артефактов нет.')
    expect(lines[3]).toBe('Ошибок, неверных ответов и хвостов за неделю не записано.')
    expect(lines[4]).toBe('Дальше: день 2 «B · день 2»; это последний незакрытый день недели.')
  })

  it('неделя, где дни только пропущены, — одна строка', () => {
    const cycle = tiny((p) => {
      p.days = [
        { day: 1, status: 'skipped', dates: [] },
        { day: 2, status: 'skipped', dates: [] },
        { day: 3, status: 'core', dates: ['2027-01-06'] },
      ]
      p.sessions = [{ date: '2027-01-06', from: '10:00', to: '10:45', day: 3, topics: ['а'] }]
      p.position.currentDay = 4
    })
    expect(weekReport(cycle, 1).lines).toEqual([
      'Неделя 1 из 2, цикл «Проба»: занятий на этой неделе не было, пропущено дней — 2. Дальше: неделя 2, день 4 «B · день 4».',
    ])
    expect(defaultReportWeek(cycle)).toBe(2)
  })

  it('цикл пройден: дальше дней нет', () => {
    const cycle = tiny((p) => {
      p.days = [1, 2, 3, 4].map((day) => ({ day, status: 'core' as const, dates: [`2027-01-0${day + 3}`] }))
      p.sessions = [1, 2, 3, 4].map((day) => ({ date: `2027-01-0${day + 3}`, from: '10:00', to: '11:00', day, topics: ['а'] }))
      p.position.currentDay = 4
    })
    const lines = weekReport(cycle, 2).lines
    expect(lines[0]).toBe('Неделя 2 из 2, цикл «Проба» (06.01–07.01): закрыто 2 дня из 2 (ядром — 2). Занятий — 2, по часам 2 ч.')
    expect(lines[4]).toBe('Дальше: цикл пройден, все дни закрыты. Недельный тест за неделю 2 открыт.')
  })
})
