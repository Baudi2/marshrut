// Город: ядро без интерфейса. Проект — docs/TOWN.md.
// Состояние города нигде не хранится: оно считается заново из журнала действий и дат занятий.
// Один день с занятием — один ход (еда, материалы, жители). По настоящим часам идёт только стройка.
// Поломки тоже считаются: долгий перерыв между занятиями ломает постройки и украшения — правило в src/game/repair.ts.
import { HEAL_SESSIONS, pickBroken, repairCost, repairPrice, stormLevel, type Damage } from './repair'
import { conditionLevel, missedWorkdays, parseISO, toISO, type ConditionLevel } from './rules'
import { shopItem } from './shop'

export interface Tier {
  n: number
  name: string
  center: string
  coins: number
  gems: number
  /** Сколько жителей нужно, чтобы перейти на эту ступень. */
  residents: number
  /** Сколько особых построек (файлов) должно быть построено. */
  specials: number
  /** Запас еды на новоселье: ради него нужен амбар. */
  food: number
  hours: number
}

export const TIERS: Tier[] = [
  { n: 0, name: 'Стоянка', center: 'Костёр', coins: 0, gems: 0, residents: 0, specials: 0, food: 0, hours: 0 },
  { n: 1, name: 'Лагерь', center: 'Очаг с навесом', coins: 60, gems: 0, residents: 0, specials: 2, food: 0, hours: 5 / 60 },
  { n: 2, name: 'Хутор', center: 'Дом собраний', coins: 300, gems: 3, residents: 5, specials: 5, food: 15, hours: 4 },
  { n: 3, name: 'Деревня', center: 'Ратуша', coins: 900, gems: 8, residents: 15, specials: 10, food: 60, hours: 12 },
  { n: 4, name: 'Городок', center: 'Ратуша с башней', coins: 1500, gems: 16, residents: 26, specials: 16, food: 150, hours: 24 },
  { n: 5, name: 'Город', center: 'Ратуша с часами', coins: 3500, gems: 30, residents: 45, specials: 30, food: 300, hours: 24 },
]

/** Время стройки по уровню, часы. Не дольше суток. */
export const LEVEL_HOURS = [5 / 60, 1, 4, 12, 24]
/** Во сколько раз уровень дороже первого. */
export const LEVEL_COST = [1, 1.8, 3.2, 5.8, 10.5]
/** Без колодца жителей не больше стольких. */
export const NO_WELL_LIMIT = 6
/**
 * Уют: сколько даёт сама стоянка, каждая ступень, уровень колодца и уровень таверны.
 * Украшения из лавки добавляют своё — поле comfort в src/game/shop.ts.
 * Довольство — это уют, делённый на число жителей.
 */
export const COMFORT = { base: 1, tier: 2, well: 2, tavern: 4 }
const BASE_FOOD_CAP = 20
const BASE_MATERIAL_CAP = 30
/** Мастерская ускоряет стройку на столько за уровень. */
const WORKSHOP_SPEEDUP = 0.06

export interface BuildingType {
  id: string
  name: string
  /** Со ступени. */
  tier: number
  /** Цена первого уровня в монетах. */
  base: number
  /** Сколько штук можно поставить на ступенях 0–5. */
  count: number[]
  /** Нужны работники: 1 на уровнях 1–2, 2 на уровнях 3–4, 3 на уровне 5. */
  staffed?: boolean
  housing?: number[]
  food?: number[]
  wood?: number[]
  brick?: number[]
  foodCap?: number[]
  materialCap?: number[]
  /** Запас дров: рабочих дней защиты от запустения. */
  firewood?: number[]
}

