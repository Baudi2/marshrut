// Мир на дату: тот же buildWorld, которому отдали данные, обрезанные по дню.
// Ничего не хранится и не выдумывается: в журнале остаётся только то, что было известно к концу названного дня.
//
// Что у записи есть дата — режется по ней: занятия, попытки по задачам, проверки, ошибки, тесты, недели, события,
// паузы, перерывы, покупки, действия в городе, ответы по карточкам. Чего по датам не восстановить — приближения:
// - файлы дня (artifacts) своей даты не имеют и относятся к последней дате дня;
// - шаги начатого дня (stepsDone) без дат: у дня, который к дате ещё не закрыт, они не показаны;
// - «ошибка побеждена» (beaten) — с первого решения той же задачи после даты ошибки;
// - зелёный CI — с первого события ci-fixed или с закрытия первого дня трека, в зачёт которого идёт CI;
// - у чего нет и такой опоры (хвосты, наблюдения, побеждённая ошибка без задачи, CI без опоры) —
//   с последнего дня занятий журнала: это состояние «на сейчас», как в отчёте недели (src/game/report.ts).
import type {
  Attempt,
  BaselinePoint,
  DayStatus,
  Ledger,
  Mistake,
  OffplanEntry,
  Plan,
  Progress,
  ProgressArtifact,
  ProgressDay,
  ProgressProblem,
  RawCycle,
} from '../data/types'
import { buildWorld, type World } from './engine'
import { parseISO } from './rules'

/** Всё, из чего строится мир: то же, что получает buildWorld в src/App.tsx. */
export interface WorldInputs {
  rawCycles: RawCycle[]
  offplan: OffplanEntry[]
  ledger: Ledger
}

const CLOSED: DayStatus[] = ['minimum', 'core', 'extension']
/** Статус задачи, у которой к дате есть попытки, но решения ещё нет: сайт читает его как «не начата». */
export const ATTEMPTED = 'attempted'
const BEFORE_PLAN = 'solved-before-plan'
const REPEAT_KINDS = ['from-empty-editor', 'no-hints']

/** Конец дня — тот же момент, что buildWorld берёт по умолчанию. */
export const endOfDay = (date: string): Date => new Date(parseISO(date).getTime() + 86_399_000)

const maxOf = (dates: string[]): string | null => dates.reduce<string | null>((top, d) => (top === null || d > top ? d : top), null)
const minOf = (dates: string[]): string | null => dates.reduce<string | null>((low, d) => (low === null || d < low ? d : low), null)

/** Статус, который следует из попыток, — правило команды записи (statusFromAttempts в scripts/record-lib.mjs). */
function statusFromAttempts(attempts: Attempt[]): string | null {
  const solved = attempts.filter((a) => a.result === 'solved')
  if (solved.some((a) => a.kind === 'no-hints')) return 'solved-no-hints'
  if (solved.some((a) => a.kind === 'from-empty-editor')) return 'repeated-from-empty'
  if (!solved.some((a) => !REPEAT_KINDS.includes(a.kind) && a.kind !== 'duel')) return null
  const walkthrough = attempts.some((a) => a.kind === 'rewrite-after-walkthrough') || solved.some((a) => !a.selfSolved)
  return walkthrough ? 'solved-with-walkthrough' : 'solved-self'
}

/** Своя дата файла, если она когда-нибудь появится в записи: сейчас её нет, и файл относится к последней дате дня. */
const artifactDate = (artifact: ProgressArtifact): string | null => {
  const own = (artifact as { date?: unknown }).date
  return typeof own === 'string' ? own : null
}

/**
 * Даты записей дней. У записи без дат (пропущенный день, день без занятий) берутся даты её занятий,
 * а если нет и их — первая дата ближайшего следующего дня: пропуск записывают, переходя к нему.
 * null — опоры нет совсем: запись считается известной с последнего дня занятий.
 */
function dayDates(progress: Progress): Map<number, string[] | null> {
  const records = [...progress.days].sort((a, b) => a.day - b.day)
  const own = records.map((record) => {
    if (record.dates.length) return [...record.dates].sort()
    const sessions = progress.sessions.filter((s) => s.day === record.day).map((s) => s.date)
    return sessions.length ? [...new Set(sessions)].sort() : null
  })
  const dates = new Map<number, string[] | null>()
  records.forEach((record, i) => {
    const next = own.slice(i + 1).find((list) => list !== null)
    dates.set(record.day, own[i] ?? (next ? [next[0]] : null))
  })
  return dates
}

