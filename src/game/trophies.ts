// Трофеи: достижения за мастерство. Каждый даётся один раз за всё время, не за цикл.
// Трофей нельзя купить и нельзя получить за время или число занятий — только за результат.
// За трофей даются камни: Baudi 19.11.2026 — «давай камнями, количество сам определи».
import type { DeckCard } from './deck'
import type { CycleView } from './engine'

export interface Trophy {
  id: string
  name: string
  /** За что даётся. */
  how: string
  gems: number
  earned: boolean
  date: string | null
  /** Сколько сделано из нужного, если трофей считается: «2 из 3». */
  progress: string | null
}

/** Сколько задач нужно решить без подсказок. */
export const NO_HINTS_NEED = 3
/** Сколько файлов по System Design нужно сохранить. */
export const DESIGN_NEED = 3
/** Пауза не короче стольких дней, чтобы возвращение считалось возвращением. */
export const RETURN_PAUSE_DAYS = 7
/** Сколько ошибок из журнала нужно победить. */
export const MISTAKES_NEED = 3
/** Сколько проверок понимания нужно пройти с первого раза. */
export const FIRST_TRY_NEED = 10
/** Сколько карточек колоды нужно довести до последней коробки. */
export const LEARNED_NEED = 10
/** Статусы задачи, с которыми она решена сама, а не после разбора. */
const OWN_STATUSES = ['solved-self', 'repeated-from-empty', 'solved-no-hints']

const sorted = (dates: string[]) => [...dates].sort()

