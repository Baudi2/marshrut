// Колода: карточки из проверок понимания и их повторение по интервалам.
// Карточка — вопрос, первый ответ игрока и правильный ответ. Игрок вспоминает, открывает ответ и сам отмечает, знал или нет.
// Состояние карточки нигде не хранится: оно считается из журнала повторов.
import type { DeckReview, KnowledgeCheck } from '../data/types'
import { parseISO, toISO } from './rules'

/**
 * Коробки Лейтнера. Новая карточка лежит в коробке 0 и ждёт повтора на следующий день после проверки.
 * «Знал» — карточка переходит в следующую коробку и ждёт столько дней, сколько записано для этой коробки.
 * «Не знал» — возвращается в коробку 0 и приходит завтра.
 */
export const BOX_DAYS = [1, 3, 7, 14, 30]
export const LAST_BOX = BOX_DAYS.length - 1

export interface DeckCard {
  id: string
  cycle: string
  check: KnowledgeCheck
  box: number
  /** С какого дня карточку пора повторить. */
  due: string
  /** Сколько повторов засчитано. */
  reviews: number
  /** Чем кончился последний засчитанный повтор. */
  lastOk: boolean | null
  /** Дошла до последней коробки. */
  learned: boolean
}

const addDays = (iso: string, days: number) => {
  const date = parseISO(iso)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

/** Короткий устойчивый отпечаток строки: номер карточки не должен меняться от пересборки сайта. */
function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** Номер карточки: дата проверки и отпечаток вопроса. */
export const cardId = (check: Pick<KnowledgeCheck, 'date' | 'question'>) => `${check.date}-${hash(check.question)}`

/** Дата повтора по местному календарю. */
export const reviewDay = (review: DeckReview) => toISO(new Date(review.at))

/**
 * Колода на сегодня. Повтор засчитывается, только если карточку уже пора было повторять:
 * лишние нажатия в тот же день и повторы раньше срока коробку не двигают.
 */
export function buildDeck(checks: { cycle: string; check: KnowledgeCheck }[], reviews: DeckReview[]): DeckCard[] {
  const byCard = new Map<string, DeckReview[]>()
  for (const review of [...reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    byCard.set(review.card, [...(byCard.get(review.card) ?? []), review])
  }
  const seen = new Set<string>()
  const deck: DeckCard[] = []
  for (const { cycle, check } of checks) {
    const id = cardId(check)
    // Один и тот же вопрос в один день — одна карточка.
    if (seen.has(id)) continue
    seen.add(id)
    const card: DeckCard = { id, cycle, check, box: 0, due: addDays(check.date, BOX_DAYS[0]), reviews: 0, lastOk: null, learned: false }
    for (const review of byCard.get(id) ?? []) {
      const day = reviewDay(review)
      if (day < card.due) continue
      card.box = review.ok ? Math.min(card.box + 1, LAST_BOX) : 0
      card.due = addDays(day, BOX_DAYS[card.box])
      card.reviews++
      card.lastOk = review.ok
    }
    card.learned = card.box === LAST_BOX
    deck.push(card)
  }
  return deck
}

const VERDICT_ORDER = { wrong: 0, partial: 1, correct: 2 }

/** Что повторять сегодня: сначала то, что забыто, потом то, что давно ждёт, потом то, на что с первого раза ответил хуже. */
export function dueCards(deck: DeckCard[], today: string): DeckCard[] {
  return deck
    .filter((card) => card.due <= today)
    .sort(
      (a, b) =>
        Number(b.lastOk === false) - Number(a.lastOk === false) ||
        a.due.localeCompare(b.due) ||
        VERDICT_ORDER[a.check.verdict] - VERDICT_ORDER[b.check.verdict],
    )
}

/** Когда придёт ближайшая карточка, если на сегодня ничего нет. */
export const nextDue = (deck: DeckCard[], today: string): string | null =>
  deck
    .map((card) => card.due)
    .filter((due) => due > today)
    .sort()[0] ?? null
