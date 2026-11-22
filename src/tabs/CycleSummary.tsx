import type { ReactNode } from 'react'
import type { CycleView, World } from '../game/engine'
import { fmtMinutes } from '../game/report'
import { MAX_GEMS_PER_TEST } from '../game/rules'
import {
  cycleCaption,
  cycleSummary,
  deltaText,
  fullDate,
  shortPeriod,
  summaryLines,
  trackAhead,
  type CycleSummary as Summary,
  type SummaryFile,
  type SummaryPoint,
  type SummaryTrack,
} from '../game/summary'
import type { Forms } from '../game/text'
import { CopyButton, DAYS, Meter, TrackBadge, fmtDate, plural } from '../ui/bits'
import { CoinIcon, GemIcon, Gems } from '../world/extras'

const RECORDS: Forms = ['запись', 'записи', 'записей']
const QUESTIONS: Forms = ['вопрос', 'вопроса', 'вопросов']
const CLOSED_DAYS: Forms = ['закрытому дню', 'закрытым дням', 'закрытым дням']

const count = (n: number, forms: Forms) => `${n} ${plural(n, forms)}`
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Доли полосы «Дни»: от самого полного закрытия к тому, что осталось. */
const DAY_PARTS = [
  { key: 'extension', label: 'с расширением' },
  { key: 'core', label: 'ядром' },
  { key: 'minimum', label: 'на минимуме' },
  { key: 'skipped', label: 'пропущено' },
  { key: 'left', label: 'осталось' },
] as const

const VERDICTS = [
  { key: 'correct', label: 'верно', mark: '✓' },
  { key: 'partial', label: 'частично', mark: '◐' },
  { key: 'wrong', label: 'неверно', mark: '✕' },
] as const

/**
 * Итог цикла: что пройдено и что это дало. Не вкладка: открывается по ссылке с «Пути», как каталог построек.
 * Идущий цикл показан теми же числами по состоянию журнала; блок, которому нечего показать, скрыт.
 */
