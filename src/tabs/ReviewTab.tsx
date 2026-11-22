import { useState, type FormEvent } from 'react'
import type { DeckReview, Mistake, OwnCard } from '../data/types'
import {
  BOX_DAYS,
  LAST_BOX,
  OWN_ANSWER_MAX,
  OWN_CARDS_PER_DAY,
  OWN_QUESTION_MAX,
  dueCards,
  nextDue,
  type CardSource,
  type DeckCard,
  type OwnCardDraft,
} from '../game/deck'
import type { World } from '../game/engine'
import { tidy } from '../game/rewards'
import type { SyncSummary } from '../game/sync'
import { DAYS, TrackBadge, fmtDate, plural } from '../ui/bits'
import { SyncNote } from './SyncNote'

export interface DeckApi {
  today: string
  /** То, что есть только в этом браузере: ответы по карточкам и свои карточки. */
  unsynced: { reviews: DeckReview[]; cards: OwnCard[] }
  review: (card: string, ok: boolean) => void
  /** Отменить последний ответ, пока он не перенесён в репозиторий. */
  undo: (() => void) | null
  /** Завести свою карточку. Возвращает причину отказа или null. */
  addCard: (draft: OwnCardDraft) => string | null
  /** Карточка есть только в этом браузере: её ещё можно убрать. */
  isFresh: (id: string) => boolean
  /** Убрать свою карточку вместе с ответами по ней. Перенесённую в репозиторий убрать нельзя. */
  removeCard: (id: string) => void
}

const CARDS: [string, string, string] = ['карточка', 'карточки', 'карточек']
const VERDICT = { correct: 'сразу верно', partial: 'частично', wrong: 'неверно' }
const SOURCE: Record<CardSource, string> = { check: 'из проверки', note: 'из заметок', mistake: 'из ошибки' }

const boxName = (card: DeckCard) => (card.learned ? 'выучена' : `коробка ${card.box + 1} из ${BOX_DAYS.length}`)
const inDays = (days: number) => `через ${days} ${plural(days, DAYS)}`

/** Откуда карточка: у проверки понимания — первый ответ (firstLabel — как его назвать), у своей — заметки или ошибка. */
function origin(card: DeckCard, firstLabel: string): string {
  if (card.source === 'check') return `${firstLabel} ${fmtDate(card.date)} (${VERDICT[card.verdict]}): «${card.firstAnswer}»`
  if (card.source === 'mistake') return `Своя карточка от ${fmtDate(card.date)}. Из ошибки${card.mistake ? `: «${card.mistake}»` : ''}`
  return `Своя карточка от ${fmtDate(card.date)}, из заметок`
}

interface TrackOption {
  code: string
  name: string
}

/** Форма своей карточки. С ошибкой из журнала — карточка из ошибки, без неё — из заметок. */
function CardForm({
  api,
  tracks,
  track: startTrack,
  mistake,
  onAdded,
  onCancel,
}: {
  api: DeckApi
  tracks: TrackOption[]
  track: string
  mistake?: Mistake
  onAdded?: () => void
  onCancel?: () => void
}) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [track, setTrack] = useState(startTrack)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const add = (event: FormEvent) => {
    event.preventDefault()
    const problem = api.addCard({ track, question, answer, mistake: mistake?.text })
    setError(problem)
    setAdded(!problem)
    if (problem) return
    setQuestion('')
    setAnswer('')
    onAdded?.()
  }
  return (
    <>
      <form className="own-form" onSubmit={add}>
        {mistake && (
          <p className="own-origin wide">
            Из ошибки {fmtDate(mistake.date)}: «{mistake.text}»
          </p>
        )}
        <label className="wide">
          Вопрос
          <textarea
            className="field"
            rows={2}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              setAdded(false)
            }}
            maxLength={OWN_QUESTION_MAX}
            placeholder={mistake ? 'Вопрос, на котором эта ошибка больше не пройдёт' : 'Например: чем implementation отличается от api?'}
            autoFocus={!!mistake}
          />
        </label>
        <label className="wide">
          Ответ
          <textarea
            className="field"
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={OWN_ANSWER_MAX}
            placeholder="Своими словами, как объяснил бы коллеге"
          />
        </label>
        <label>
          Трек
          <select className="field" value={track} onChange={(e) => setTrack(e.target.value)}>
            {tracks.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} · {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="own-actions">
          <button className="btn" type="submit">
            Добавить в колоду
          </button>
          {onCancel && (
            <button className="btn btn-quiet" type="button" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="form-error" role="alert">
          Не добавлено: {error}.
        </p>
      )}
      {added && !error && (
        <p className="muted small" role="status">
          Карточка в колоде: придёт на повтор завтра.
        </p>
      )}
    </>
  )
}

