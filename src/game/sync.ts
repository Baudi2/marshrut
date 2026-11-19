// Запись из браузера: всё, что игрок сделал на сайте и чего ещё нет в репозитории.
// Сайт статический и сам писать в репозиторий не может, поэтому запись копируют и отдают Claude Code:
// node scripts/record.mjs sync --json '<запись>' раскладывает её по файлам в data/.
import type { DeckReview, MemorialSign, OwnCard, Purchase, Redeemed, Reward } from '../data/types'
import { plural, type Forms } from './text'
import type { TownAction } from './town'

/** Всё, что есть только в этом браузере. */
export interface Unsynced {
  purchases: Purchase[]
  repairs: Purchase[]
  rewards: Reward[]
  redeemed: Redeemed[]
  signs: MemorialSign[]
  town: TownAction[]
  reviews: DeckReview[]
  cards: OwnCard[]
}

/** Запись для переноса: в ней только непустые разделы. ledger — data/purchases.json, town — data/town.json, deck — data/deck.json. */
export interface BrowserRecord {
  ledger?: Partial<Pick<Unsynced, 'purchases' | 'repairs' | 'rewards' | 'redeemed' | 'signs'>>
  town?: TownAction[]
  deck?: Partial<Pick<Unsynced, 'reviews' | 'cards'>>
}

export interface SyncSummary {
  /** Сколько записей ждёт переноса. */
  count: number
  /** Из чего они состоят: «2 покупки», «5 ответов по карточкам». */
  parts: string[]
  /** Текст для кнопки «Скопировать запись». */
  record: string
}

const NAMES: Record<keyof Unsynced, Forms> = {
  purchases: ['покупка', 'покупки', 'покупок'],
  repairs: ['ремонт', 'ремонта', 'ремонтов'],
  rewards: ['своя награда в списке', 'свои награды в списке', 'своих наград в списке'],
  redeemed: ['выкуп награды', 'выкупа наград', 'выкупов наград'],
  signs: ['памятный знак', 'памятных знака', 'памятных знаков'],
  town: ['действие в городе', 'действия в городе', 'действий в городе'],
  reviews: ['ответ по карточкам', 'ответа по карточкам', 'ответов по карточкам'],
  cards: ['своя карточка', 'свои карточки', 'своих карточек'],
}

const ORDER = Object.keys(NAMES) as (keyof Unsynced)[]

/** Только непустые списки: пустые разделы в запись не идут. */
function filled<T extends object>(lists: T): Partial<T> | undefined {
  const entries = Object.entries(lists).filter(([, list]) => (list as unknown[]).length > 0)
  return entries.length ? (Object.fromEntries(entries) as Partial<T>) : undefined
}

export function browserRecord(u: Unsynced): BrowserRecord {
  const record: BrowserRecord = {}
  const ledger = filled({ purchases: u.purchases, repairs: u.repairs, rewards: u.rewards, redeemed: u.redeemed, signs: u.signs })
  const deck = filled({ reviews: u.reviews, cards: u.cards })
  if (ledger) record.ledger = ledger
  if (u.town.length) record.town = u.town
  if (deck) record.deck = deck
  return record
}

export function syncSummary(u: Unsynced): SyncSummary {
  const parts = ORDER.filter((key) => u[key].length > 0).map((key) => `${u[key].length} ${plural(u[key].length, NAMES[key])}`)
  const count = ORDER.reduce((sum, key) => sum + u[key].length, 0)
  return { count, parts, record: JSON.stringify(browserRecord(u)) }
}
