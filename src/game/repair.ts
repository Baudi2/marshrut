// Починка. Долгий перерыв ломает купленные украшения и постройки города; их можно починить за монеты
// либо дождаться, пока они починятся сами за несколько занятий.
// Рамки, чтобы ремонт не стал рутиной и не съедал монеты:
// за перерыв ломается не больше двух вещей, ремонт стоит пятую часть цены.
// Здесь — само правило: тяжесть перерыва, выбор сломанного, цена. Какие перерывы были и что стояло
// в городе в день возвращения, считает replayTown в src/game/town.ts.
import type { Purchase } from '../data/types'
import { conditionLevel, type ConditionLevel } from './rules'
import { shopItem, type ShopItem } from './shop'

/** Столько занятий после возвращения чинят сломанное бесплатно. */
export const HEAL_SESSIONS = 3

/** Сколько вещей ломает перерыв: по уровню запустения. */
export const BREAKS_BY_LEVEL = [0, 0, 1, 2] as const

/** Ремонт вещи, купленной за камни, стоит столько монет. */
const GEM_ITEM_REPAIR = 50

/** Ремонт стоит пятую часть монетной цены: с округлением до десяти и не меньше десяти. */
export const repairPrice = (coins: number): number => Math.max(10, Math.round((coins * 0.2) / 10) * 10)

export function repairCost(item: ShopItem): number {
  if (!item.coins) return GEM_ITEM_REPAIR
  return repairPrice(item.coins)
}

/** Сломанное украшение из лавки. */
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
 * Тяжесть перерыва: пропущенные рабочие дни минус запас дров, который был у города.
 * Правило одно для идущего перерыва и для прошедшего.
 */
export function stormLevel(missed: number, firewood: number): ConditionLevel {
  return conditionLevel(missed - Math.min(missed, firewood))
}

/**
 * Что ломает перерыв — одно правило на украшения и постройки.
 * from — последнее занятие перед перерывом; things — всё, что может сломаться;
 * guarded — работает сторожевая башня: ломается не больше одной вещи.
 * Порядок зависит только от перерыва и вещи: пока перерыв длится, выбор не перетасовывается.
 */
export function pickBroken(from: string, things: string[], level: ConditionLevel, guarded: boolean): string[] {
  const count = Math.min(BREAKS_BY_LEVEL[level], guarded ? 1 : 2)
  if (!count) return []
  return [...new Set(things)].sort((a, b) => hash(from + a) - hash(from + b) || (a < b ? -1 : 1)).slice(0, count)
}

/** Сколько монет ушло на ремонты украшений. Один и тот же ремонт считается один раз. */
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