// Карта города прокручивается, поэтому в один экран он не вмещается и не должен:
// на ступени «Город» выходит 33 постройки и центр.
export const BUILDINGS: BuildingType[] = [
  { id: 'house', name: 'Жилище', tier: 0, base: 20, count: [1, 2, 4, 6, 8, 10], housing: [2, 3, 5, 7, 10] },
  { id: 'garden', name: 'Огород', tier: 1, base: 30, count: [0, 1, 2, 3, 3, 4], staffed: true, food: [3, 6, 9, 13, 18] },
  { id: 'barn', name: 'Амбар', tier: 1, base: 40, count: [0, 1, 1, 2, 2, 2], foodCap: [40, 80, 150, 260, 420] },
  { id: 'sawmill', name: 'Лесопилка', tier: 1, base: 50, count: [0, 1, 1, 2, 2, 2], staffed: true, wood: [2, 4, 6, 9, 13] },
  { id: 'woodshed', name: 'Дровник', tier: 1, base: 60, count: [0, 1, 1, 1, 1, 1], firewood: [1, 2, 3, 4, 5] },
  { id: 'well', name: 'Колодец', tier: 1, base: 80, count: [0, 1, 1, 2, 2, 2] },
  { id: 'store', name: 'Склад', tier: 2, base: 80, count: [0, 0, 1, 1, 2, 2], materialCap: [40, 80, 150, 260, 420] },
  { id: 'brickyard', name: 'Кирпичный двор', tier: 2, base: 120, count: [0, 0, 1, 1, 2, 2], staffed: true, brick: [1, 2, 4, 6, 9] },
  { id: 'workshop', name: 'Мастерская', tier: 2, base: 150, count: [0, 0, 1, 1, 1, 1] },
  { id: 'pier', name: 'Рыбацкий причал', tier: 2, base: 160, count: [0, 0, 1, 1, 2, 2], staffed: true, food: [6, 9, 13, 18, 24] },
  { id: 'mill', name: 'Мельница', tier: 3, base: 250, count: [0, 0, 0, 1, 1, 1], staffed: true },
  { id: 'tavern', name: 'Таверна', tier: 3, base: 300, count: [0, 0, 0, 1, 1, 1] },
  { id: 'market', name: 'Рынок', tier: 3, base: 350, count: [0, 0, 0, 1, 1, 1] },
  { id: 'bakery', name: 'Пекарня', tier: 4, base: 500, count: [0, 0, 0, 0, 1, 1], staffed: true, food: [15, 22, 30, 40, 52] },
  { id: 'tower', name: 'Сторожевая башня', tier: 4, base: 600, count: [0, 0, 0, 0, 1, 1] },
]

export const buildingType = (id: string): BuildingType | undefined => BUILDINGS.find((b) => b.id === id)

/** Рынок: одна партия товара стоит столько монет. */
export const TRADE_COINS = 20
export type Goods = 'food' | 'wood' | 'brick'
export const GOODS: { id: Goods; name: string }[] = [
  { id: 'food', name: 'еда' },
  { id: 'wood', name: 'дерево' },
  { id: 'brick', name: 'кирпич' },
]
/**
 * Сколько товара в партии: чем выше уровень рынка, тем выгоднее.
 * Обмен нарочно невыгодный: огород первого уровня даёт столько же еды за три хода бесплатно.
 */
export function tradeYield(level: number, goods: Goods): number {
  if (level <= 0) return 0
  return goods === 'food' ? 8 + 2 * level : goods === 'wood' ? 4 + level : 2 + level
}

/** Максимальный уровень постройки на ступени. */
export const maxLevel = (tier: number) => Math.min(5, tier + 1)

export interface Cost {
  coins: number
  gems: number
  food: number
  wood: number
  brick: number
}

const round5 = (value: number) => Math.max(5, Math.round(value / 5) * 5)

/** Цена уровня: монеты всегда, дерево со 2-го уровня, кирпич с 4-го. */
export function buildCost(type: BuildingType, level: number): Cost {
  const scale = type.base * LEVEL_COST[level - 1]
  return {
    coins: round5(scale),
    gems: 0,
    food: 0,
    wood: level >= 2 ? Math.round(scale * 0.1) : 0,
    brick: level >= 4 ? Math.round(scale * 0.04) : 0,
  }
}