/** Запись дня, какой она была к дате: целиком, «в работе» без итога или ещё никакой. */
function sliceDay(record: ProgressDay, dates: string[] | null, date: string, undatedKnown: boolean): ProgressDay | null {
  const known = dates ? dates[dates.length - 1] <= date : undatedKnown
  if (known) {
    const artifacts = record.artifacts?.filter((a) => (artifactDate(a) ?? '') <= date)
    return artifacts && artifacts.length !== record.artifacts!.length ? { ...record, artifacts } : record
  }
  const began = dates?.filter((d) => d <= date) ?? []
  if (!began.length) return null
  // День начат, но к дате не закрыт: итога, заметки и шагов ещё нет, файлы — только с собственной датой.
  const stub: ProgressDay = { day: record.day, status: 'in_progress', dates: began }
  if (record.confirmed !== undefined) stub.confirmed = record.confirmed
  if (record.plannedMinutes !== undefined) stub.plannedMinutes = record.plannedMinutes
  const artifacts = (record.artifacts ?? []).filter((a) => artifactDate(a) !== null && artifactDate(a)! <= date)
  if (artifacts.length) stub.artifacts = artifacts
  return stub
}

/** Задача, какой она была к дате: попытки не позже даты и статус, который из них следует. */
function sliceProblem(problem: ProgressProblem, date: string): ProgressProblem | null {
  const attempts = problem.attempts.filter((a) => a.date <= date)
  if (attempts.length === problem.attempts.length) return problem
  // «Решена до плана» — не попытка с датой: такой задача была с самого начала.
  if (problem.status === BEFORE_PLAN) return { ...problem, attempts }
  if (!attempts.length) return null
  const { nextRepeat: _later, ...rest } = problem
  return { ...rest, attempts, status: statusFromAttempts(attempts) ?? ATTEMPTED }
}

/** С какой даты ошибка побеждена: первое решение той же задачи после даты ошибки. null — опоры нет. */
function beatenSince(mistake: Mistake, problems: ProgressProblem[]): string | null {
  if (mistake.problemId === null) return null
  const attempts = problems.find((p) => p.id === mistake.problemId)?.attempts ?? []
  return minOf(attempts.filter((a) => a.result === 'solved' && a.date > mistake.date).map((a) => a.date))
}

/**
 * С какой даты считается зелёный CI: раньше из двух — первое событие ci-fixed (чинят то, что уже было зелёным)
 * и закрытие первого дня трека, в условиях ранга которого есть CI. null — опоры нет.
 */
function ciSince(progress: Progress, plan: Plan | undefined, dates: Map<number, string[] | null>): string | null {
  const fixed = minOf((progress.events ?? []).filter((e) => e.type === 'ci-fixed').map((e) => e.date))
  const tracks = new Set((plan?.tracks ?? []).filter((t) => t.rank?.criteria.some((rule) => rule.kind === 'ci')).map((t) => t.code))
  const closed = (plan?.days ?? [])
    .filter((d) => tracks.has(d.trackCode))
    .flatMap((d) => {
      const record = progress.days.find((r) => r.day === d.day)
      const last = dates.get(d.day)
      return record && CLOSED.includes(record.status) && last ? [last[last.length - 1]] : []
    })
  return minOf([...(fixed ? [fixed] : []), ...closed])
}

/** Замер, каким он был к дате. Без своей даты — с закрытия дня, на который он назначен. */
function slicePoint(point: BaselinePoint, date: string, dayKnown: (day: number) => boolean): BaselinePoint {
  const known = point.date ? point.date <= date : dayKnown(point.day)
  if (known) return point
  const { date: _later, ...rest } = point
  return {
    ...rest,
    minutes: null,
    result: null,
    selfAssessment: { algorithms: null, systemDesign: null, gradle: null, cicd: null, aiTutorAndTests: null },
  }
}

/**
 * Журнал цикла, каким он был к концу дня date. plan нужен, чтобы найти позицию на дату и опоры для записей без дат;
 * без него позиция считается по самим записям дней.
 */
