import type { CycleView, NodeState } from '../game/engine'
import { fmtMinutes, timeReport, type DayTime, type TimeSum } from '../game/report'
import { DAYS, TrackBadge, fmtDate, plural } from '../ui/bits'

const LEVEL: Partial<Record<NodeState, string>> = {
  minimum: 'минимум',
  core: 'ядро',
  extension: 'с расширением',
}

const SESSIONS: [string, string, string] = ['занятие', 'занятия', 'занятий']
const CLOSED_DAYS: [string, string, string] = ['закрытый день', 'закрытых дня', 'закрытых дней']

const count = (n: number, forms: [string, string, string]) => `${n} ${plural(n, forms)}`

/** Насколько факт отличается от плана — коротко, без оценки. */
function gap(planned: number, fact: number): string {
  if (planned <= 0 || fact === planned) return 'по плану'
  const word = fact > planned ? 'дольше' : 'быстрее'
  if (fact >= planned * 1.5) {
    const ratio = Math.round((fact / planned) * 10) / 10
    const times = Number.isInteger(ratio)
      ? `${ratio} ${plural(ratio, ['раз', 'раза', 'раз'])}`
      : `${String(ratio).replace('.', ',')} раза`
    return `в ${times} ${word}`
  }
  return `на ${Math.max(1, Math.round((Math.abs(fact - planned) / planned) * 100))}% ${word}`
}

/** Наблюдение о темпе: перерасход времени — не провал, а сведения для следующего плана. */
function pace({ planned, fact }: TimeSum): string {
  if (fact > planned) return 'Занятия идут дольше, чем заложено планом. Это наблюдение о темпе, а не оценка: по нему можно править следующий план.'
  if (fact < planned) return 'Занятия идут быстрее, чем заложено планом. Это наблюдение о темпе, а не оценка.'
  return 'Времени уходит столько, сколько заложено планом.'
}

/** Что известно о факте дня, одной строкой. */
function daySub(day: DayTime): string {
  const parts = [LEVEL[day.state] ?? '', day.dates.map(fmtDate).join(', ')]
  if (day.source === 'sessions') parts.push(count(day.sessions, SESSIONS))
  else if (day.source === 'day') parts.push('итог дня записан вручную')
  else if (day.sessions === 0) parts.push('занятий не записано')
  else {
    parts.push(
      day.measured > 0
        ? `по часам ${day.measured} мин, без замера — ${count(day.unmeasured, SESSIONS)}`
        : `${count(day.sessions, SESSIONS)}, время не записано`,
    )
  }
  return parts.filter(Boolean).join(' · ')
}

