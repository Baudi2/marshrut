// Колода: карточки и их повторение по интервалам.
// Карточки берутся из проверок понимания на занятиях и из своих записей игрока — по заметкам и по журналу ошибок.
// Игрок вспоминает, открывает ответ и сам отмечает, знал или нет.
// Состояние карточки нигде не хранится: оно считается из журнала повторов.
import type { DeckReview, KnowledgeCheck, OwnCard } from '../data/types'
import { tidy } from './rewards'
import { parseISO, toISO } from './rules'

/**
 * Коробки Лейтнера. Новая карточка лежит в коробке 0 и ждёт повтора на следующий день после своей даты.
 * «Знал» — карточка переходит в следующую коробку и ждёт столько дней, сколько записано для этой коробки.
 * «Не знал» — возвращается в коробку 0 и приходит завтра.
 */
export const BOX_DAYS = [1, 3, 7, 14, 30]
export const LAST_BOX = BOX_DAYS.length - 1

/** Сколько своих карточек можно завести на одну дату: колода растёт от учёбы, а не от набивания. */
export const OWN_CARDS_PER_DAY = 5
export const OWN_QUESTION_MIN = 3
export const OWN_QUESTION_MAX = 200
export const OWN_ANSWER_MAX = 600

/** Откуда карточка: check — проверка понимания, note — свои заметки, mistake — журнал ошибок. */
export type CardSource = 'check' | OwnCard['source']

