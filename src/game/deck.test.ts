import { describe, expect, it } from 'vitest'
import { offplan, rawCycles, repoReviews } from '../data/load'
import type { DeckReview, KnowledgeCheck } from '../data/types'
import { BOX_DAYS, LAST_BOX, buildDeck, cardId, dueCards, nextDue } from './deck'
import { buildWorld } from './engine'
import { toISO } from './rules'

const check = (date: string, question: string, verdict: KnowledgeCheck['verdict'] = 'wrong'): KnowledgeCheck => ({
  date,
  track: 'C1',
  question,
  firstAnswer: 'первый ответ',
  verdict,
  answer: 'правильный ответ',
})
const one = check('2026-11-10', 'Что делает wrapper?')
const id = cardId(one)
/** Ответ в полдень по местному времени. */
const at = (day: string, ok: boolean, card = id): DeckReview => ({ card, at: new Date(`${day}T12:00:00`).toISOString(), ok })
const deckOf = (reviews: DeckReview[]) => buildDeck([{ cycle: '01', check: one }], reviews)[0]

describe('колода', () => {
  it('номер карточки не меняется и зависит от даты и вопроса', () => {
    expect(cardId(one)).toBe(cardId({ ...one }))
    expect(cardId(one)).toMatch(/^2026-11-10-[a-z0-9]+$/)
    expect(cardId(check('2026-11-10', 'Другой вопрос'))).not.toBe(id)
    expect(cardId(check('2026-11-11', one.question))).not.toBe(id)
  })

  it('новая карточка лежит в первой коробке и ждёт повтора на следующий день', () => {
    expect(deckOf([])).toMatchObject({ box: 0, due: '2026-11-11', reviews: 0, lastOk: null, learned: false })
    expect(BOX_DAYS).toEqual([1, 3, 7, 14, 30])
  })

  it('«знал» переносит в следующую коробку, промежутки растут', () => {
    expect(deckOf([at('2026-11-11', true)])).toMatchObject({ box: 1, due: '2026-11-14', reviews: 1, lastOk: true })
    expect(deckOf([at('2026-11-11', true), at('2026-11-14', true)])).toMatchObject({ box: 2, due: '2026-11-21' })
    expect(deckOf([at('2026-11-11', true), at('2026-11-14', true), at('2026-11-21', true)])).toMatchObject({ box: 3, due: '2026-12-05' })
  })

  it('выученной карточка становится после четырёх верных ответов в срок — не раньше чем через 25 дней', () => {
    const card = deckOf([at('2026-11-11', true), at('2026-11-14', true), at('2026-11-21', true), at('2026-12-05', true)])
    expect(card).toMatchObject({ box: LAST_BOX, learned: true, due: '2027-01-04', reviews: 4 })
  })

  it('«не знал» возвращает в первую коробку: карточка придёт завтра', () => {
    const card = deckOf([at('2026-11-11', true), at('2026-11-14', true), at('2026-11-21', false)])
    expect(card).toMatchObject({ box: 0, due: '2026-11-22', lastOk: false, reviews: 3 })
  })

  it('ответ раньше срока и повторные нажатия в тот же день коробку не двигают', () => {
    // раньше срока: карточка ждёт 11-го
    expect(deckOf([at('2026-11-10', true)])).toMatchObject({ box: 0, reviews: 0 })
    // три «знал» в один день — засчитан один
    expect(deckOf([at('2026-11-11', true), at('2026-11-11', true), at('2026-11-11', true)])).toMatchObject({ box: 1, reviews: 1 })
    // после «не знал» в тот же день исправить нельзя
    expect(deckOf([at('2026-11-11', false), at('2026-11-11', true)])).toMatchObject({ box: 0, due: '2026-11-12', lastOk: false })
  })

  it('чужие ответы и повтор вопроса в тот же день не мешают', () => {
    const deck = buildDeck(
      [
        { cycle: '01', check: one },
        { cycle: '01', check: { ...one } },
      ],
      [at('2026-11-11', true, 'нет-такой-карточки')],
    )
    expect(deck).toHaveLength(1)
    expect(deck[0]).toMatchObject({ box: 0, reviews: 0 })
  })

  it('сегодня повторяют то, что пора: сначала забытое, потом давно ждущее, потом слабые первые ответы', () => {
    const old = check('2026-11-01', 'Старая')
    const weak = check('2026-11-05', 'Слабая', 'wrong')
    const good = check('2026-11-05', 'Хорошая', 'correct')
    const failed = check('2026-11-08', 'Забытая')
    const future = check('2026-11-19', 'Свежая')
    const deck = buildDeck(
      [old, weak, good, failed, future].map((c) => ({ cycle: '01', check: c })),
      [at('2026-11-09', false, cardId(failed))],
    )
    expect(dueCards(deck, '2026-11-19').map((c) => c.check.question)).toEqual(['Забытая', 'Старая', 'Слабая', 'Хорошая'])
    expect(nextDue(deck, '2026-11-19')).toBe('2026-11-20')
    expect(nextDue(deck, '2026-11-20')).toBeNull()
  })
})

describe('живые данные: колода', () => {
  const world = buildWorld(rawCycles, offplan, toISO(new Date()), { purchases: [], repairs: [], reviews: repoReviews })

  it('каждая проверка понимания стала карточкой', () => {
    const checks = rawCycles.flatMap((c) => c.progress.knowledgeChecks)
    expect(world.deck).toHaveLength(new Set(checks.map(cardId)).size)
  })

  it('каждый записанный ответ относится к существующей карточке', () => {
    const ids = new Set(world.deck.map((c) => c.id))
    for (const review of repoReviews) expect(ids.has(review.card), review.card).toBe(true)
  })
})
