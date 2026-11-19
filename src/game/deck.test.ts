import { describe, expect, it } from 'vitest'
import { offplan, rawCycles, repoCards, repoReviews } from '../data/load'
import type { DeckReview, KnowledgeCheck, OwnCard } from '../data/types'
import {
  BOX_DAYS,
  LAST_BOX,
  OWN_ANSWER_MAX,
  OWN_CARDS_PER_DAY,
  OWN_QUESTION_MAX,
  buildDeck,
  cardId,
  dueCards,
  makeOwnCard,
  newCardProblem,
  nextDue,
  ownCardProblem,
  ownCardsProblems,
} from './deck'
import { buildWorld } from './engine'
import { toISO } from './rules'
import { trophiesFor } from './trophies'

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
    expect(dueCards(deck, '2026-11-19').map((c) => c.question)).toEqual(['Забытая', 'Старая', 'Слабая', 'Хорошая'])
    expect(nextDue(deck, '2026-11-19')).toBe('2026-11-20')
    expect(nextDue(deck, '2026-11-20')).toBeNull()
  })
})

const TRACKS = ['A', 'B', 'C1', 'C2', 'E']
const note = (date: string, question: string, extra: Partial<OwnCard> = {}): OwnCard => ({
  date,
  track: 'B',
  question,
  answer: 'свой ответ',
  source: 'note',
  ...extra,
})
const fromMistake = (date: string, question: string): OwnCard => note(date, question, { source: 'mistake', mistake: 'путал .length и .size' })

