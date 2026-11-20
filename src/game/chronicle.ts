// Летопись города: на каждый день с занятием — одна запись. Что это был за день учёбы,
// что понято своими словами и что в этот день изменилось в городе и на маршруте.
// Ничего не хранится: запись — это разница двух миров, на конец этого учебного дня и предыдущего (src/game/history.ts).
//
// Что решено здесь:
// - всё, что случилось между двумя учебными днями (стройка в выходной, покупка, ответы по карточкам),
//   попадает в запись следующего учебного дня;
// - «ход принёс» считается точно: запасы сразу после хода минус запасы перед ним. Для этого, когда в день хода
//   или перед ним были действия в городе, строится ещё один мир — на начало дня;
// - названия построек берутся из src/game/town.ts, названия обликов уровней — из src/town3d/looks.ts.
//   Второй файл тянет за собой three.js, поэтому сюда он не подключён: функцию levelName передают в настройках.
import type { PlannedBreak } from '../data/types'
import { dueCards } from './deck'
import { PROBLEM_STATE_LABEL, solvedAfterWalkthrough, type CycleView, type World } from './engine'
import { endOfDay, worldAt, type WorldInputs } from './history'
import { RETURN_PAUSE_MIN_DAYS, missedWorkdays, parseISO, pausedDays, toISO } from './rules'
import { shopItem } from './shop'
import { DAYS, fmtDate, plural, type Forms } from './text'
import { GOODS, TIERS, buildingType, type Goods, type Town } from './town'

/** Запас города: еда, дерево, кирпич. */
export type Stock = Record<Goods, number>

/** Название облика уровня постройки: levelName из src/town3d/looks.ts. */
export type LevelNamer = (type: string, level: number) => string

export interface ChronicleOptions {
  /** Настоящий момент: сегодняшний день считается на него, а не на свой конец. */
  now?: Date
  /** Без неё уровень постройки назван числом, без названия облика. */
  levelName?: LevelNamer
}

export interface ChronicleLine {
  text: string
  /** Чем важнее строка, тем больше: по весу отбирается итог занятия для «Сегодня». */
  weight: number
}

/** День плана, которым занимались. */
export interface ChronicleDay {
  cycle: string
  n: number
  trackCode: string
  /** Название дня из плана: «C · Gradle 1». */
  track: string
}

/** Запись вне плана, засчитанная в этот день. */
export interface ChronicleSide {
  /** «Видео или доклад: Доклад про Gradle». */
  label: string
  /** Откуда и с кем, если записано. */
  source: string | null
  takeaways: string[]
}

export interface ChronicleEntry {
  date: string
  /** Номер хода: какой по счёту день с занятием. */
  turn: number
  /** «День 3 · C · Gradle 1»; у дня без занятий по плану — «Вне плана». */
  title: string
  days: ChronicleDay[]
  /** Темы занятий этого дня. */
  topics: string[]
  /** Свои строки после занятий: что понял, своими словами. */
  insights: string[]
  side: ChronicleSide[]
  /** Перерыв перед этим днём, одной строкой; null — пропущенных рабочих дней не было. */
  gap: string | null
  /** Учёба и маршрут. */
  study: ChronicleLine[]
  /** Город и лавка. */
  town: ChronicleLine[]
  /** Заработано за день. */
  earned: { xp: number; coins: number; gems: number }
  /** Город к концу дня — числа, по которым записи сходятся друг с другом. */
  state: {
    tier: number
    population: number
    /** Сколько жителей пришло с этим ходом. */
    arrived: number
    stock: Stock
    /** Что принёс ход: запасы после него минус запасы перед ним; еда — за вычетом съеденного. */
    gained: Stock
    /** Что ушло из запасов на стройку с прошлой записи; минус — куплено на рынке. */
    used: Stock
  }
}

/** Итог последнего занятия для вкладки «Сегодня». */
export interface LastTurn {
  entry: ChronicleEntry
  /** Самое важное из записи: до пяти строк. */
  highlights: string[]
  /** Что будет готово дальше: идущие стройки, починка, следующий ход, колода. */
  next: string[]
}

/**
 * Перерыв попадает в запись, начиная со стольких пропущенных рабочих дней.
 * Как в правилах мира (conditionLevel в src/game/rules.ts): один пропущенный рабочий день ничего не меняет.
 */
export const GAP_FROM = 2
/** Сколько строк записи берётся в итог занятия. */
export const HIGHLIGHTS = 5

