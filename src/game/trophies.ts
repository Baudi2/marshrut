// Трофеи: достижения за мастерство. Каждый даётся один раз за всё время, не за цикл.
// Трофей нельзя купить и нельзя получить за время или число занятий — только за результат.
// За трофей даются камни: Baudi 19.11.2026 — «давай камнями, количество сам определи».
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
/** Статусы задачи, с которыми она решена сама, а не после разбора. */
const OWN_STATUSES = ['solved-self', 'repeated-from-empty', 'solved-no-hints']

const sorted = (dates: string[]) => [...dates].sort()

export function trophiesFor(cycles: CycleView[]): Trophy[] {
  const journals = cycles.map((c) => c.raw.progress)
  const problems = journals.flatMap((p) => p.leetcode)
  const solved = problems.flatMap((problem) => problem.attempts.filter((a) => a.result === 'solved').map((a) => ({ ...a, id: problem.id })))

  // С пустого редактора: первый удачный повтор.
  const repeats = sorted(solved.filter((a) => a.kind === 'from-empty-editor').map((a) => a.date))

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
  const faster = journals
    .map((p) => p.baseline)
    .find((b) => b.start.minutes != null && b.final.minutes != null && !!b.final.result && b.final.minutes < b.start.minutes)

  // Возвращение: занятие после долгой паузы.
  const returns = sorted(
    journals.flatMap((p) =>
      p.position.pauses
        .filter((pause) => pause.days >= RETURN_PAUSE_DAYS)
        .flatMap((pause) => sorted(p.sessions.map((s) => s.date).filter((date) => date > pause.to)).slice(0, 1)),
    ),
  )

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
  const list: Omit<Trophy, 'earned'>[] = [
    {
      id: 'empty-editor',
      name: 'С пустого редактора',
      how: 'Первая задача, которую ты повторил с пустого редактора и решил.',
      gems: 1,
      date: repeats[0] ?? null,
      progress: null,
    },
    {
      id: 'return',
      name: 'Возвращение',
      how: `Занятие после паузы не короче ${RETURN_PAUSE_DAYS} дней.`,
      gems: 1,
      date: returns[0] ?? null,
      progress: null,
    },
    {
      id: 'green',
      name: 'Зелёный',
      how: 'Первый успешный workflow в GitHub Actions.',
      gems: 1,
      date: null,
      progress: null,
    },
    {
      id: 'red-green',
      name: 'Красный → зелёный',
      how: 'Починил упавший CI.',
      gems: 1,
      date: fixes[0] ?? null,
      progress: null,
    },
    {
      id: 'pattern',
      name: 'Коллекция паттерна',
      how: 'Все задачи одного паттерна решены сами: без разбора, с пустого редактора или без подсказок.',
      gems: 1,
      date: null,
      progress: best.total ? count(best.done, best.total) : null,
    },
    {
      id: 'architect',
      name: 'Архитектор',
      how: `${DESIGN_NEED} сохранённых файла по System Design.`,
      gems: 1,
      date: null,
      progress: count(designs, DESIGN_NEED),
    },
    {
      id: 'no-hints',
      name: 'Три без подсказок',
      how: `${NO_HINTS_NEED} разные задачи решены без подсказок через две-три недели после разбора.`,
      gems: 2,
      date: noHintKnown[NO_HINTS_NEED - 1] ?? null,
      progress: count(noHintDates.size, NO_HINTS_NEED),
    },
    {
      id: 'faster',
      name: 'Быстрее себя',
      how: 'Финальный замер цикла быстрее стартового.',
      gems: 2,
      date: faster?.final.date ?? null,
      progress: null,
    },
  ]
  const earned: Record<string, boolean> = {
    'empty-editor': repeats.length > 0,
    return: returns.length > 0,
    green,
    'red-green': fixes.length > 0,
    pattern: best.full,
    architect: designs >= DESIGN_NEED,
    'no-hints': noHintDates.size >= NO_HINTS_NEED,
    faster: !!faster,
  }
  return list.map((trophy) => ({ ...trophy, earned: earned[trophy.id] }))
}
