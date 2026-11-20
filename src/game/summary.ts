// Итог цикла: что пройдено и что это дало. Один цикл — на сегодня или на момент закрытия.
// Чистые функции: всё берётся из готовых World и CycleView, движок не меняется, в JSON ничего не пишется.
//
// Что решено здесь:
// - сроки считаются по журналу: от первой даты занятий до последней. Сегодняшний день в расчёт не входит,
//   поэтому один и тот же журнал всегда даёт один и тот же итог;
// - камни цикла — только за его перевалы и недельные тесты, по тому же правилу, что gemLog в buildWorld.
//   Трофеи и стороннее развитие к циклу не привязаны: в сумму они не входят, трофеи идут отдельно, счётом за всё время;
// - «не начата» считается только по основным задачам и замерам. Пары и запасная задача берутся по желанию,
//   и нетронутая пара — не хвост;
// - время не пересчитывается: это timeReport из report.ts, как в карточке «Время: план и факт».
import type { BaselinePoint, SelfAssessment } from '../data/types'
import {
  PROBLEM_STATE_LABEL,
  STAGE_LABEL,
  rankProgress,
  solvedAfterWalkthrough,
  type BuildingView,
  type CycleView,
  type ProblemState,
  type ProblemView,
  type World,
} from './engine'
import { fmtMinutes, reportWeeks, timeReport, type TimeSum } from './report'
import { BREAK_LIMIT, GEMS_PER_PASS, MAX_GEMS_PER_TEST, parseISO, pausedDays, toISO } from './rules'
import { DAYS, fmtDate, plural, type Forms } from './text'

const CALENDAR_DAYS: Forms = ['календарный день', 'календарных дня', 'календарных дней']
const WEEKS: Forms = ['неделя', 'недели', 'недель']
const COINS: Forms = ['монета', 'монеты', 'монет']
const GEMS: Forms = ['камень', 'камня', 'камней']
const RECORDS: Forms = ['запись', 'записи', 'записей']
/** «Из 30 дней», «из 21 дня». */
const OF_DAYS: Forms = ['дня', 'дней', 'дней']

const sum = (numbers: number[]) => numbers.reduce((total, n) => total + n, 0)
const count = (n: number, forms: Forms) => `${n} ${plural(n, forms)}`
const isISO = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** «2026-11-18» → «18.11.2026»: у итога цикла год важен, он переживёт месяц. */
export function fullDate(iso: string): string {
  return `${fmtDate(iso)}.${iso.slice(0, 4)}`
}

/** «27.10–18.11.2026»; год у начала пишется, только если он другой. */
export function fullPeriod(from: string, to: string): string {
  if (from === to) return fullDate(to)
  return `${from.slice(0, 4) === to.slice(0, 4) ? fmtDate(from) : fullDate(from)}–${fullDate(to)}`
}

