import { useState } from 'react'
import type { CycleView } from '../game/engine'
import { defaultReportWeek, reportWeeks, weekReport } from '../game/report'
import { CopyButton } from '../ui/bits'

/** Отчёт недели для пятничного ревью: текст собран из журнала, его можно скопировать и отправить. */
export function WeekReport({ cycle }: { cycle: CycleView }) {
  const weeks = reportWeeks(cycle)
  const fallback = defaultReportWeek(cycle)
  const [picked, setPicked] = useState<number | null>(null)
  // Выбор держится, пока неделя доступна: у другого цикла или после правки данных берётся неделя по умолчанию.
  const week = picked !== null && weeks.some((w) => w.n === picked && w.started) ? picked : fallback
  const report = weekReport(cycle, week)

  return (
    <div className="card report-card">
      <h3>Отчёт недели</h3>
      <p className="muted">Пять строк о неделе для пятничного ревью.</p>

      <div className="report-pick">
        <span className="eyebrow" id="report-week-label">
          Неделя
        </span>
        <div className="seg report-weeks" role="group" aria-labelledby="report-week-label">
          {weeks.map((w) => {
            const open = w.started || w.n === fallback
            return (
              <button
                key={w.n}
                type="button"
                className={w.n === week ? 'is-on' : ''}
                aria-pressed={w.n === week}
                aria-label={`Неделя ${w.n}${open ? '' : ', ещё не началась'}`}
                title={open ? `Неделя ${w.n}` : `Неделя ${w.n} ещё не началась`}
                disabled={!open}
                onClick={() => setPicked(w.n)}
              >
                {w.n}
              </button>
            )
          })}
        </div>
      </div>

      <div className="report-text" aria-live="polite">
        {report.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div className="row">
        <CopyButton text={report.text} label="Скопировать отчёт" />
      </div>

      <details className="how">
        <summary>Как собран отчёт</summary>
        <p>Текст собран из журнала как есть, без оценок: его можно отправить другу или в свой канал.</p>
        <p>
          Недели, которые ещё не начались, откроются с первым занятием. Хвосты и зелёный CI попадают только в отчёт
          последней начатой недели: у них нет даты.
        </p>
      </details>
    </div>
  )
}