describe('свои карточки', () => {
  it('карточка из заметок и карточка из ошибки попадают в колоду рядом с проверками', () => {
    const deck = buildDeck([{ cycle: '01', check: one }], [], [note('2026-11-19', 'Что такое idempotency key?'), fromMistake('2026-11-19', 'Чем .length отличается от .size?')])
    expect(deck.map((c) => c.source)).toEqual(['check', 'note', 'mistake'])
    expect(deck[1]).toMatchObject({ date: '2026-11-19', track: 'B', question: 'Что такое idempotency key?', answer: 'свой ответ' })
    expect(deck[2]).toMatchObject({ source: 'mistake', mistake: 'путал .length и .size' })
  })

  it('первый ответ и вердикт есть только у карточки из проверки', () => {
    const [fromCheck, own] = buildDeck([{ cycle: '01', check: one }], [], [note('2026-11-19', 'Свой вопрос')])
    expect(fromCheck).toMatchObject({ source: 'check', cycle: '01', date: '2026-11-10', track: 'C1', firstAnswer: 'первый ответ', verdict: 'wrong' })
    expect(fromCheck).toMatchObject({ question: one.question, answer: 'правильный ответ' })
    expect(own).not.toHaveProperty('firstAnswer')
    expect(own).not.toHaveProperty('verdict')
  })

  it('номер своей карточки считается так же, как у проверки: дата и отпечаток вопроса', () => {
    const own = note('2026-11-10', one.question)
    expect(cardId(own)).toBe(id)
    expect(buildDeck([], [], [own])[0].id).toBe(id)
  })

  it('своя карточка приходит на повтор на следующий день после своей даты', () => {
    const [card] = buildDeck([], [], [note('2026-11-19', 'Свой вопрос')])
    expect(card).toMatchObject({ box: 0, due: '2026-11-20', reviews: 0, lastOk: null, learned: false })
    expect(dueCards([card], '2026-11-19')).toHaveLength(0)
    expect(dueCards([card], '2026-11-20')).toHaveLength(1)
  })

  it('у своей карточки те же коробки и те же правила зачёта', () => {
    const own = note('2026-11-10', 'Свой вопрос')
    const ownId = cardId(own)
    const of = (reviews: DeckReview[]) => buildDeck([], reviews, [own])[0]
    // раньше срока и повторно в тот же день — не в счёт
    expect(of([at('2026-11-10', true, ownId)])).toMatchObject({ box: 0, reviews: 0 })
    expect(of([at('2026-11-11', true, ownId), at('2026-11-11', true, ownId)])).toMatchObject({ box: 1, due: '2026-11-14', reviews: 1 })
    // «не знал» возвращает в первую коробку
    expect(of([at('2026-11-11', true, ownId), at('2026-11-14', false, ownId)])).toMatchObject({ box: 0, due: '2026-11-15', lastOk: false })
    // четыре верных ответа в срок — выучена
    const learned = of([at('2026-11-11', true, ownId), at('2026-11-14', true, ownId), at('2026-11-21', true, ownId), at('2026-12-05', true, ownId)])
    expect(learned).toMatchObject({ box: LAST_BOX, learned: true, due: '2027-01-04', reviews: 4 })
  })

  it('если своя карточка совпала номером с проверкой понимания, остаётся проверка', () => {
    const twin = note('2026-11-10', one.question, { answer: 'другой ответ' })
    const deck = buildDeck([{ cycle: '01', check: one }], [at('2026-11-11', true)], [twin, note('2026-11-10', 'Отдельный вопрос')])
    expect(deck).toHaveLength(2)
    expect(deck[0]).toMatchObject({ id, source: 'check', answer: 'правильный ответ', box: 1 })
    expect(deck[1]).toMatchObject({ source: 'note', question: 'Отдельный вопрос' })
  })

  it('две свои карточки с одним номером — одна карточка, первая по порядку', () => {
    const deck = buildDeck([], [], [note('2026-11-19', 'Вопрос', { answer: 'первый' }), note('2026-11-19', 'Вопрос', { answer: 'второй' })])
    expect(deck).toHaveLength(1)
    expect(deck[0].answer).toBe('первый')
  })

  it('в очереди на сегодня карточка из ошибки стоит наравне с неверным первым ответом, из заметок — перед верным', () => {
    const deck = buildDeck(
      [check('2026-11-05', 'Проверка: верно', 'correct'), check('2026-11-05', 'Проверка: частично', 'partial')].map((c) => ({ cycle: '01', check: c })),
      [],
      [note('2026-11-05', 'Заметка'), fromMistake('2026-11-05', 'Ошибка'), note('2026-11-01', 'Давняя заметка')],
    )
    expect(dueCards(deck, '2026-11-19').map((c) => c.question)).toEqual(['Давняя заметка', 'Ошибка', 'Проверка: частично', 'Заметка', 'Проверка: верно'])
  })

  it('трофей «Знаю наизусть» считает выученные карточки любого источника', () => {
    const own = [...Array(5)].map((_, i) => (i % 2 ? note('2026-11-10', `Заметка ${i}`) : fromMistake('2026-11-10', `Ошибка ${i}`)))
    const checks = [...Array(5)].map((_, i) => ({ cycle: '01', check: check('2026-11-10', `Проверка ${i}`) }))
    const ids = [...checks.map((c) => cardId(c.check)), ...own.map(cardId)]
    const days = ['2026-11-11', '2026-11-14', '2026-11-21', '2026-12-05']
    const all = ids.flatMap((card) => days.map((day) => at(day, true, card)))
    const trophy = (reviews: DeckReview[]) => trophiesFor([], buildDeck(checks, reviews, own)).find((t) => t.id === 'deck')
    // девять выучено: у последней своей карточки нет четвёртого ответа
    expect(trophy(all.slice(0, -1))).toMatchObject({ earned: false, progress: '9 из 10' })
    expect(trophy(all)).toMatchObject({ earned: true, progress: '10 из 10' })
  })
})