/** «28.10–10.11» — внутри срока цикла год не нужен. */
export function shortPeriod(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)}–${fmtDate(to)}`
}

/** Календарных дней от from до to, обе даты включительно. */
function spanDays(from: string, to: string): number {
  return Math.max(0, Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000) + 1)
}

/** ahead — занятий ещё не было; running — цикл идёт; done — закрыты все дни. */
export type CycleStatus = 'ahead' | 'running' | 'done'

function statusOf(cycle: CycleView): CycleStatus {
  if (cycle.done) return 'done'
  const { days, sessions } = cycle.raw.progress
  return days.length === 0 && sessions.length === 0 ? 'ahead' : 'running'
}

/** День, на котором стоит идущий цикл: текущий, а если позиция на закрытом дне — первый незакрытый. */
function positionOf(cycle: CycleView): number | null {
  if (cycle.done) return null
  return (cycle.current?.day ?? cycle.days.find((d) => !d.done && d.state !== 'skipped'))?.n ?? null
}

/** Подпись для входа на страницу: «Цикл на сегодня: день 3 из 30» или «Цикл пройден». */
export function cycleCaption(cycle: CycleView): string {
  const status = statusOf(cycle)
  if (status === 'done') return 'Цикл пройден'
  if (status === 'ahead') return 'Цикл ещё не начат'
  const day = positionOf(cycle)
  const total = cycle.days.length
  return day !== null
    ? `Цикл на сегодня: день ${day} из ${total}`
    : `Цикл на сегодня: закрыто ${cycle.daysDone} из ${count(total, OF_DAYS)}`
}

/** Привал или плановый перерыв внутри срока цикла. */
export interface SummaryRest {
  from: string
  to: string
  /** Календарных дней, обе даты включительно. */
  days: number
  /** true — плановый перерыв, объявленный заранее; false — привал, записанный по возвращении. */
  planned: boolean
  note: string | null
}

export interface SummaryWeek {
  n: number
  /** Есть запись дня или занятие. */
  started: boolean
  daysDone: number
  daysTotal: number
  /** Закрыта по чекпоинту. */
  closed: boolean
  /** Лучшая попытка недельного теста. */
  test: { score: number; max: number; date: string; attempts: number; gems: number } | null
}

export interface SummaryTrack {
  code: string
  name: string
  daysDone: number
  daysTotal: number
  /** XP за события цикла с этим треком. */
  xp: number
  /** Зачёт на ранг, который даёт цикл; null — в этом цикле у трека ранга нет. */
  rank: { name: string; done: boolean; met: number; total: number } | null
  /** Минуты по закрытым дням трека с замером и число таких дней. */
  time: { planned: number; fact: number; measured: number }
}

export interface SummaryPoint {
  day: number
  date: string | null
  problemId: number
  title: string
  minutes: number | null
  /** Лимит таймера, если у задачи записана попытка на таймере. */
  limit: number | null
  result: string | null
  /** Замер сделан: минуты записаны. То же правило, что на «Приросте». */
  done: boolean
}

export interface SummaryFile {
  id: string
  title: string
  /** Подпись из плана или путь в репозитории. */
  path: string
  track: string | null
  stage: BuildingView['stage']
  stageLabel: string
}

export interface CycleSummary {
  id: string
  n: number
  name: string
  status: CycleStatus
  /** Маршрут сейчас стоит на этом цикле. */
  active: boolean
  /** Что на вершине маршрута и какое звание даёт цикл. */
  summit: string
  rankOnComplete: string
  /** Звание — только у пройденного цикла. */
  rank: string | null
  /** День, на котором стоит идущий цикл. */
  currentDay: number | null
  /** На какую дату журнал: meta.updatedAt, а если её нет — последнее занятие. */
  asOf: string | null
  dates: {
    /** Первая и последняя дата занятий цикла. */
    first: string | null
    last: string | null
    /** Календарных дней от первого занятия до последнего, включительно. */
    calendarDays: number
    /** Разных дат с занятиями. */
    activeDays: number
    sessions: number
    rests: SummaryRest[]
    /** Сколько из календарных дней пришлось на привалы и перерывы, без двойного счёта. */
    restDays: number
    /** Рабочих дней плановых перерывов использовано из лимита цикла. */
    breakWorkdays: number
    breakLimit: number
  }
  days: {
    total: number
    closed: number
    minimum: number
    core: number
    extension: number
    skipped: number
    /** Начатые, но не закрытые дни. */
    inProgress: number[]
    /** Не закрыто и не пропущено. */
    left: number
  }
  /** План и факт времени по закрытым дням — итог из timeReport. */
  time: TimeSum
  weeks: SummaryWeek[]
  /** Недельные тесты цикла: сдано недель и сумма лучших попыток. */
  tests: { taken: number; score: number; max: number }
  tracks: SummaryTrack[]
  /** XP событий без трека: чекпоинты недель, возвращение после паузы, общие файлы, ретро. */
  offTrackXp: number
  problems: {
    /** Все задачи цикла: основные, замеры, пары, запасная и решённые вне плана. */
    total: number
    /** Основные задачи и оба замера. */
    planned: number
    /** Из них не начато. */
    notStarted: number
    /** Есть попытки, решения пока нет. */
    unsolved: number
    /** Сколько задач в каком состоянии; пустые состояния опущены. */
    states: { state: ProblemState; label: string; count: number }[]
    /** Первое решение: само или после разбора — то же правило, что у очков. */
    first: { self: number; walkthrough: number }
    /** Повторы с пустого редактора и решения без подсказок: сделано из запланированных. */
    repeated: { have: number; of: number }
    noHints: { have: number; of: number }
    /** Задач с попыткой на таймере и сколько из них решено самим в лимит. */
    timed: { tried: number; inLimit: number }
  }
  baseline: {
    start: SummaryPoint
    final: SummaryPoint
    /** Минуты финального замера минус минуты стартового; null — сравнивать ещё нечего. */
    delta: number | null
    /** Самооценка по трекам, от 1 до 5. */
    self: { code: string; name: string; start: number | null; final: number | null }[]
    assessed: boolean
  }
  /** Проверки понимания: первый ответ. */
  checks: { correct: number; partial: number; wrong: number; total: number }
  mistakes: { total: number; beaten: number }
  files: { built: number; inWork: number; total: number; list: SummaryFile[] }
  /** Перевалы цикла и памятные знаки на пройденных. */
  passes: { day: number; title: string; done: boolean; sign: string | null }[]
  earned: {
    xp: number
    coins: number
    /** Камни цикла: за перевалы и недельные тесты; «Of» — сколько их всего можно получить. */
    gems: { passes: number; passesOf: number; tests: number; testsOf: number; total: number }
  }
  /** Сквозной счёт игрока: к циклу не привязан, показан рядом для масштаба. */
  allTime: { xp: number; level: number; trophies: { earned: number; total: number; gems: number } }
}

// То же соответствие, что SELF_KEY в engine.ts: там оно не экспортировано, а оценки в World считаются
// только для активного цикла.
const SELF_KEY: Record<string, keyof SelfAssessment> = {
  A: 'algorithms',
  B: 'systemDesign',
  C1: 'gradle',
  C2: 'cicd',
  E: 'aiTutorAndTests',
}

const REQUIRED_ROLES: ProblemView['role'][] = ['main', 'baseline', 'baseline-final']
const STATE_ORDER: ProblemState[] = ['self', 'walkthrough', 'repeated', 'nohints', 'before']

const attemptsOf = (p: ProblemView) => p.progress?.attempts ?? []
const solvedBy = (p: ProblemView, kind: string) => attemptsOf(p).some((a) => a.kind === kind && a.result === 'solved')

/** Решена сама и уложилась в таймер — то же правило, что у условия ранга «на таймере» в rankProgress. */
function timedInLimit(p: ProblemView): boolean {
  return attemptsOf(p).some((a) => {
    if (!a.kind.startsWith('timed') || a.result !== 'solved' || !a.selfSolved) return false
    const limit = Number(a.kind.split('-')[1]) || null
    return a.minutes == null || limit === null || a.minutes <= limit
  })
}

/** Скобки вокруг описательного «пути» не нужны: «(репозиторий и папки)» → «репозиторий и папки». */
const plainPath = (path: string) => path.replace(/^\((.*)\)$/, '$1')

/** Итог цикла: все числа страницы «Итог цикла» и её текстовой версии. */
export function cycleSummary(world: World, cycle: CycleView): CycleSummary {
  const { plan, progress } = cycle.raw
  const status = statusOf(cycle)
  const time = timeReport(cycle)

  // --- Сроки ---
  const dates = [...new Set([...progress.sessions.map((s) => s.date), ...progress.days.flatMap((d) => d.dates)])]
    .filter(isISO)
    .sort()
  const first = dates[0] ?? null
  const last = dates[dates.length - 1] ?? null
  // Привалы и перерывы, которые задели срок цикла: объявленный на будущее перерыв ещё ничего не занял.
  const rests: SummaryRest[] =
    first && last
      ? [
          ...cycle.pauses.map(({ pause }) => ({
            from: pause.from,
            to: pause.to,
            days: pause.days,
            planned: false,
            note: pause.note ?? null,
          })),
          ...(progress.breaks ?? []).map((item) => ({
            from: item.from,
            to: item.to,
            days: spanDays(item.from, item.to),
            planned: true,
            note: item.reason ?? null,
          })),
        ]
          .filter((rest) => isISO(rest.from) && isISO(rest.to) && rest.from <= last && rest.to >= first)
          .sort((a, b) => a.from.localeCompare(b.from))
      : []
  let restDays = 0
  if (first && last && rests.length) {
    const end = parseISO(last)
    for (const cursor = parseISO(first); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const iso = toISO(cursor)
      if (rests.some((rest) => rest.from <= iso && iso <= rest.to)) restDays++
    }
  }

  // --- Недели и тесты ---
  const started = new Map(reportWeeks(cycle).map((w) => [w.n, w.started]))
  const weeks: SummaryWeek[] = cycle.weeks.map((w) => ({
    n: w.week.n,
    started: started.get(w.week.n) ?? false,
    daysDone: w.days.filter((d) => d.done).length,
    daysTotal: w.days.length,
    closed: w.closed,
    test: w.test.best
      ? {
          score: w.test.best.score,
          max: w.test.best.max,
          date: w.test.best.date,
          attempts: w.test.attempts.length,
          gems: w.test.gems,
        }
      : null,
  }))
  const taken = weeks.flatMap((w) => (w.test ? [w.test] : []))

  // --- Треки ---
  const tracks: SummaryTrack[] = plan.tracks.map((track) => {
    const ofTrack = cycle.days.filter((d) => d.plan.trackCode === track.code)
    const exam = track.rank ? rankProgress(cycle, track) : null
    const spent = time.tracks.find((t) => t.code === track.code)
    return {
      code: track.code,
      name: track.name,
      daysDone: ofTrack.filter((d) => d.done).length,
      daysTotal: ofTrack.length,
      xp: sum(cycle.events.filter((e) => e.track === track.code).map((e) => e.xp)),
      rank: exam ? { name: exam.name, done: exam.done, met: exam.met, total: exam.items.length } : null,
      time: { planned: spent?.planned ?? 0, fact: spent?.fact ?? 0, measured: spent?.measured ?? 0 },
    }
  })
  const xp = sum(cycle.events.map((e) => e.xp))

  // --- Задачи ---
  const required = cycle.problems.filter((p) => REQUIRED_ROLES.includes(p.role))
  const solved = cycle.problems.filter((p) => p.state !== 'none' && p.state !== 'before')
  const afterWalkthrough = solved.filter((p) => solvedAfterWalkthrough(p.state, attemptsOf(p))).length
  const toRepeat = cycle.problems.filter((p) => p.plan?.repeatDay)
  const toNoHints = cycle.problems.filter((p) => p.plan?.noHintsDay)
  const timed = cycle.problems.filter((p) => attemptsOf(p).some((a) => a.kind.startsWith('timed')))

  // --- Замер ---
  const point = (b: BaselinePoint): SummaryPoint => {
    const problem = cycle.problems.find((p) => p.id === b.problemId)
    return {
      day: b.day,
      date: b.date ?? null,
      problemId: b.problemId,
      title: problem?.title ?? '',
      minutes: b.minutes,
      limit: problem?.timedLimit ?? null,
      result: b.result,
      done: b.minutes !== null,
    }
  }
  const start = point(progress.baseline.start)
  const final = point(progress.baseline.final)
  const self = plan.tracks.flatMap((track) => {
    const key = SELF_KEY[track.code]
    if (!key) return []
    return [
      {
        code: track.code,
        name: track.name,
        start: progress.baseline.start.selfAssessment[key] ?? null,
        final: progress.baseline.final.selfAssessment[key] ?? null,
      },
    ]
  })

  // --- Файлы, перевалы, камни ---
  const files: SummaryFile[] = cycle.buildings.map((b) => ({
    id: b.item.id,
    title: b.item.title,
    path: b.item.label ?? plainPath(b.item.path),
    track: b.item.track,
    stage: b.stage,
    stageLabel: STAGE_LABEL[b.stage],
  }))
  const passes = cycle.days
    .filter((d) => d.keyPoint)
    .map((d) => ({ day: d.n, title: d.keyPoint!.title, done: d.done, sign: d.sign }))
  const gemsPasses = passes.filter((p) => p.done).length * GEMS_PER_PASS
  const gemsTests = sum(cycle.weeks.map((w) => w.test.gems))
  const trophies = world.trophies.filter((t) => t.earned)
  const checks = progress.knowledgeChecks

  return {
    id: cycle.id,
    n: cycle.n,
    name: cycle.name,
    status,
    active: world.active.id === cycle.id,
    summit: cycle.summit,
    rankOnComplete: cycle.rankOnComplete,
    rank: status === 'done' ? cycle.rankOnComplete : null,
    currentDay: positionOf(cycle),
    asOf: isISO(progress.meta.updatedAt) ? progress.meta.updatedAt : last,
    dates: {
      first,
      last,
      calendarDays: first && last ? spanDays(first, last) : 0,
      activeDays: dates.length,
      sessions: progress.sessions.length,
      rests,
      restDays,
      breakWorkdays: pausedDays(progress.breaks ?? []).size,
      breakLimit: BREAK_LIMIT,
    },
    days: {
      total: cycle.days.length,
      closed: cycle.daysDone,
      minimum: cycle.days.filter((d) => d.state === 'minimum').length,
      core: cycle.days.filter((d) => d.state === 'core').length,
      extension: cycle.days.filter((d) => d.state === 'extension').length,
      skipped: cycle.days.filter((d) => d.state === 'skipped').length,
      inProgress: cycle.days.filter((d) => d.progress?.status === 'in_progress').map((d) => d.n),
      left: cycle.days.filter((d) => !d.done && d.state !== 'skipped').length,
    },
    time: time.total,
    weeks,
    tests: { taken: taken.length, score: sum(taken.map((t) => t.score)), max: sum(taken.map((t) => t.max)) },
    tracks,
    offTrackXp: xp - sum(tracks.map((t) => t.xp)),
    problems: {
      total: cycle.problems.length,
      planned: required.length,
      notStarted: required.filter((p) => p.state === 'none' && attemptsOf(p).length === 0).length,
      unsolved: cycle.problems.filter((p) => p.state === 'none' && attemptsOf(p).length > 0).length,
      states: STATE_ORDER.map((state) => ({
        state,
        label: PROBLEM_STATE_LABEL[state],
        count: cycle.problems.filter((p) => p.state === state).length,
      })).filter((item) => item.count > 0),
      first: { self: solved.length - afterWalkthrough, walkthrough: afterWalkthrough },
      repeated: { have: toRepeat.filter((p) => solvedBy(p, 'from-empty-editor')).length, of: toRepeat.length },
      noHints: { have: toNoHints.filter((p) => solvedBy(p, 'no-hints')).length, of: toNoHints.length },
      timed: { tried: timed.length, inLimit: timed.filter(timedInLimit).length },
    },
    baseline: {
      start,
      final,
      delta: start.minutes !== null && final.minutes !== null ? final.minutes - start.minutes : null,
      self,
      assessed: self.some((item) => item.start !== null || item.final !== null),
    },
    checks: {
      correct: checks.filter((k) => k.verdict === 'correct').length,
      partial: checks.filter((k) => k.verdict === 'partial').length,
      wrong: checks.filter((k) => k.verdict === 'wrong').length,
      total: checks.length,
    },
    mistakes: { total: progress.mistakes.length, beaten: progress.mistakes.filter((m) => m.beaten).length },
    files: {
      built: files.filter((f) => f.stage >= 2).length,
      inWork: files.filter((f) => f.stage === 1).length,
      total: files.length,
      list: files,
    },
    passes,
    earned: {
      xp,
      coins: sum(cycle.events.map((e) => e.coins)),
      gems: {
        passes: gemsPasses,
        passesOf: passes.length * GEMS_PER_PASS,
        tests: gemsTests,
        testsOf: weeks.length * MAX_GEMS_PER_TEST,
        total: gemsPasses + gemsTests,
      },
    },
    allTime: {
      xp: world.totalXp,
      level: world.level.n,
      trophies: { earned: trophies.length, total: world.trophies.length, gems: sum(trophies.map((t) => t.gems)) },
    },
  }
}

// --- Текст итога ---
//
// Простой текст без разметки: его вставляют в чат репетитору или в ретро.
// Строка о том, чего в цикле нет вовсе (задач, файлов, тестов), не пишется: пустые строки читались бы как упрёк.

function listed(items: string[], max: number): string {
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown} и ещё ${items.length - max}` : shown
}

