import { useState, type FormEvent } from 'react'
import type { CycleView, DayView, World } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import { ConditionCard, DAYS, RichText, TrackBadge, fmtDate, plural } from '../ui/bits'
import { timeReport } from '../game/report'
import { SIGN_GEMS, SIGN_MAX } from '../game/rewards'
import { cycleCaption } from '../game/summary'
import { GemIcon } from '../world/extras'
import { MapScene, NODE_LABEL } from '../world/MapScene'
import { trackColor } from '../world/sprites'
import { SkyCard, type SkyApi } from './SkyCard'
import { WeeklyTests } from './Tests'
import { WeekReport } from './WeekReport'

const ARTIFACT_STATE: Record<string, string> = {
  created: 'создан',
  saved: 'сохранён',
  committed: 'закоммичен',
  'not-saved': 'не сохранён',
  'given-by-tutor': 'выдан репетитором, не сохранён',
  unknown: 'не подтверждено',
}

export const artifactState = (state: string) => ARTIFACT_STATE[state] ?? state

/** Памятные знаки на пройденных перевалах: подпись за камень. */
export interface SignApi {
  gems: number
  /** Поставить знак. Возвращает причину отказа или null. */
  put: (cycleId: string, day: number, text: string) => string | null
  /** Знак есть только в этом браузере: его ещё можно убрать. */
  isFresh: (cycleId: string, day: number) => boolean
  remove: (cycleId: string, day: number) => void
}

interface Props {
  world: World
  cycle: CycleView
  level: ConditionLevel
  /** Надетая экипировка путника. */
  gear: string[]
  skyApi: SkyApi
  signs: SignApi
}

export function PathTab({ world, cycle, level, gear, skyApi, signs }: Props) {
  const [selected, setSelected] = useState<number>(cycle.current?.day.n ?? cycle.days[cycle.done ? cycle.days.length - 1 : 0].n)
  const day = cycle.days.find((d) => d.n === selected) ?? cycle.days[0]
  const week = cycle.weeks.find((w) => w.week.n === day.plan.week)

  return (
    <div className="stack">
      <div className="section-head">
        <h2>
          Цикл {cycle.n} · {cycle.name}
        </h2>
        <p className="muted">
          Пройдено {cycle.daysDone} {plural(cycle.daysDone, DAYS)} из {cycle.days.length}. Нажми на точку, чтобы открыть день.
        </p>
      </div>

      <MapScene cycle={cycle} level={level} selected={selected} onSelect={setSelected} gear={gear} sky={skyApi.sky} />

      <div className="legend" aria-label="Обозначения">
        <span><i className="dot dot-core" /> сделан ядром</span>
        <span><i className="dot dot-minimum" /> на минимуме</span>
        <span><i className="dot dot-current" /> текущий</span>
        <span><i className="dot dot-ahead" /> впереди</span>
        <span><i className="dot dot-skipped" /> пропущен</span>
        <span><i className="flag-mark" /> перевал</span>
        {world.tracks.map((t) => (
          <span key={t.track.code}>
            <i className="dot" style={{ background: trackColor(t.track.code) }} /> {t.track.code} · {t.track.name}
          </span>
        ))}
      </div>

      <DayCard key={day.n} day={day} cycle={cycle} checkpoint={week?.week.checkpoint} signs={signs} />

      <WeeklyTests cycle={cycle} />

      <WeekReport cycle={cycle} />

      {/* Вход на страницу «Итог цикла»: она без вкладки, открывается отсюда. */}
      <a className="card deck-link" href={`#/cycle/${cycle.id}`}>
        <span>
          <b>Итог цикла.</b> {cycleCaption(cycle)}
        </span>
        <span aria-hidden="true">→</span>
      </a>

      <SkyCard api={skyApi} />

      <ConditionCard
        real={world.condition.level}
        missed={world.missedWorkdays}
        firewood={Math.max(world.town.firewood, world.covered)}
        covered={world.covered}
        breaks={world.breaks}
      />
    </div>
  )
}

