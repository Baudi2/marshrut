// Отчёт недели и сравнение времени «план и факт».
// Чистые функции: всё берётся из готового CycleView, движок не меняется, в JSON ничего не пишется.
import type { Session } from '../data/types'
import { solvedAfterWalkthrough, type CycleView, type DayView, type NodeState, type WeekView } from './engine'
import { BUILT_STATES } from './rules'
import { DAYS, fmtDate, plural, type Forms } from './text'

const ARTIFACTS: Forms = ['артефакт', 'артефакта', 'артефактов']
const RECORDS: Forms = ['запись', 'записи', 'записей']

const total = (numbers: number[]) => numbers.reduce((sum, n) => sum + n, 0)
const count = (n: number, forms: Forms) => `${n} ${plural(n, forms)}`

/** 45 → «45 мин», 60 → «1 ч», 353 → «5 ч 53 мин». */
export function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}

// --- Время: план и факт ---
//
// Что есть в данных на 19.11.2026:
// - план: plan.days[].plannedMinutes — минуты ядра дня; у всех 30 дней они равны сумме минут шагов;
// - журнал: progress.sessions[] с from и to — часы начала и конца каждого захода. Их пишет команда записи
//   на каждом занятии. Из пяти занятий время конца не записано у одного (18.11, день 3 ещё идёт);
// - progress.days[].wallClockMinutes — итог дня, вписанный вручную. Он есть у одного дня (день 2: 100 минут),
//   и это округлённая сумма его же двух занятий (22 + 82 = 104). Команда записи пишет его ключом day --minutes.
//
// Что считается фактом:
// 1. Факт дня — сумма «to − from» по его занятиям (Session.day), когда время есть у всех занятий дня.
//    Это время по часам: от начала до конца захода, вместе с паузами внутри. Чистого времени работы в данных нет.
// 2. Если у какого-то занятия дня нет начала или конца, а у дня записан wallClockMinutes, фактом считается он:
//    ручной итог дня точнее, чем неполная сумма.
// 3. Если нет ни того, ни другого, день идёт как «без замера» (fact: null), а не как ноль. В суммы плана
//    и факта он не входит: иначе план считался бы за день, а факт — нет. Число таких дней видно отдельно.
// 4. С планом сравниваются только закрытые дни: начатый день ещё не весь. Он лежит в open и в итог не входит.
// 5. План — всегда plannedMinutes, то есть ядро. У дня, закрытого на минимуме или с расширением, сравнение
//    условно; сколько таких дней попало в суммы, показывает offCore.
// 6. По шагам факта нет: таймеры шагов живут в браузере, сюда они не читаются.