/** Вес строк: что важнее, то раньше попадает в итог занятия. */
const W = {
  tier: 100,
  cycle: 98,
  rank: 95,
  level: 92,
  day: 90,
  pass: 86,
  trophy: 84,
  test: 82,
  week: 78,
  blueprint: 76,
  built: 74,
  residents: 70,
  file: 66,
  problem: 62,
  baseline: 60,
  ci: 58,
  broken: 56,
  back: 54,
  mended: 50,
  skipped: 48,
  started: 46,
  gained: 40,
  shop: 36,
  reward: 34,
  sign: 34,
  checks: 30,
  mistakes: 28,
  deck: 20,
  used: 18,
  trade: 16,
}

const WORKDAYS: Forms = ['рабочий день', 'рабочих дня', 'рабочих дней']
const RESIDENTS: Forms = ['житель', 'жителя', 'жителей']
const SESSIONS: Forms = ['занятие', 'занятия', 'занятий']
const CARDS: Forms = ['карточка', 'карточки', 'карточек']
const COINS: Forms = ['монета', 'монеты', 'монет']
const GEMS: Forms = ['камень', 'камня', 'камней']

const count = (n: number, forms: Forms) => `${n} ${plural(n, forms)}`
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const quoted = (text: string) => `«${text}»`
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

/** «жилище, огород ×2»: одинаковые названия не повторяются. */
function listed(items: string[]): string {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts].map(([item, n]) => (n > 1 ? `${item} ×${n}` : item)).join(', ')
}

const stockOf = (town: Town): Stock => ({ food: town.food, wood: town.wood, brick: town.brick })
const minus = (a: Stock, b: Stock): Stock => ({ food: a.food - b.food, wood: a.wood - b.wood, brick: a.brick - b.brick })

/** «еда +6, дерево +2»; show решает, как показать число, null — не показывать. Пустая строка — показать нечего. */
function goodsText(stock: Stock, show: (n: number) => string | null): string {
  return GOODS.flatMap((g) => {
    const shown = show(stock[g.id])
    return shown === null ? [] : [`${g.name} ${shown}`]
  }).join(', ')
}

const typeName = (type: string) => lower(buildingType(type)?.name ?? type)

/** «жилище (шалаш)»: название постройки и облик уровня, если он назван иначе. */
function buildingText(type: string, level: number, names?: LevelNamer): string {
  const base = typeName(type)
  const look = lower(names?.(type, level) ?? '')
  return look && look !== base ? `${base} (${look})` : base
}

const dayBefore = (iso: string): string => {
  const date = parseISO(iso)
  date.setDate(date.getDate() - 1)
  return toISO(date)
}

/** Учебные дни мира по порядку, без повторов: те же даты, что дают ходы городу. */
const studyDates = (world: World): string[] => [...new Set(world.sessionDates)].sort()

/** Дни плановых перерывов всех циклов — как в buildWorld. */
const pausedOf = (world: World): Set<string> => new Set(world.cycles.flatMap((c) => [...pausedDays(c.raw.progress.breaks ?? [])]))

// --- Тексты ---