export function sliceProgress(progress: Progress, date: string, plan?: Plan): Progress {
  const anchor = maxOf(progress.sessions.map((s) => s.date))
  /** Известно ли к дате то, у чего нет ни своей даты, ни опоры. */
  const undatedKnown = anchor === null || anchor <= date
  const dates = dayDates(progress)

  const days = progress.days.flatMap((record) => sliceDay(record, dates.get(record.day) ?? null, date, undatedKnown) ?? [])
  const sameDays = days.length === progress.days.length && days.every((record, i) => record === progress.days[i])
  const byDay = new Map(days.map((record) => [record.day, record]))
  const dayKnown = (n: number) => {
    const record = byDay.get(n)
    return !!record && CLOSED.includes(record.status)
  }

  // Позиция на дату — первый день, который к ней не закрыт и не пропущен. Какой шаг шёл тогда, не записано:
  // если запись дня обрезана, берётся первый несделанный шаг, то есть первый.
  let position = progress.position
  if (!sameDays) {
    const settled = (n: number) => (byDay.get(n)?.status ?? 'in_progress') !== 'in_progress'
    const open = plan
      ? plan.days.find((d) => !settled(d.day))?.day
      : (days.find((record) => record.status === 'in_progress')?.day ?? Math.max(0, ...days.map((record) => record.day)) + 1)
    if (open !== undefined) {
      const done = byDay.get(open)?.stepsDone ?? []
      const steps = plan?.days.find((d) => d.day === open)?.steps ?? []
      const { currentStepTitle: _title, ...rest } = progress.position
      position = { ...rest, currentDay: open, currentStep: (steps.find((s) => !done.includes(s.n)) ?? steps[0])?.n ?? 1 }
    }
  }
  position = {
    ...position,
    daysDone: sameDays ? position.daysDone : days.filter((record) => CLOSED.includes(record.status)).length,
    // Привал записывают по возвращении: он известен, когда остался позади.
    pauses: progress.position.pauses.filter((pause) => pause.to < date),
  }

  const leetcode = progress.leetcode.flatMap((problem) => sliceProblem(problem, date) ?? [])
  const mistakes = progress.mistakes
    .filter((m) => m.date <= date)
    .map((m) => {
      if (!m.beaten) return m
      const since = beatenSince(m, progress.leetcode)
      if (since ? since <= date : undatedKnown) return m
      const { beaten: _later, ...rest } = m
      return rest
    })

  const green = ciSince(progress, plan, dates)
  const ciKnown = green ? green <= date : undatedKnown
  const ci = progress.petProject?.ci
  const petProject =
    ci && !ciKnown ? { ...progress.petProject, ci: { helloWorldWorkflow: null, buildWorkflow: null } } : progress.petProject

  const weekKnown = (week: { n: number; date?: string }) => {
    if (week.date) return week.date <= date
    // Неделя без даты закрытия: считается закрытой, когда закрыты все её дни.
    const own = plan?.days.filter((d) => d.week === week.n) ?? []
    return own.length ? own.every((d) => dayKnown(d.day)) : undatedKnown
  }

  const cut: Progress = {
    ...progress,
    meta: { ...progress.meta, updatedAt: progress.meta.updatedAt > date ? date : progress.meta.updatedAt },
    position,
    days,
    sessions: progress.sessions.filter((s) => s.date <= date),
    leetcode,
    baseline: {
      start: slicePoint(progress.baseline.start, date, dayKnown),
      final: slicePoint(progress.baseline.final, date, dayKnown),
    },
    mistakes,
    knowledgeChecks: progress.knowledgeChecks.filter((k) => k.date <= date),
    openItems: undatedKnown ? progress.openItems : [],
    observations: undatedKnown ? progress.observations : [],
  }
  if (petProject) cut.petProject = petProject
  // Перерыв, который к дате начался, известен целиком; объявлен ли заранее будущий, по записи не понять.
  if (progress.breaks) cut.breaks = progress.breaks.filter((item) => item.from <= date)
  if (progress.weeks) cut.weeks = progress.weeks.filter(weekKnown)
  if (progress.events) cut.events = progress.events.filter((e) => e.date <= date)
  if (progress.weeklyTests) cut.weeklyTests = progress.weeklyTests.filter((t) => t.date <= date)
  return cut
}

/** Цикл, каким он был к концу дня date: план тот же, журнал обрезан. */
export function sliceCycle(raw: RawCycle, date: string): RawCycle {
  return { ...raw, progress: sliceProgress(raw.progress, date, raw.plan) }
}

/**
 * Журнал браузера и репозитория к моменту moment (по умолчанию — конец дня date).
 * Записи с датой режутся по дню, записи с точным временем (город, выкупы, ответы по карточкам) — по моменту.
 * Список своих наград — не журнал: он остаётся как есть.
 */
export function sliceLedger(ledger: Ledger, date: string, moment: Date = endOfDay(date)): Ledger {
  const limit = moment.getTime()
  const byDay = <T extends { date: string }>(list: T[] | undefined) => list?.filter((item) => item.date <= date)
  const byTime = <T extends { at: string }>(list: T[] | undefined) => list?.filter((item) => Date.parse(item.at) <= limit)
  return {
    ...ledger,
    purchases: byDay(ledger.purchases) ?? [],
    repairs: byDay(ledger.repairs) ?? [],
    town: byTime(ledger.town),
    redeemed: byTime(ledger.redeemed),
    signs: byDay(ledger.signs),
    reviews: byTime(ledger.reviews),
    cards: byDay(ledger.cards),
  }
}

/** Все данные, обрезанные по дню date. */
export function sliceInputs(inputs: WorldInputs, date: string, moment: Date = endOfDay(date)): WorldInputs {
  return {
    rawCycles: inputs.rawCycles.map((raw) => sliceCycle(raw, date)),
    offplan: inputs.offplan.filter((entry) => entry.date <= date),
    ledger: sliceLedger(inputs.ledger, date, moment),
  }
}

/**
 * Мир, каким он был к концу дня date.
 * now — настоящий момент: если он раньше конца дня (date — сегодня), мир считается на него,
 * чтобы стройка, которая закончится вечером, не выглядела готовой с утра.
 */
export function worldAt(inputs: WorldInputs, date: string, now?: Date): World {
  const end = endOfDay(date)
  const moment = now && now.getTime() < end.getTime() ? now : end
  const cut = sliceInputs(inputs, date, moment)
  return buildWorld(cut.rawCycles, cut.offplan, date, cut.ledger, moment)
}
