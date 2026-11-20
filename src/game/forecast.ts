// Прогноз и факт: чего ждал перед проверкой и что вышло.
// Чистые функции поверх готовых CycleView: движок не меняется, в JSON ничего не пишется.
// За точность прогноза нет ни очков, ни монет, ни камней, ни трофеев: иначе выгодно занижать.
// Поэтому отчёт идёт только в карточку на «Приросте» и ни в один расчёт игры.
import type { CycleView } from './engine'
import { plural, type Forms } from './text'

// Что есть в данных:
// - WeeklyTest.forecast — сколько баллов из max ждал перед недельным тестом. У пересдачи прогноз свой;
// - Attempt.forecast — сколько минут ждал перед попыткой по задаче. Команда записи принимает его только
//   у попытки на таймере и у дуэли с собой; здесь парой считается любая попытка, у которой прогноз записан.
//
// Что считается:
// 1. Пара — одна попытка с записанным прогнозом. Пары копятся через циклы и идут по порядку дат.
// 2. Баллы и минуты — разные шкалы: у каждой своя сводка, в одну среднюю они не складываются.
// 3. Разница — факт минус прогноз. Сторона ошибки: more — вышло больше, чем ждал; less — меньше; exact — совпало.
//    Что из этого «лучше», модуль не решает: на тестах больше баллов, чем ждал, и на задаче больше минут,
//    чем ждал, — обе пары идут как more.
// 4. Нерешённая задача — тоже факт, но без числа: сколько ушло бы до решения, неизвестно. В среднюю разницу
//    она не входит. Сторона у неё есть, только когда потрачено не меньше прогноза: тогда ясно, что прогноза
//    не хватило. Бросил раньше или минуты не записаны — сторона неизвестна.
// 5. Решённая попытка без записанных минут — пара без замера: в списке она есть, в счёт не идёт.
// 6. Куда обычно ошибается — когда пар со стороной хотя бы MIN_PAIRS и в одну сторону больше половины из них.
// 7. Становится ли прогноз точнее — средняя разница первой половины пар с числом против второй, когда таких
//    пар хотя бы MIN_TREND_PAIRS. При нечётном числе средняя пара не входит ни в одну половину.

/** Сводка по шкале появляется, когда сравнить можно хотя бы столько пар. */
export const MIN_PAIRS = 3
/** «Становится ли точнее» — когда пар с числом хотя бы столько: по три в каждой половине. */
export const MIN_TREND_PAIRS = 6
/** Перемена точности считается переменой от одной единицы шкалы и от этой доли прежней разницы. */
export const TREND_SHARE = 0.25

export type ForecastUnit = 'points' | 'minutes'
export type ForecastSide = 'more' | 'less' | 'exact'
/** even — ни в одну сторону нет больше половины пар. */
export type ForecastLean = ForecastSide | 'even'

interface PairBase {
  /** Ключ пары для списка: цикл, тест или задача, номер попытки. */
  key: string
  /** Цикл пары: id и название. */
  cycle: string
  cycleName: string
  date: string
  forecast: number
  /** Факт в единицах прогноза; null — числа нет. */
  fact: number | null
  /** Факт минус прогноз; null — сравнивать не с чем. */
  diff: number | null
  side: ForecastSide | null
}

export interface TestPair extends PairBase {
  unit: 'points'
  week: number
  max: number
  /** Номер попытки по этой неделе, с единицы: вторая и дальше — пересдачи. */
  attempt: number
  fact: number
  diff: number
  side: ForecastSide
}

export interface TimedPair extends PairBase {
  unit: 'minutes'
  problemId: number
  title: string
  /** kind попытки как в журнале: timed-20, duel. */
  kind: string
  /** Лимит таймера из kind: timed-20 → 20. */
  limit: number | null
  solved: boolean
  /** Минуты попытки как записаны; у нерешённой — сколько на неё ушло. */
  spent: number | null
}

export type ForecastPair = TestPair | TimedPair

export interface ForecastTrend {
  /** Пар в каждой половине. */
  size: number
  /** Средняя разница первой и второй половины. */
  first: number
  second: number
  verdict: 'closer' | 'farther' | 'same'
}