function clock(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

/**
 * Минуты занятия по часам. null — без замера: нет начала или конца либо они совпадают.
 * Конец раньше начала значит, что занятие перешло за полночь.
 */
export function sessionMinutes(session: Pick<Session, 'from' | 'to'>): number | null {
  const from = clock(session.from)
  const to = clock(session.to)
  if (from === null || to === null || from === to) return null
  return to > from ? to - from : to + 24 * 60 - from
}

export interface DayTime {
  n: number
  /** Название дня из плана. */
  title: string
  trackCode: string
  state: NodeState
  done: boolean
  dates: string[]
  /** Минуты ядра по плану. */
  planned: number
  /** Факт в минутах; null — без замера. */
  fact: number | null
  /** Откуда факт: sessions — сумма занятий по часам, day — итог дня, записанный вручную. */
  source: 'sessions' | 'day' | null
  /** Занятий у дня, из них без замера, и минуты тех, что замерены. */
  sessions: number
  unmeasured: number
  measured: number
}

export interface TimeSum {
  /** Закрытых дней, из них с замером и без. */
  days: number
  measured: number
  unmeasured: number
  /** План и факт по закрытым дням с замером: сравнивать можно только их. */
  planned: number
  fact: number
  /** Сколько из дней с замером закрыто не ядром: на минимуме или с расширением. */
  offCore: number
  /** План по всем закрытым дням и план на все дни, закрытые и нет. */
  plannedClosed: number
  plannedAll: number
}

export interface TrackTime extends TimeSum {
  code: string
  name: string
}

export interface TimeReport {
  /** Все дни плана по порядку. */
  days: DayTime[]
  /** Треки плана и коды дней вне треков (ретро). */
  tracks: TrackTime[]
  total: TimeSum
  /** Начатые, но не закрытые дни, у которых уже есть занятия. В суммы не входят. */
  open: DayTime[]
}

function dayTime(day: DayView, sessions: Session[]): DayTime {
  const spans = sessions.filter((s) => s.day === day.n).map(sessionMinutes)
  const measured = total(spans.filter((span): span is number => span !== null))
  const unmeasured = spans.filter((span) => span === null).length
  const byHand = day.progress?.wallClockMinutes
  let fact: number | null = null
  let source: DayTime['source'] = null
  if (spans.length > 0 && unmeasured === 0) {
    fact = measured
    source = 'sessions'
  } else if (byHand != null && byHand > 0) {
    fact = byHand
    source = 'day'
  }
  return {
    n: day.n,
    title: day.plan.track,
    trackCode: day.plan.trackCode,
    state: day.state,
    done: day.done,
    dates: day.progress?.dates ?? [],
    planned: day.plan.plannedMinutes,
    fact,
    source,
    sessions: spans.length,
    unmeasured,
    measured,
  }
}

function sumTime(days: DayTime[]): TimeSum {
  const closed = days.filter((d) => d.done)
  const measured = closed.filter((d) => d.fact !== null)
  return {
    days: closed.length,
    measured: measured.length,
    unmeasured: closed.length - measured.length,
    planned: total(measured.map((d) => d.planned)),
    fact: total(measured.map((d) => d.fact ?? 0)),
    offCore: measured.filter((d) => d.state !== 'core').length,
    plannedClosed: total(closed.map((d) => d.planned)),
    plannedAll: total(days.map((d) => d.planned)),
  }
}

/** План и факт времени: по дням, по трекам и итог по циклу. */
export function timeReport(cycle: CycleView): TimeReport {
  const { plan, progress } = cycle.raw
  const days = cycle.days.map((day) => dayTime(day, progress.sessions))
  const codes = [...new Set([...plan.tracks.map((t) => t.code), ...days.map((d) => d.trackCode)])]
  const tracks = codes.map((code) => ({
    code,
    name: plan.tracks.find((t) => t.code === code)?.name ?? (code === 'retro' ? 'Ретро' : code),
    ...sumTime(days.filter((d) => d.trackCode === code)),
  }))
  return {
    days,
    tracks,
    total: sumTime(days),
    open: days.filter((d) => !d.done && (d.sessions > 0 || d.fact !== null)),
  }
}

// --- Отчёт недели ---
//
// Неделя — это неделя плана (plan.weeks), а не календарная: идём по номерам дней.
// К неделе относится то, что случилось в даты её дней: занятия, попытки по задачам, проверки, ошибки.
// У зелёного CI и у списка хвостов (openItems) даты нет: к прошедшей неделе их не привязать,
// поэтому они попадают только в отчёт последней начатой недели — как состояние на сейчас.

export interface WeekFacts {
  week: number
  weeksTotal: number
  /** Первая и последняя дата занятий недели. */
  from: string | null
  to: string | null
  /** Привалы и плановые перерывы внутри этих дат. */
  rests: { from: string; to: string; planned: boolean }[]
  daysTotal: number
  closed: { minimum: number; core: number; extension: number }
  skipped: number
  /** Начатые, но не закрытые дни. */
  inProgress: number[]
  sessions: number
  /** Минуты по часам и число занятий без замера, которые в них не вошли. */
  minutes: number
  unmeasured: number
  problems: {
    /** Впервые решены на этой неделе: сам и после разбора — отдельно. */
    self: number[]
    walkthrough: number[]
    /** Брался за задачу, но к концу недели решения не было. */
    unsolved: number[]
    repeatOk: number[]
    repeatFail: number[]
    noHintsOk: number[]
    noHintsFail: number[]
    duels: number
    duelsFaster: number
  }
  /** Сохранённые артефакты и файлы, которые записаны, но не сохранены или не подтверждены. */
  artifacts: string[]
  unsaved: string[]
  /** Пройденные перевалы. */
  passes: string[]
  ciFixed: number
  ciGreen: boolean
  weekClosed: boolean
  test: { score: number; max: number } | null
  mistakes: number
  beaten: number
  checks: { correct: number; partial: number; wrong: number }
  /** Записей в списке хвостов; null — неделя не последняя начатая. */
  openItems: number | null
}

const weekStarted = (cycle: CycleView, w: WeekView) =>
  w.days.some((d) => d.progress !== null) ||
  cycle.raw.progress.sessions.some((s) => w.days.some((d) => d.n === s.day))

/** Недели цикла для выбора в отчёте: неделя началась, когда у неё есть запись дня или занятие. */
export function reportWeeks(cycle: CycleView): { n: number; started: boolean }[] {
  return cycle.weeks.map((w) => ({ n: w.week.n, started: weekStarted(cycle, w) }))
}

/** Неделя отчёта по умолчанию: последняя начатая, а пока не начата ни одна — первая. */
export function defaultReportWeek(cycle: CycleView): number {
  const started = reportWeeks(cycle).filter((w) => w.started)
  return started.length ? started[started.length - 1].n : (cycle.weeks[0]?.week.n ?? 1)
}

/** Скобки вокруг описательного «пути» в тексте не нужны: «(репозиторий и папки)» → «репозиторий и папки». */
const artifactName = (path: string) => path.replace(/^\((.*)\)$/, '$1')

export function weekFacts(cycle: CycleView, w: WeekView): WeekFacts {
  const { progress } = cycle.raw
  const dayNs = new Set(w.days.map((d) => d.n))
  const times = w.days.map((day) => dayTime(day, progress.sessions))
  const dates = [
    ...new Set([
      ...w.days.flatMap((d) => d.progress?.dates ?? []),
      ...progress.sessions.filter((s) => dayNs.has(s.day)).map((s) => s.date),
    ]),
  ].sort()
  const inWeek = new Set(dates)
  const from = dates[0] ?? null
  const to = dates[dates.length - 1] ?? null
  const latest = w.week.n === defaultReportWeek(cycle)

  const inside = (item: { from: string; to: string }) => from !== null && to !== null && item.from > from && item.to < to
  const rests = [
    ...cycle.pauses.map(({ pause }) => ({ from: pause.from, to: pause.to, planned: false })),
    ...(progress.breaks ?? []).map((item) => ({ from: item.from, to: item.to, planned: true })),
  ]
    .filter(inside)
    .sort((a, b) => a.from.localeCompare(b.from))

  const problems: WeekFacts['problems'] = {
    self: [],
    walkthrough: [],
    unsolved: [],
    repeatOk: [],
    repeatFail: [],
    noHintsOk: [],
    noHintsFail: [],
    duels: 0,
    duelsFaster: 0,
  }
  const solved = (a: { result: string }) => a.result === 'solved'
  for (const problem of cycle.problems) {
    const attempts = problem.progress?.attempts ?? []
    const here = attempts.filter((a) => inWeek.has(a.date))
    if (!here.length) continue
    const firstSolved = attempts.filter(solved).map((a) => a.date).sort()[0] ?? null
    if (firstSolved !== null && inWeek.has(firstSolved)) {
      // То же правило, что у очков в движке: задача, которую переписывал после разбора, «сама» уже не станет.
      const afterWalkthrough =
        solvedAfterWalkthrough(problem.state, attempts)
      ;(afterWalkthrough ? problems.walkthrough : problems.self).push(problem.id)
    } else if (firstSolved === null || (to !== null && firstSolved > to)) {
      problems.unsolved.push(problem.id)
    }
    const repeats = here.filter((a) => a.kind === 'from-empty-editor')
    if (repeats.length) (repeats.some(solved) ? problems.repeatOk : problems.repeatFail).push(problem.id)
    const noHints = here.filter((a) => a.kind === 'no-hints')
    if (noHints.length) (noHints.some(solved) ? problems.noHintsOk : problems.noHintsFail).push(problem.id)
    const firstTimed = attempts.find((a) => a.kind.startsWith('timed'))
    const duels = here.filter((a) => a.kind === 'duel')
    problems.duels += duels.length
    problems.duelsFaster += duels.filter(
      (a) => solved(a) && a.minutes !== null && firstTimed?.minutes != null && a.minutes < firstTimed.minutes,
    ).length
  }

  const isBuilt = (state: string) => BUILT_STATES.includes(state)
  const savedAnywhere = new Set(
    progress.days.flatMap((d) => (d.artifacts ?? []).filter((a) => isBuilt(a.state)).map((a) => `${a.repo}|${a.path}`)),
  )
  const recorded = w.days.flatMap((d) => d.progress?.artifacts ?? [])
  const ci = progress.petProject?.ci

  return {
    week: w.week.n,
    weeksTotal: cycle.weeks.length,
    from,
    to,
    rests,
    daysTotal: w.days.length,
    closed: {
      minimum: w.days.filter((d) => d.state === 'minimum').length,
      core: w.days.filter((d) => d.state === 'core').length,
      extension: w.days.filter((d) => d.state === 'extension').length,
    },
    skipped: w.days.filter((d) => d.state === 'skipped').length,
    inProgress: w.days.filter((d) => d.progress?.status === 'in_progress').map((d) => d.n),
    sessions: total(times.map((t) => t.sessions)),
    minutes: total(times.map((t) => t.fact ?? t.measured)),
    unmeasured: total(times.map((t) => (t.fact === null ? t.unmeasured : 0))),
    problems,
    artifacts: recorded.filter((a) => isBuilt(a.state)).map((a) => artifactName(a.path)),
    unsaved: recorded
      .filter((a) => !isBuilt(a.state) && !savedAnywhere.has(`${a.repo}|${a.path}`))
      .map((a) => artifactName(a.path)),
    passes: w.days.filter((d) => d.keyPoint && d.done).map((d) => d.keyPoint!.title),
    ciFixed: (progress.events ?? []).filter((e) => e.type === 'ci-fixed' && inWeek.has(e.date)).length,
    ciGreen: latest && !!ci && Object.values(ci).some((v) => v === 'green'),
    weekClosed: w.closed,
    test: w.test.best ? { score: w.test.best.score, max: w.test.best.max } : null,
    mistakes: w.test.mistakes.length,
    beaten: w.test.mistakes.filter((m) => m.beaten).length,
    checks: {
      correct: w.test.checks.filter((k) => k.verdict === 'correct').length,
      partial: w.test.checks.filter((k) => k.verdict === 'partial').length,
      wrong: w.test.checks.filter((k) => k.verdict === 'wrong').length,
    },
    openItems: latest ? progress.openItems.length : null,
  }
}

const period = (from: string, to: string | null) => (to && to !== from ? `${fmtDate(from)}–${fmtDate(to)}` : fmtDate(from))
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const sentences = (parts: string[]) => parts.map((part) => `${capital(part)}.`).join(' ')
const ids = (list: number[]) => (list.length ? ` (${list.map((id) => `№${id}`).join(', ')})` : '')

function listed(items: string[], max: number): string {
  const shown = items.slice(0, max).join(', ')
  return items.length > max ? `${shown} и ещё ${items.length - max}` : shown
}

const weekName = (cycle: CycleView, f: WeekFacts) => `Неделя ${f.week} из ${f.weeksTotal}, цикл «${cycle.name}»`

/** Строка 1: что за неделя, сколько дней закрыто и как, сколько занятий и минут. */
function headLine(cycle: CycleView, f: WeekFacts): string {
  const rests = f.rests.map((r) => `, ${r.planned ? 'с плановым перерывом' : 'с привалом'} ${period(r.from, r.to)}`).join('')
  const when = f.from ? ` (${period(f.from, f.to)}${rests})` : ''

  const closed = f.closed.minimum + f.closed.core + f.closed.extension
  const levels = [
    f.closed.minimum ? `на минимуме — ${f.closed.minimum}` : '',
    f.closed.core ? `ядром — ${f.closed.core}` : '',
    f.closed.extension ? `с расширением — ${f.closed.extension}` : '',
  ].filter(Boolean)
  let days = closed
    ? `${plural(closed, ['закрыт', 'закрыто', 'закрыто'])} ${count(closed, DAYS)} из ${f.daysTotal} (${levels.join(', ')})`
    : `из ${count(f.daysTotal, ['дня', 'дней', 'дней'])} пока не закрыт ни один`
  if (f.skipped) days += `, пропущено — ${f.skipped}`
  if (f.inProgress.length) days += `, ${f.inProgress.length === 1 ? 'день' : 'дни'} ${f.inProgress.join(', ')} в работе`

  let sessions = 'занятий не было'
  if (f.sessions && f.minutes === 0) sessions = `занятий — ${f.sessions}, время не замерялось`
  else if (f.sessions) {
    const missing = f.unmeasured ? ` (без замера — ${f.unmeasured}, в сумму ${f.unmeasured === 1 ? 'не вошло' : 'не вошли'})` : ''
    sessions = `занятий — ${f.sessions}, по часам ${fmtMinutes(f.minutes)}${missing}`
  }
  return `${weekName(cycle, f)}${when}: ${days}. ${capital(sessions)}.`
}

/** Строка 2: задачи. «Сам» и «после разбора» не складываются. */
function problemsLine(p: WeekFacts['problems']): string {
  const parts: string[] = []
  if (p.self.length + p.walkthrough.length) {
    parts.push(`сам — ${p.self.length}${ids(p.self)}, после разбора — ${p.walkthrough.length}${ids(p.walkthrough)}`)
  }
  if (p.unsolved.length) parts.push(`начато без решения — ${p.unsolved.length}${ids(p.unsolved)}`)
  const repeats = p.repeatOk.length + p.repeatFail.length
  if (repeats) {
    parts.push(
      `повторы с пустого редактора — удалось ${p.repeatOk.length}${ids(p.repeatOk)}, не удалось ${p.repeatFail.length}${ids(p.repeatFail)}`,
    )
  }
  if (p.noHintsOk.length + p.noHintsFail.length) {
    parts.push(
      `без подсказок — решено ${p.noHintsOk.length}${ids(p.noHintsOk)}, не решено ${p.noHintsFail.length}${ids(p.noHintsFail)}`,
    )
  }
  if (p.duels) parts.push(`дуэль с собой — попыток ${p.duels}, быстрее первой попытки ${p.duelsFaster}`)
  if (!parts.length) return 'Задачи LeetCode: на этой неделе не решались.'
  if (!repeats) parts.push('повторов с пустого редактора не было')
  return `Задачи LeetCode: ${parts.join('; ')}.`
}

/** Строка 3: что сохранено и что пройдено. */
function savedLine(f: WeekFacts): string {
  const n = f.artifacts.length
  const parts = [
    n
      ? `${plural(n, ['сохранён', 'сохранено', 'сохранено'])} ${count(n, ARTIFACTS)}: ${listed(f.artifacts, 6)}`
      : 'новых сохранённых артефактов нет',
  ]
  if (f.passes.length) {
    parts.push(`${f.passes.length === 1 ? 'пройден перевал' : 'пройдены перевалы'} ${f.passes.map((t) => `«${t}»`).join(', ')}`)
  }
  if (f.ciFixed) parts.push('красный CI починен')
  if (f.ciGreen) parts.push('workflow в GitHub Actions сейчас зелёный')
  if (f.weekClosed) parts.push('неделя закрыта по чекпоинту')
  if (f.test) parts.push(`недельный тест — ${f.test.score} из ${f.test.max}`)
  return sentences(parts)
}

/** Строка 4: что не получилось или осталось хвостом. */
function tailsLine(f: WeekFacts): string {
  const asked = f.checks.correct + f.checks.partial + f.checks.wrong
  const parts: string[] = []
  if (f.mistakes) parts.push(`ошибок в журнале — ${f.mistakes}${f.beaten ? ` (побеждено — ${f.beaten})` : ''}`)
  if (f.checks.partial + f.checks.wrong) {
    parts.push(`из ${asked} первых ответов на проверках понимания неверных — ${f.checks.wrong}, частичных — ${f.checks.partial}`)
  }
  if (f.unsaved.length) parts.push(`файлов не сохранено или не подтверждено — ${f.unsaved.length}`)
  if (f.openItems) parts.push(`в списке хвостов сейчас ${count(f.openItems, RECORDS)}`)
  if (parts.length) return `Не получилось или осталось: ${parts.join('; ')}.`
  return asked
    ? `Ошибок и хвостов за неделю не записано; на проверках понимания неверных и частичных ответов нет (вопросов — ${asked}).`
    : 'Ошибок, неверных ответов и хвостов за неделю не записано.'
}

/** Строка 5: что дальше — следующий день или неделя по плану. */
function nextLine(cycle: CycleView, w: WeekView): string {
  const test = w.test.state === 'open' ? ` Недельный тест за неделю ${w.week.n} открыт.` : ''
  const day = cycle.current?.day ?? cycle.days.find((d) => !d.done && d.state !== 'skipped') ?? null
  if (!day) return `Дальше: ${cycle.done ? 'цикл пройден, все дни закрыты' : 'незакрытых дней по плану не осталось'}.${test}`

  const step = cycle.current?.day.n === day.n && day.stepsDone.length > 0 ? cycle.current.step : null
  const name = `день ${day.n} «${day.plan.track}»${step ? `, шаг ${step.n} из ${day.plan.steps.length}` : ''}`
  if (day.plan.week !== w.week.n) return `Дальше: неделя ${day.plan.week}, ${name}.${test}`

  const rest = w.days.filter((d) => !d.done && d.state !== 'skipped' && d.n !== day.n)
  if (rest.length === 0) return `Дальше: ${name}; это последний незакрытый день недели.`
  if (rest.length === 1) return `Дальше: ${name}; после него в этой неделе остаётся день ${rest[0].n} «${rest[0].plan.track}».`
  return `Дальше: ${name}; после него в этой неделе ${plural(rest.length, ['остаётся', 'остаются', 'остаётся'])} ещё ${count(rest.length, DAYS)}.`
}

export interface WeekReport {
  week: number
  /** false — за неделю ничего не было: отчёт сжат до одной строки. */
  active: boolean
  lines: string[]
  /** Те же строки обычным текстом, по одной на строку: для буфера обмена. */
  text: string
}

/**
 * Отчёт недели для пятничного ревью: пять строк обычным текстом.
 * 1 — неделя, дни, занятия и время; 2 — задачи; 3 — что сохранено; 4 — что не получилось или осталось; 5 — что дальше.
 * Если за неделю ничего не было, отчёт — одна строка: пять строк «ничего» читались бы как упрёк.
 */
export function weekReport(cycle: CycleView, week: number): WeekReport {
  const w = cycle.weeks.find((item) => item.week.n === week)
  const done = (lines: string[], active: boolean): WeekReport => ({ week, active, lines, text: lines.join('\n') })
  if (!w) return done([`В плане цикла «${cycle.name}» нет недели ${week}.`], false)

  const f = weekFacts(cycle, w)
  const p = f.problems
  const active =
    f.sessions > 0 ||
    f.closed.minimum + f.closed.core + f.closed.extension > 0 ||
    f.inProgress.length > 0 ||
    f.artifacts.length + f.unsaved.length + f.mistakes > 0 ||
    f.checks.correct + f.checks.partial + f.checks.wrong > 0 ||
    p.self.length + p.walkthrough.length + p.unsolved.length + p.repeatOk.length + p.repeatFail.length > 0 ||
    p.noHintsOk.length + p.noHintsFail.length + p.duels > 0
  if (!active) {
    const skipped = f.skipped ? `, пропущено дней — ${f.skipped}` : ''
    return done([`${weekName(cycle, f)}: занятий на этой неделе не было${skipped}. ${nextLine(cycle, w)}`], false)
  }
  return done([headLine(cycle, f), problemsLine(p), savedLine(f), tailsLine(f), nextLine(cycle, w)], true)
}