function headLine(s: CycleSummary): string {
  const name = `Цикл ${s.n} «${s.name}»`
  if (s.status === 'done') return `${name} пройден. Звание: «${s.rankOnComplete}». Вершина: «${s.summit}».`
  const when = s.asOf ? ` на ${fullDate(s.asOf)}` : ''
  const where =
    s.currentDay !== null
      ? `день ${s.currentDay} из ${s.days.total}`
      : `закрыто ${s.days.closed} из ${count(s.days.total, OF_DAYS)}`
  return `${name}${when}: ${where}.`
}

function datesLine(d: CycleSummary['dates']): string | null {
  if (!d.first || !d.last) return null
  const rests = d.rests.map((r) => `${r.planned ? 'плановый перерыв' : 'привал'} ${shortPeriod(r.from, r.to)}`)
  const paused = d.restDays ? `, из них ${d.restDays} на паузах (${rests.join(', ')})` : ''
  return `Сроки: ${fullPeriod(d.first, d.last)} — ${count(d.calendarDays, CALENDAR_DAYS)}${paused}. Дней с занятиями — ${d.activeDays}, занятий — ${d.sessions}.`
}

function daysLine(d: CycleSummary['days']): string {
  const levels = [
    d.minimum ? `на минимуме — ${d.minimum}` : '',
    d.core ? `ядром — ${d.core}` : '',
    d.extension ? `с расширением — ${d.extension}` : '',
  ].filter(Boolean)
  let text = `Дни: закрыто ${d.closed} из ${d.total} (${levels.join(', ')})`
  if (d.closed === 0) text = `Дни: из ${d.total} пока не закрыт ни один`
  else if (d.closed === d.total) text = `Дни: закрыты все ${d.total} (${levels.join(', ')})`
  if (d.skipped) text += `, пропущено — ${d.skipped}`
  if (d.left) text += `, осталось — ${d.left}`
  if (d.inProgress.length) text += `; ${d.inProgress.length === 1 ? 'день' : 'дни'} ${d.inProgress.join(', ')} в работе`
  return `${text}.`
}

