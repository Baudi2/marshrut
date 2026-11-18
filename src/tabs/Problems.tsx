import { PROBLEM_STATE_LABEL, type CycleView, type ProblemView } from '../game/engine'
import { Tile, fmtDate } from '../ui/bits'

const ROLE: Record<string, string> = {
  baseline: 'замер в начале',
  main: 'основная',
  pair: 'пара',
  'baseline-final': 'замер в конце',
  reserve: 'запасная',
  offplan: 'вне плана',
}

function attemptLabel(kind: string): string {
  if (kind.startsWith('timed-')) return `на таймере ${kind.split('-')[1]} мин`
  if (kind.startsWith('optimal')) return 'оптимальное решение'
  if (kind === 'rewrite-after-walkthrough') return 'переписал после разбора'
  if (kind === 'from-empty-editor') return 'с пустого редактора'
  if (kind === 'no-hints') return 'без подсказок'
  if (kind === 'duel') return 'дуэль с собой'
  return kind
}

const solvedBy = (p: ProblemView, kind: string) =>
  !!p.progress?.attempts.some((a) => a.kind === kind && a.result === 'solved')

export function Problems({ cycle }: { cycle: CycleView }) {
  const core = cycle.problems.filter((p) => p.role === 'main' || p.role === 'baseline')
  const started = core.filter((p) => p.state !== 'none')
  const withWalkthrough = started.filter((p) => p.state === 'walkthrough').length
  const toRepeat = cycle.problems.filter((p) => p.plan?.repeatDay)
  const toNoHints = cycle.problems.filter((p) => p.plan?.noHintsDay)
  const groups = [...new Set(cycle.problems.map((p) => p.group))]

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Задачи LeetCode</h2>
        <p className="muted">
          «Решена сама» и «решена с разбором» — разные статусы, и оба в порядке. Пары — побочные задания: берутся, если
          основная решена быстрее 10 минут.
        </p>
      </div>

      <div className="tiles">
        <Tile label="Основные задачи" value={`${started.length} из ${core.length}`} note="начаты" />
        <Tile
          label="Сама / с разбором"
          value={`${started.length - withWalkthrough} / ${withWalkthrough}`}
          note="среди начатых"
        />
        <Tile
          label="Повторы с пустого редактора"
          value={`${toRepeat.filter((p) => solvedBy(p, 'from-empty-editor')).length} из ${toRepeat.length}`}
        />
        <Tile
          label="Без подсказок"
          value={`${toNoHints.filter((p) => solvedBy(p, 'no-hints')).length} из ${toNoHints.length}`}
          note="через 2–3 недели"
        />
      </div>

      {groups.map((group) => {
        const list = cycle.problems.filter((p) => p.group === group)
        const main = list.filter((p) => p.role !== 'pair' && p.role !== 'reserve')
        const side = list.filter((p) => p.role === 'pair' || p.role === 'reserve')
        return (
          <section key={group} className="card">
            <h3>{group}</h3>
            <div className="problem-grid">
              {main.map((p) => (
                <ProblemCard key={p.id} p={p} />
              ))}
            </div>
            {side.length > 0 && (
              <>
                <h4 className="side-title">Побочные задания</h4>
                <div className="problem-grid">
                  {side.map((p) => (
                    <ProblemCard key={p.id} p={p} side />
                  ))}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

function ProblemCard({ p, side = false }: { p: ProblemView; side?: boolean }) {
  const attempts = p.progress?.attempts ?? []
  const repeated = solvedBy(p, 'from-empty-editor')
  const noHints = solvedBy(p, 'no-hints')
  return (
    <article className={`problem problem-${p.state}${side ? ' problem-side' : ''}`}>
      <header>
        <a href={p.url} target="_blank" rel="noreferrer">
          <span className="problem-id">{p.id}</span> {p.title}
        </a>
        <span className={`pill pill-p-${p.state}`}>{PROBLEM_STATE_LABEL[p.state]}</span>
      </header>
      <div className="problem-meta">
        <span>{ROLE[p.role]}</span>
        {p.plan && p.state === 'none' && <span>день {p.plan.plannedDay}</span>}
        {p.timedMinutes !== null && (
          <span>
            {p.timedMinutes} мин{p.timedLimit ? ` из ${p.timedLimit}` : ''} на таймере
          </span>
        )}
        {attempts.length > 0 && <span>попыток: {attempts.length}</span>}
      </div>
      {p.plan?.repeatDay && (
        <div className="marks">
          <span className={repeated ? 'mark mark-on' : 'mark'}>
            {repeated ? '✓ повторена' : `повтор — день ${p.plan.repeatDay}`}
          </span>
          {p.plan.noHintsDay && (
            <span className={noHints ? 'mark mark-on' : 'mark'}>
              {noHints ? '✓ без подсказок' : `без подсказок — день ${p.plan.noHintsDay}`}
            </span>
          )}
        </div>
      )}
      {p.progress?.notes && <p className="muted small">{p.progress.notes}</p>}
      {attempts.length > 0 && (
        <details className="attempts">
          <summary>Попытки</summary>
          <ul className="plain">
            {attempts.map((a, i) => (
              <li key={i}>
                <b>
                  {fmtDate(a.date)} · {attemptLabel(a.kind)}
                </b>{' '}
                — {a.result === 'solved' ? 'решено' : 'не решено'}
                {a.minutes !== null ? `, ${a.minutes} мин` : ''}
                {a.approach ? `. ${a.approach}` : ''}
                {a.notes ? `. ${a.notes}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}