export function CycleSummary({ world, cycle }: { world: World; cycle: CycleView }) {
  const s = cycleSummary(world, cycle)
  const lines = summaryLines(s)

  return (
    <div className="stack sum">
      <a className="sum-back" href="#/path">
        ← Путь
      </a>

      <div className="section-head">
        <div className="eyebrow">Итог цикла {s.n}</div>
        <h2>{s.name}</h2>
        {s.status === 'done' ? (
          <p>
            Цикл пройден. Звание: «{s.rank}». Вершина: «{s.summit}».
          </p>
        ) : (
          <p>{cycleCaption(cycle)}.</p>
        )}
        <p className="muted small">
          {s.status === 'done' && `Числа — по журналу${s.asOf ? ` на ${fullDate(s.asOf)}` : ''}.`}
          {s.status === 'running' &&
            `Итог считается из журнала${s.asOf ? ` на ${fullDate(s.asOf)}` : ''} и растёт вместе с циклом. Когда будут закрыты все дни, цикл даст звание «${s.rankOnComplete}».`}
          {s.status === 'ahead' && `За пройденный цикл даётся звание «${s.rankOnComplete}».`}
        </p>
      </div>

      <div className="row">
        <CopyButton text={lines.join('\n')} label="Скопировать итог" />
      </div>

      {world.cycles.length > 1 && (
        <nav className="chips" aria-label="Итоги циклов">
          {world.cycles.map((c) =>
            c.id === cycle.id ? (
              <span key={c.id} className="chip sum-chip-on" aria-current="page">
                Цикл {c.n}
              </span>
            ) : (
              <a key={c.id} className="chip" href={`#/cycle/${c.id}`}>
                Цикл {c.n} · {c.name}
              </a>
            ),
          )}
        </nav>
      )}

      {s.status === 'ahead' ? (
        <PlanCard s={s} />
      ) : (
        <>
          <Figures s={s} />
          <DatesCard s={s} />
          <DaysCard s={s} />
          <TimeBlock s={s} />
          <WeeksCard s={s} />
          <TracksCard s={s} />
          <ProblemsCard s={s} />
          <BaselineCard s={s} />
          <ChecksCard s={s} />
          <FilesCard s={s} />
          <EarnedCard s={s} />
        </>
      )}

      <div className="card sum-card">
        <h3>Итог текстом</h3>
        <p className="muted small">Те же числа простым текстом: для чата с репетитором или для ретро.</p>
        <details className="sum-text">
          <summary>Показать текст</summary>
          <div className="report-text">
            {lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Цикл без занятий: итога ещё нет, показан только план. */
function PlanCard({ s }: { s: Summary }) {
  return (
    <div className="card sum-card">
      <h3>План цикла</h3>
      <dl className="sum-facts">
        <Fact label="Дней" value={s.days.total} />
        <Fact label="Недель" value={s.weeks.length} />
        <Fact label="Время ядра" value={fmtMinutes(s.time.plannedAll)} />
        {s.problems.planned > 0 && <Fact label="Основных задач" value={s.problems.planned} />}
        {s.files.total > 0 && <Fact label="Файлов" value={s.files.total} />}
        {s.passes.length > 0 && <Fact label="Перевалов" value={s.passes.length} />}
      </dl>
      <p className="muted">Итог появится с первым занятием. На вершине маршрута — «{s.summit}».</p>
    </div>
  )
}

/** Четыре главных числа. Время есть не всегда: тогда его место занимают файлы. */
function Figures({ s }: { s: Summary }) {
  const figs: { label: string; value: ReactNode; note: string }[] = [
    {
      label: 'Дней закрыто',
      value: `${s.days.closed} из ${s.days.total}`,
      note: s.days.left ? `осталось ${s.days.left}` : s.days.skipped ? `пропущено ${s.days.skipped}` : 'все дни цикла',
    },
    { label: 'Занятий', value: s.dates.sessions, note: `дней с занятиями — ${s.dates.activeDays}` },
  ]
  if (s.time.measured > 0) {
    figs.push({ label: 'Время по часам', value: fmtMinutes(s.time.fact), note: `при плане ${fmtMinutes(s.time.planned)}` })
  }
  figs.push({ label: 'Очки за цикл', value: `${s.earned.xp} XP`, note: `общий уровень — ${s.allTime.level}` })
  if (s.files.total > 0) {
    figs.push({ label: 'Файлов построено', value: `${s.files.built} из ${s.files.total}`, note: 'шпаргалки, заметки, журналы' })
  }
  return (
    <div className="sum-figs">
      {figs.slice(0, 4).map((fig) => (
        <div key={fig.label} className="sum-fig">
          <span className="sum-fig-label">{fig.label}</span>
          <span className="sum-fig-value">{fig.value}</span>
          <span className="sum-fig-note">{fig.note}</span>
        </div>
      ))}
    </div>
  )
}

function DatesCard({ s }: { s: Summary }) {
  const d = s.dates
  if (!d.first || !d.last) return null
  return (
    <div className="card sum-card">
      <h3>Сроки</h3>
      <dl className="sum-facts">
        <Fact label="Первое занятие" value={fullDate(d.first)} />
        <Fact label="Последнее занятие" value={fullDate(d.last)} />
        <Fact label="Календарных дней" value={d.calendarDays} />
        {d.restDays > 0 && <Fact label="На паузах" value={count(d.restDays, DAYS)} />}
      </dl>
      {d.rests.length > 0 && (
        <ul className="plain">
          {d.rests.map((rest) => (
            <li key={rest.from + rest.to}>
              {rest.planned ? 'Плановый перерыв' : 'Привал'} {shortPeriod(rest.from, rest.to)} — {count(rest.days, DAYS)}
              {rest.note ? <span className="muted"> · {rest.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Календарные дни — от первого занятия до последнего, включительно.
        {d.breakWorkdays > 0 && ` Плановых перерывов использовано ${d.breakWorkdays} из ${d.breakLimit} рабочих дней цикла.`}
      </p>
    </div>
  )
}

function DaysCard({ s }: { s: Summary }) {
  const parts = DAY_PARTS.map((part) => ({ ...part, n: s.days[part.key] })).filter((part) => part.n > 0)
  const open = s.days.inProgress
  return (
    <div className="card sum-card">
      <h3>Дни</h3>
      <div className="sum-bar" role="img" aria-label={`Дни цикла: ${parts.map((part) => `${part.label} — ${part.n}`).join(', ')}`}>
        {parts.map((part) => (
          <span key={part.key} className={`sum-day-${part.key}`} style={{ flexGrow: part.n }} title={`${capital(part.label)}: ${part.n}`} />
        ))}
      </div>
      <ul className="sum-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <i className={`sum-key sum-day-${part.key}`} aria-hidden="true" />
            <span>{part.label}</span>
            <b>{part.n}</b>
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <p className="muted small">
          {open.length === 1 ? `День ${open[0]} в работе: он входит` : `Дни ${open.join(', ')} в работе: они входят`} в «осталось».
        </p>
      )}
    </div>
  )
}

/** Разница плана и факта: сами числа стоят наверху страницы, подробности остаются на «Приросте». */
function TimeBlock({ s }: { s: Summary }) {
  const t = s.time
  if (t.days === 0) return null
  const diff = t.fact - t.planned
  return (
    <div className="card sum-card">
      <h3>Время: план и факт</h3>
      {t.measured > 0 ? (
        <>
          <dl className="sum-facts">
            <Fact label="Разница" value={diff === 0 ? 'по плану' : `${diff > 0 ? '+' : '−'}${fmtMinutes(Math.abs(diff))}`} />
          </dl>
          <p className="muted small">
            По {count(t.measured, CLOSED_DAYS)} с замером{t.unmeasured > 0 ? `; без замера — ${t.unmeasured}` : ''}. На весь цикл планом
            заложено {fmtMinutes(t.plannedAll)} ядра.
          </p>
          <details className="how">
            <summary>Как это считается</summary>
            <p>
              План — минуты ядра, факт — время занятий по часам. По дням и трекам — на вкладке <a href="#/growth">«Прирост»</a>.
            </p>
          </details>
        </>
      ) : (
        <p className="muted">
          Закрыто {count(t.days, DAYS)}, но время начала или конца занятий не записано: сравнить план с фактом пока нельзя.
        </p>
      )}
    </div>
  )
}

/** «неделя 2», «недели 2–6», «недели 2, 4». */
function weekNumbers(list: number[]): string {
  if (list.length === 1) return `неделя ${list[0]}`
  const row = list.every((n, i) => i === 0 || n === list[i - 1] + 1)
  return `недели ${row ? `${list[0]}–${list[list.length - 1]}` : list.join(', ')}`
}

function WeeksCard({ s }: { s: Summary }) {
  if (!s.weeks.length) return null
  // У идущего цикла недели, которые не начались, строками не идут: в них пока одни нули.
  const shown = s.status === 'done' ? s.weeks : s.weeks.filter((w) => w.started)
  const ahead = s.weeks.filter((w) => !shown.includes(w)).map((w) => w.n)
  const closed = s.weeks.filter((w) => w.closed).length
  return (
    <div className="card sum-card">
      <h3>Недели</h3>
      <p className="muted small">
        По чекпоинту закрыто {closed} из {s.weeks.length}.
        {s.tests.taken > 0
          ? ` Недельных тестов сдано ${s.tests.taken} из ${s.weeks.length}, баллов — ${s.tests.score} из ${s.tests.max}.`
          : ` Недельных тестов ${s.status === 'done' ? 'нет' : 'пока нет'}.`}
      </p>
      {shown.length > 0 && (
        <ul className="sum-rows">
          {shown.map((w) => (
            <li key={w.n}>
              <div className="sum-row-main">
                <b>Неделя {w.n}</b>
                <span className="muted small">
                  дней {w.daysDone} из {w.daysTotal} ·{' '}
                  {w.closed ? 'закрыта по чекпоинту' : w.daysDone < w.daysTotal ? 'идёт' : 'чекпоинт не отмечен'}
                </span>
              </div>
              <div className="sum-row-side">
                {w.test ? (
                  <>
                    <span>
                      тест <b>{w.test.score}</b> из {w.test.max}
                    </span>
                    <Gems count={w.test.gems} of={MAX_GEMS_PER_TEST} />
                  </>
                ) : (
                  <span className="muted">теста нет</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {ahead.length > 0 && <p className="muted small">Впереди: {weekNumbers(ahead)}.</p>}
    </div>
  )
}

function trackFacts(t: SummaryTrack): string {
  const parts: string[] = []
  if (t.daysTotal > 0) parts.push(`дней ${t.daysDone} из ${t.daysTotal}`)
  if (t.rank && !t.rank.done) parts.push(`ранг «${t.rank.name}»: условий ${t.rank.met} из ${t.rank.total}`)
  if (t.time.measured > 0) parts.push(`время ${fmtMinutes(t.time.fact)} при плане ${fmtMinutes(t.time.planned)}`)
  return parts.join(' · ')
}

function TracksCard({ s }: { s: Summary }) {
  if (!s.tracks.length) return null
  const shown = s.tracks.filter((t) => !trackAhead(s, t))
  const ahead = s.tracks.filter((t) => trackAhead(s, t))
  return (
    <div className="card sum-card">
      <h3>Треки</h3>
      {shown.length > 0 && (
        <ul className="sum-rows">
          {shown.map((t) => (
            <li key={t.code}>
              <div className="sum-row-main">
                <TrackBadge code={t.code} name={t.name} />
              </div>
              <div className="sum-row-side">
                <b>{t.xp} XP</b>
              </div>
              <div className="sum-row-wide">
                {t.daysTotal > 0 && (
                  <Meter value={t.daysDone} max={t.daysTotal} label={`${t.name}: дней пройдено ${t.daysDone} из ${t.daysTotal}`} />
                )}
                <span className="muted small">{trackFacts(t)}</span>
                {t.rank?.done && <span className="pill pill-core">ранг «{t.rank.name}» получен</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {ahead.length > 0 && (
        <p className="muted small">
          Ещё впереди: {ahead.map((t) => `${t.code} · ${t.name}`).join(', ')}.
        </p>
      )}
      <p className="muted small">
        Очки — только за этот цикл.
        {s.offTrackXp > 0 && ` Ещё ${s.offTrackXp} XP получено вне треков: недельные чекпоинты, возвращение после паузы, общие файлы и ретро.`}
      </p>
    </div>
  )
}

function ProblemsCard({ s }: { s: Summary }) {
  const p = s.problems
  if (p.total === 0) return null
  const touched = p.states.length > 0 || p.unsolved > 0
  // У идущего цикла повторы, до которых план ещё не дошёл, нулём не показываются.
  const due = (item: { have: number; of: number }) => item.of > 0 && (item.have > 0 || s.status === 'done')
  const solved = p.first.self + p.first.walkthrough
  return (
    <div className="card sum-card">
      <h3>Задачи LeetCode</h3>
      {!touched ? (
        <p className="muted">Из {p.planned} основных задач пока не начата ни одна.</p>
      ) : (
        <>
          <ul className="sum-rows sum-rows-tight">
            {p.states.map((item) => (
              <li key={item.state}>
                <span>{capital(item.label)}</span>
                <b className="sum-row-side">{item.count}</b>
              </li>
            ))}
            {p.unsolved > 0 && (
              <li>
                <span>Начата, решения пока нет</span>
                <b className="sum-row-side">{p.unsolved}</b>
              </li>
            )}
            {p.notStarted > 0 && (
              <li>
                <span className="muted">Не начата — из {p.planned} основных</span>
                <b className="sum-row-side">{p.notStarted}</b>
              </li>
            )}
          </ul>
          <dl className="sum-facts">
            {solved > 0 && <Fact label="Первое решение: сама / с разбором" value={`${p.first.self} / ${p.first.walkthrough}`} />}
            {due(p.repeated) && <Fact label="Повторено с пустого редактора" value={`${p.repeated.have} из ${p.repeated.of}`} />}
            {due(p.noHints) && <Fact label="Без подсказок" value={`${p.noHints.have} из ${p.noHints.of}`} />}
            {p.timed.tried > 0 && <Fact label="На таймере в лимит" value={`${p.timed.inLimit} из ${p.timed.tried}`} />}
          </dl>
          <details className="how">
            <summary>Как это считается</summary>
            <p>Состояния — по всем задачам цикла, вместе с парами и решёнными вне плана.</p>
            {p.notStarted > 0 && (
              <p>«Не начата» считается только по основным задачам и замерам: пары и запасная задача берутся по желанию.</p>
            )}
          </details>
        </>
      )}
    </div>
  )
}

function Point({ label, p, pending }: { label: string; p: SummaryPoint; pending: string }) {
  return (
    <div className="sum-ba-side">
      <div className="eyebrow">
        {label} · день {p.day}
        {p.date ? `, ${fmtDate(p.date)}` : ''}
      </div>
      {p.done ? (
        <>
          <div className="sum-ba-value">
            {p.minutes} мин{p.limit ? <small> из {p.limit} на таймере</small> : null}
          </div>
          <p className="small">
            {p.problemId}
            {p.title ? `. ${p.title}` : ''}
            {p.result ? ` — ${p.result}.` : ''}
          </p>
        </>
      ) : (
        <p className="muted">{pending}</p>
      )}
    </div>
  )
}

function BaselineCard({ s }: { s: Summary }) {
  const b = s.baseline
  const yet = s.status === 'done' ? 'не сделан' : 'ещё не сделан'
  return (
    <div className="card sum-card">
      <h3>Замер: было → стало</h3>
      {b.start.done || b.final.done ? (
        <div className="sum-ba">
          <Point label="Было" p={b.start} pending="Замера в начале цикла нет." />
          <Point label="Стало" p={b.final} pending={`Замер в конце цикла ${yet}.`} />
        </div>
      ) : (
        <p className="muted">
          Замер {yet}: по плану он в день {b.start.day} и в день {b.final.day}.
        </p>
      )}
      {b.delta !== null && <p>Разница: {deltaText(b.delta)}.</p>}

      {b.self.length > 0 && (
        <>
          <h4>Самооценка по трекам, от 1 до 5</h4>
          {b.assessed ? (
            <ul className="sum-rows sum-rows-tight">
              {b.self.map((t) => (
                <li key={t.code}>
                  <div className="sum-row-main">
                    <TrackBadge code={t.code} name={t.name} />
                  </div>
                  <b className="sum-row-side">
                    {t.start ?? '—'} → {t.final ?? '—'}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Самооценка по трекам не записана.</p>
          )}
        </>
      )}
    </div>
  )
}

function ChecksCard({ s }: { s: Summary }) {
  const c = s.checks
  const m = s.mistakes
  if (c.total === 0 && m.total === 0) return null
  return (
    <div className="card sum-card">
      <h3>Проверки понимания и ошибки</h3>
      {c.total > 0 && (
        <>
          <div
            className="sum-bar"
            role="img"
            aria-label={`Первый ответ: ${VERDICTS.map((v) => `${v.label} — ${c[v.key]}`).join(', ')}`}
          >
            {VERDICTS.map((v) =>
              c[v.key] ? <span key={v.key} className={`seg-${v.key}`} style={{ flexGrow: c[v.key] }} title={`${capital(v.label)}: ${c[v.key]} из ${c.total}`} /> : null,
            )}
          </div>
          <ul className="sum-legend">
            {VERDICTS.map((v) => (
              <li key={v.key}>
                <i className={`sum-key seg-${v.key}`} aria-hidden="true" />
                <span>
                  {v.mark} {v.label}
                </span>
                <b>{c[v.key]}</b>
              </li>
            ))}
          </ul>
          <p className="muted small">Первый ответ на {count(c.total, QUESTIONS)}: до подсказки и разбора.</p>
        </>
      )}
      {m.total > 0 && (
        <p>
          Журнал ошибок: {count(m.total, RECORDS)}, побеждено — {m.beaten}.
        </p>
      )}
    </div>
  )
}

function FileRows({ files }: { files: SummaryFile[] }) {
  return (
    <ul className="sum-rows">
      {files.map((f) => (
        <li key={f.id}>
          <div className="sum-row-main">
            <span>{f.title}</span>
            <span className="sum-path">{f.path}</span>
          </div>
          <div className="sum-row-side">
            {f.track && <TrackBadge code={f.track} />}
            <span className={`pill pill-stage-${f.stage}`}>{f.stageLabel}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FilesCard({ s }: { s: Summary }) {
  const f = s.files
  if (f.total === 0) return null
  const touched = f.list.filter((file) => file.stage >= 1)
  const ahead = f.list.filter((file) => file.stage === 0)
  return (
    <div className="card sum-card">
      <h3>Файлы цикла</h3>
      <p className="muted small">Шпаргалки, заметки и журналы в репозиториях: то, что остаётся после цикла.</p>
      <div className="sum-meter">
        <Meter value={f.built} max={f.total} label={`Файлов построено: ${f.built} из ${f.total}`} />
        <span>
          построено {f.built} из {f.total}
        </span>
      </div>
      {touched.length > 0 && <FileRows files={touched} />}
      {ahead.length > 0 && (
        <details className="fold inner">
          <summary>
            Ещё впереди <span className="muted">· {ahead.length}</span>
          </summary>
          <FileRows files={ahead} />
        </details>
      )}
    </div>
  )
}

function EarnedCard({ s }: { s: Summary }) {
  const g = s.earned.gems
  const passed = s.passes.filter((p) => p.done)
  const trophies = s.allTime.trophies
  return (
    <div className="card sum-card">
      <h3>Заработано за цикл</h3>
      <dl className="sum-facts">
        <Fact
          label="Монеты"
          value={
            <>
              <CoinIcon /> {s.earned.coins}
            </>
          }
        />
        <Fact
          label="Камни"
          value={
            <>
              <GemIcon /> {g.total}
            </>
          }
        />
      </dl>
      <ul className="plain">
        {s.passes.length > 0 && (
          <li>
            Перевалы: пройдено {passed.length} из {s.passes.length}, камней — {g.passes}.
            {passed.length > 0 && (
              <span className="muted">
                {' '}
                {passed.map((p) => `«${p.title}»${p.sign ? ` (знак: «${p.sign}»)` : ''}`).join(', ')}.
              </span>
            )}
          </li>
        )}
        {g.testsOf > 0 && (
          <li>
            Недельные тесты: камней — {g.tests} из {g.testsOf}.
          </li>
        )}
      </ul>
      <p className="muted small">
        Трофеи в итог цикла не входят: получено {trophies.earned} из {trophies.total}
        {trophies.gems > 0 ? `, камней за них — ${trophies.gems}` : ''}. Общий уровень — {s.allTime.level}, всего {s.allTime.xp} XP.
      </p>
      <details className="how">
        <summary>Как это считается</summary>
        <p>Трофеи к циклу не привязаны и даются один раз за всё время, поэтому в итог цикла не входят.</p>
      </details>
    </div>
  )
}