function SignForm({ day, cycle, signs }: { day: DayView; cycle: CycleView; signs: SignApi }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const put = (event: FormEvent) => {
    event.preventDefault()
    setError(signs.put(cycle.id, day.n, text))
  }
  return (
    <form className="sign-form" onSubmit={put}>
      <p className="muted small">
        Перевал пройден. Можно поставить здесь памятный знак со своей подписью: что понял, что далось тяжело, что хочешь запомнить.
      </p>
      <input
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={SIGN_MAX}
        placeholder="Подпись, до 40 знаков"
        aria-label="Подпись на памятном знаке"
      />
      <button className="btn" type="submit" disabled={signs.gems < SIGN_GEMS}>
        Поставить знак · <GemIcon /> {SIGN_GEMS}
      </button>
      {signs.gems < SIGN_GEMS && <span className="muted small">не хватает камней</span>}
      {error && (
        <p className="form-error" role="alert">
          Не поставлен: {error}.
        </p>
      )}
    </form>
  )
}

function DayCard({ day, cycle, checkpoint, signs }: { day: DayView; cycle: CycleView; checkpoint?: string; signs: SignApi }) {
  const plan = day.plan
  const p = day.progress
  const isLastOfWeek = cycle.days.filter((d) => d.plan.week === plan.week).slice(-1)[0]?.n === day.n
  // То же число, что в карточке «Время: план и факт» на «Приросте».
  const spent = timeReport(cycle).days.find((d) => d.n === day.n)?.fact
  return (
    <div className="card" aria-live="polite">
      <div className="day-head">
        <div>
          <div className="eyebrow">
            День {day.n} · неделя {plan.week}
          </div>
          <h3>{plan.track}</h3>
        </div>
        <div className="chips">
          <span className={`pill pill-${day.state}`}>{NODE_LABEL[day.state]}</span>
          <TrackBadge code={plan.trackCode} />
          {p?.dates.length ? <span className="chip">{p.dates.map(fmtDate).join(', ')}</span> : null}
          {spent != null ? (
            <span className="chip">
              {spent} мин при плане {plan.plannedMinutes}
            </span>
          ) : (
            <span className="chip">{plan.plannedMinutes} мин</span>
          )}
        </div>
      </div>

      {day.keyPoint && (
        <p className="key-note">
          <b>Перевал: {day.keyPoint.title}.</b> {day.keyPoint.what}.
        </p>
      )}
      {day.sign && (
        <p className="key-note sign-note">
          <b>Памятный знак:</b> «{day.sign}»
          {signs.isFresh(cycle.id, day.n) && (
            <>
              {' '}
              <button className="link-btn" onClick={() => signs.remove(cycle.id, day.n)}>
                убрать и вернуть камень
              </button>
            </>
          )}
        </p>
      )}
      {day.keyPoint && day.done && !day.sign && <SignForm day={day} cycle={cycle} signs={signs} />}
      {p?.summary && <p>{p.summary}</p>}

      <ol className="steps">
        {plan.steps.map((s) => {
          const done = day.stepsDone.includes(s.n)
          return (
            <li key={s.n} className={done ? 'step-done' : 'step-todo'}>
              <span className="step-mark" aria-hidden="true">
                {done ? '✓' : '○'}
              </span>
              <span>
                <span className="sr-only">{done ? 'Сделан: ' : 'Не сделан: '}</span>
                <RichText text={s.text} />
              </span>
            </li>
          )
        })}
      </ol>

      {p?.artifacts?.length ? (
        <>
          <h4>Артефакты</h4>
          <ul className="plain">
            {p.artifacts.map((a) => (
              <li key={a.repo + a.path}>
                <code>{a.path}</code> <span className="muted">— {a.repo}, {artifactState(a.state)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {isLastOfWeek && checkpoint && (
        <p className="muted">
          <b>Чекпоинт недели {plan.week}:</b> {checkpoint}.
        </p>
      )}
    </div>
  )
}
