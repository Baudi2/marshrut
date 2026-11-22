import type { CycleView, WeekView } from '../game/engine'
import { GEM_STEPS, MAX_GEMS_PER_TEST } from '../game/rules'
import { testPrompt } from '../game/weekly'
import { CopyButton, DAYS, fmtDate, plural } from '../ui/bits'
import { Gems } from '../world/extras'

const STATE = { locked: 'ещё рано', open: 'можно сдавать', done: 'сдан' } as const

export function WeeklyTests({ cycle }: { cycle: CycleView }) {
  const steps = [...GEM_STEPS].reverse().map((s) => `от ${Math.round(s.share * 100)}% — ${s.gems}`)
  // Строкой показаны недели, где есть что делать или смотреть: сданные, открытые и та, что идёт сейчас.
  // Остальные впереди и выглядят одинаково — они сведены в одну строку.
  const nowWeek = cycle.current?.day.plan.week
  const far = cycle.weeks.filter((w) => w.test.state === 'locked' && w.week.n !== nowWeek)
  const shown = cycle.weeks.filter((w) => !far.includes(w))
  const farNumbers = far.map((w) => w.week.n)
  const run = farNumbers.length > 1 && farNumbers[farNumbers.length - 1] - farNumbers[0] === farNumbers.length - 1
  return (
    <div className="card">
      <h3>Недельные тесты</h3>
      <p className="muted">
        Тест открывается, когда пройдены все дни недели. Его ведёт репетитор: 10 вопросов, каждый ответ — от 0 до 2 баллов.
      </p>
      <ul className="tests">
        {shown.map((w) => (
          <TestRow key={w.week.n} cycle={cycle} w={w} />
        ))}
        {far.length > 0 && (
          <li className="muted small">
            {far.length === 1 ? `Неделя ${farNumbers[0]}` : run ? `Недели ${farNumbers[0]}–${farNumbers[farNumbers.length - 1]}` : `Недели ${farNumbers.join(', ')}`}: ещё рано — тест
            откроется, когда закрыты все дни недели.
          </li>
        )}
      </ul>
      <details className="fold inner">
        <summary>Камни и пересдача</summary>
        <p className="muted small">
          Камни за результат: {steps.join(', ')}. Пересдавать можно, считается лучшая попытка. Ещё по камню даёт каждый пройденный
          перевал.
        </p>
      </details>
    </div>
  )
}

function TestRow({ cycle, w }: { cycle: CycleView; w: WeekView }) {
  const { test } = w
  const prompt = test.state === 'locked' ? '' : testPrompt(cycle, w)
  return (
    <li>
      <div className="test-head">
        <b>Неделя {w.week.n}</b>
        <span className={`pill pill-test-${test.state}`}>{STATE[test.state]}</span>
        <Gems count={test.gems} of={MAX_GEMS_PER_TEST} />
        {test.best && (
          <span className="muted">
            {typeof test.best.forecast === 'number' ? `ждал ${test.best.forecast} → ` : ''}
            {test.best.score} из {test.best.max}, {fmtDate(test.best.date)}
            {test.attempts.length > 1 ? ` · попыток: ${test.attempts.length}` : ''}
          </span>
        )}
      </div>
      {test.state === 'locked' && (
        <p className="muted small">
          До теста осталось закрыть {test.daysLeft} {plural(test.daysLeft, DAYS)} этой недели.
        </p>
      )}
      {test.best?.questions?.length ? (
        <details className="attempts">
          <summary>Вопросы теста</summary>
          <ul className="plain">
            {test.best.questions.map((q) => (
              <li key={q.q}>
                <b>{q.points} из 2</b> — {q.q}
                {q.note ? <span className="muted"> · {q.note}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {prompt && (
        <details className="attempts">
          <summary>{test.state === 'done' ? 'Задание для пересдачи' : 'Задание для репетитора'}</summary>
          <pre className="prompt">{prompt}</pre>
          <div className="row">
            <CopyButton text={prompt} label="Скопировать задание" />
            <span className="muted small">Вставь в чат с репетитором — он же перенесёт итоговую JSON-запись в репозиторий.</span>
          </div>
        </details>
      )}
    </li>
  )
}