interface CardBase {
  id: string
  /** Дата проверки понимания или дата, когда игрок завёл карточку. */
  date: string
  track: string
  question: string
  answer: string
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

/** Первый ответ и его оценка есть только у карточек из проверок понимания, текст ошибки — только у карточек из ошибок. */
export type DeckCard = CardBase &
  (
    | { source: 'check'; cycle: string; firstAnswer: string; verdict: KnowledgeCheck['verdict'] }
    | { source: 'note' }
    | { source: 'mistake'; mistake: string }
  )

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

/** Номер карточки: дата и отпечаток вопроса. Схема одна для проверок понимания и своих карточек. */
export const cardId = (card: { date: string; question: string }) => `${card.date}-${hash(card.question)}`

/** Дата повтора по местному календарю. */
export const reviewDay = (review: DeckReview) => toISO(new Date(review.at))

/**
 * Колода на сегодня: проверки понимания и свои карточки. Если своя карточка совпала номером с проверкой, остаётся проверка.
 * Повтор засчитывается, только если карточку уже пора было повторять:
 * лишние нажатия в тот же день и повторы раньше срока коробку не двигают.
 */
export function buildDeck(checks: { cycle: string; check: KnowledgeCheck }[], reviews: DeckReview[], own: OwnCard[] = []): DeckCard[] {
  const byCard = new Map<string, DeckReview[]>()
  for (const review of [...reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    byCard.set(review.card, [...(byCard.get(review.card) ?? []), review])
  }
  const fresh = (item: { date: string; track: string; question: string; answer: string }): CardBase => ({
    id: cardId(item),
    date: item.date,
    track: item.track,
    question: item.question,
    answer: item.answer,
    box: 0,
    due: addDays(item.date, BOX_DAYS[0]),
    reviews: 0,
    lastOk: null,
    learned: false,
  })
  // Проверки идут первыми: при совпадении номеров место в колоде достаётся им.
  const cards: DeckCard[] = [
    ...checks.map(
      ({ cycle, check }): DeckCard => ({ ...fresh(check), source: 'check', cycle, firstAnswer: check.firstAnswer, verdict: check.verdict }),
    ),
    ...own.map(
      (card): DeckCard =>
        card.source === 'mistake' ? { ...fresh(card), source: 'mistake', mistake: card.mistake ?? '' } : { ...fresh(card), source: 'note' },
    ),
  ]
  const seen = new Set<string>()
  const deck: DeckCard[] = []
  for (const card of cards) {
    // Один и тот же вопрос в один день — одна карточка.
    if (seen.has(card.id)) continue
    seen.add(card.id)
    for (const review of byCard.get(card.id) ?? []) {
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

/**
 * Насколько карточка — слабое место. У проверки это первый ответ; карточка из ошибки стоит наравне с неверным ответом,
 * карточка из заметок — посередине: про неё ещё ничего не известно.
 */
const weakness = (card: DeckCard) => (card.source === 'check' ? VERDICT_ORDER[card.verdict] : card.source === 'mistake' ? 0 : 1)

/** Что повторять сегодня: сначала то, что забыто, потом то, что давно ждёт, потом слабые места. */
export function dueCards(deck: DeckCard[], today: string): DeckCard[] {
  return deck
    .filter((card) => card.due <= today)
    .sort((a, b) => Number(b.lastOk === false) - Number(a.lastOk === false) || a.due.localeCompare(b.due) || weakness(a) - weakness(b))
}

/** Когда придёт ближайшая карточка, если на сегодня ничего нет. */
export const nextDue = (deck: DeckCard[], today: string): string | null =>
  deck
    .map((card) => card.due)
    .filter((due) => due > today)
    .sort()[0] ?? null

/** То, что игрок вводит в форму своей карточки. Текст ошибки есть, когда карточка делается из журнала ошибок. */
export interface OwnCardDraft {
  track: string
  question: string
  answer: string
  mistake?: string | null
}

const text = (value: unknown) => (typeof value === 'string' ? tidy(value) : '')

/** Своя карточка в том виде, в каком она ляжет в файл: текст без лишних пробелов, источник — по тому, есть ли ошибка. */
export function makeOwnCard(draft: OwnCardDraft, date: string): OwnCard {
  const mistake = text(draft.mistake)
  const card: OwnCard = { date, track: draft.track, question: text(draft.question), answer: text(draft.answer), source: mistake ? 'mistake' : 'note' }
  if (mistake) card.mistake = mistake
  return card
}

/** Что не так с самой карточкой: дата, длины, трек, источник. Длины считаются после обрезки краёв и схлопывания пробелов. null — всё в порядке. */
export function ownCardProblem(card: OwnCard, tracks: string[]): string | null {
  const validDate = typeof card.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.date) && toISO(parseISO(card.date)) === card.date
  if (!validDate) return 'дата карточки должна быть в виде ГГГГ-ММ-ДД'
  const question = text(card.question)
  if (!question) return 'напиши вопрос'
  if (question.length < OWN_QUESTION_MIN) return `вопрос короче ${OWN_QUESTION_MIN} знаков`
  if (question.length > OWN_QUESTION_MAX) return `вопрос длиннее ${OWN_QUESTION_MAX} знаков`
  const answer = text(card.answer)
  if (!answer) return 'напиши ответ'
  if (answer.length > OWN_ANSWER_MAX) return `ответ длиннее ${OWN_ANSWER_MAX} знаков`
  if (!tracks.includes(card.track)) return 'выбери трек из плана'
  if (card.source !== 'note' && card.source !== 'mistake') return 'источник карточки — заметки (note) или ошибка (mistake)'
  if (card.source === 'mistake' && !text(card.mistake)) return 'у карточки из ошибки должен быть текст ошибки'
  return null
}

/**
 * Почему карточку нельзя добавить к тем, что уже есть. null — можно.
 * Повтор — тот же номер или тот же вопрос, даже с другой датой и другим регистром букв.
 * Лимит на день считается по дате карточки и только по своим карточкам.
 */
export function newCardProblem(card: OwnCard, tracks: string[], deck: Pick<DeckCard, 'id' | 'question' | 'source' | 'date'>[]): string | null {
  const problem = ownCardProblem(card, tracks)
  if (problem) return problem
  const id = cardId(card)
  const question = text(card.question).toLowerCase()
  if (deck.some((other) => other.id === id || text(other.question).toLowerCase() === question)) return 'такой вопрос уже есть в колоде'
  const sameDay = deck.filter((other) => other.source !== 'check' && other.date === card.date).length
  if (sameDay >= OWN_CARDS_PER_DAY) return `за день не больше ${OWN_CARDS_PER_DAY} своих карточек`
  return null
}

/** Что не так со списком своих карточек из файла: по строке на каждую негодную. Пустой список — всё в порядке. */
export function ownCardsProblems(cards: OwnCard[], tracks: string[]): string[] {
  const problems: string[] = []
  const accepted: Pick<DeckCard, 'id' | 'question' | 'source' | 'date'>[] = []
  cards.forEach((card, i) => {
    const problem = newCardProblem(card, tracks, accepted)
    if (problem) problems.push(`карточка ${i + 1}: ${problem}`)
    else accepted.push({ id: cardId(card), question: card.question, source: card.source, date: card.date })
  })
  return problems
}