export const tierCost = (n: number): Cost => ({ coins: TIERS[n].coins, gems: TIERS[n].gems, food: TIERS[n].food, wood: 0, brick: 0 })

/**
 * Действие игрока. at — момент по часам, от него идёт время стройки.
 * tier — перейти на следующую ступень; build — поставить постройку типа type;
 * upgrade — улучшить постройку с номером id;
 * trade — купить на рынке партию товара type: food, wood или brick;
 * repair — починить за монеты сломанную постройку с номером id.
 */
export interface TownAction {
  at: string
  do: 'tier' | 'build' | 'upgrade' | 'trade' | 'repair'
  type?: string
  id?: string
}

/** Поломка после долгого перерыва: постройка стоит, но не работает. */
export interface Breakage {
  /** Последнее занятие перед перерывом, который сломал постройку. */
  since: string
  /** Через сколько занятий починится само; null — перерыв ещё идёт. */
  healsIn: number | null
  /** Цена починки в монетах: пятая часть монетной цены нынешнего уровня. */
  cost: number
}

export interface TownBuilding {
  id: string
  type: string
  /** Действующий уровень. 0 — ещё строится. */
  level: number
  /** Идущая стройка или улучшение. */
  pending: { level: number; readyAt: number } | null
  /** Сломана после долгого перерыва; null — цела. Жильё и склады сломанной постройки остаются. */
  broken: Breakage | null
}

export interface Town {
  tier: number
  tierPending: { n: number; readyAt: number } | null
  buildings: TownBuilding[]
  food: number
  wood: number
  brick: number
  population: number
  housing: number
  foodCap: number
  materialCap: number
  /** Сколько ушло на город. */
  spent: { coins: number; gems: number }
  builders: { total: number; busy: number }
  turns: number
  /** Что даёт следующий ход при нынешних жителях. */
  perTurn: { food: number; eaten: number; wood: number; brick: number }
  /** Рабочих дней защиты от запустения: запас работающего дровника. */
  firewood: number
  /** Уют и из чего он складывается. decor — украшения из лавки. */
  comfort: { total: number; center: number; wells: number; tavern: number; decor: number }
  /** Сломанные украшения из лавки. Сломанные постройки помечены полем broken. */
  damage: Damage[]
  /**
   * Идущий перерыв: сколько рабочих дней пропущено, сколько из них прикрыл запас дров
   * и до какого уровня дошло запустение. Запас считается по дровнику, каким он был до этого перерыва.
   */
  idle: { missed: number; covered: number; level: ConditionLevel }
}

const staffFor = (level: number) => (level >= 5 ? 3 : level >= 3 ? 2 : 1)
const at = (values: number[] | undefined, level: number) => (values && level > 0 ? values[level - 1] : 0)
/** Работающие постройки типа: построены и не сломаны. */
const levelsOf = (town: Town, type: string) => town.buildings.filter((b) => b.type === type && b.level > 0 && !b.broken)
const topLevel = (town: Town, type: string) => Math.max(0, ...levelsOf(town, type).map((b) => b.level))

function refresh(town: Town) {
  const sum = (pick: (t: BuildingType) => number[] | undefined, working = false) =>
    town.buildings.reduce((total, b) => total + (working && b.broken ? 0 : at(pick(buildingType(b.type)!), b.level)), 0)
  // Жильё и склады сломанной постройки остаются: жители не уходят, запасы не пропадают.
  town.housing = sum((t) => t.housing)
  town.foodCap = BASE_FOOD_CAP + sum((t) => t.foodCap)
  town.materialCap = BASE_MATERIAL_CAP + sum((t) => t.materialCap)
  town.firewood = sum((t) => t.firewood, true)
  const center = COMFORT.base + COMFORT.tier * town.tier
  const wells = levelsOf(town, 'well').reduce((total, b) => total + b.level * COMFORT.well, 0)
  const tavern = topLevel(town, 'tavern') * COMFORT.tavern
  const decor = town.comfort.decor
  town.comfort = { center, wells, tavern, decor, total: center + wells + tavern + decor }
  town.builders = {
    total: 1 + (topLevel(town, 'workshop') > 0 ? 1 : 0) + (town.tier >= 4 ? 1 : 0),
    busy: town.buildings.filter((b) => b.pending).length + (town.tierPending ? 1 : 0),
  }
}