function timeLine(t: TimeSum): string | null {
  if (t.days === 0) return null
  if (t.measured === 0) return 'Время: у закрытых дней нет замера, план с фактом пока не сравнить.'
  const basis = count(t.measured, ['закрытому дню', 'закрытым дням', 'закрытым дням'])
  const missing = t.unmeasured ? `; без замера — ${t.unmeasured}` : ''
  return `Время: план ${fmtMinutes(t.planned)}, факт ${fmtMinutes(t.fact)} — по ${basis} с замером${missing}.`
}

function weeksLine(s: CycleSummary): string | null {
  if (!s.weeks.length) return null
  const head = `Недели: по чекпоинту закрыто ${s.weeks.filter((w) => w.closed).length} из ${s.weeks.length}`
  const tests = s.weeks.flatMap((w) => (w.test ? [`неделя ${w.n} — ${w.test.score} из ${w.test.max}`] : []))
  if (!tests.length) return `${head}; недельных тестов ${s.status === 'done' ? 'нет' : 'пока нет'}.`
  return `${head}. Недельные тесты: ${tests.join(', ')}.`
}

function trackLine(t: SummaryTrack): string {
  const parts = [t.daysTotal ? `дней ${t.daysDone} из ${t.daysTotal}` : '', `${t.xp} XP`]
  if (t.rank) {
    parts.push(
      t.rank.done
        ? `ранг «${t.rank.name}» получен`
        : `условий ранга «${t.rank.name}» выполнено ${t.rank.met} из ${t.rank.total}`,
    )
  }
  return `Трек ${t.code} «${t.name}»: ${parts.filter(Boolean).join(', ')}.`
}

