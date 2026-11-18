import type { TrackView, World } from '../game/engine'
import { roman } from '../game/rules'
import { Meter, fmtDate } from '../ui/bits'
import { trackColor } from '../world/sprites'

export function Skills({ world }: { world: World }) {
  return (
    <div className="stack">
      <div className="section-head">
        <h2>Навыки</h2>
        <p className="muted">
          Ранг навыка даётся за результат, а не за число занятий: решённые и повторённые задачи, сохранённые файлы, ответы
          в недельных тестах. Один ранг — один цикл, в котором выполнены все условия трека. Опыт показан отдельно и на ранг
          не влияет.
        </p>
      </div>

      {world.tracks.map((t) => (
        <article key={t.track.code} className="card skill" style={{ borderLeftColor: trackColor(t.track.code) }}>
          <header className="skill-head">
            <div>
              <div className="eyebrow">Трек {t.track.code}</div>
              <h3>{t.track.name}</h3>
            </div>
            <div className="rank">
              <div className="rank-n">
                Ранг {roman(t.rank.n)}
                {t.rank.title ? ` · ${t.rank.title}` : ''}
              </div>
              <div className="muted small">опыт: {t.xp} XP</div>
            </div>
          </header>

          <Exam t={t} />

          <div className="branch" role="img" aria-label={`Занятий пройдено: ${t.daysDone} из ${t.daysTotal}`}>
            {Array.from({ length: t.daysTotal }, (_, i) => (
              <i key={i} className={i < t.daysDone ? 'is-done' : ''} style={i < t.daysDone ? { background: trackColor(t.track.code) } : undefined} />
            ))}
            <span className="muted small">
              занятий {t.daysDone} из {t.daysTotal}
            </span>
          </div>

          <dl className="facts">
            <dt>Старт</dt>
            <dd>{t.track.startLevel}</dd>
            <dt>Цель цикла</dt>
            <dd>{t.track.target}</dd>
            <dt>Режим</dt>
            <dd>
              {t.track.sessions}; бюджет {t.track.budget}
            </dd>
          </dl>

          {(t.canExplain.length > 0 || t.almost.length > 0) && (
            <div className="explain">
              {t.canExplain.length > 0 && (
                <>
                  <h4>Уже могу объяснить</h4>
                  <ul className="plain">
                    {t.canExplain.map((k) => (
                      <li key={k.question}>
                        ✓ {k.question} <span className="muted">— {fmtDate(k.date)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {t.almost.length > 0 && (
                <>
                  <h4>Почти</h4>
                  <ul className="plain">
                    {t.almost.map((k) => (
                      <li key={k.question}>
                        ◐ {k.question} <span className="muted">— ответил частично</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

/** Зачёт на следующий ранг: что выполнено и чего не хватает. */
function Exam({ t }: { t: TrackView }) {
  const exam = t.rank.next
  if (!exam) {
    return <p className="muted">Все условия этого цикла выполнены. Следующий ранг откроет новый цикл.</p>
  }
  return (
    <div className="exam">
      <div className="exam-head">
        <h4>
          До ранга {roman(t.rank.n + 1)} «{exam.name}»
        </h4>
        <span className="muted small">
          выполнено {exam.met} из {exam.items.length}
        </span>
      </div>
      <Meter value={exam.met} max={exam.items.length} label={`Условий выполнено: ${exam.met} из ${exam.items.length}`} />
      <ul className="exam-list">
        {exam.items.map((item) => (
          <li key={item.label} className={item.done ? 'is-done' : ''}>
            <span className="exam-mark" aria-hidden="true">
              {item.done ? '✓' : '○'}
            </span>
            <span>
              <span className="sr-only">{item.done ? 'Выполнено: ' : 'Не выполнено: '}</span>
              {item.label}
              {item.detail && <span className="muted"> — {item.detail}</span>}
            </span>
            <span className="exam-num">
              {item.unit ? `${item.have}${item.unit}` : `${item.have} из ${item.need}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