/** Что постройки дадут за ход. Путник тоже работает, иначе первый огород некому вскопать. Сломанные рук не занимают. */
function yields(town: Town) {
  let free = town.population + 1
  const order = ['garden', 'pier', 'bakery', 'mill', 'sawmill', 'brickyard']
  const share = new Map<string, number>()
  for (const type of order) {
    for (const b of levelsOf(town, type)) {
      const need = staffFor(b.level)
      const got = Math.min(free, need)
      free -= got
      share.set(b.id, got / need)
    }
  }
  const total = (type: string, pick: (t: BuildingType) => number[] | undefined) =>
    levelsOf(town, type).reduce((s, b) => s + at(pick(buildingType(type)!), b.level) * (share.get(b.id) ?? 0), 0)
  const mill = levelsOf(town, 'mill')[0]
  const millBonus = mill ? 1 + 0.1 * mill.level * (share.get(mill.id) ?? 0) : 1
  const food = total('garden', (t) => t.food) * millBonus + total('pier', (t) => t.food) + (mill ? total('bakery', (t) => t.food) : 0)
  return { food: Math.floor(food), wood: Math.floor(total('sawmill', (t) => t.wood)), brick: Math.floor(total('brickyard', (t) => t.brick)) }
}

function settle(town: Town, time: number) {
  for (const b of town.buildings) {
    if (b.pending && b.pending.readyAt <= time) {
      b.level = b.pending.level
      b.pending = null
    }
  }
  if (town.tierPending && town.tierPending.readyAt <= time) {
    town.tier = town.tierPending.n
    town.tierPending = null
  }
  refresh(town)
}

/**
 * Ход: постройки дают, жители едят, излишек еды уходит в запас.
 * Новый житель приходит, если есть место и еды за ход хватит на всех вместе с ним и ещё останется порция:
 * так излишек копится всегда, и ступень не упирается в пустой амбар.
 * Голода нет: если еды не хватает, новые жители просто не приходят.
 * Довольство: новичок приходит, только если и с ним уюта останется больше половины от числа жителей;
 * пока уюта хватает всем с запасом, за ход приходит на одного больше.
 * Сломанная постройка в ходе не участвует: не даёт ни еды, ни материалов, ни уюта; пока сломаны все колодцы,
 * жителей сверх шести не прибавляется. Жильё и запасы остаются: никто не уходит и ничего не пропадает.
 */
function turn(town: Town) {
  const made = yields(town)
  town.food = Math.max(0, Math.min(town.foodCap, town.food + made.food - town.population))
  town.wood = Math.min(town.materialCap, town.wood + made.wood)
  town.brick = Math.min(town.materialCap, town.brick + made.brick)
  const room = Math.min(town.housing, topLevel(town, 'well') > 0 ? Infinity : NO_WELL_LIMIT)
  const arrivals = (topLevel(town, 'tavern') > 0 ? 2 : 1) + (arrivalPace(town) === 'fast' ? 1 : 0)
  for (let i = 0; i < arrivals; i++) {
    if (town.population < room && made.food >= town.population + 2 && arrivalPace(town) !== 'stopped') town.population++
  }
  town.turns++
}

/** Довольство в процентах: уют на одного жителя, не больше 100. */
export const moodOf = (town: Pick<Town, 'comfort' | 'population'>): number =>
  town.population <= 0 ? 100 : Math.min(100, Math.round((100 * town.comfort.total) / town.population))