export interface ForecastScale<P extends ForecastPair = ForecastPair> {
  unit: P['unit']
  /** Пары шкалы по порядку дат. */
  pairs: P[]
  /** Пар с числом: по ним считается средняя разница. */
  measured: number
  /** Пар, у которых известна сторона ошибки, и сколько их в каждую сторону. */
  directed: number
  more: number
  less: number
  exact: number
  /** Нерешённые задачи и решённые без записанных минут. */
  unsolved: number
  unmeasured: number
  /** Средняя разница между прогнозом и фактом, без знака; null — пар с числом нет. */
  meanGap: number | null
  /** Куда обычно ошибается; null — пар меньше MIN_PAIRS, судить рано. */
  lean: ForecastLean | null
  /** Становится ли прогноз точнее; null — пар с числом меньше MIN_TREND_PAIRS. */
  trend: ForecastTrend | null
  /** Сводка для карточки: куда обычно ошибается и средняя разница, затем — становится ли точнее. Пусто, когда пар нет. */
  lines: string[]
  /** Мелкой строкой: о чём судить ещё рано и что в сводку не вошло. */
  note: string | null
}

export interface ForecastReport {
  /** Все пары всех циклов по порядку дат. */
  pairs: ForecastPair[]
  tests: ForecastScale<TestPair>
  timed: ForecastScale<TimedPair>
}

const POINTS: Forms = ['балл', 'балла', 'баллов']
const TIMES: Forms = ['раз', 'раза', 'раз']
const PAIRS: Forms = ['пара', 'пары', 'пар']
const PAIRS_ACC: Forms = ['пару', 'пары', 'пар']

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (numbers: number[]) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length
const sideOf = (diff: number): ForecastSide => (diff > 0 ? 'more' : diff < 0 ? 'less' : 'exact')

