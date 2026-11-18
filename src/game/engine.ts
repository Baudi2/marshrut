import type {
  CampItem,
  Ledger,
  KeyPoint,
  KnowledgeCheck,
  Mistake,
  OffplanEntry,
  Pause,
  PlanDay,
  PlanProblem,
  PlanStep,
  PlanTrack,
  PlanWeek,
  ProgressDay,
  ProgressProblem,
  RawCycle,
  BonusDay,
  SelfAssessment,
  WeeklyTest,
} from '../data/types'
import { damageFor, repairsSpent, type Damage } from './repair'
import { shopItem, walletFor, type Wallet } from './shop'
import { rateSide, type RatedSide } from './side'
import { replayTown, type Means, type Town } from './town'
import {
  BUILT_STATES,
  CONDITIONS,
  RETURN_PAUSE_MIN_DAYS,
  XP,
  GEMS_PER_PASS,
  conditionLevel,
  gemsForScore,
  levelFor,
  missedWorkdays,
  pausedDays,
  BREAK_LIMIT,
  parseISO,
  toISO,
  type Condition,
  type Tier,
} from './rules'

export type NodeState = 'ahead' | 'current' | 'minimum' | 'core' | 'extension' | 'skipped'

export interface DayView {
  n: number
  plan: PlanDay
  progress: ProgressDay | null
  state: NodeState
  done: boolean
  keyPoint: KeyPoint | null
  stepsDone: number[]
}

/** locked — дни недели ещё не закрыты; open — можно сдавать; done — сдан. */
export interface WeekTest {
  state: 'locked' | 'open' | 'done'
  attempts: WeeklyTest[]
  best: WeeklyTest | null
  gems: number
  /** Сколько дней недели осталось закрыть до теста. */
  daysLeft: number
  /** Проверки понимания и ошибки этой недели — материал для вопросов. */
  checks: KnowledgeCheck[]
  mistakes: Mistake[]
}

export interface WeekView {
  week: PlanWeek
  days: DayView[]
  bonus: BonusDay | null
  closed: boolean
  test: WeekTest
}

export type ProblemState = 'none' | 'walkthrough' | 'self' | 'repeated' | 'nohints' | 'before'

export const PROBLEM_STATE_LABEL: Record<ProblemState, string> = {
  none: 'не начата',
  walkthrough: 'решена с разбором',
  self: 'решена сама',
  repeated: 'повторена с пустого редактора',
  nohints: 'решена без подсказок',
  before: 'решена до плана',
}

export interface ProblemView {
  id: number
  title: string
  url: string
  pattern: string
  group: string
  role: PlanProblem['role'] | 'offplan'
  plan: PlanProblem | null
  progress: ProgressProblem | null
  state: ProblemState
  /** Минуты первой попытки на таймере и её лимит. */
  timedMinutes: number | null
  timedLimit: number | null
  /** День запланированного повтора, если он ещё впереди. */
  repeatDay: number | null
}

export interface BuildingView {
  item: CampItem
  /** 0 — участок, 1 — стройка, 2 — дом, 3 — дом с пристройкой. */
  stage: 0 | 1 | 2 | 3
  /** Состояние из progress.json, если запись есть. */
  recorded: string | null
}

export const STAGE_LABEL = ['участок', 'стройка', 'построен', 'с пристройкой'] as const

export interface XpEvent {
  cycle: string
  date: string | null
  label: string
  xp: number
  /** Монеты за это же событие; 0 — событие не про ежедневный прогресс. */
  coins: number
  track: string | null
}

/** Одно условие ранга: сколько есть и сколько нужно. */
export interface RankItem {
  label: string
  have: number
  need: number
  done: boolean
  /** Уточнение: чего не хватает. */
  detail?: string
  unit?: string
}

/** Зачёт на ранг, который даёт цикл. */
export interface RankProgress {
  cycle: string
  name: string
  items: RankItem[]
  met: number
  done: boolean
}

