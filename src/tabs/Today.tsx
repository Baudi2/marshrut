import { earnedText, type LastTurn } from '../game/chronicle'
import { dueCards } from '../game/deck'
import type { CycleView, World } from '../game/engine'
import { toISO } from '../game/rules'
import { fullPeriod } from '../game/summary'
import type { SyncSummary } from '../game/sync'
import { SyncNote } from './SyncNote'
import { DAYS, RichText, Timer, TrackBadge, fmtDate, plural } from '../ui/bits'

const MODE: Record<string, string> = { light: 'лёгкий день', deep: 'глубокий день', retro: 'ретро' }

/**
 * Итог последнего занятия: самое важное из последней записи летописи и что будет готово дальше.
 * Тихая карточка: без счётчиков и значков, со ссылкой на всю летопись.
 */
function TurnCard({ turn }: { turn: LastTurn }) {
  const { entry, highlights, next } = turn
  const earned = earnedText(entry.earned)
  return (
    <div className="card chron-turn">
      <div className="chron-turn-head">
        <div className="eyebrow">
          Ход {entry.turn} · {entry.title}
        </div>
        <h3>Итог занятия {fmtDate(entry.date)}</h3>
      </div>
      {entry.insights.length > 0 && <blockquote className="chron-quote">{entry.insights[0]}</blockquote>}
      {highlights.length > 0 ? (
        <ul className="plain">
          {highlights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        entry.topics.length > 0 && <p className="muted">Темы: {entry.topics.join(' · ')}</p>
      )}
      {earned && <p className="muted small">За день: {earned}</p>}
      {next.length > 0 && (
        <div className="chron-block">
          <h4>Что будет готово дальше</h4>
          <ul className="plain">
            {next.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <a className="chron-turn-link" href="#/chronicle">
        Вся летопись →
      </a>
    </div>
  )
}

/** Что ждёт внимания кроме шага: колода и открытый недельный тест. Строки-ссылки, без пояснений. */
function Attention({ due, tests }: { due: number; tests: number[] }) {
  if (due === 0 && tests.length === 0) return null
  return (
    <nav className="card link-list" aria-label="Что ещё ждёт">
      {due > 0 && (
        <a href="#/review">
          <span>
            <b>Колода</b>
            <span className="muted small">
              к повтору сегодня {due} {plural(due, ['карточка', 'карточки', 'карточек'])}
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      )}
      {tests.length > 0 && (
        <a href="#/path">
          <span>
            <b>
              Тест {tests.length > 1 ? 'недель' : 'недели'} {tests.join(', ')} открыт
            </b>
            <span className="muted small">до 3 камней; задание для репетитора — на «Пути»</span>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      )}
    </nav>
  )
}

export function Today({
  world,
  cycle,
  sync,
  turn,
}: {
  world: World
  cycle: CycleView
  sync: SyncSummary
  /** Итог последнего занятия — lastTurn() из src/game/chronicle.ts. Без него карточки нет. */
  turn?: LastTurn | null
}) {
  const current = cycle.current
  const progress = cycle.raw.progress

  // Все циклы пройдены, следующего маршрута ещё нет: привал. Сайт при этом не замирает.
  if (!current) {
    const dates = progress.sessions.map((s) => s.date).sort()
    const due = dueCards(world.deck, toISO(new Date())).length
    const tests = cycle.weeks.filter((w) => w.test.state === 'open')
    return (
      <div className="stack">
        <div className="card">
          <div className="eyebrow">
            Цикл {cycle.n} · {cycle.name}
          </div>
          <h2>Маршрут пройден</h2>
          <p>
            Закрыты все {cycle.days.length} {plural(cycle.days.length, DAYS)}
            {dates.length > 0 && <>: {fullPeriod(dates[0], dates[dates.length - 1])}</>}. Звание — «{cycle.rankOnComplete}».
          </p>
          <ul className="plain">
            <li>
              <a href={`#/cycle/${cycle.id}`}>Итог цикла</a> <span className="muted">— что пройдено и что это дало, одним листом</span>
            </li>
            <li>
              <a href="#/town">Памятник цикла</a>{' '}
              <span className="muted">
                {world.town.tier > 0 ? '— стоит в городе на берегу у моста' : '— встанет на берегу у моста, когда стоянка станет лагерем'}
              </span>
            </li>
          </ul>
        </div>

        {world.condition.level > 0 && (
          <div className="card banner">
            <b>{world.condition.name}.</b> Без занятия {world.missedWorkdays}{' '}
            {plural(world.missedWorkdays, ['рабочий день', 'рабочих дня', 'рабочих дней'])}. Маршрут пройден, но мир живёт занятиями:
            чтобы вернуть порядок, хватит любого занятия вне плана.
          </div>
        )}

        <Attention due={due} tests={tests.map((w) => w.week.n)} />

        <div className="card">
          <h3>Что дальше</h3>
          <p>
            Следующий маршрут собирается из ретро. Пока его нет, идёт привал, и занятия вне плана тоже в счёт: видео, статья, задача,
            встреча. Расскажи репетитору, что сделал и что вынес, — он запишет. Город живёт как обычно: день с занятием — один ход.
          </p>
        </div>

        {turn && <TurnCard turn={turn} />}

        {progress.openItems.length > 0 && (
          <details className="card fold">
            <summary>
              Хвосты <span className="muted">· {progress.openItems.length}</span>
            </summary>
            <ul className="plain">
              {progress.openItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        )}

        <SyncNote sync={sync} />
      </div>
    )
  }

  const { day, step } = current
  const plan = day.plan
  const stepIndex = step ? plan.steps.findIndex((s) => s.n === step.n) : -1
  const thisWeek = world.rhythm.length ? world.rhythm[world.rhythm.length - 1].sessions : 0
  const title = (id: number) => cycle.problems.find((p) => p.id === id)
  const openTests = cycle.weeks.filter((w) => w.test.state === 'open')
  const tasks = [
    ...plan.leetcode.repeatFromEmptyEditor.map((id) => ({ id, kind: 'повтор с пустого редактора' })),
    ...plan.leetcode.new.map((id) => ({ id, kind: 'новая' })),
    ...plan.leetcode.noHints.map((id) => ({ id, kind: 'без подсказок' })),
    ...plan.leetcode.pairIfFast.map((id) => ({ id, kind: 'пара, если основная быстрее 10 мин' })),
  ]

  const dueToday = dueCards(world.deck, toISO(new Date())).length

  return (
    <div className="stack">
      <div className="today-head">
        <div>
          <div className="eyebrow">
            День {day.n} из {cycle.days.length}
          </div>
          <h2>{plan.track}</h2>
        </div>
        <div className="chips">
          <TrackBadge code={plan.trackCode} />
          <span className="chip">{MODE[plan.mode] ?? plan.mode}</span>
          <span className="chip">{plan.plannedMinutes} мин</span>
          {day.keyPoint && <span className="chip chip-key">перевал: {day.keyPoint.title}</span>}
        </div>
      </div>

      {step ? (
        <div className="card step-card">
          <div className="step-main">
            <div className="eyebrow">
              Шаг {stepIndex + 1} из {plan.steps.length} · сейчас
            </div>
            <p className="step-text">
              <RichText text={step.text} />
            </p>
          </div>
          <Timer key={`${cycle.id}-${day.n}-${step.n}`} id={`${cycle.id}-${day.n}-${step.n}`} minutes={step.minutes} />
        </div>
      ) : (
        <div className="card">
          <p>Шаги дня закрыты. Осталось записать результат занятия.</p>
        </div>
      )}

      {world.condition.level > 0 && (
        <div className="card banner">
          <b>{world.condition.name}.</b> Без занятия {world.missedWorkdays}{' '}
          {plural(world.missedWorkdays, ['рабочий день', 'рабочих дня', 'рабочих дней'])}. Чтобы вернуть порядок на маршруте,
          хватит минимума{plan.minimum ? ': ' : '.'}
          {plan.minimum && <RichText text={plan.minimum} />}
          {plan.minimum && '.'}
        </div>
      )}

      <Attention due={dueToday} tests={openTests.map((w) => w.week.n)} />

      {tasks.length > 0 && (
        <div className="card">
          <h3>Задачи дня</h3>
          <ul className="plain task-list">
            {tasks.map((t) => (
              <li key={`${t.kind}-${t.id}`}>
                <a href={title(t.id)?.url} target="_blank" rel="noreferrer">
                  {t.id}. {title(t.id)?.title ?? 'задача'}
                </a>{' '}
                <span className="muted">— {t.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>Что открыть</h3>
        <ul className="res-list">
          {plan.resources.map((res) => (
            <li key={res.title}>
              <div className="res-links">
                {res.links.length
                  ? res.links.map((l) => (
                      <a key={l.url + l.title} href={l.url} target="_blank" rel="noreferrer">
                        {l.title}
                      </a>
                    ))
                  : res.title}
              </div>
              <div className="muted">
                <RichText text={res.todo} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {turn && <TurnCard turn={turn} />}

      <details className="card fold">
        <summary>
          Все шаги дня <span className="muted">· сделано {day.stepsDone.length} из {plan.steps.length}</span>
        </summary>
        <ol className="steps">
          {plan.steps.map((s) => {
            const state = day.stepsDone.includes(s.n) ? 'done' : s.n === step?.n ? 'now' : 'todo'
            return (
              <li key={s.n} className={`step-${state}`}>
                <span className="step-mark" aria-hidden="true">
                  {state === 'done' ? '✓' : state === 'now' ? '●' : '○'}
                </span>
                <span>
                  <span className="sr-only">{state === 'done' ? 'Сделан: ' : state === 'now' ? 'Сейчас: ' : 'Впереди: '}</span>
                  <RichText text={s.text} />
                </span>
              </li>
            )
          })}
        </ol>
      </details>

      <details className="card fold">
        <summary>Минимум и расширение</summary>
        <dl className="facts">
          <dt>Минимум — день засчитан</dt>
          <dd>{plan.minimum ? <RichText text={plan.minimum} /> : '—'}</dd>
          <dt>Расширение — по желанию</dt>
          <dd>{plan.extension ? <RichText text={plan.extension} /> : 'в этот день не предусмотрено'}</dd>
        </dl>
      </details>

      {progress.openItems.length > 0 && (
        <details className="card fold">
          <summary>
            Хвосты <span className="muted">· {progress.openItems.length}</span>
          </summary>
          <ul className="plain">
            {progress.openItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}

      <SyncNote sync={sync} />

      <p className="muted foot-note">
        На этой неделе {thisWeek} {plural(thisWeek, ['занятие', 'занятия', 'занятий'])}. Идём по номерам дней, а не по
        календарю.
      </p>
    </div>
  )
}