/**
 * Как довольство влияет на приход жителей:
 * fast — уюта хватит всем и вместе с новичком, за ход приходит на одного больше;
 * stopped — с новичком уюта стало бы меньше половины от числа жителей, никто не приходит.
 */
export function arrivalPace(town: Pick<Town, 'comfort' | 'population'>): 'fast' | 'normal' | 'stopped' {
  if (town.comfort.total > town.population) return 'fast'
  return town.comfort.total * 2 > town.population ? 'normal' : 'stopped'
}

/** Скольким жителям хватает нынешнего уюта: дальше новые не приходят. */
export const comfortRoom = (town: Pick<Town, 'comfort'>): number => town.comfort.total * 2

export function buildHours(town: Town, level: number): number {
  return LEVEL_HOURS[level - 1] * (1 - WORKSHOP_SPEEDUP * topLevel(town, 'workshop'))
}

function pay(town: Town, cost: Cost) {
  town.spent.coins += cost.coins
  town.spent.gems += cost.gems
  town.food = Math.max(0, town.food - cost.food)
  town.wood = Math.max(0, town.wood - cost.wood)
  town.brick = Math.max(0, town.brick - cost.brick)
}

const HOUR = 3600_000

function act(town: Town, action: TownAction, time: number) {
  if (action.do === 'trade') {
    const goods = action.type as Goods
    const amount = tradeYield(topLevel(town, 'market'), goods)
    if (!amount || !GOODS.some((g) => g.id === goods)) return
    town.spent.coins += TRADE_COINS
    // Купленное сверх склада пропадает: интерфейс такую сделку не даёт начать.
    if (goods === 'food') town.food = Math.min(town.foodCap, town.food + amount)
    else town[goods] = Math.min(town.materialCap, town[goods] + amount)
    return
  }
  if (action.do === 'tier') {
    const next = TIERS[town.tier + 1]
    if (!next || town.tierPending) return
    pay(town, tierCost(next.n))
    town.tierPending = { n: next.n, readyAt: time + next.hours * HOUR }
  } else if (action.do === 'build') {
    const type = buildingType(action.type ?? '')
    if (!type) return
    const n = town.buildings.filter((b) => b.type === type.id).length + 1
    pay(town, buildCost(type, 1))
    town.buildings.push({ id: `${type.id}-${n}`, type: type.id, level: 0, pending: { level: 1, readyAt: time + buildHours(town, 1) * HOUR }, broken: null })
  } else if (action.do === 'upgrade') {
    const b = town.buildings.find((x) => x.id === action.id)
    // Сломанную постройку сначала чинят.
    if (!b || b.pending || b.broken || b.level >= 5) return
    const level = b.level + 1
    pay(town, buildCost(buildingType(b.type)!, level))
    b.pending = { level, readyAt: time + buildHours(town, level) * HOUR }
  }
  refresh(town)
}

/** Что ещё нужно знать, чтобы посчитать поломки. */
export interface ReplayExtra {
  /**
   * Сегодняшняя дата: по ней считается идущий перерыв — от последнего занятия до сегодня.
   * Без неё на момент now видны только поломки прошедших перерывов.
   */
  today?: string
  /** Дни плановых перерывов: пропуском не считаются. */
  paused?: Set<string>
  /** Ремонты украшений из лавки. Постройки чинит действие repair в журнале. */
  repairs?: { item: string; date: string }[]
  /** Предпросмотр: как будто идущий перерыв уже дошёл до этого уровня запустения. */
  forcedLevel?: ConditionLevel | null
}

/**
 * Состояние города на момент now.
 * studyDays — даты занятий: каждая даёт один ход в начале дня, чтобы ресурсы были доступны в тот же день.
 * decor — покупки из лавки: украшение даёт уют со дня покупки, но ход того же дня уже прошёл.
 *
 * Поломки. Перерыв — промежуток между соседними днями занятий или от последнего занятия до сегодня.
 * Его тяжесть — пропущенные рабочие дни минус запас дров; что сломается, выбирает pickBroken из украшений
 * и построек, которые стоят и не улучшаются. Всё это берётся по городу, каким он был до этого перерыва:
 * дровник и башня, сломанные прошлым перерывом, новый не смягчают, а сломанные этим — смягчают.
 * Сломанное не работает с возвращения и чинится само на третьем занятии, считая занятие в день возвращения.
 * Пока перерыв идёт, поломка уже видна; срок починки неизвестен.
 */