export interface TrackView {
  track: PlanTrack
  daysTotal: number
  daysDone: number
  xp: number
  /** n — номер ранга: 1 плюс число циклов, в которых зачёт сдан. next — зачёт текущего цикла. */
  rank: { n: number; title: string | null; next: RankProgress | null }
  checks: Record<KnowledgeCheck['verdict'], number>
  canExplain: KnowledgeCheck[]
  almost: KnowledgeCheck[]
  selfStart: number | null
  selfFinal: number | null
}

export interface CycleView {
  id: string
  n: number
  name: string
  summit: string
  rankOnComplete: string
  raw: RawCycle
  days: DayView[]
  weeks: WeekView[]
  current: { day: DayView; step: PlanStep | null } | null
  daysDone: number
  done: boolean
  problems: ProblemView[]
  buildings: BuildingView[]
  /** Привалы: после какого дня была пауза. */
  pauses: { afterDay: number; pause: Pause }[]
  events: XpEvent[]
}

export interface World {
  cycles: CycleView[]
  active: CycleView
  events: XpEvent[]
  totalXp: number
  level: Tier
  tracks: TrackView[]
  ranksEarned: string[]
  /** Купленные предметы лавки. */
  owned: string[]
  wallet: Wallet
  /** Город: состояние из журнала действий и дат занятий. Интерфейса пока нет. */
  town: Town
  /** Что есть у игрока для города: монеты, камни и число построенных файлов. */
  means: Means
  /** Стороннее развитие: записи вне плана с оценкой. */
  side: RatedSide[]
  /** За что получены камни: недельные тесты и пройденные перевалы. */
  gemLog: { label: string; gems: number; date: string | null }[]
  /** Сломанные постройки лагеря. */
  damage: Damage[]
  /** Даты всех занятий по возрастанию — по ним считаются перерывы. */
  sessionDates: string[]
  lastActivity: string | null
  missedWorkdays: number
  /** Сколько из этих дней прикрыл запас дров: они не считаются запустением. */
  covered: number
  /** Плановые перерывы текущего цикла: сколько рабочих дней использовано и до какого числа идёт нынешний. */
  breaks: { used: number; limit: number; until: string | null }
  condition: Condition
  /** Число занятий по неделям от первого занятия до текущей недели. */
  rhythm: { weekStart: string; sessions: number }[]
  checks: KnowledgeCheck[]
  mistakes: Mistake[]
}

const DONE: NodeState[] = ['minimum', 'core', 'extension']

const SELF_KEY: Record<string, keyof SelfAssessment> = {
  A: 'algorithms',
  B: 'systemDesign',
  C1: 'gradle',
  C2: 'cicd',
  E: 'aiTutorAndTests',
}

function problemState(status: string | undefined): ProblemState {
  switch (status) {
    case 'solved-with-walkthrough':
      return 'walkthrough'
    case 'solved-self':
      return 'self'
    case 'repeated-from-empty':
      return 'repeated'
    case 'solved-no-hints':
      return 'nohints'
    case 'solved-before-plan':
      return 'before'
    default:
      return 'none'
  }
}

export function patternGroup(pattern: string): string {
  const p = pattern.toLowerCase()
  if (p.startsWith('хеш')) return 'Хеш-таблицы и множества'
  if (p.includes('два указателя')) return 'Два указателя'
  if (p.includes('стек')) return 'Стек'
  if (p.includes('список')) return 'Связный список'
  if (p.includes('бинарный')) return 'Бинарный поиск'
  if (p.includes('дерев')) return 'Деревья и рекурсия'
  return pattern.charAt(0).toUpperCase() + pattern.slice(1)
}

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern.includes('*')) return pattern === path
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(path)
}

function lastDate(dates: string[] | undefined): string | null {
  return dates && dates.length ? [...dates].sort()[dates.length - 1] : null
}