export function TimeCard({ cycle }: { cycle: CycleView }) {
  const time = timeReport(cycle)
  const { total } = time
  const closed = time.days.filter((d) => d.done)
  const tracks = time.tracks.filter((t) => t.days > 0)
  const scale = Math.max(1, ...tracks.flatMap((t) => [t.planned, t.fact]))
  const diff = total.fact - total.planned
  const offCore = closed.filter((d) => d.fact !== null && d.state !== 'core')
  const atMinimum = offCore.filter((d) => d.state === 'minimum').length
  const extended = offCore.length - atMinimum

  return (
    <div className="card time-card">
      <h3>Время: план и факт</h3>

      {total.days === 0 && <p>Закрытых дней пока нет: сравнивать ещё нечего.</p>}

      {total.days > 0 && total.measured === 0 && (
        <p>
          Закрыто {count(total.days, DAYS)}, все без замера: у занятий не записано время начала или конца. План этих дней
          — {total.plannedClosed} мин.
        </p>
      )}

      {total.measured > 0 && (
        <>
          <div className="time-figs">
            <div className="time-fig">
              <span className="time-fig-label">По плану</span>
              <span className="time-fig-value">
                {total.planned} <small>мин</small>
              </span>
              <span className="time-fig-note">{fmtMinutes(total.planned)}</span>
            </div>
            <div className="time-fig">
              <span className="time-fig-label">На деле</span>
              <span className="time-fig-value">
                {total.fact} <small>мин</small>
              </span>
              <span className="time-fig-note">{fmtMinutes(total.fact)}</span>
            </div>
            <div className="time-fig">
              <span className="time-fig-label">Разница</span>
              <span className="time-fig-value">
                {diff > 0 ? '+' : diff < 0 ? '−' : ''}
                {Math.abs(diff)} <small>мин</small>
              </span>
              <span className="time-fig-note">{gap(total.planned, total.fact)}</span>
            </div>
          </div>
          <p>
            В итог {plural(total.measured, ['вошёл', 'вошли', 'вошло'])} {count(total.measured, CLOSED_DAYS)} с замером.{' '}
            {pace(total)}
          </p>
          {total.unmeasured > 0 && (
            <p className="muted small">
              Ещё {count(total.unmeasured, CLOSED_DAYS)} — без замера: время начала или конца занятия не записано. В суммы{' '}
              {total.unmeasured === 1 ? 'он не вошёл' : 'они не вошли'}.
            </p>
          )}
          {offCore.length > 0 && (
            <p className="muted small">
              Среди дней с замером{' '}
              {[atMinimum ? `на минимуме — ${atMinimum}` : '', extended ? `с расширением — ${extended}` : ''].filter(Boolean).join(', ')}.
              План у каждого дня — минуты ядра, поэтому для таких дней сравнение условно.
            </p>
          )}

          <h4>По трекам</h4>
          <div className="legend">
            <span>
              <i className="time-key-fact" /> факт
            </span>
            <span>
              <i className="time-key-plan" /> план
            </span>
            <span className="muted">числа справа: план → факт</span>
          </div>
          <ul className="time-tracks">
            {tracks.map((t) => {
              const label = t.measured
                ? `${t.name}: план ${t.planned} мин, факт ${t.fact} мин`
                : `${t.name}: без замера`
              return (
                <li key={t.code} className="time-track">
                  <div className="time-track-head">
                    <TrackBadge code={t.code} name={t.name} />
                    <span className="time-nums">
                      {t.measured ? (
                        <>
                          {t.planned} → <b>{t.fact}</b> мин
                        </>
                      ) : (
                        'без замера'
                      )}
                    </span>
                  </div>
                  {t.measured > 0 && (
                    <div className="time-bar" role="img" aria-label={label} title={label}>
                      <span className="time-bar-fact" style={{ width: `${((t.fact / scale) * 100).toFixed(1)}%` }} />
                      <span className="time-bar-plan" style={{ left: `${((t.planned / scale) * 100).toFixed(1)}%` }} />
                    </div>
                  )}
                  <span className="muted small">
                    {count(t.days, CLOSED_DAYS)}
                    {t.measured > 0 ? `, ${gap(t.planned, t.fact)}` : ''}
                    {t.unmeasured > 0 && t.measured > 0 ? `; без замера — ${t.unmeasured}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {closed.length > 0 && (
        <>
          <h4>Закрытые дни</h4>
          <table className="table time-table">
            <thead>
              <tr>
                <th>День</th>
                <th className="num">План</th>
                <th className="num">Факт</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((d) => (
                <tr key={d.n}>
                  <td>
                    {d.n}. {d.title}
                    <span className="time-day-sub">{daySub(d)}</span>
                  </td>
                  <td className="num">{d.planned} мин</td>
                  <td className="num">{d.fact !== null ? `${d.fact} мин` : 'без замера'}</td>
                </tr>
              ))}
              {total.measured > 0 && (
                <tr className="total">
                  <td>Всего по дням с замером</td>
                  <td className="num">{total.planned} мин</td>
                  <td className="num">{total.fact} мин</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {time.open.map((d) => (
        <p key={d.n} className="muted small">
          День {d.n} ещё идёт: {d.fact !== null || d.measured > 0 ? `по часам пока ${d.fact ?? d.measured} мин` : 'замеров пока нет'}
          {d.fact === null && d.unmeasured > 0 ? `, ${count(d.unmeasured, SESSIONS)} без замера` : ''}; план дня —{' '}
          {d.planned} мин. В итог он войдёт, когда будет закрыт.
        </p>
      ))}

      <p className="muted small">На весь цикл планом заложено {fmtMinutes(total.plannedAll)} ядра.</p>

      <details className="how">
        <summary>Как это считается</summary>
        <p>
          План — минуты ядра из плана дня. Факт — время занятий по часам: от начала до конца каждого захода, вместе с
          паузами внутри.
        </p>
        <p>
          Сравниваются только закрытые дни; день, у которого время не записано, идёт как «без замера» и в суммы не входит.
          По шагам факта нет: таймеры шагов остаются в браузере и в журнал не попадают.
        </p>
      </details>
    </div>
  )
}