export function ReviewTab({ world, deck: api, sync }: { world: World; deck: DeckApi; sync: SyncSummary }) {
  const deck = world.deck
  const due = dueCards(deck, api.today)
  const card = due[0]
  const next = nextDue(deck, api.today)
  const learned = deck.filter((c) => c.learned).length
  // Ответ открыт только для той карточки, на которой его открыли.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = !!card && openFor === card.id
  const answer = (ok: boolean) => {
    api.review(card.id, ok)
    setOpenFor(null)
  }

  const mistakes = [...world.mistakes].sort((a, b) => Number(!!a.beaten) - Number(!!b.beaten) || b.date.localeCompare(a.date))
  const beaten = mistakes.filter((m) => m.beaten).length
  const problemTitle = (id: number) => world.cycles.flatMap((c) => c.problems).find((p) => p.id === id)?.title
  const all = [...deck].sort((a, b) => a.due.localeCompare(b.due))

  // Свои карточки: треки для формы, счёт за сегодня, открытая форма под ошибкой и карточка, которую собираются убрать.
  const tracks: TrackOption[] = world.tracks.map((t) => ({ code: t.track.code, name: t.track.name }))
  const hasTrack = (code: string | undefined) => tracks.some((t) => t.code === code)
  const todayTrack = world.active.current?.day.plan.trackCode
  const defaultTrack = hasTrack(todayTrack) ? todayTrack! : (tracks[0]?.code ?? '')
  const ownToday = deck.filter((c) => c.source !== 'check' && c.date === api.today).length
  // Форма своей карточки нужна изредка: она раскрывается по кнопке.
  const [adding, setAdding] = useState(false)
  const [cardFor, setCardFor] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const madeFrom = (m: Mistake) => deck.filter((c) => c.source === 'mistake' && tidy(c.mistake) === tidy(m.text)).length

  const fresh = api.unsynced

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Повтор</h2>
        <p className="muted">
          В колоде {deck.length} {plural(deck.length, CARDS)}, выучено {learned}. Карточка возвращается через растущие промежутки.
        </p>
      </div>

      <div className="card deck-card" aria-live="polite">
        {card ? (
          <>
            <div className="deck-top">
              <span className="eyebrow">
                К повтору сегодня: {due.length} {plural(due.length, CARDS)}
              </span>
              <span className="chips">
                <TrackBadge code={card.track} />
                <span className="chip">{boxName(card)}</span>
              </span>
            </div>
            <p className="deck-question">{card.question}</p>
            {!open ? (
              <>
                <p className="muted small">Ответь вслух или про себя, потом открой ответ.</p>
                <button className="btn btn-primary" onClick={() => setOpenFor(card.id)}>
                  Показать ответ
                </button>
              </>
            ) : (
              <>
                <p className="deck-answer">{card.answer}</p>
                <p className="muted small">{origin(card, 'Твой первый ответ')}.</p>
                <div className="row">
                  <button className="btn btn-primary" onClick={() => answer(true)}>
                    Знал
                  </button>
                  <button className="btn" onClick={() => answer(false)}>
                    Не знал
                  </button>
                </div>
                <p className="muted small">
                  «Знал» — карточка вернётся {inDays(BOX_DAYS[Math.min(card.box + 1, LAST_BOX)])}, «Не знал» — завтра. Отмечай честно:
                  очков за колоду нет, она для тебя.
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <h3>На сегодня всё</h3>
            <p className="muted">
              {deck.length === 0
                ? 'Карточек пока нет: они появляются из проверок понимания на занятиях, а свою можно завести ниже.'
                : next
                  ? `Следующая карточка придёт ${fmtDate(next)}.`
                  : 'Все карточки выучены.'}
            </p>
          </>
        )}
        {api.undo && (
          <button className="btn btn-quiet" onClick={api.undo}>
            Отменить последний ответ
          </button>
        )}
      </div>

      {(fresh.reviews.length > 0 || fresh.cards.length > 0) && <SyncNote sync={sync} />}

      {adding ? (
        <div className="card" id="own-card">
          <h3>Своя карточка</h3>
          <p className="muted small">
            В день — не больше {OWN_CARDS_PER_DAY} своих карточек, сегодня добавлено {ownToday}.
          </p>
          <CardForm api={api} tracks={tracks} track={defaultTrack} onCancel={() => setAdding(false)} />
          <details className="how">
            <summary>О своих карточках</summary>
            <p>
              Вопрос из своих заметок и ответ своими словами. Карточка придёт на повтор завтра и дальше идёт по тем же коробкам.
            </p>
            <p>
              Вопрос — до {OWN_QUESTION_MAX} знаков, ответ — до {OWN_ANSWER_MAX}. Карточку из ошибки удобнее завести в журнале ошибок
              ниже.
            </p>
          </details>
        </div>
      ) : (
        <button className="btn own-open" id="own-card" onClick={() => setAdding(true)}>
          Добавить свою карточку
        </button>
      )}

      {deck.length > 0 && (
        <div className="card">
          <h3>Коробки</h3>
          <p className="muted small">
            Через сколько карточка вернётся. Верный ответ переносит её в следующую коробку, неверный возвращает в первую.
          </p>
          <div className="box-row">
            {BOX_DAYS.map((days, box) => {
              const count = deck.filter((c) => c.box === box).length
              return (
                <div key={box} className={count ? 'box is-full' : 'box'}>
                  <b>{count}</b>
                  <span className="muted small">{box === LAST_BOX ? 'выучено' : box === 0 ? 'завтра' : `${days} дн.`}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {deck.length > 0 && (
        <div className="card">
          <h3>Все карточки</h3>
          <ul className="deck-list">
            {all.map((c) => (
              <li key={c.id}>
                <details>
                  <summary>
                    <span>{c.question}</span>
                    <span className="chips">
                      <TrackBadge code={c.track} />
                      <span className="chip">{SOURCE[c.source]}</span>
                      <span className="chip">{c.learned ? 'выучена' : c.due <= api.today ? 'пора повторить' : `повтор ${fmtDate(c.due)}`}</span>
                    </span>
                  </summary>
                  <p>{c.answer}</p>
                  <p className="muted small">
                    {origin(c, 'Первый ответ')}. Повторов: {c.reviews}.
                  </p>
                  {api.isFresh(c.id) &&
                    (removing === c.id ? (
                      <div className="row own-confirm">
                        <span className="small">Убрать карточку вместе с ответами по ней?</span>
                        <button
                          className="btn"
                          onClick={() => {
                            api.removeCard(c.id)
                            setRemoving(null)
                          }}
                        >
                          Убрать
                        </button>
                        <button className="btn btn-quiet" onClick={() => setRemoving(null)}>
                          Оставить
                        </button>
                      </div>
                    ) : (
                      <p className="muted small">
                        Карточка пока только в этом браузере.{' '}
                        <button className="link-btn" onClick={() => setRemoving(c.id)} aria-label={`Убрать карточку: ${c.question}`}>
                          Убрать карточку
                        </button>
                      </p>
                    ))}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" id="mistakes">
        <h3>Ошибки</h3>
        {mistakes.length > 0 && (
          <p className="muted">
            В работе {mistakes.length - beaten}, побеждено {beaten}.
          </p>
        )}
        {mistakes.length === 0 ? (
          <p className="muted">Пока пусто.</p>
        ) : (
          <ul className="mistake-list">
            {mistakes.map((m) => {
              const key = m.date + m.text
              const made = madeFrom(m)
              return (
                <li key={key} className={m.beaten ? 'is-beaten' : undefined}>
                  <div className="mistake-text">
                    <span>{m.text}</span>
                    <span className="muted small">
                      {fmtDate(m.date)}
                      {m.problemId ? ` · задача ${m.problemId}${problemTitle(m.problemId) ? ' ' + problemTitle(m.problemId) : ''}` : ''}
                    </span>
                  </div>
                  <div className="chips">
                    <TrackBadge code={m.track} />
                    <span className={m.beaten ? 'pill pill-core' : 'pill pill-current'}>{m.beaten ? 'побеждена' : 'в работе'}</span>
                  </div>
                  {((!m.beaten && cardFor !== key) || made > 0) && (
                    <div className="mistake-act muted small">
                      {!m.beaten && cardFor !== key && (
                        <button className="link-btn" onClick={() => setCardFor(key)} aria-label={`Сделать карточкой ошибку: ${m.text}`}>
                          Сделать карточкой
                        </button>
                      )}
                      {made > 0 && (
                        <span>
                          В колоде из этой ошибки: {made} {plural(made, CARDS)}
                        </span>
                      )}
                    </div>
                  )}
                  {!m.beaten && cardFor === key && (
                    <div className="own-inline">
                      <CardForm
                        api={api}
                        tracks={tracks}
                        track={hasTrack(m.track) ? m.track : defaultTrack}
                        mistake={m}
                        onAdded={() => setCardFor(null)}
                        onCancel={() => setCardFor(null)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <details className="how">
          <summary>Что считается ошибкой</summary>
          <p>Что забыл или перепутал. Ошибка побеждена, когда при повторе задачи она не повторилась.</p>
          <p>Из ошибки в работе можно сделать карточку: вопрос придёт на повтор вместе с остальной колодой.</p>
        </details>
      </div>
    </div>
  )
}