describe('проверка своей карточки', () => {
  const good = note('2026-11-19', 'Что такое idempotency key?')

  it('текст приводится в порядок, источник — по тому, есть ли ошибка', () => {
    expect(makeOwnCard({ track: 'B', question: '  Что   такое\nidempotency key? ', answer: ' ключ,\n\nпо которому повтор запроса не создаёт дубль ' }, '2026-11-19')).toEqual({
      date: '2026-11-19',
      track: 'B',
      question: 'Что такое idempotency key?',
      answer: 'ключ, по которому повтор запроса не создаёт дубль',
      source: 'note',
    })
    const made = makeOwnCard({ track: 'A', question: 'Вопрос', answer: 'Ответ', mistake: ' путал .length  и .size ' }, '2026-11-19')
    expect(made).toMatchObject({ source: 'mistake', mistake: 'путал .length и .size' })
    // порядок полей — как в data/deck.json
    expect(Object.keys(made)).toEqual(['date', 'track', 'question', 'answer', 'source', 'mistake'])
    expect(makeOwnCard({ track: 'A', question: 'Вопрос', answer: 'Ответ', mistake: '  ' }, '2026-11-19')).not.toHaveProperty('mistake')
  })

  it('годная карточка проходит, границы длин включены', () => {
    expect(ownCardProblem(good, TRACKS)).toBeNull()
    expect(ownCardProblem(fromMistake('2026-11-19', 'Вопрос'), TRACKS)).toBeNull()
    expect(ownCardProblem(note('2026-11-19', 'Кто?', { answer: 'я' }), TRACKS)).toBeNull()
    expect(ownCardProblem(note('2026-11-19', 'в'.repeat(OWN_QUESTION_MAX), { answer: 'о'.repeat(OWN_ANSWER_MAX) }), TRACKS)).toBeNull()
    // длина считается после обрезки краёв и схлопывания пробелов
    expect(ownCardProblem(note('2026-11-19', `  ${'в'.repeat(OWN_QUESTION_MAX)}  `), TRACKS)).toBeNull()
  })

  it('называет причину отказа по-русски', () => {
    expect(ownCardProblem(note('2026-11-19', '   '), TRACKS)).toBe('напиши вопрос')
    expect(ownCardProblem(note('2026-11-19', 'Я?'), TRACKS)).toBe('вопрос короче 3 знаков')
    expect(ownCardProblem(note('2026-11-19', 'а  б'), TRACKS)).toBeNull()
    expect(ownCardProblem(note('2026-11-19', ' а '), TRACKS)).toBe('вопрос короче 3 знаков')
    expect(ownCardProblem(note('2026-11-19', 'в'.repeat(OWN_QUESTION_MAX + 1)), TRACKS)).toBe('вопрос длиннее 200 знаков')
    expect(ownCardProblem({ ...good, answer: ' ' }, TRACKS)).toBe('напиши ответ')
    expect(ownCardProblem({ ...good, answer: 'о'.repeat(OWN_ANSWER_MAX + 1) }, TRACKS)).toBe('ответ длиннее 600 знаков')
    expect(ownCardProblem({ ...good, track: 'Z' }, TRACKS)).toBe('выбери трек из плана')
    expect(ownCardProblem({ ...good, track: 'retro' }, TRACKS)).toBe('выбери трек из плана')
    expect(ownCardProblem({ ...good, date: '19.11.2026' }, TRACKS)).toBe('дата карточки должна быть в виде ГГГГ-ММ-ДД')
    expect(ownCardProblem({ ...good, date: '2026-02-30' }, TRACKS)).toBe('дата карточки должна быть в виде ГГГГ-ММ-ДД')
    expect(ownCardProblem({ ...good, source: 'video' as OwnCard['source'] }, TRACKS)).toBe('источник карточки — заметки (note) или ошибка (mistake)')
    expect(ownCardProblem({ ...good, source: 'mistake' }, TRACKS)).toBe('у карточки из ошибки должен быть текст ошибки')
    // запись из файла может оказаться без поля: это отказ, а не падение
    expect(ownCardProblem({ date: '2026-11-19', track: 'B', source: 'note' } as OwnCard, TRACKS)).toBe('напиши вопрос')
  })

  it('повтор — тот же номер или тот же вопрос, даже с другой датой и другим регистром', () => {
    const deck = buildDeck([{ cycle: '01', check: one }], [], [good])
    expect(newCardProblem(note('2026-11-19', 'Новый вопрос'), TRACKS, deck)).toBeNull()
    expect(newCardProblem(good, TRACKS, deck)).toBe('такой вопрос уже есть в колоде')
    expect(newCardProblem(note('2026-11-25', 'что такое IDEMPOTENCY key?'), TRACKS, deck)).toBe('такой вопрос уже есть в колоде')
    // вопрос уже есть среди проверок понимания
    expect(newCardProblem(note('2026-11-25', one.question), TRACKS, deck)).toBe('такой вопрос уже есть в колоде')
    // сначала проверяется сама карточка
    expect(newCardProblem({ ...good, answer: '' }, TRACKS, deck)).toBe('напиши ответ')
  })

  it(`за день — не больше ${OWN_CARDS_PER_DAY} своих карточек, считая по дате карточки`, () => {
    expect(OWN_CARDS_PER_DAY).toBe(5)
    const day = (date: string, n: number) => [...Array(n)].map((_, i) => (i % 2 ? note(date, `Вопрос ${date} ${i}`) : fromMistake(date, `Вопрос ${date} ${i}`)))
    // проверки понимания того же дня в лимит не идут
    const checks = [...Array(6)].map((_, i) => ({ cycle: '01', check: check('2026-11-19', `Проверка ${i}`) }))
    const four = buildDeck(checks, [], day('2026-11-19', 4))
    expect(newCardProblem(note('2026-11-19', 'Пятая'), TRACKS, four)).toBeNull()
    const five = buildDeck(checks, [], day('2026-11-19', 5))
    expect(newCardProblem(note('2026-11-19', 'Шестая'), TRACKS, five)).toBe('за день не больше 5 своих карточек')
    expect(newCardProblem(fromMistake('2026-11-19', 'Шестая'), TRACKS, five)).toBe('за день не больше 5 своих карточек')
    // на другую дату место есть
    expect(newCardProblem(note('2026-11-20', 'Завтрашняя'), TRACKS, five)).toBeNull()
  })

  it('список карточек из файла проверяется целиком: негодные названы по номерам', () => {
    const cards = [...Array(5)].map((_, i) => note('2026-11-19', `Вопрос ${i}`))
    expect(ownCardsProblems(cards, TRACKS)).toEqual([])
    expect(ownCardsProblems([], TRACKS)).toEqual([])
    expect(
      ownCardsProblems([...cards, note('2026-11-19', 'Шестая за день'), note('2026-11-20', 'вопрос 0'), note('2026-11-20', 'Без трека', { track: 'Z' }), note('2026-11-20', 'Годная')], TRACKS),
    ).toEqual(['карточка 6: за день не больше 5 своих карточек', 'карточка 7: такой вопрос уже есть в колоде', 'карточка 8: выбери трек из плана'])
  })
})

describe('живые данные: колода', () => {
  const world = buildWorld(rawCycles, offplan, toISO(new Date()), { purchases: [], repairs: [], reviews: repoReviews, cards: repoCards })

  it('каждая проверка понимания стала карточкой', () => {
    const checks = rawCycles.flatMap((c) => c.progress.knowledgeChecks)
    expect(world.deck.filter((c) => c.source === 'check')).toHaveLength(new Set(checks.map(cardId)).size)
  })

  it('каждая своя карточка из репозитория стоит в колоде или уступила место проверке с тем же номером', () => {
    const sources = new Map(world.deck.map((c) => [c.id, c.source]))
    for (const card of repoCards) expect(sources.has(cardId(card)), card.question).toBe(true)
    const own = new Set(repoCards.map(cardId).filter((id) => sources.get(id) !== 'check'))
    expect(world.deck.filter((c) => c.source !== 'check')).toHaveLength(own.size)
  })

  it('каждый записанный ответ относится к существующей карточке', () => {
    const ids = new Set(world.deck.map((c) => c.id))
    for (const review of repoReviews) expect(ids.has(review.card), review.card).toBe(true)
  })
})