/** Перерыв перед учебным днём: пропущенные рабочие дни и плановый перерыв. Без упрёка: только число. */
export function gapText(missed: number, planned: number, reasons: string[]): string | null {
  const why = reasons.length ? ` (${reasons.join(', ')})` : ''
  if (planned > 0 && missed >= GAP_FROM) return `Плановый перерыв ${count(planned, WORKDAYS)}${why}, сверх него — ${count(missed, WORKDAYS)}`
  if (planned > 0) return `Плановый перерыв ${count(planned, WORKDAYS)}${why}`
  return missed >= GAP_FROM ? `Перерыв ${count(missed, WORKDAYS)}` : null
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** «19 ноября, чт». */
export function dateText(iso: string): string {
  const date = parseISO(iso)
  return `${date.getDate()} ${MONTHS_OF[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`
}

/** «Ноябрь 2026» — заголовок месяца в ленте. */
export function monthText(iso: string): string {
  const date = parseISO(iso)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** «60 XP · 60 монет · 1 камень»; пустая строка — за день ничего не начислено. */
export function earnedText(earned: ChronicleEntry['earned']): string {
  return [
    earned.xp > 0 ? `${earned.xp} XP` : null,
    earned.coins > 0 ? count(earned.coins, COINS) : null,
    earned.gems > 0 ? count(earned.gems, GEMS) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function dayClosedText(n: number, state: string): string {
  if (state === 'minimum') return `День ${n} закрыт на минимуме`
  if (state === 'extension') return `День ${n} закрыт ядром и расширением`
  return `День ${n} закрыт ядром`
}

export function residentsText(arrived: number, population: number): string {
  const came = arrived % 10 === 1 && arrived % 100 !== 11 ? 'Пришёл' : 'Пришло'
  return `${came} ${count(arrived, RESIDENTS)}, теперь их ${population}`
}

/** «сегодня в 19:20», «завтра в 07:00», «08.01 в 07:00». */
export function whenText(time: number, today: string): string {
  const at = new Date(time)
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const day = toISO(at)
  const tomorrow = parseISO(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (day === today) return `сегодня в ${clock}`
  return day === toISO(tomorrow) ? `завтра в ${clock}` : `${fmtDate(day)} в ${clock}`
}

const healText = (left: number) => (left <= 1 ? 'на следующем занятии' : `через ${count(left, SESSIONS)}`)

// --- Запись одного хода ---

interface Turn {
  inputs: WorldInputs
  date: string
  /** Предыдущий учебный день; null — это первый. */
  prevDate: string | null
  /** Мир на конец предыдущего учебного дня (у первого — на день раньше него). */
  prev: World
  /** Мир на конец этого дня. */
  cur: World
  /** Город сразу после хода, до дел этого дня. */
  dawn: Town
  /** Запасы перед ходом. */
  eve: Stock
  names?: LevelNamer
}

const hasGreen = (cycle: CycleView | undefined) => Object.values(cycle?.raw.progress.petProject?.ci ?? {}).some((value) => value === 'green')

/** Строки записи собираются в любом порядке, а читаются по порядку мест: сначала что сделано, потом что это дало. */
function ordered() {
  const rows: { at: number; line: ChronicleLine }[] = []
  return {
    add: (at: number, weight: number, text: string) => rows.push({ at, line: { weight, text } }),
    count: () => rows.length,
    lines: () => [...rows].sort((a, b) => a.at - b.at).map((row) => row.line),
  }
}

/** Места строк учёбы: день, итог цикла, тесты, задачи, файлы, прочие события, заметки, награды. */
const STUDY = { day: 0, cycle: 1, test: 2, problem: 3, file: 4, fact: 5, note: 6, award: 7 }
/** Места строк города: поломки после перерыва, рост, ход, начатое, остальное. */
const TOWN = { storm: 0, grown: 1, turn: 2, begun: 3, rest: 4 }

function studyLines({ prev, cur, date, prevDate, inputs }: Turn): ChronicleLine[] {
  const { add, count: said, lines } = ordered()
  const fresh = (day: string) => (prevDate === null || day > prevDate) && day <= date

  let checks = 0
  let correct = 0
  let mistakes = 0
  const beaten: string[] = []

  for (const cycle of cur.cycles) {
    const was = prev.cycles.find((c) => c.id === cycle.id)

    for (const day of cycle.days) {
      const before = was?.days.find((d) => d.n === day.n)
      if (day.done && !before?.done) {
        add(STUDY.day, W.day, dayClosedText(day.n, day.state))
        if (day.keyPoint) add(STUDY.day, W.pass, `Пройден перевал ${quoted(day.keyPoint.title)}`)
      } else if (day.state === 'skipped' && before?.state !== 'skipped') add(STUDY.day, W.skipped, `День ${day.n} пропущен`)
    }
    if (cycle.done && !was?.done) add(STUDY.cycle, W.cycle, `Маршрут ${quoted(cycle.name)} пройден. Звание: ${quoted(cycle.rankOnComplete)}`)

    for (const week of cycle.weeks) {
      const before = was?.weeks.find((w) => w.week.n === week.week.n)
      const taken = before?.test.attempts.length ?? 0
      week.test.attempts
        .filter((t) => fresh(t.date))
        .forEach((t, i) => add(STUDY.test, W.test, `${taken + i > 0 ? 'Пересдан' : 'Сдан'} тест недели ${week.week.n}: ${t.score} из ${t.max}`))
      if (week.closed && !before?.closed) add(STUDY.test, W.week, `Неделя ${week.week.n} закрыта по чекпоинту`)
    }

    for (const problem of cycle.problems) {
      const attempts = problem.progress?.attempts ?? []
      const tried = attempts.filter((a) => fresh(a.date))
      if (!tried.length) continue
      const name = `${problem.id} ${quoted(problem.title)}`
      const before = was?.problems.find((p) => p.id === problem.id)?.state ?? 'none'
      const solved = tried.filter((a) => a.result === 'solved')
      const had = said()
      if (before === 'none' && problem.state !== 'none' && problem.state !== 'before') {
        if (problem.role === 'pair') add(STUDY.problem, W.problem, `Задача-пара ${name} решена`)
        else add(STUDY.problem, W.problem, `Задача ${name} ${PROBLEM_STATE_LABEL[solvedAfterWalkthrough(problem.state, attempts) ? 'walkthrough' : 'self']}`)
      }
      if (solved.some((a) => a.kind === 'from-empty-editor')) add(STUDY.problem, W.problem, `Задача ${name} ${PROBLEM_STATE_LABEL.repeated}`)
      if (solved.some((a) => a.kind === 'no-hints')) add(STUDY.problem, W.problem, `Задача ${name} ${PROBLEM_STATE_LABEL.nohints}`)
      const first = attempts.find((a) => a.kind.startsWith('timed'))
      for (const duel of solved.filter((a) => a.kind === 'duel' && a.minutes !== null)) {
        if (first?.minutes == null) continue
        add(STUDY.problem, W.problem, `Дуэль с собой: задача ${name} за ${duel.minutes} мин, в первый раз было ${first.minutes}`)
      }
      if (said() === had && !solved.length) {
        add(STUDY.problem, W.problem, before === 'none' ? `Задача ${name}: попытка, решения пока нет` : `Задача ${name}: повтор пока не получился`)
      }
    }

    const built: string[] = []
    const grown: string[] = []
    for (const building of cycle.buildings) {
      const stage = was?.buildings.find((b) => b.item.id === building.item.id)?.stage ?? 0
      if (building.stage >= 2 && stage < 2) built.push(quoted(building.item.title))
      else if (building.stage === 3 && stage === 2) grown.push(quoted(building.item.title))
    }
    if (built.length) add(STUDY.file, W.file, `${built.length > 1 ? 'Построены постройки-файлы' : 'Построена постройка-файл'}: ${built.join(', ')}`)
    if (grown.length) add(STUDY.file, W.file, `${grown.length > 1 ? 'Постройки-файлы получили пристройку' : 'Постройка-файл получила пристройку'}: ${grown.join(', ')}`)

    const journal = cycle.raw.progress
    const old = was?.raw.progress
    for (const [key, label] of [['start', 'Стартовый'], ['final', 'Финальный']] as const) {
      const point = journal.baseline[key]
      if (point.minutes !== null && (old?.baseline[key].minutes ?? null) === null) add(STUDY.fact, W.baseline, `${label} замер: задача ${point.problemId} за ${point.minutes} мин`)
    }
    if (hasGreen(cycle) && !hasGreen(was)) add(STUDY.fact, W.ci, 'Workflow в GitHub Actions впервые зелёный')
    for (const event of journal.events ?? []) if (event.type === 'ci-fixed' && fresh(event.date)) add(STUDY.fact, W.ci, 'Красный CI починен')
    for (const { pause } of cycle.pauses.slice(was?.pauses.length ?? 0)) {
      if (pause.days >= RETURN_PAUSE_MIN_DAYS) add(STUDY.fact, W.back, `Возвращение после паузы: ${count(pause.days, DAYS)}`)
    }

    const asked = journal.knowledgeChecks.filter((k) => fresh(k.date))
    checks += asked.length
    correct += asked.filter((k) => k.verdict === 'correct').length
    mistakes += journal.mistakes.filter((m) => fresh(m.date)).length
    // Ошибка, записанная и побеждённая в одном окне, — не событие: побеждают ту, что уже была в журнале.
    const known = new Map((old?.mistakes ?? []).map((m) => [`${m.date}|${m.text}`, !!m.beaten]))
    for (const m of journal.mistakes) if (m.beaten && known.get(`${m.date}|${m.text}`) === false) beaten.push(m.text)
  }

  if (checks) add(STUDY.note, W.checks, `Проверки понимания: ${checks}, верно сразу — ${correct}`)
  if (mistakes) add(STUDY.note, W.mistakes, `В журнал ошибок записано: ${mistakes}`)
  if (beaten.length === 1) add(STUDY.note, W.mistakes, `Побеждена ошибка: ${quoted(beaten[0])}`)
  else if (beaten.length) add(STUDY.note, W.mistakes, `Побеждено ошибок из журнала: ${beaten.length}`)

  // Колода: ответы за это окно и свои новые карточки.
  const from = prevDate === null ? -Infinity : endOfDay(prevDate).getTime()
  const answers = (inputs.ledger.reviews ?? []).filter((r) => {
    const time = Date.parse(r.at)
    return time > from && toISO(new Date(time)) <= date && cur.deck.some((card) => card.id === r.card)
  })
  if (answers.length) add(STUDY.note, W.deck, `Колода: ответов — ${answers.length}, из них «знал» — ${answers.filter((r) => r.ok).length}`)
  const own = cur.deck.filter((card) => card.source !== 'check' && fresh(card.date)).length
  if (own) add(STUDY.note, W.deck, `Своих карточек заведено: ${own}`)

  for (const sign of cur.signs) {
    if (prev.signs.some((s) => s.cycle === sign.cycle && s.day === sign.day)) continue
    const pass = cur.cycles.find((c) => c.id === sign.cycle)?.days.find((d) => d.n === sign.day)?.keyPoint?.title
    add(STUDY.note, W.sign, `На перевале${pass ? ` ${quoted(pass)}` : ''} поставлен памятный знак: ${quoted(sign.text)}`)
  }

  // Что это дало: уровень, ранги, трофеи.
  if (cur.level.n > prev.level.n) add(STUDY.award, W.level, `Новый уровень: ${cur.level.n}`)
  for (const track of cur.tracks) {
    const was = prev.tracks.find((t) => t.track.code === track.track.code)?.rank.n ?? 1
    if (track.rank.n > was && track.rank.title) add(STUDY.award, W.rank, `Получен ранг ${quoted(track.rank.title)} по треку ${quoted(track.track.name)}`)
  }
  const trophies = cur.trophies.filter((trophy) => trophy.earned && !prev.trophies.find((t) => t.id === trophy.id)?.earned).map((trophy) => quoted(trophy.name))
  if (trophies.length) add(STUDY.award, W.trophy, `${trophies.length > 1 ? 'Получены трофеи' : 'Получен трофей'}: ${trophies.join(', ')}`)

  return lines()
}

function townLines({ prev, cur, dawn, eve, date, prevDate, inputs, names }: Turn): { lines: ChronicleLine[]; state: ChronicleEntry['state'] } {
  const { add, lines } = ordered()
  const town = cur.town
  const old = prev.town

  // Ступень: закончившийся переход и начатый.
  if (town.tier > old.tier) add(TOWN.grown, W.tier, `Новая ступень: ${quoted(TIERS[town.tier].name)}. В центре — ${lower(TIERS[town.tier].center)}`)
  if (town.tierPending && town.tierPending.n > (old.tierPending?.n ?? old.tier)) {
    add(TOWN.begun, W.started, `Начат переход на ступень ${quoted(TIERS[town.tierPending.n].name)}`)
  }

  // Постройки: что достроено и улучшено, что заложено и ещё строится. По состоянию, а не по журналу:
  // действие, которое город не принял, в летопись не попадает.
  const before = new Map(old.buildings.map((b) => [b.id, b]))
  const built: string[] = []
  const upgraded: string[] = []
  const laid: string[] = []
  const upgrading: string[] = []
  for (const b of town.buildings) {
    const was = before.get(b.id)
    const wasLevel = was?.level ?? 0
    const wasAim = was ? (was.pending?.level ?? was.level) : 0
    if (b.level > wasLevel) {
      const look = lower(names?.(b.type, b.level) ?? '')
      if (wasLevel === 0) built.push(buildingText(b.type, b.level, names))
      else upgraded.push(`${typeName(b.type)} до уровня ${b.level}${look && look !== typeName(b.type) ? ` (${look})` : ''}`)
    }
    if (b.pending && b.pending.level > wasAim) {
      if (b.level === 0) laid.push(typeName(b.type))
      else upgrading.push(`${typeName(b.type)} до уровня ${b.pending.level}`)
    }
  }
  if (built.length) add(TOWN.grown, W.built, `Достроено: ${listed(built)}`)
  if (upgraded.length) add(TOWN.grown, W.built, `Улучшено: ${listed(upgraded)}`)
  if (laid.length) add(TOWN.begun, W.started, `Заложено: ${listed(laid)}`)
  if (upgrading.length) add(TOWN.begun, W.started, `Начато улучшение: ${listed(upgrading)}`)

  // Ход: жители и запасы.
  const arrived = town.population - old.population
  if (arrived > 0) add(TOWN.turn, W.residents, residentsText(arrived, town.population))
  const stock = stockOf(town)
  const afterTurn = stockOf(dawn)
  const gained = minus(afterTurn, eve)
  // Между учебными днями запасы меняют только ход и действия в городе: остаток разницы — стройка и рынок.
  const used = minus(minus(afterTurn, stock), minus(eve, stockOf(old)))
  const gainedText = goodsText(gained, (n) => (n === 0 ? null : signed(n)))
  if (gainedText) add(TOWN.turn, W.gained, `Ход принёс: ${gainedText}`)
  const usedText = goodsText(used, (n) => (n > 0 ? String(n) : null))
  if (usedText) add(TOWN.begun, W.used, `На стройку ушло: ${usedText}`)

  // Поломки после перерыва и починка. Сломанное этим перерывом помечено днём, с которого перерыв начался.
  const nameOf = (id: string) => {
    const building = town.buildings.find((b) => b.id === id) ?? dawn.buildings.find((b) => b.id === id)
    return building ? typeName(building.type) : lower(shopItem(id)?.name ?? id)
  }
  const brokenIn = (t: Town) => new Set([...t.buildings.filter((b) => b.broken).map((b) => b.id), ...t.damage.map((d) => d.item)])
  const struck =
    prevDate === null
      ? []
      : [...dawn.buildings.filter((b) => b.broken?.since === prevDate).map((b) => b.id), ...dawn.damage.filter((d) => d.since === prevDate).map((d) => d.item)]
  if (struck.length) add(TOWN.storm, W.broken, `После перерыва сломалось: ${listed(struck.map(nameOf))}`)
  const brokenBefore = brokenIn(old)
  const brokenAtDawn = brokenIn(dawn)
  const brokenNow = brokenIn(town)
  const from = prevDate === null ? -Infinity : endOfDay(prevDate).getTime()
  const start = parseISO(date).getTime()
  const inWindow = (time: number) => time > from && toISO(new Date(time)) <= date
  const paid = new Set<string>()
  for (const action of inputs.ledger.town ?? []) {
    const time = Date.parse(action.at)
    if (action.do !== 'repair' || !action.id || !inWindow(time)) continue
    // Починка между учебными днями видна только по журналу: перерыв тогда ещё шёл.
    if (time < start || brokenBefore.has(action.id) || brokenAtDawn.has(action.id)) paid.add(action.id)
  }
  for (const repair of inputs.ledger.repairs) {
    if ((prevDate !== null && repair.date <= prevDate) || repair.date > date || !shopItem(repair.item)) continue
    if (repair.date < date || brokenBefore.has(repair.item) || brokenAtDawn.has(repair.item)) paid.add(repair.item)
  }
  const mended = [...paid].filter((id) => !brokenNow.has(id))
  if (mended.length) add(TOWN.storm, W.mended, `Починено за монеты: ${listed(mended.map(nameOf))}`)
  const healed = [...brokenBefore].filter((id) => !brokenNow.has(id) && !paid.has(id) && !struck.includes(id))
  if (healed.length) add(TOWN.storm, W.mended, `Починилось само: ${listed(healed.map(nameOf))}`)

  const blueprints = (world: World) => (world.means as { blueprints?: number }).blueprints ?? 0
  if (blueprints(cur) > blueprints(prev)) add(TOWN.rest, W.blueprint, 'Открыт чертёж редкой постройки')

  // Рынок: партии товара за это окно.
  const trades = (inputs.ledger.town ?? []).flatMap((action) => {
    const goods = GOODS.find((g) => g.id === action.type)
    return action.do === 'trade' && goods && inWindow(Date.parse(action.at)) ? [goods.name] : []
  })
  if (trades.length) add(TOWN.rest, W.trade, `На рынке куплено: ${listed(trades)}`)

  // Лавка и свои награды.
  const bought = cur.owned.filter((id) => !prev.owned.includes(id))
  const gear = bought.filter((id) => shopItem(id)?.group === 'gear').map((id) => lower(shopItem(id)!.name))
  const decor = bought.filter((id) => shopItem(id)?.group === 'camp').map((id) => lower(shopItem(id)!.name))
  if (decor.length) add(TOWN.rest, W.shop, `Куплено для города: ${listed(decor)}`)
  if (gear.length) add(TOWN.rest, W.shop, `Куплено для путника: ${listed(gear)}`)
  for (const reward of cur.redeemed) {
    if (!prev.redeemed.some((r) => r.at === reward.at && r.name === reward.name)) add(TOWN.rest, W.reward, `Выкуплена своя награда: ${quoted(reward.name)}`)
  }

  return { lines: lines(), state: { tier: town.tier, population: town.population, arrived, stock, gained, used } }
}

function describe(turn: Turn, n: number): ChronicleEntry {
  const { cur, prev, date, prevDate } = turn
  const days: ChronicleDay[] = []
  const topics: string[] = []
  const insights: string[] = []
  for (const cycle of cur.cycles) {
    for (const session of cycle.raw.progress.sessions) {
      if (session.date !== date) continue
      const plan = cycle.days.find((d) => d.n === session.day)?.plan
      if (plan && !days.some((d) => d.cycle === cycle.id && d.n === session.day)) {
        days.push({ cycle: cycle.id, n: session.day, trackCode: plan.trackCode, track: plan.track })
      }
      for (const topic of session.topics) if (!topics.includes(topic)) topics.push(topic)
      const insight = session.insight?.trim()
      if (insight && !insights.includes(insight)) insights.push(insight)
    }
  }
  const side = cur.side
    .filter((rated) => rated.counted && rated.entry.date === date)
    .map((rated): ChronicleSide => ({
      label: `${rated.rule.name}: ${rated.entry.title}`,
      source: [rated.entry.source, rated.entry.with].filter(Boolean).join(', ') || null,
      takeaways: (rated.entry.takeaways ?? []).map((t) => t.trim()).filter(Boolean),
    }))

  let gap: string | null = null
  if (prevDate !== null) {
    const paused = pausedOf(cur)
    const planned = [...paused].filter((day) => day > prevDate && day < date).length
    const breaks: PlannedBreak[] = cur.cycles.flatMap((c) => c.raw.progress.breaks ?? [])
    const reasons = planned
      ? [...new Set(breaks.filter((item) => item.to > prevDate && item.from < date).flatMap((item) => (item.reason ? [item.reason] : [])))]
      : []
    gap = gapText(missedWorkdays(prevDate, date, paused), planned, reasons)
  }

  const { lines, state } = townLines(turn)
  return {
    date,
    turn: n,
    title: days.length ? days.map((d) => `День ${d.n} · ${d.track}`).join('; ') : 'Вне плана',
    days,
    topics,
    insights,
    side,
    gap,
    study: studyLines(turn),
    town: lines,
    earned: {
      xp: cur.totalXp - prev.totalXp,
      coins: cur.wallet.coinsEarned - prev.wallet.coinsEarned,
      gems: cur.wallet.gemsEarned - prev.wallet.gemsEarned,
    },
    state,
  }
}

/**
 * Запись хода по двум мирам. Когда в день хода или перед ним были действия в городе, строятся ещё миры:
 * на момент перед ходом и сразу после него — чтобы отделить то, что принёс ход, от трат на стройку.
 */
function entryFor(inputs: WorldInputs, date: string, prevDate: string | null, n: number, prev: World, cur: World, options: ChronicleOptions): ChronicleEntry {
  const start = parseISO(date).getTime()
  const from = prevDate === null ? -Infinity : endOfDay(prevDate).getTime()
  const end = endOfDay(date).getTime()
  const times = (inputs.ledger.town ?? []).map((action) => Date.parse(action.at))
  const before = times.some((time) => time > from && time < start)
  const during = times.some((time) => time >= start && time <= end) || inputs.ledger.repairs.some((r) => r.date === date)
  const eve = before ? stockOf(worldAt(inputs, date, new Date(start - 1)).town) : stockOf(prev.town)
  // Починки украшений записаны днём, без часа: на начало дня их ещё не было.
  const atDawn = { ...inputs, ledger: { ...inputs.ledger, repairs: inputs.ledger.repairs.filter((r) => r.date !== date) } }
  const dawn = during ? worldAt(atDawn, date, new Date(start)).town : cur.town
  return describe({ inputs, date, prevDate, prev, cur, dawn, eve, names: options.levelName }, n)
}

/**
 * Летопись: по записи на каждый день с занятием, от новых к старым.
 * Дорогая: на запись уходит от одного до трёх вызовов buildWorld. Считать только там, где она показана, и запоминать.
 */
export function chronicle(inputs: WorldInputs, today: string, options: ChronicleOptions = {}): ChronicleEntry[] {
  const live = worldAt(inputs, today, options.now)
  const dates = studyDates(live)
  if (!dates.length) return []
  let prev = worldAt(inputs, dayBefore(dates[0]))
  const entries = dates.map((date, i) => {
    const cur = date === today ? live : worldAt(inputs, date)
    const entry = entryFor(inputs, date, dates[i - 1] ?? null, i + 1, prev, cur, options)
    prev = cur
    return entry
  })
  return entries.reverse()
}

/** Следующий рабочий день после today, не занятый плановым перерывом. */
function nextWorkday(today: string, paused: Set<string>): string {
  const cursor = parseISO(today)
  for (let i = 0; i < 60; i++) {
    cursor.setDate(cursor.getDate() + 1)
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6 && !paused.has(toISO(cursor))) break
  }
  return toISO(cursor)
}

/**
 * Что будет готово дальше — по сегодняшнему миру. Только то, что считается честно:
 * идущие стройки и их срок, что починится само и когда, что даст следующий ход при нынешних жителях
 * и сколько карточек колоды будет к повтору в следующий рабочий день (когда будет занятие, сайт не знает).
 */
export function nextUp(world: World, today: string, names?: LevelNamer): string[] {
  const town = world.town
  const lines: string[] = []
  const pending = [
    ...(town.tierPending ? [{ at: town.tierPending.readyAt, what: `Переход на ступень ${quoted(TIERS[town.tierPending.n].name)} закончится` }] : []),
    ...town.buildings.flatMap((b) =>
      b.pending
        ? [{ at: b.pending.readyAt, what: b.level === 0 ? `${capital(buildingText(b.type, b.pending.level, names))} достроится` : `${capital(typeName(b.type))} улучшится до уровня ${b.pending.level}` }]
        : [],
    ),
  ].sort((a, b) => a.at - b.at)
  for (const item of pending) lines.push(`${item.what} ${whenText(item.at, today)}`)

  const healing = new Map<number, string[]>()
  const heal = (left: number | null, name: string) => {
    if (left !== null) healing.set(left, [...(healing.get(left) ?? []), name])
  }
  for (const b of town.buildings) if (b.broken) heal(b.broken.healsIn, typeName(b.type))
  for (const d of world.damage) heal(d.healsIn, lower(shopItem(d.item)?.name ?? d.item))
  for (const [left, things] of [...healing].sort((a, b) => a[0] - b[0])) lines.push(`Починится само ${healText(left)}: ${listed(things)}`)

  const perTurn: Stock = { food: town.perTurn.food - town.perTurn.eaten, wood: town.perTurn.wood, brick: town.perTurn.brick }
  const turnText = goodsText(perTurn, (n) => (n === 0 ? null : signed(n)))
  if (turnText) lines.push(`Следующий ход принесёт: ${turnText}`)

  const day = nextWorkday(today, pausedOf(world))
  const due = dueCards(world.deck, day).length
  if (due) lines.push(`Колода: ${fmtDate(day)} к повтору будет ${count(due, CARDS)}`)
  return lines
}

/**
 * Итог последнего занятия — только последняя запись летописи и «что дальше».
 * Дёшево: миры на два учебных дня (и, если в день занятия что-то строили, на его начало), а не вся летопись.
 * world — сегодняшний мир, если он уже посчитан: тогда он не строится заново.
 */
export function lastTurn(inputs: WorldInputs, today: string, options: ChronicleOptions & { world?: World } = {}): LastTurn | null {
  const live = options.world ?? worldAt(inputs, today, options.now)
  const dates = studyDates(live).filter((date) => date <= today)
  if (!dates.length) return null
  const date = dates[dates.length - 1]
  const prevDate = dates[dates.length - 2] ?? null
  const prev = worldAt(inputs, prevDate ?? dayBefore(date))
  const cur = worldAt(inputs, date, options.now)
  const entry = entryFor(inputs, date, prevDate, dates.length, prev, cur, options)
  const highlights = [...entry.study, ...entry.town]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, HIGHLIGHTS)
    .map((line) => line.text)
  return { entry, highlights, next: nextUp(live, today, options.levelName) }
}