/** Трек идущего цикла, до которого дело ещё не дошло: ни дня, ни очков, ни условий ранга. */
export function trackAhead(s: CycleSummary, t: SummaryTrack): boolean {
  return s.status !== 'done' && t.daysDone === 0 && t.xp === 0 && !t.rank?.met
}

/** По строке на трек; треки, которые ещё впереди, собраны в одну строку без нулей. */
function trackLines(s: CycleSummary): string[] {
  const lines = s.tracks.filter((t) => !trackAhead(s, t)).map(trackLine)
  const ahead = s.tracks.filter((t) => trackAhead(s, t)).map((t) => t.code)
  if (ahead.length) lines.push(`${ahead.length === 1 ? 'Трек' : 'Треки'} ${ahead.join(', ')} ещё впереди.`)
  return lines
}

function problemsLine(s: CycleSummary): string | null {
  const p = s.problems
  if (p.total === 0) return null
  if (!p.states.length && !p.unsolved) {
    return p.planned ? `Задачи LeetCode: из ${p.planned} основных пока не начата ни одна.` : null
  }
  // У идущего цикла повторы, до которых план ещё не дошёл, нулём не пишутся; у пройденного ноль — это итог.
  const due = (item: { have: number; of: number }) => item.of > 0 && (item.have > 0 || s.status === 'done')
  const parts: string[] = []
  if (p.states.length) parts.push(p.states.map((item) => `${item.label} — ${item.count}`).join(', '))
  if (p.unsolved) parts.push(`начато без решения — ${p.unsolved}`)
  if (p.notStarted) parts.push(`из ${p.planned} основных не начато — ${p.notStarted}`)
  if (due(p.repeated)) parts.push(`повторено с пустого редактора — ${p.repeated.have} из ${p.repeated.of}`)
  if (due(p.noHints)) parts.push(`без подсказок — ${p.noHints.have} из ${p.noHints.of}`)
  if (p.timed.tried) parts.push(`на таймере в лимит — ${p.timed.inLimit} из ${p.timed.tried}`)
  return `Задачи LeetCode: ${parts.join('; ')}.`
}

