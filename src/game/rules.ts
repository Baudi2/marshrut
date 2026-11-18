// Правила игры. Всё производное считается отсюда, в данных не хранится:
// правила можно менять без правки progress.json.

export const XP = {
  dayMinimum: 10,
  dayCoreLight: 30,
  dayCoreDeep: 50,
  extension: 25,
  problemSelf: 20,
  problemWalkthrough: 10,
  repeatFromEmpty: 15,
  noHints: 30,
  pair: 10,
  artifact: 10,
  ciFirstGreen: 40,
  ciFixed: 20,
  weekCheckpoint: 50,
  returnAfterPause: 20,
  offplanSession: 20,
  /** Дуэль с собой: перерешал старую задачу быстрее первой попытки на таймере. */
  duel: 15,
} as const

/** Камень за каждый пройденный перевал — ключевую точку маршрута. */
export const GEMS_PER_PASS = 1

// --- Монеты и камни ---
// Монеты даются за ежедневный прогресс: столько же, сколько XP за закрытый день, задачу, артефакт, CI.
// За закрытую неделю и возвращение после паузы монет нет: это не работа за день.
// Камни даются только за недельный тест — за проверенное знание, а не за потраченное время.

export const MAX_GEMS_PER_TEST = 3

/** Доля набранных баллов → камни. */
export const GEM_STEPS = [
  { share: 0.9, gems: 3 },
  { share: 0.7, gems: 2 },
  { share: 0.5, gems: 1 },
] as const

export function gemsForScore(score: number, max: number): number {
  if (max <= 0) return 0
  return GEM_STEPS.find((step) => score / max >= step.share)?.gems ?? 0
}

/** Пауза от стольких календарных дней даёт очки за возвращение. */
export const RETURN_PAUSE_MIN_DAYS = 7

/** Состояния артефакта, при которых домик считается построенным. */
export const BUILT_STATES = ['created', 'saved', 'committed']

// Уровень L открывается при 100·L·(L−1) XP: 0, 200, 600, 1200, 2000, 3000…
// Потолка нет. Уровень должен весить: первый новый — примерно за неделю занятий,
// цикл 1, пройденный ядром (около 2250 XP), выводит на уровень 5, дальше — один-два уровня за цикл.
const LEVEL_BASE = 100
// Ранги треков от XP не зависят: ранг даётся за выполненные условия цикла, см. engine.ts → rankProgress.

export interface Tier {
  /** Номер уровня или ранга, от 1. */
  n: number
  /** XP, с которого он начинается. */
  floor: number
  /** XP, с которого начинается следующий. */
  next: number
  /** Набрано внутри текущего. */
  into: number
  /** Сколько нужно внутри текущего. */
  span: number
}

function tier(xp: number, base: number): Tier {
  const n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / base)) / 2))
  const floor = base * n * (n - 1)
  const next = base * (n + 1) * n
  return { n, floor, next, into: xp - floor, span: next - floor }
}

export const levelFor = (xp: number): Tier => tier(xp, LEVEL_BASE)

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

export function roman(n: number): string {
  let out = ''
  let rest = n
  for (const [value, sign] of ROMAN) {
    while (rest >= value) {
      out += sign
      rest -= value
    }
  }
  return out
}

// --- Состояние мира: пропуски видны, но очки не отнимают ---

export type ConditionLevel = 0 | 1 | 2 | 3

export interface Condition {
  level: ConditionLevel
  name: string
  /** Что видно в мире. */
  look: string
}

export const CONDITIONS: Condition[] = [
  { level: 0, name: 'Обжито', look: 'Тропа чистая, костёр горит.' },
  { level: 1, name: 'Тропа зарастает', look: 'На тропе трава, костёр прогорел до углей.' },
  { level: 2, name: 'Запустение', look: 'Склон затянуло мглой, костёр погас, краски блёкнут.' },
  { level: 3, name: 'Лагерь остыл', look: 'Густая мгла, тропу почти не видно, лагерь зарос.' },
]

/**
 * Правило плана: цепочка не рвётся дважды подряд.
 * Один пропущенный рабочий день ничего не меняет, со второго мир начинает портиться.
 */
export function conditionLevel(missedWorkdays: number): ConditionLevel {
  if (missedWorkdays <= 1) return 0
  if (missedWorkdays <= 3) return 1
  if (missedWorkdays <= 7) return 2
  return 3
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Рабочие дни (пн–пт) строго между последним занятием и сегодняшним днём. */
export function missedWorkdays(lastISO: string, todayISO: string): number {
  const end = parseISO(todayISO)
  const cursor = parseISO(lastISO)
  let missed = 0
  for (;;) {
    cursor.setDate(cursor.getDate() + 1)
    if (cursor >= end) break
    const weekday = cursor.getDay()
    if (weekday !== 0 && weekday !== 6) missed++
  }
  return missed
}
