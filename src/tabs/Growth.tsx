import { GemIcon } from '../world/extras'
import type { CycleView, TrackView, World } from '../game/engine'
import { SIDE } from '../game/side'
import { TrackBadge, Tile, fmtDate, plural } from '../ui/bits'

const VERDICT = {
  correct: { label: 'верно', mark: '✓' },
  partial: { label: 'частично', mark: '◐' },
  wrong: { label: 'неверно', mark: '✕' },
} as const

const VERDICT_ORDER = ['correct', 'partial', 'wrong'] as const

export function Growth({ world, cycle }: { world: World; cycle: CycleView }) {
  const progress = cycle.raw.progress
  const { start, final } = progress.baseline
  const title = (id: number) => cycle.problems.find((p) => p.id === id)?.title ?? ''
  const built = cycle.buildings.filter((b) => b.stage >= 2).length
  const sessions = world.cycles.reduce((sum, c) => sum + c.raw.progress.sessions.length, 0)
  const timed = cycle.days.filter((d) => d.progress?.wallClockMinutes)
  const checked = world.tracks.filter((t) => t.checks.correct + t.checks.partial + t.checks.wrong > 0)
  const assessed = world.tracks.some((t) => t.selfStart !== null || t.selfFinal !== null)

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Прирост</h2>
        <p className="muted">Сравнение с собой в начале пути важнее числа закрытых дней.</p>
      </div>

      <div className="card">
        <h3>Замер: было → стало</h3>
        <div className="before-after">
          <div>
            <div className="eyebrow">
              Было · день {start.day}
              {start.date ? `, ${fmtDate(start.date)}` : ''}
            </div>
            <div className="hero-figure">
              {start.minutes !== null ? `${start.minutes} мин` : '—'} <small>из 20 на таймере</small>
            </div>
            <p>
              {start.problemId}. {title(start.problemId)}
              {start.result ? ` — ${start.result}.` : ''}
            </p>
          </div>
          <div className="arrow" aria-hidden="true">
            →
          </div>
          <div className={final.minutes === null ? 'is-pending' : ''}>
            <div className="eyebrow">Стало · день {final.day}</div>
            <div className="hero-figure">
              {final.minutes !== null ? `${final.minutes} мин` : 'впереди'}
              {final.minutes !== null && <small> из 20 на таймере</small>}
            </div>
            <p>
              {final.problemId}. {title(final.problemId)}
              {final.result ? ` — ${final.result}.` : ' — новая задача на тот же приём, без разбора.'}
            </p>
          </div>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Очки" value={`${world.totalXp} XP`} note={`уровень ${world.level.n}`} />
        <Tile label="Дней пройдено" value={`${cycle.daysDone} из ${cycle.days.length}`} />
        <Tile label="Занятий" value={sessions} note="включая заходы внутри одного дня" />
        <Tile label="Домиков построено" value={`${built} из ${cycle.buildings.length}`} />
        <Tile
          label="Монеты и камни"
          value={`${world.wallet.coins} · ${world.wallet.gems}`}
          note={`заработано ${world.wallet.coinsEarned} и ${world.wallet.gemsEarned}`}
        />
      </div>

      <div className="card">
        <h3>Самооценка по трекам, от 1 до 5</h3>
        {!assessed && (
          <p className="muted">
            Оценок пока нет: самооценка дня {start.day} осталась в хвостах. Запиши её сейчас — без неё не с чем будет
            сравнить день {final.day}.
          </p>
        )}
        <div className="dumbbells">
          {world.tracks.map((t) => (
            <Dumbbell key={t.track.code} t={t} />
          ))}
        </div>
        <div className="legend">
          <span><i className="dot dot-start" /> было</span>
          <span><i className="dot dot-final" /> стало</span>
        </div>
      </div>

      <div className="card">
        <h3>Проверки понимания: первый ответ</h3>
        <div className="stack-rows">
          {checked.map((t) => {
            const total = t.checks.correct + t.checks.partial + t.checks.wrong
            return (
              <div key={t.track.code} className="stack-row">
                <TrackBadge code={t.track.code} name={t.track.name} />
                <div className="stack-bar" role="img" aria-label={`${t.track.name}: верно ${t.checks.correct}, частично ${t.checks.partial}, неверно ${t.checks.wrong}`}>
                  {VERDICT_ORDER.map((v) =>
                    t.checks[v] ? (
                      <span key={v} className={`seg-${v}`} style={{ flexGrow: t.checks[v] }} title={`${VERDICT[v].label}: ${t.checks[v]} из ${total}`} />
                    ) : null,
                  )}
                </div>
                <div className="stack-nums">
                  {t.checks.correct} · {t.checks.partial} · {t.checks.wrong}
                </div>
              </div>
            )
          })}
        </div>
        <div className="legend">
          {VERDICT_ORDER.map((v) => (
            <span key={v}>
              <i className={`dot seg-${v}`} /> {VERDICT[v].mark} {VERDICT[v].label}
            </span>
          ))}
          <span className="muted">числа справа — в том же порядке</span>
        </div>
        <details className="fold inner">
          <summary>
            Вопросы и ответы <span className="muted">· {world.checks.length}</span>
          </summary>
          <ul className="deck">
            {world.checks.map((k) => (
              <li key={k.date + k.question}>
                <div className="deck-q">
                  <span className={`verdict verdict-${k.verdict}`}>
                    {VERDICT[k.verdict].mark} {VERDICT[k.verdict].label}
                  </span>
                  <b>{k.question}</b>
                </div>
                <p className="muted">
                  Первый ответ, {fmtDate(k.date)}: {k.firstAnswer}
                </p>
                <p>{k.answer}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="card">
        <h3>Занятий по неделям</h3>
        <Rhythm weeks={world.rhythm} />
        <p className="muted">Считаются недели, а не дни подряд. Правило плана — не пропускать дважды подряд.</p>
      </div>

      {timed.length > 0 && (
        <div className="card">
          <h3>Время: по плану и на деле</h3>
          <table className="table">
            <thead>
              <tr>
                <th>День</th>
                <th className="num">План</th>
                <th className="num">На деле</th>
              </tr>
            </thead>
            <tbody>
              {timed.map((d) => (
                <tr key={d.n}>
                  <td>
                    {d.n}. {d.plan.track}
                  </td>
                  <td className="num">{d.plan.plannedMinutes} мин</td>
                  <td className="num">{d.progress!.wallClockMinutes} мин</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>За что получены очки</h3>
        <table className="table">
          <tbody>
            {world.events.map((e, i) => (
              <tr key={i}>
                <td>{e.label}</td>
                <td className="muted">{e.date ? fmtDate(e.date) : ''}</td>
                <td className="num">+{e.xp}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Всего</td>
              <td />
              <td className="num">{world.totalXp}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Стороннее развитие</h3>
        <p className="muted">
          Видео, статьи, встречи с коллегами и тестовые собеседования вне плана. Считается результат, а не время: запись
          засчитывается, только если записаны выводы, и не больше одной каждого вида в день. Засчитанная запись — такой же
          день занятий, как день плана. Чтобы добавить запись, расскажи Claude Code, что посмотрел или с кем говорил и что
          из этого вынес.
        </p>
        {world.side.length > 0 && (
          <ul className="deck">
            {world.side.map((s, i) => (
              <li key={i}>
                <div className="deck-q">
                  <span className="verdict">{s.counted ? `+${s.xp} XP${s.gems ? ' и камень' : ''}` : 'не засчитано'}</span>
                  <b>{s.entry.title}</b>
                </div>
                <p className="muted">
                  {fmtDate(s.entry.date)} · {s.rule.name.toLowerCase()}
                  {s.entry.source ? ` · ${s.entry.source}` : ''}
                  {s.entry.with ? ` · с кем: ${s.entry.with}` : ''}
                  {s.why ? ` · ${s.why}` : ''}
                </p>
                {s.entry.takeaways?.length ? (
                  <ul className="plain">
                    {s.entry.takeaways.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Что</th>
              <th className="num">Выводов</th>
              <th className="num">XP и монеты</th>
            </tr>
          </thead>
          <tbody>
            {(['video', 'article', 'meetup', 'mock-interview', 'session'] as const).map((kind) => (
              <tr key={kind}>
                <td>
                  {SIDE[kind].name}
                  {SIDE[kind].gem ? ' — ещё камень, не чаще раза в неделю' : ''}
                </td>
                <td className="num">{SIDE[kind].takeaways || '—'}</td>
                <td className="num">{SIDE[kind].xp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" id="trophies">
        <h3>Трофеи</h3>
        <p className="muted">
          Достижения за мастерство: их нельзя купить и нельзя получить за число занятий. Каждый даётся один раз и приносит камни.
          Получено {world.trophies.filter((t) => t.earned).length} из {world.trophies.length}.
        </p>
        <ul className="trophy-list">
          {world.trophies.map((t) => (
            <li key={t.id} className={t.earned ? 'trophy is-earned' : 'trophy'}>
              <div className="trophy-info">
                <b>{t.name}</b>
                <span className="muted small">{t.how}</span>
              </div>
              <div className="trophy-state">
                <span className={t.earned ? 'pill pill-core' : 'pill'}>
                  {t.earned ? `получен${t.date ? ' ' + fmtDate(t.date) : ''}` : (t.progress ?? 'ещё нет')}
                </span>
                <span className="price">
                  <GemIcon /> {t.earned ? '+' : ''}
                  {t.gems}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>За что получены камни</h3>
        {world.gemLog.length === 0 ? (
          <p className="muted">Пока ни одного. Камни дают пройденные перевалы, недельные тесты и трофеи.</p>
        ) : (
          <table className="table">
            <tbody>
              {world.gemLog.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td className="muted">{g.date ? fmtDate(g.date) : ''}</td>
                  <td className="num">+{g.gems}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="card fold">
        <summary>
          Журнал ошибок <span className="muted">· {world.mistakes.length}</span>
        </summary>
        <ul className="plain">
          {world.mistakes.map((m) => (
            <li key={m.date + m.text}>
              {m.text}{' '}
              <span className="muted">
                — {fmtDate(m.date)}, трек {m.track}
                {m.problemId ? `, задача ${m.problemId}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {progress.observations.length > 0 && (
        <details className="card fold">
          <summary>Наблюдения репетитора</summary>
          <ul className="plain">
            {progress.observations.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** «Было → стало» на общей шкале: читается точнее, чем радар. */
function Dumbbell({ t }: { t: TrackView }) {
  const x = (v: number) => 12 + ((v - 1) / 4) * 176
  const has = t.selfStart !== null || t.selfFinal !== null
  const label = has
    ? `${t.track.name}: было ${t.selfStart ?? 'нет оценки'}, стало ${t.selfFinal ?? 'нет оценки'}`
    : `${t.track.name}: оценок нет`
  return (
    <div className="dumbbell">
      <TrackBadge code={t.track.code} name={t.track.name} />
      <svg viewBox="0 0 200 28" role="img" aria-label={label}>
        <title>{label}</title>
        <path className="axis" d="M12 14 H188" />
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <path className="tick" d={`M${x(v)} 10 V18`} />
            <text className="tick-label" x={x(v)} y={27} textAnchor="middle">
              {v}
            </text>
          </g>
        ))}
        {t.selfStart !== null && t.selfFinal !== null && (
          <path className="link" d={`M${x(t.selfStart)} 14 H${x(t.selfFinal)}`} />
        )}
        {t.selfStart !== null && <circle className="mark-start" cx={x(t.selfStart)} cy={14} r={5} />}
        {t.selfFinal !== null && <circle className="mark-final" cx={x(t.selfFinal)} cy={14} r={5.5} />}
      </svg>
      <span className="dumbbell-num">{has ? `${t.selfStart ?? '—'} → ${t.selfFinal ?? '—'}` : 'нет оценки'}</span>
    </div>
  )
}

function Rhythm({ weeks }: { weeks: World['rhythm'] }) {
  const max = Math.max(3, ...weeks.map((w) => w.sessions))
  return (
    <div className="rhythm" role="img" aria-label={weeks.map((w) => `неделя с ${fmtDate(w.weekStart)}: ${w.sessions}`).join('; ')}>
      {weeks.map((w) => (
        <div key={w.weekStart} className="rhythm-col" title={`Неделя с ${fmtDate(w.weekStart)}: ${w.sessions} ${plural(w.sessions, ['занятие', 'занятия', 'занятий'])}`}>
          <span className="rhythm-num">{w.sessions}</span>
          <span className="rhythm-bar" style={{ height: `${(w.sessions / max) * 72}px` }} />
          <span className="rhythm-date">{fmtDate(w.weekStart)}</span>
        </div>
      ))}
    </div>
  )
}