export function replayTown(
  actions: TownAction[],
  studyDays: string[],
  now: Date,
  decor: { item: string; date: string }[] = [],
  extra: ReplayExtra = {},
): Town {
  const town: Town = {
    tier: 0,
    tierPending: null,
    buildings: [],
    food: 0,
    wood: 0,
    brick: 0,
    population: 0,
    housing: 0,
    foodCap: BASE_FOOD_CAP,
    materialCap: BASE_MATERIAL_CAP,
    spent: { coins: 0, gems: 0 },
    builders: { total: 1, busy: 0 },
    turns: 0,
    perTurn: { food: 0, eaten: 0, wood: 0, brick: 0 },
    firewood: 0,
    comfort: { total: COMFORT.base, center: COMFORT.base, wells: 0, tavern: 0, decor: 0 },
    damage: [],
    idle: { missed: 0, covered: 0, level: 0 },
  }
  // Каждое украшение считается один раз, с самой ранней покупки.
  const bought = new Map<string, number>()
  for (const purchase of decor) {
    const time = parseISO(purchase.date).getTime()
    if (shopItem(purchase.item)?.comfort && time < (bought.get(purchase.item) ?? Infinity)) bought.set(purchase.item, time)
  }
  const decorAt = (time: number) =>
    [...bought].reduce((total, [item, since]) => total + (since < time ? (shopItem(item)?.comfort ?? 0) : 0), 0)
  const limit = now.getTime()
  const events = [
    ...actions.map((action) => ({ time: Date.parse(action.at), action, day: null as string | null })),
    ...[...new Set(studyDays)].map((day) => ({ time: parseISO(day).getTime(), action: null as TownAction | null, day })),
  ]
    .filter((e) => e.time <= limit)
    .sort((a, b) => a.time - b.time || (a.day ? -1 : 1))

  // --- Поломки: ничего не хранится, всё выводится из дат занятий и журнала ---
  /** Украшения, которые могут сломаться. */
  const fragile = decor.filter((p) => shopItem(p.item)?.group === 'camp')
  /** Дни занятий, до которых дошёл пересчёт. */
  const seen: string[] = []
  /** Сломанное прошедшими перерывами: since — последнее занятие перед перерывом, n — номер занятия в день возвращения. */
  const hits = new Map<string, { since: string; n: number }>()
  /** Когда постройку чинили за монеты. */
  const mended = new Map<string, number>()
  /** Что ломает идущий перерыв, каким он виден в последний размеченный момент. */
  const open = { from: '', ids: [] as string[] }
  /** Остались ли на постройках метки с прошлой разметки. */
  let marked = false

  const breakage = (b: TownBuilding, since: string, left: number | null): Breakage => ({
    since,
    healsIn: left,
    cost: repairPrice(buildCost(buildingType(b.type)!, b.level).coins),
  })
  /** Через сколько занятий починится само: занятие в день возвращения — первое из трёх. */
  const healsIn = (hit: { n: number }) => HEAL_SESSIONS - (seen.length - hit.n)
  /** Починка за монеты закрывает перерыв, если сделана уже после его начала. */
  const mendedSince = (id: string, from: string) => {
    const time = mended.get(id)
    return time !== undefined && toISO(new Date(time)) > from
  }

  /** Метки поломок от прошедших перерывов; идущий перерыв в них не входит. */
  const markPast = () => {
    open.ids = []
    if (!marked && !hits.size) return
    marked = false
    for (const b of town.buildings) {
      const hit = hits.get(b.id)
      b.broken = hit ? breakage(b, hit.since, healsIn(hit)) : null
      if (hit) marked = true
    }
    refresh(town)
  }

  /**
   * Перерыв от занятия from до дня day: тяжесть и что он ломает. Вызывается после markPast,
   * поэтому запас дров и башня здесь — какими они были до этого перерыва.
   * returned — в этот день вернулись к занятиям: купленное в день возвращения уже не ломается.
   */
  const strike = (from: string, day: string, returned: boolean, forced: ConditionLevel | null = null) => {
    const missed = missedWorkdays(from, day, extra.paused)
    const level = forced ?? stormLevel(missed, town.firewood)
    const things =
      level < 2
        ? []
        : [
            ...fragile.filter((p) => (returned ? p.date < day : p.date <= day)).map((p) => p.item),
            // Строящееся и улучшаемое не ломается.
            ...town.buildings.filter((b) => b.level > 0 && !b.pending).map((b) => b.id),
          ]
    return { missed, covered: Math.min(missed, town.firewood), level, ids: pickBroken(from, things, level, topLevel(town, 'tower') > 0) }
  }

  /** Разметить поломки на день day: прошедшие перерывы и идущий, каким он виден в этот день. null — только прошедшие. */
  const mark = (day: string | null, forced: ConditionLevel | null = null) => {
    markPast()
    town.idle = { missed: 0, covered: 0, level: 0 }
    const from = seen[seen.length - 1]
    if (day === null || from === undefined || (forced === null && day <= from)) return
    const storm = strike(from, day, false, forced)
    town.idle = { missed: storm.missed, covered: storm.covered, level: storm.level }
    open.from = from
    open.ids = storm.ids
    let struck = false
    for (const id of storm.ids) {
      const b = town.buildings.find((x) => x.id === id)
      if (!b || mendedSince(id, from)) continue
      b.broken = breakage(b, from, null)
      struck = true
    }
    if (!struck) return
    marked = true
    refresh(town)
  }

  /** День занятия: перерыв перед ним закончился. Что он сломал, сломано с этого дня. */
  const arrive = (day: string) => {
    const from = seen[seen.length - 1]
    let struck: string[] = []
    if (from !== undefined && conditionLevel(missedWorkdays(from, day, extra.paused)) >= 2) {
      // Считается до того, как починится старое: дровник, простоявший перерыв сломанным, его не прикрывал.
      markPast()
      struck = strike(from, day, true).ids.filter((id) => !mendedSince(id, from))
    }
    seen.push(day)
    for (const [id, hit] of hits) if (healsIn(hit) <= 0) hits.delete(id)
    for (const id of struck) hits.set(id, { since: from!, n: seen.length - 1 })
  }

  /** Починка за монеты: мгновенная, строителей не занимает. Если постройка цела — пустое действие. */
  const mend = (id: string | undefined, time: number) => {
    const b = town.buildings.find((x) => x.id === id)
    if (!b?.broken) return
    town.spent.coins += b.broken.cost
    b.broken = null
    hits.delete(b.id)
    mended.set(b.id, time)
    refresh(town)
  }

  for (const event of events) {
    town.comfort.decor = decorAt(event.time)
    settle(town, event.time)
    if (event.action) {
      // Действие видит город таким, каким его видел игрок: вместе с перерывом, который шёл в тот момент.
      mark(toISO(new Date(event.time)))
      if (event.action.do === 'repair') mend(event.action.id, event.time)
      else act(town, event.action, event.time)
    } else {
      arrive(event.day!)
      mark(null)
      turn(town)
    }
  }
  town.comfort.decor = decorAt(limit)
  settle(town, limit)
  mark(extra.today ?? null, extra.forcedLevel ?? null)
  town.perTurn = { ...yields(town), eaten: town.population }

  // Сломанные украшения. Их чинит запись в ledger.repairs, сделанная не раньше начала перерыва.
  const repairs = extra.repairs ?? []
  const damage = new Map<string, Damage>()
  const note = (id: string, since: string, left: number | null) => {
    const item = shopItem(id)
    if (!item || town.buildings.some((b) => b.id === id)) return
    if (repairs.some((r) => r.item === id && r.date >= since)) return
    damage.set(id, { item: id, since, healsIn: left, cost: repairCost(item) })
  }
  for (const [id, hit] of hits) note(id, hit.since, healsIn(hit))
  for (const id of open.ids) note(id, open.from, null)
  town.damage = [...damage.values()]
  return town
}