/** Прогноз записан числом. Запись другого вида парой не считается. */
const isForecast = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function testPairs(cycle: CycleView): TestPair[] {
  // Номер попытки — по порядку дат внутри недели, и попытки без прогноза тоже считаются.
  const tests = [...(cycle.raw.progress.weeklyTests ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const taken = new Map<number, number>()
  const pairs: TestPair[] = []
  for (const test of tests) {
    const attempt = (taken.get(test.week) ?? 0) + 1
    taken.set(test.week, attempt)
    if (!isForecast(test.forecast)) continue
    const diff = test.score - test.forecast
    pairs.push({
      key: `${cycle.id}:test:${test.week}:${attempt}`,
      cycle: cycle.id,
      cycleName: cycle.name,
      date: test.date,
      unit: 'points',
      week: test.week,
      max: test.max,
      attempt,
      forecast: test.forecast,
      fact: test.score,
      diff,
      side: sideOf(diff),
    })
  }
  return pairs
}

function timedPairs(cycle: CycleView): TimedPair[] {
  const pairs: TimedPair[] = []
  for (const problem of cycle.problems) {
    const attempts = problem.progress?.attempts ?? []
    attempts.forEach((a, i) => {
      if (!isForecast(a.forecast)) return
      const solved = a.result === 'solved'
      const spent = a.minutes ?? null
      const fact = solved ? spent : null
      const diff = fact === null ? null : fact - a.forecast
      let side: ForecastSide | null = diff === null ? null : sideOf(diff)
      // Не решена, а ушло не меньше, чем ждал: прогноза точно не хватило.
      if (!solved && spent !== null && spent >= a.forecast) side = 'more'
      const limit = /^(?:timed|optimal)-(\d+)$/.exec(a.kind)
      pairs.push({
        key: `${cycle.id}:problem:${problem.id}:${i}`,
        cycle: cycle.id,
        cycleName: cycle.name,
        date: a.date,
        unit: 'minutes',
        problemId: problem.id,
        title: problem.title,
        kind: a.kind,
        limit: limit ? Number(limit[1]) : null,
        solved,
        spent,
        forecast: a.forecast,
        fact,
        diff,
        side,
      })
    })
  }
  return pairs
}

function leanOf(more: number, less: number, exact: number): ForecastLean | null {
  const directed = more + less + exact
  if (directed < MIN_PAIRS) return null
  if (more * 2 > directed) return 'more'
  if (less * 2 > directed) return 'less'
  if (exact * 2 > directed) return 'exact'
  return 'even'
}

function trendOf(gaps: number[]): ForecastTrend | null {
  if (gaps.length < MIN_TREND_PAIRS) return null
  const size = Math.floor(gaps.length / 2)
  const first = mean(gaps.slice(0, size))
  const second = mean(gaps.slice(-size))
  const step = Math.max(1, first * TREND_SHARE)
  const verdict = first - second >= step ? 'closer' : second - first >= step ? 'farther' : 'same'
  return { size, first: round1(first), second: round1(second), verdict }
}

/** Число с единицей шкалы: «3 балла», «2,5 балла», «14 мин». */
export function amount(value: number, unit: ForecastUnit): string {
  const n = round1(value)
  const text = String(n).replace('.', ',')
  if (unit === 'minutes') return `${text} мин`
  return `${text} ${Number.isInteger(n) ? plural(n, POINTS) : POINTS[1]}`
}

const WORDS: Record<ForecastUnit, { where: string; comes: string; came: string }> = {
  points: { where: 'На тестах', comes: 'выходит', came: 'вышло' },
  minutes: { where: 'По времени', comes: 'уходит', came: 'ушло' },
}

const TREND: Record<ForecastTrend['verdict'], string> = {
  closer: 'прогноз становится точнее',
  farther: 'разница растёт',
  same: 'заметной перемены нет',
}

const times = (n: number) => `${n} ${plural(n, TIMES)}`

type Counts = Omit<ForecastScale, 'lines' | 'note'>

/** Сводка словами: куда обычно ошибается, средняя разница, становится ли точнее. Наблюдение, а не оценка. */
function summaryLines(s: Counts): string[] {
  const total = s.pairs.length
  if (total === 0) return []
  if (s.lean === null) {
    const early = `куда ты обычно ошибаешься, судить рано — нужно хотя бы ${MIN_PAIRS}`
    return [
      s.directed === total
        ? `Пока ${total} ${plural(total, PAIRS)}: ${early}.`
        : `Сравнить пока можно ${s.directed} ${plural(s.directed, PAIRS_ACC)} из ${total}: ${early}.`,
    ]
  }

  const w = WORDS[s.unit]
  const lean: Record<ForecastLean, string> = {
    more: `${w.where} ты чаще ждёшь меньше, чем ${w.comes}: ${times(s.more)} из ${s.directed}.`,
    less: `${w.where} ты чаще ждёшь больше, чем ${w.comes}: ${times(s.less)} из ${s.directed}.`,
    exact: `${w.where} прогноз чаще совпадает с фактом: ${times(s.exact)} из ${s.directed}.`,
    even: `${w.where} перекоса нет: меньше, чем ${w.came}, ждал ${times(s.more)}, больше — ${s.less}${s.exact ? `, точно — ${s.exact}` : ''}.`,
  }
  const gap = s.meanGap !== null ? ` Средняя разница — ${amount(s.meanGap, s.unit)}.` : ''
  const lines = [lean[s.lean] + gap]
  if (s.trend) {
    lines.push(
      `В первых ${s.trend.size} парах средняя разница — ${amount(s.trend.first, s.unit)}, в последних ${s.trend.size} — ${amount(s.trend.second, s.unit)}: ${TREND[s.trend.verdict]}.`,
    )
  }
  return lines
}

/** О чём судить ещё рано и что в сводку не вошло. */
function noteOf(s: Counts): string | null {
  const parts: string[] = []
  // Пока пар меньше MIN_PAIRS, «судить рано» уже сказано в самой сводке.
  if (s.lean !== null && s.trend === null) {
    parts.push(
      `Становится ли прогноз точнее, судить рано: нужно хотя бы ${MIN_TREND_PAIRS} пар${s.measured < s.pairs.length ? ' с числом' : ''}, сейчас ${s.measured}.`,
    )
  }
  if (s.unsolved) parts.push(`Нерешённых задач с прогнозом — ${s.unsolved}: в среднюю ${s.unsolved === 1 ? 'она не входит' : 'они не входят'}.`)
  if (s.unmeasured) parts.push(`Попыток без записанных минут — ${s.unmeasured}: сравнить не с чем.`)
  return parts.length ? parts.join(' ') : null
}

function scaleOf<P extends ForecastPair>(unit: P['unit'], pairs: P[]): ForecastScale<P> {
  const gaps = pairs.flatMap((p) => (p.diff === null ? [] : [Math.abs(p.diff)]))
  const sided = (side: ForecastSide) => pairs.filter((p) => p.side === side).length
  const more = sided('more')
  const less = sided('less')
  const exact = sided('exact')
  const timed = pairs.filter((p): p is P & TimedPair => p.unit === 'minutes')
  const counts = {
    unit,
    pairs,
    measured: gaps.length,
    directed: more + less + exact,
    more,
    less,
    exact,
    unsolved: timed.filter((p) => !p.solved).length,
    unmeasured: timed.filter((p) => p.solved && p.fact === null).length,
    meanGap: gaps.length ? round1(mean(gaps)) : null,
    lean: leanOf(more, less, exact),
    trend: trendOf(gaps),
  }
  return { ...counts, lines: summaryLines(counts), note: noteOf(counts) }
}

/**
 * Прогноз и факт по всем циклам: пары по порядку дат и сводка по каждой шкале.
 * Циклы передаются все сразу: пары копятся через циклы, новый цикл сводку не обнуляет.
 */
export function forecastReport(cycles: CycleView[]): ForecastReport {
  // В один день тест идёт после задач: его сдают в конце занятия. Сортировка по дате этот порядок не меняет.
  const byDate = <P extends ForecastPair>(pairs: P[]) => [...pairs].sort((a, b) => a.date.localeCompare(b.date))
  const timed = byDate(cycles.flatMap(timedPairs))
  const tests = byDate(cycles.flatMap(testPairs))
  return {
    pairs: byDate<ForecastPair>([...timed, ...tests]),
    tests: scaleOf<TestPair>('points', tests),
    timed: scaleOf<TimedPair>('minutes', timed),
  }
}

/** Что это за пара: «Тест недели 2», «Тест недели 2, пересдача», «№217 Contains Duplicate». */
export function pairTitle(pair: ForecastPair): string {
  if (pair.unit === 'points') return `Тест недели ${pair.week}${pair.attempt > 1 ? ', пересдача' : ''}`
  return `№${pair.problemId} ${pair.title}`
}

/** Вид попытки по задаче коротко: «таймер 20 мин», «дуэль с собой». */
export function attemptKind(kind: string): string {
  const limit = /^(timed|optimal)-(\d+)$/.exec(kind)
  if (limit) return limit[1] === 'timed' ? `таймер ${limit[2]} мин` : `оптимальное решение, ${limit[2]} мин`
  if (kind === 'duel') return 'дуэль с собой'
  if (kind === 'from-empty-editor') return 'с пустого редактора'
  if (kind === 'no-hints') return 'без подсказок'
  if (kind === 'rewrite-after-walkthrough') return 'после разбора'
  return kind
}

/**
 * Разница словами, без оценки: «на 4 балла больше прогноза», «на 2 мин дольше прогноза», «как и ждал».
 * У пары без числа — что известно о факте: «ушло 20 мин», «время не записано»; пустая строка — ничего.
 */
export function gapText(pair: ForecastPair): string {
  if (pair.diff === null) {
    if (pair.unit === 'minutes' && pair.solved) return 'время не записано'
    return pair.unit === 'minutes' && pair.spent !== null ? `ушло ${pair.spent} мин` : ''
  }
  if (pair.diff === 0) return 'как и ждал'
  const by = amount(Math.abs(pair.diff), pair.unit)
  if (pair.unit === 'points') return `на ${by} ${pair.diff > 0 ? 'больше' : 'меньше'} прогноза`
  return `на ${by} ${pair.diff > 0 ? 'дольше' : 'быстрее'} прогноза`
}