function buildCycle(raw: RawCycle): CycleView {
  const { plan, progress } = raw
  const id = plan.meta.cycle.id
  const progressByDay = new Map(progress.days.map((d) => [d.day, d]))
  const keyByDay = new Map((plan.keyPoints ?? []).map((k) => [k.day, k]))
  const currentN = progress.position.currentDay

  const days: DayView[] = plan.days.map((planDay) => {
    const p = progressByDay.get(planDay.day) ?? null
    let state: NodeState = 'ahead'
    if (p && p.status !== 'in_progress') state = p.status
    else if (planDay.day === currentN) state = 'current'
    return {
      n: planDay.day,
      plan: planDay,
      progress: p,
      state,
      done: DONE.includes(state),
      keyPoint: keyByDay.get(planDay.day) ?? null,
      stepsDone: p?.stepsDone ?? (DONE.includes(state) ? planDay.steps.map((s) => s.n) : []),
    }
  })
  const dayByN = new Map(days.map((d) => [d.n, d]))
  const daysDone = days.filter((d) => d.done).length
  const done = daysDone === days.length

  const closedWeeks = new Set((progress.weeks ?? []).filter((w) => w.closed).map((w) => w.n))
  const weeks: WeekView[] = plan.weeks.map((week) => {
    const weekDays = days.filter((d) => d.plan.week === week.n)
    const attempts = (progress.weeklyTests ?? []).filter((t) => t.week === week.n)
    const best = attempts.reduce<WeeklyTest | null>(
      (top, t) => (!top || t.score / t.max > top.score / top.max ? t : top),
      null,
    )
    const dates = new Set(weekDays.flatMap((d) => d.progress?.dates ?? []))
    const daysLeft = weekDays.filter((d) => !d.done).length
    return {
      week,
      days: weekDays,
      bonus: (plan.bonusDays ?? []).find((b) => b.week === week.n) ?? null,
      closed: closedWeeks.has(week.n),
      test: {
        state: best ? 'done' : daysLeft === 0 ? 'open' : 'locked',
        attempts,
        best,
        gems: best ? gemsForScore(best.score, best.max) : 0,
        daysLeft,
        checks: progress.knowledgeChecks.filter((k) => dates.has(k.date)),
        mistakes: progress.mistakes.filter((m) => dates.has(m.date)),
      },
    }
  })

  const currentDay = dayByN.get(currentN)
  const current =
    currentDay && !currentDay.done
      ? {
          day: currentDay,
          step: currentDay.plan.steps.find((s) => s.n === progress.position.currentStep) ?? null,
        }
      : null

  // --- Задачи ---
  const progressProblems = new Map(progress.leetcode.map((p) => [p.id, p]))
  const problems: ProblemView[] = plan.leetcode.map((pp) => {
    const got = progressProblems.get(pp.id) ?? null
    const timed = got?.attempts.find((a) => a.kind.startsWith('timed')) ?? null
    const state = problemState(got?.status)
    const repeatPending = pp.repeatDay && !dayByN.get(pp.repeatDay)?.done && state !== 'none'
    return {
      id: pp.id,
      title: pp.title,
      url: pp.url,
      pattern: pp.pattern,
      group: patternGroup(pp.pattern),
      role: pp.role,
      plan: pp,
      progress: got,
      state,
      timedMinutes: timed?.minutes ?? null,
      timedLimit: timed ? Number(timed.kind.split('-')[1]) || null : null,
      repeatDay: repeatPending ? pp.repeatDay! : null,
    }
  })
  for (const got of progress.leetcode) {
    if (plan.leetcode.some((pp) => pp.id === got.id)) continue
    problems.push({
      id: got.id,
      title: got.title,
      url: got.url ?? `https://leetcode.com/problemset/`,
      pattern: 'вне плана',
      group: 'Вне плана',
      role: 'offplan',
      plan: null,
      progress: got,
      state: problemState(got.status),
      timedMinutes: null,
      timedLimit: null,
      repeatDay: null,
    })
  }

  // --- Лагерь ---
  const recordedArtifacts = progress.days.flatMap((d) => d.artifacts ?? [])
  const buildings: BuildingView[] = (plan.camp ?? []).map((item) => {
    const records = recordedArtifacts.filter(
      (a) => a.repo === item.repo && pathMatches(item.path, a.path),
    )
    const built = records.some((a) => BUILT_STATES.includes(a.state))
    const startDay = dayByN.get(item.day)
    const touched = records.length > 0 || !!startDay?.done || startDay?.state === 'current'
    const grown = item.growsOn.some((n) => dayByN.get(n)?.done)
    const stage = built ? (grown ? 3 : 2) : touched ? 1 : 0
    return { item, stage, recorded: records[0]?.state ?? null }
  })

  // --- Привалы ---
  const pauses = progress.position.pauses.map((pause) => {
    const before = days.filter((d) => {
      const last = lastDate(d.progress?.dates)
      return last !== null && last < pause.from
    })
    return { afterDay: before.length ? before[before.length - 1].n : 0, pause }
  })

  // --- Очки ---
  const events: XpEvent[] = []
  const add = (label: string, xp: number, track: string | null, date: string | null, coins = xp) =>
    events.push({ cycle: id, label, xp, coins, track, date })
  const trackOf = (code: string) => (plan.tracks.some((t) => t.code === code) ? code : null)

  for (const d of days) {
    if (!d.done) continue
    const date = lastDate(d.progress?.dates)
    const track = trackOf(d.plan.trackCode)
    if (d.state === 'minimum') {
      add(`День ${d.n} закрыт на минимуме`, XP.dayMinimum, track, date)
    } else {
      const deep = d.plan.mode !== 'light'
      add(
        `День ${d.n} закрыт ядром (${deep ? 'глубокий' : 'лёгкий'})`,
        deep ? XP.dayCoreDeep : XP.dayCoreLight,
        track,
        date,
      )
      if (d.state === 'extension') add(`День ${d.n}: расширение`, XP.extension, track, date)
    }
  }

  for (const pd of progress.days) {
    for (const a of pd.artifacts ?? []) {
      if (!BUILT_STATES.includes(a.state)) continue
      const item = (plan.camp ?? []).find((c) => c.repo === a.repo && pathMatches(c.path, a.path))
      const fallback = trackOf(dayByN.get(pd.day)?.plan.trackCode ?? '')
      add(`Артефакт: ${a.path}`, XP.artifact, item ? item.track : fallback, lastDate(pd.dates))
    }
  }

  const algoTrack = trackOf('A')
  for (const pv of problems) {
    const got = pv.progress
    if (!got || pv.state === 'none' || pv.state === 'before') continue
    const solved = got.attempts.filter((a) => a.result === 'solved')
    const firstDate = solved[0]?.date ?? null
    if (pv.role === 'pair') {
      add(`Задача-пара ${pv.id}`, XP.pair, algoTrack, firstDate)
    } else {
      const afterWalkthrough =
        pv.state === 'walkthrough' || got.attempts.some((a) => a.kind === 'rewrite-after-walkthrough')
      add(
        `Задача ${pv.id}: ${afterWalkthrough ? 'решена с разбором' : 'решена сама'}`,
        afterWalkthrough ? XP.problemWalkthrough : XP.problemSelf,
        algoTrack,
        firstDate,
      )
    }
    const repeat = solved.find((a) => a.kind === 'from-empty-editor')
    if (repeat) add(`Задача ${pv.id}: повтор с пустого редактора`, XP.repeatFromEmpty, algoTrack, repeat.date)
    const noHints = solved.find((a) => a.kind === 'no-hints')
    if (noHints) add(`Задача ${pv.id}: без подсказок`, XP.noHints, algoTrack, noHints.date)
    const firstTimed = got.attempts.find((a) => a.kind.startsWith('timed'))
    const duel = solved.find(
      (a) => a.kind === 'duel' && a.minutes !== null && firstTimed?.minutes != null && a.minutes < firstTimed.minutes,
    )
    if (duel) {
      add(`Задача ${pv.id}: дуэль с собой, ${duel.minutes} мин против ${firstTimed!.minutes}`, XP.duel, algoTrack, duel.date)
    }
  }

  const ci = progress.petProject?.ci
  if (ci && Object.values(ci).some((v) => v === 'green')) {
    add('Workflow впервые зелёный', XP.ciFirstGreen, trackOf('C2'), null)
  }
  for (const e of progress.events ?? []) {
    if (e.type === 'ci-fixed') add('Красный CI починен', XP.ciFixed, trackOf('C2'), e.date)
  }
  for (const w of progress.weeks ?? []) {
    if (w.closed) add(`Неделя ${w.n} закрыта по чекпоинту`, XP.weekCheckpoint, null, w.date ?? null, 0)
  }
  for (const { pause } of pauses) {
    if (pause.days >= RETURN_PAUSE_MIN_DAYS) {
      add(`Возвращение после паузы в ${pause.days} дней`, XP.returnAfterPause, null, pause.to, 0)
    }
  }

  return {
    id,
    n: plan.meta.cycle.n,
    name: plan.meta.cycle.name,
    summit: plan.meta.cycle.summit,
    rankOnComplete: plan.meta.cycle.rankOnComplete,
    raw,
    days,
    weeks,
    current,
    daysDone,
    done,
    problems,
    buildings,
    pauses,
    events,
  }
}