/** Что есть у игрока помимо самого города. */
export interface Means {
  coins: number
  gems: number
  /** Сколько особых построек (файлов) построено. */
  specials: number
}

/** Почему действие сейчас нельзя сделать. Пустой список — можно. */
export function blockers(town: Town, action: Pick<TownAction, 'do' | 'type' | 'id'>, means: Means): string[] {
  const why: string[] = []
  if (action.do === 'trade') {
    // Торговле строители не нужны.
    const goods = action.type as Goods
    const amount = tradeYield(topLevel(town, 'market'), goods)
    if (!amount) return [town.buildings.some((b) => b.type === 'market' && b.broken) ? 'рынок сломан: сначала почини его' : 'нужен рынок']
    const have = goods === 'food' ? town.food : town[goods]
    const cap = goods === 'food' ? town.foodCap : town.materialCap
    if (have + amount > cap) why.push(`не поместится: на складе ${Math.floor(have)} из ${cap}`)
    if (means.coins < TRADE_COINS) why.push(`не хватает монет: ${TRADE_COINS - means.coins}`)
    return why
  }
  if (action.do === 'repair') {
    // Починке строители не нужны.
    const b = town.buildings.find((x) => x.id === action.id)
    if (!b) return ['такой постройки нет']
    if (!b.broken) return ['постройка цела']
    return means.coins < b.broken.cost ? [`не хватает монет: ${b.broken.cost - means.coins}`] : []
  }
  if (town.builders.busy >= town.builders.total) why.push('все строители заняты')
  let cost: Cost
  if (action.do === 'tier') {
    const next = TIERS[town.tier + 1]
    if (!next) return ['это последняя ступень']
    if (town.tierPending) return ['переход уже идёт']
    cost = tierCost(next.n)
    if (town.population < next.residents) why.push(`нужно жителей: ${next.residents}, сейчас ${town.population}`)
    if (means.specials < next.specials) why.push(`нужно особых построек: ${next.specials}, сейчас ${means.specials}`)
  } else if (action.do === 'build') {
    const type = buildingType(action.type ?? '')
    if (!type) return ['такой постройки нет']
    cost = buildCost(type, 1)
    if (town.tier < type.tier) why.push(`откроется на ступени «${TIERS[type.tier].name}»`)
    const have = town.buildings.filter((b) => b.type === type.id).length
    if (have >= type.count[town.tier]) why.push('на этой ступени больше нельзя')
  } else {
    const b = town.buildings.find((x) => x.id === action.id)
    if (!b) return ['такой постройки нет']
    if (b.pending) return ['уже строится']
    if (b.broken) return ['постройка сломана: сначала почини её']
    if (b.level >= maxLevel(town.tier)) return ['выше уровень откроет следующая ступень']
    cost = buildCost(buildingType(b.type)!, b.level + 1)
  }
  if (means.coins < cost.coins) why.push(`не хватает монет: ${cost.coins - means.coins}`)
  if (means.gems < cost.gems) why.push(`не хватает камней: ${cost.gems - means.gems}`)
  if (town.food < cost.food) why.push(`не хватает запаса еды: ${cost.food - town.food}`)
  if (town.wood < cost.wood) why.push(`не хватает дерева: ${cost.wood - town.wood}`)
  if (town.brick < cost.brick) why.push(`не хватает кирпича: ${cost.brick - town.brick}`)
  return why
}
