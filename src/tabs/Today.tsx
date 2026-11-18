import type { CycleView, World } from '../game/engine'
import { DAYS, RichText, Timer, TrackBadge, plural } from '../ui/bits'

const MODE: Record<string, string> = { light: 'лёгкий день', deep: 'глубокий день', retro: 'ретро' }

export function Today({ world, cycle }: { world: World; cycle: CycleView }) {
  const current = cycle.current
  const progress = cycle.raw.progress

  if (!current) {
    return (
      <div className="card">
        <h2>Маршрут пройден</h2>
        <p>
          Цикл {cycle.n} «{cycle.name}» закрыт: {cycle.daysDone} {plural(cycle.daysDone, DAYS)} из {cycle.days.length}. Звание —
          «{cycle.rankOnComplete}». Следующий маршрут собирается из ретро; пока его нет, занятия вне плана тоже идут в счёт.
        </p>
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

  return (
    <div className="stack">
      {world.condition.level > 0 && (
        <div className="card banner">
          <b>{world.condition.name}.</b> Без занятия {world.missedWorkdays}{' '}
          {plural(world.missedWorkdays, ['рабочий день', 'рабочих дня', 'рабочих дней'])}. Чтобы вернуть порядок на маршруте,
          хватит минимума{plan.minimum ? ': ' : '.'}
          {plan.minimum && <RichText text={plan.minimum} />}
          {plan.minimum && '.'}
        </div>
      )}

      {openTests.length > 0 && (
        <div className="card note">
          <b>
            Открыт тест {openTests.length > 1 ? 'недель' : 'недели'} {openTests.map((w) => w.week.n).join(', ')}.
          </b>{' '}
          За него дают до 3 камней. Задание для репетитора — на вкладке <a href="#/path">«Путь»</a>.
        </div>
      )}

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

      {tasks.length > 0 && (
        <div className="card">
          <h3>Задачи дня</h3>
          <ul className="plain">
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

      <p className="muted foot-note">
        На этой неделе {thisWeek} {plural(thisWeek, ['занятие', 'занятия', 'занятий'])}. Идём по номерам дней, а не по
        календарю.
      </p>
    </div>
  )
}