const solvedBy = (p: ProblemView, kind: string) =>
  !!p.progress?.attempts.some((a) => a.kind === kind && a.result === 'solved')

/** Что уже выполнено для ранга трека в этом цикле. */
function rankProgress(cycle: CycleView, track: PlanTrack): RankProgress {
  const item = (label: string, have: number, need: number, detail?: string): RankItem => ({
    label,
    have,
    need,
    done: have >= need,
    detail,
  })
  const core = cycle.problems.filter((p) => p.role === 'main' || p.role === 'baseline')
  const items = track.rank!.criteria.map((rule): RankItem => {
    switch (rule.kind) {
      case 'days':
        return item('Занятий трека закрыто', cycle.days.filter((d) => d.plan.trackCode === track.code && d.done).length, rule.need)
      case 'problems':
        if (rule.what === 'solved') return item('Задач решено', core.filter((p) => p.state !== 'none').length, rule.need)
        return rule.what === 'repeated'
          ? item('Повторено с пустого редактора', core.filter((p) => solvedBy(p, 'from-empty-editor')).length, rule.need)
          : item('Решено без подсказок через 2–3 недели', core.filter((p) => solvedBy(p, 'no-hints')).length, rule.need)
      case 'timed': {
        const attempts = cycle.problems.find((p) => p.id === rule.problem)?.progress?.attempts ?? []
        const ok = attempts.some((a) => a.kind.startsWith('timed') && a.result === 'solved' && a.selfSolved)
        return item(`Задача ${rule.problem} решена на таймере без разбора`, ok ? 1 : 0, 1)
      }
      case 'artifacts': {
        const wanted = rule.items.map((id) => cycle.buildings.find((b) => b.item.id === id))
        const missing = wanted.filter((b) => !b || b.stage < 2).map((b) => b?.item.label ?? b?.item.path ?? '?')
        return item(
          'Файлов сохранено в репозитории',
          rule.items.length - missing.length,
          rule.items.length,
          missing.length ? `не хватает: ${missing.join(', ')}` : undefined,
        )
      }
      case 'tests': {
        const asked = cycle.weeks.flatMap((w) => w.test.best?.questions ?? []).filter((q) => q.track === track.code)
        const points = asked.reduce((sum, q) => sum + q.points, 0)
        const share = asked.length ? points / (asked.length * 2) : 0
        const enough = asked.length >= rule.questions
        return {
          label: `Вопросы трека в недельных тестах: от ${Math.round(rule.share * 100)}% баллов`,
          have: Math.round(share * 100),
          need: Math.round(rule.share * 100),
          done: enough && share >= rule.share,
          detail: enough ? `${points} из ${asked.length * 2} баллов` : `вопросов пока ${asked.length} из ${rule.questions}`,
          unit: '%',
        }
      }
      case 'ci': {
        const ci = cycle.raw.progress.petProject?.ci
        return item('Workflow в GitHub Actions зелёный', ci && Object.values(ci).some((v) => v === 'green') ? 1 : 0, 1)
      }
    }
  })
  return { cycle: cycle.id, name: track.rank!.name, items, met: items.filter((i) => i.done).length, done: items.every((i) => i.done) }
}