export function trophiesFor(cycles: CycleView[], deck: DeckCard[] = []): Trophy[] {
  const journals = cycles.map((c) => c.raw.progress)
  const problems = journals.flatMap((p) => p.leetcode)
  const solved = problems.flatMap((problem) => problem.attempts.filter((a) => a.result === 'solved').map((a) => ({ ...a, id: problem.id })))

  // С пустого редактора: первый удачный повтор.
  const repeats = sorted(solved.filter((a) => a.kind === 'from-empty-editor').map((a) => a.date))

  // Дуэль с собой: старая задача заново на таймере, быстрее первой попытки.
  const duels = sorted(
    problems.flatMap((problem) => {
      const first = problem.attempts.find((a) => a.kind.startsWith('timed'))
      if (first?.minutes == null) return []
      return problem.attempts
        .filter((a) => a.kind === 'duel' && a.result === 'solved' && a.minutes != null && a.minutes < first.minutes!)
        .map((a) => a.date)
    }),
  )

  // Три без подсказок: три разные задачи.
  const noHintDates = new Map<number, string | null>()
  for (const problem of problems) {
    const attempt = problem.attempts.find((a) => a.kind === 'no-hints' && a.result === 'solved')
    if (attempt || problem.status === 'solved-no-hints') noHintDates.set(problem.id, attempt?.date ?? null)
  }
  const noHintKnown = sorted([...noHintDates.values()].filter((date): date is string => !!date))

  // Зелёный и «красный → зелёный».
  const green = journals.some((p) => Object.values(p.petProject?.ci ?? {}).some((value) => value === 'green'))
  const fixes = sorted(journals.flatMap((p) => (p.events ?? []).filter((e) => e.type === 'ci-fixed').map((e) => e.date)))

  // Архитектор: сохранённые файлы трека B.
  const designs = cycles.flatMap((c) => c.buildings).filter((b) => b.item.track === 'B' && b.stage >= 2).length

  // Быстрее себя: финальный замер быстрее стартового.
  // Финальный замер засчитывается, только если его задача в журнале решена самим.
  const faster = journals.find((p) => {
    const b = p.baseline
    if (b.start.minutes == null || b.final.minutes == null || !b.final.result || b.final.minutes >= b.start.minutes) return false
    const attempts = p.leetcode.find((problem) => problem.id === b.final.problemId)?.attempts ?? []
    return attempts.some((a) => a.result === 'solved' && a.selfSolved)
  })?.baseline

  // Возвращение: занятие после долгой паузы.
  const returns = sorted(
    journals.flatMap((p) =>
      p.position.pauses
        .filter((pause) => pause.days >= RETURN_PAUSE_DAYS)
        .flatMap((pause) => sorted(p.sessions.map((s) => s.date).filter((date) => date > pause.to)).slice(0, 1)),
    ),
  )

  // Работа над ошибками и ответы с первого раза.
  const beaten = journals.flatMap((p) => p.mistakes).filter((m) => m.beaten).length
  const firstTry = sorted(
    journals
      .flatMap((p) => p.knowledgeChecks)
      .filter((k) => k.verdict === 'correct')
      .map((k) => k.date),
  )

  // Знаю наизусть: карточки колоды в последней коробке — и из проверок понимания, и свои.
  const learned = deck.filter((card) => card.learned).length

  // Коллекция паттерна: все задачи одного паттерна решены сами.
  const status = new Map(problems.map((problem) => [problem.id, problem.status]))
  let best = { done: 0, total: 0, full: false }
  for (const cycle of cycles) {
    const groups = new Map<string, number[]>()
    for (const problem of cycle.raw.plan.leetcode) {
      if (problem.role === 'reserve') continue
      groups.set(problem.pattern, [...(groups.get(problem.pattern) ?? []), problem.id])
    }
    for (const ids of groups.values()) {
      if (ids.length < 2) continue
      const done = ids.filter((id) => OWN_STATUSES.includes(status.get(id) ?? '')).length
      const full = done === ids.length
      // Ближе всего к цели та группа, где осталось меньше задач.
      if (full ? !best.full : !best.full && (best.total === 0 || ids.length - done < best.total - best.done)) best = { done, total: ids.length, full }
    }
  }

  const count = (have: number, need: number) => `${Math.min(have, need)} из ${need}`
  const list: Trophy[] = [
    {
      id: 'empty-editor',
      name: 'С пустого редактора',
      how: 'Первая задача, которую ты повторил с пустого редактора и решил.',
      gems: 1,
      earned: repeats.length > 0,
      date: repeats[0] ?? null,
      progress: null,
    },
    {
      id: 'return',
      name: 'Возвращение',
      how: `Занятие после паузы не короче ${RETURN_PAUSE_DAYS} дней.`,
      gems: 1,
      earned: returns.length > 0,
      date: returns[0] ?? null,
      progress: null,
    },
    {
      id: 'first-try',
      name: 'С первого раза',
      how: `${FIRST_TRY_NEED} проверок понимания, на которые ты сразу ответил верно.`,
      gems: 1,
      earned: firstTry.length >= FIRST_TRY_NEED,
      date: firstTry[FIRST_TRY_NEED - 1] ?? null,
      progress: count(firstTry.length, FIRST_TRY_NEED),
    },
    {
      id: 'mistakes',
      name: 'Работа над ошибками',
      how: `${MISTAKES_NEED} ошибки из журнала побеждены: при повторе задачи не повторились.`,
      gems: 1,
      earned: beaten >= MISTAKES_NEED,
      date: null,
      progress: count(beaten, MISTAKES_NEED),
    },
    {
      id: 'green',
      name: 'Зелёный',
      how: 'Первый успешный workflow в GitHub Actions.',
      gems: 1,
      earned: green,
      date: null,
      progress: null,
    },
    {
      id: 'red-green',
      name: 'Красный → зелёный',
      how: 'Починил упавший CI.',
      gems: 1,
      earned: fixes.length > 0,
      date: fixes[0] ?? null,
      progress: null,
    },
    {
      id: 'duel',
      name: 'Дуэль с собой',
      how: 'Старая задача решена заново на таймере быстрее, чем в первый раз.',
      gems: 1,
      earned: duels.length > 0,
      date: duels[0] ?? null,
      progress: null,
    },
    {
      id: 'pattern',
      name: 'Коллекция паттерна',
      how: 'Все задачи одного паттерна решены сами: без разбора, с пустого редактора или без подсказок.',
      gems: 1,
      earned: best.full,
      date: null,
      progress: best.total ? count(best.done, best.total) : null,
    },
    {
      id: 'architect',
      name: 'Архитектор',
      how: `${DESIGN_NEED} сохранённых файла по System Design.`,
      gems: 1,
      earned: designs >= DESIGN_NEED,
      date: null,
      progress: count(designs, DESIGN_NEED),
    },
    {
      id: 'deck',
      name: 'Знаю наизусть',
      how: `${LEARNED_NEED} карточек колоды дошли до последней коробки.`,
      gems: 1,
      earned: learned >= LEARNED_NEED,
      date: null,
      progress: count(learned, LEARNED_NEED),
    },
    {
      id: 'no-hints',
      name: 'Три без подсказок',
      how: `${NO_HINTS_NEED} разные задачи решены без подсказок через две-три недели после разбора.`,
      gems: 2,
      earned: noHintDates.size >= NO_HINTS_NEED,
      date: noHintKnown[NO_HINTS_NEED - 1] ?? null,
      progress: count(noHintDates.size, NO_HINTS_NEED),
    },
    {
      id: 'faster',
      name: 'Быстрее себя',
      how: 'Финальный замер цикла быстрее стартового.',
      gems: 2,
      earned: !!faster,
      date: faster?.final.date ?? null,
      progress: null,
    },
    {
      id: 'summit',
      name: 'Вершина',
      how: 'Цикл пройден до конца.',
      gems: 2,
      earned: cycles.some((c) => c.done),
      date: null,
      progress: null,
    },
  ]
  return list
}
