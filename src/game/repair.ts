// Починка. Долгий перерыв ломает купленные постройки лагеря; их можно починить за монеты
// либо дождаться, пока они починятся сами за несколько занятий.
// Рамки, чтобы ремонт не стал рутиной и не съедал монеты:
// ломается только купленное для лагеря, не больше двух вещей за перерыв, ремонт стоит пятую часть цены.
import type { Purchase } from '../data/types'
import { conditionLevel, missedWorkdays, type ConditionLevel } from './rules'
import { shopItem, type ShopItem } from './shop'

/** Столько занятий после возвращения чинят сломанное бесплатно. */
export const HEAL_SESSIONS = 3

/** Сколько построек ломает перерыв: по уровню запустения. */
export const BREAKS_BY_LEVEL = [0, 0, 1, 2] as const

/** Ремонт вещи, купленной за камни, стоит столько монет. */
const GEM_ITEM_REPAIR = 50

export function repairCost(item: ShopItem): number {
  if (!item.coins) return GEM_ITEM_REPAIR
  return Math.max(10, Math.round((item.coins * 0.2) / 10) * 10)
}

export interface Damage {
  item: string
  /** Последнее занятие перед перерывом, который сломал вещь. */
  since: string
  /** Через сколько занятий починится само; null — перерыв ещё идёт. */
  healsIn: number | null
  cost: number
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Что сломано сейчас. Считается из дат занятий, покупок и ремонтов — отдельно нигде не хранится.
 * forcedLevel — предпросмотр: как будто перерыв уже дошёл до этого уровня.
 */
export function damageFor(
  sessionDates: string[],
  purchases: Purchase[],
  repairs: Purchase[],
  todayISO: string,
  forcedLevel: ConditionLevel | null = null,
  /** Дни плановых перерывов: пропуском не считаются. */
  paused?: Set<string>,
): Damage[] {
  const dates = [...new Set(sessionDates)].sort()
  if (!dates.length) return []

  const storms: { from: string; back: string | null; level: ConditionLevel }[] = []
  for (let i = 0; i < dates.length - 1; i++) {
    const level = conditionLevel(missedWorkdays(dates[i], dates[i + 1], paused))
    if (level >= 2) storms.push({ from: dates[i], back: dates[i + 1], level })
  }
  const last = dates[dates.length - 1]
  const now = forcedLevel ?? conditionLevel(missedWorkdays(last, todayISO, paused))
  if (now >= 2) storms.push({ from: last, back: null, level: now })

  const damage = new Map<string, Damage>()
  for (const storm of storms) {
    const standing = [...new Set(purchases.filter((p) => !storm.back || p.date < storm.back).map((p) => p.item))]
      .filter((id) => shopItem(id)?.group === 'camp')
      // Порядок зависит только от перерыва и вещи: пока перерыв длится, список не перетасовывается.
      .sort((a, b) => hash(storm.from + a) - hash(storm.from + b))
    for (const id of standing.slice(0, BREAKS_BY_LEVEL[storm.level])) {
      const repaired = repairs.some((r) => r.item === id && r.date >= storm.from)
      const sessionsBack = storm.back ? dates.filter((d) => d >= storm.back!).length : 0
      if (repaired || (storm.back && sessionsBack >= HEAL_SESSIONS)) continue
      damage.set(id, {
        item: id,
        since: storm.from,
        healsIn: storm.back ? HEAL_SESSIONS - sessionsBack : null,
        cost: repairCost(shopItem(id)!),
      })
    }
  }
  return [...damage.values()]
}

/** Сколько монет ушло на ремонты. Один и тот же ремонт считается один раз. */
export function repairsSpent(repairs: Purchase[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const r of repairs) {
    const item = shopItem(r.item)
    const key = `${r.item}@${r.date}`
    if (!item || seen.has(key)) continue
    seen.add(key)
    total += repairCost(item)
  }
  return total
}