function mondayOf(iso: string): Date {
  const d = parseISO(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function buildWorld(
  rawCycles: RawCycle[],
  offplan: OffplanEntry[],
  todayISO: string,
  ledger: Ledger = { purchases: [], repairs: [] },
  /** Момент по часам: от него зависят идущие стройки. По умолчанию — конец дня todayISO. */
  now: Date = new Date(parseISO(todayISO).getTime() + 86_399_000),
): World {
  const owned = [...new Set(ledger.purchases.map((p) => p.item))].filter((id) => shopItem(id))
  const cycles = rawCycles.map(buildCycle).sort((a, b) => a.n - b.n)
  const active = cycles.find((c) => !c.done) ?? cycles[cycles.length - 1]

  const events = cycles.flatMap((c) => c.events)
  const side = rateSide(offplan)
  for (const rated of side) {
    if (!rated.counted) continue
    events.push({
      cycle: 'offplan',
      date: rated.entry.date,
      label: `${rated.rule.name}: ${rated.entry.title}`,
      xp: rated.xp,
      coins: rated.xp,
      track: rated.entry.track ?? null,
    })
  }
  const totalXp = events.reduce((sum, e) => sum + e.xp, 0)
  const coinsEarned = events.reduce((sum, e) => sum + e.coins, 0)
  const gemLog: World['gemLog'] = cycles.flatMap((c) => [
    ...c.days
      .filter((d) => d.keyPoint && d.done)
      .map((d) => ({
        label: `Перевал: ${d.keyPoint!.title}`,
        gems: GEMS_PER_PASS,
        date: lastDate(d.progress?.dates),
      })),
    ...c.weeks
      .filter((w) => w.test.gems > 0)
      .map((w) => ({ label: `Тест недели ${w.week.n}`, gems: w.test.gems, date: w.test.best?.date ?? null })),
  ])
  for (const rated of side) {
    if (rated.gems) gemLog.push({ label: `${rated.rule.name}: ${rated.entry.title}`, gems: rated.gems, date: rated.entry.date })
  }
  const gemsEarned = gemLog.reduce((sum, g) => sum + g.gems, 0)

  const checks = cycles.flatMap((c) => c.raw.progress.knowledgeChecks)
  const mistakes = cycles.flatMap((c) => c.raw.progress.mistakes)

  // Трек живёт дольше цикла: описание берём из последнего цикла, где он есть.
  const trackByCode = new Map<string, PlanTrack>()
  for (const c of cycles) for (const t of c.raw.plan.tracks) trackByCode.set(t.code, t)
  const baseline = active.raw.progress.baseline
  const tracks: TrackView[] = [...trackByCode.values()].map((track) => {
    const ofTrack = active.days.filter((d) => d.plan.trackCode === track.code)
    const xp = events.filter((e) => e.track === track.code).reduce((sum, e) => sum + e.xp, 0)
    const own = checks.filter((k) => k.track === track.code)
    const selfKey = SELF_KEY[track.code]
    // Ранг — по одному на цикл, в котором выполнены все условия трека.
    const exams = cycles.flatMap((c) => {
      const inCycle = c.raw.plan.tracks.find((t) => t.code === track.code)
      return inCycle?.rank ? [rankProgress(c, inCycle)] : []
    })
    const passed = exams.filter((exam) => exam.done)
    return {
      track,
      daysTotal: ofTrack.length,
      daysDone: ofTrack.filter((d) => d.done).length,
      xp,
      rank: {
        n: 1 + passed.length,
        title: passed.length ? passed[passed.length - 1].name : null,
        next: exams.find((exam) => !exam.done) ?? null,
      },
      checks: {
        correct: own.filter((k) => k.verdict === 'correct').length,
        partial: own.filter((k) => k.verdict === 'partial').length,
        wrong: own.filter((k) => k.verdict === 'wrong').length,
      },
      canExplain: own.filter((k) => k.verdict === 'correct'),
      almost: own.filter((k) => k.verdict === 'partial'),
      selfStart: selfKey ? baseline.start.selfAssessment[selfKey] : null,
      selfFinal: selfKey ? baseline.final.selfAssessment[selfKey] : null,
    }
  })

  const sessionDates = [
    ...cycles.flatMap((c) => c.raw.progress.sessions.map((s) => s.date)),
    // Незасчитанная запись днём занятий не считается: мир от неё не оживает.
    ...side.filter((rated) => rated.counted).map((rated) => rated.entry.date),
  ].sort()
  const lastActivity = sessionDates.length ? sessionDates[sessionDates.length - 1] : null
  // Плановые перерывы: объявленные отпуск или болезнь. Их рабочие дни не считаются пропуском.
  const paused = new Set(cycles.flatMap((c) => [...pausedDays(c.raw.progress.breaks ?? [])]))
  const missed = lastActivity ? missedWorkdays(lastActivity, todayISO, paused) : 0
  const activeBreak = (active.raw.progress.breaks ?? []).find((item) => item.from <= todayISO && todayISO <= item.to && paused.has(todayISO))

  const rhythm: World['rhythm'] = []
  if (sessionDates.length) {
    const distinct = [...new Set(sessionDates)]
    const end = mondayOf(todayISO)
    for (const cursor = mondayOf(distinct[0]); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
      const from = toISO(cursor)
      const next = new Date(cursor)
      next.setDate(next.getDate() + 7)
      const to = toISO(next)
      rhythm.push({ weekStart: from, sessions: distinct.filter((d) => d >= from && d < to).length })
    }
  }

  const town = replayTown(ledger.town ?? [], sessionDates, now)
  const wallet = walletFor(coinsEarned, gemsEarned, owned, {
    coins: repairsSpent(ledger.repairs) + town.spent.coins,
    gems: town.spent.gems,
  })
  const specials = cycles.flatMap((c) => c.buildings).filter((b) => b.stage >= 2).length
  // Запас дров: дровник прикрывает столько рабочих дней пропуска, сколько в нём запаса.
  // Мир начинает зарастать и ломаться только после того, как дрова кончились.
  const covered = Math.min(missed, town.firewood)
  const neglect = conditionLevel(missed - covered)

  return {
    cycles,
    active,
    events,
    totalXp,
    level: levelFor(totalXp),
    tracks,
    ranksEarned: cycles.filter((c) => c.done).map((c) => c.rankOnComplete),
    owned,
    wallet,
    town,
    means: { coins: wallet.coins, gems: wallet.gems, specials },
    gemLog,
    side,
    // Сторожевая башня: под её присмотром за один перерыв ломается не больше одного украшения.
    damage: damageFor(sessionDates, ledger.purchases, ledger.repairs, todayISO, neglect, paused, town.buildings.some((b) => b.type === 'tower' && b.level > 0) ? 1 : 2),
    sessionDates,
    lastActivity,
    missedWorkdays: missed,
    covered,
    breaks: { used: pausedDays(active.raw.progress.breaks ?? []).size, limit: BREAK_LIMIT, until: activeBreak?.to ?? null },
    condition: CONDITIONS[neglect],
    rhythm,
    checks,
    mistakes,
  }
}