/** «на 3 мин быстрее», «на 2 мин дольше», «столько же». */
export function deltaText(delta: number): string {
  if (delta === 0) return 'столько же'
  return `на ${Math.abs(delta)} мин ${delta < 0 ? 'быстрее' : 'дольше'}`
}

function baselineLine(s: CycleSummary): string {
  const b = s.baseline
  const at = (p: SummaryPoint) => `${p.minutes} мин${p.limit ? ` из ${p.limit}` : ''} (задача ${p.problemId}, день ${p.day})`
  const yet = s.status === 'done' ? 'не сделан' : 'ещё не сделан'
  let text = `Замер ${yet}.`
  if (b.start.done && b.final.done) text = `Замер: было ${at(b.start)}, стало ${at(b.final)} — ${deltaText(b.delta ?? 0)}.`
  else if (b.start.done) text = `Замер: в начале — ${at(b.start)}; замер в конце цикла ${yet}.`
  else if (b.final.done) text = `Замер: в конце — ${at(b.final)}; замера в начале нет.`
  const self = b.assessed
    ? `Самооценка, было → стало: ${b.self.map((t) => `${t.code} ${t.start ?? '—'} → ${t.final ?? '—'}`).join(', ')}.`
    : 'Самооценка по трекам не записана.'
  return `${text} ${self}`
}

