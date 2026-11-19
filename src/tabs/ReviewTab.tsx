import { useState } from 'react'
import type { DeckReview } from '../data/types'
import { BOX_DAYS, LAST_BOX, dueCards, nextDue, type DeckCard } from '../game/deck'
import type { World } from '../game/engine'
import { CopyButton, DAYS, TrackBadge, fmtDate, plural } from '../ui/bits'

export interface DeckApi {
  today: string
  /** Ответы по карточкам, которые есть только в этом браузере. */
  unsynced: DeckReview[]
  review: (card: string, ok: boolean) => void
  /** Отменить последний ответ, пока он не перенесён в репозиторий. */
  undo: (() => void) | null
}

const CARDS: [string, string, string] = ['карточка', 'карточки', 'карточек']
const ANSWERS: [string, string, string] = ['ответ', 'ответа', 'ответов']
const VERDICT = { correct: 'сразу верно', partial: 'частично', wrong: 'неверно' }

const boxName = (card: DeckCard) => (card.learned ? 'выучена' : `коробка ${card.box + 1} из ${BOX_DAYS.length}`)
const inDays = (days: number) => `через ${days} ${plural(days, DAYS)}`

export function ReviewTab({ world, deck: api }: { world: World; deck: DeckApi }) {
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

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Повтор</h2>
        <p className="muted">
          Колода собирается из проверок понимания на занятиях: {deck.length} {plural(deck.length, CARDS)}, выучено {learned}. Карточка
          возвращается через растущие промежутки — так знание переходит из «помню сегодня» в «помню через месяц».
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
                <TrackBadge code={card.check.track} />
                <span className="chip">{boxName(card)}</span>
              </span>
            </div>
            <p className="deck-question">{card.check.question}</p>
            {!open ? (
              <>
                <p className="muted small">Ответь вслух или про себя, потом открой ответ.</p>
                <button className="btn btn-primary" onClick={() => setOpenFor(card.id)}>
                  Показать ответ
                </button>
              </>
            ) : (
              <>
                <p className="deck-answer">{card.check.answer}</p>
                <p className="muted small">
                  Твой первый ответ {fmtDate(card.check.date)} ({VERDICT[card.check.verdict]}): «{card.check.firstAnswer}»
                </p>
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
                ? 'Карточек пока нет: они появляются из проверок понимания на занятиях.'
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

      {api.unsynced.length > 0 && (
        <div className="card sync-note">
          <p>
            <b>Только в этом браузере:</b> {api.unsynced.length} {plural(api.unsynced.length, ANSWERS)} по карточкам. Чтобы колода была
            одинаковой на всех устройствах, отдай запись Claude Code — он добавит её в <code>data/deck.json</code>.
          </p>
          <CopyButton text={JSON.stringify(api.unsynced)} label="Скопировать запись" />
        </div>
      )}

      {deck.length > 0 && (
        <div className="card">
          <h3>Коробки</h3>
          <p className="muted small">
            Верный ответ переносит карточку в следующую коробку, неверный возвращает в первую. В последней коробке карточка считается
            выученной.
          </p>
          <div className="box-row">
            {BOX_DAYS.map((days, box) => {
              const count = deck.filter((c) => c.box === box).length
              return (
                <div key={box} className={count ? 'box is-full' : 'box'}>
                  <b>{count}</b>
                  <span className="muted small">{box === LAST_BOX ? 'выучено' : inDays(days)}</span>
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
                    <span>{c.check.question}</span>
                    <span className="chips">
                      <TrackBadge code={c.check.track} />
                      <span className="chip">{c.learned ? 'выучена' : c.due <= api.today ? 'пора повторить' : `повтор ${fmtDate(c.due)}`}</span>
                    </span>
                  </summary>
                  <p>{c.check.answer}</p>
                  <p className="muted small">
                    Первый ответ {fmtDate(c.check.date)} ({VERDICT[c.check.verdict]}): «{c.check.firstAnswer}». Повторов: {c.reviews}.
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" id="mistakes">
        <h3>Ошибки</h3>
        <p className="muted">
          Что забыл или перепутал. Ошибка побеждена, когда при повторе задачи она не повторилась. В работе {mistakes.length - beaten},
          побеждено {beaten}.
        </p>
        {mistakes.length === 0 ? (
          <p className="muted">Пока пусто.</p>
        ) : (
          <ul className="mistake-list">
            {mistakes.map((m) => (
              <li key={m.date + m.text} className={m.beaten ? 'is-beaten' : undefined}>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