function checksLine(s: CycleSummary): string | null {
  const parts: string[] = []
  const c = s.checks
  if (c.total) parts.push(`Проверки понимания, первый ответ: верно — ${c.correct}, частично — ${c.partial}, неверно — ${c.wrong}.`)
  if (s.mistakes.total) parts.push(`Журнал ошибок: ${count(s.mistakes.total, RECORDS)}, побеждено — ${s.mistakes.beaten}.`)
  return parts.length ? parts.join(' ') : null
}

function filesLine(f: CycleSummary['files']): string | null {
  if (!f.total) return null
  // Названия в кавычках: в них самих есть двоеточия («Штаб: репозиторий prep-basic»).
  const built = f.list.filter((file) => file.stage >= 2).map((file) => `«${file.title}»`)
  const names = built.length ? ` (${listed(built, 8)})` : ''
  const inWork = f.inWork ? `, в стройке — ${f.inWork}` : ''
  return `Файлы цикла: построено ${f.built} из ${f.total}${names}${inWork}.`
}

function earnedLine(s: CycleSummary): string {
  const g = s.earned.gems
  const from = g.total ? ` (перевалы — ${g.passes}, недельные тесты — ${g.tests})` : ''
  return `Заработано за цикл: ${s.earned.xp} XP, ${count(s.earned.coins, COINS)}, ${count(g.total, GEMS)}${from}. Общий уровень — ${s.allTime.level}, всего ${s.allTime.xp} XP.`
}

/** Итог цикла строками обычного текста. Цикл без занятий — одна строка. */
export function summaryLines(s: CycleSummary): string[] {
  if (s.status === 'ahead') {
    const planned = [count(s.days.total, DAYS), count(s.weeks.length, WEEKS), `${fmtMinutes(s.time.plannedAll)} ядра`]
    return [`Цикл ${s.n} «${s.name}» ещё не начат: занятий не записано. По плану — ${planned.join(', ')}.`]
  }
  return [
    headLine(s),
    datesLine(s.dates),
    daysLine(s.days),
    timeLine(s.time),
    weeksLine(s),
    ...trackLines(s),
    problemsLine(s),
    baselineLine(s),
    checksLine(s),
    filesLine(s.files),
    earnedLine(s),
  ].filter((line): line is string => line !== null)
}

/** Тот же итог одним текстом — для буфера обмена. */
export function summaryText(s: CycleSummary): string {
  return summaryLines(s).join('\n')
}
