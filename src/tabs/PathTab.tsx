import { useState } from 'react'
import type { CycleView, DayView, World } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import { ConditionPreview, DAYS, RichText, TrackBadge, fmtDate, plural } from '../ui/bits'
import { MapScene, NODE_LABEL } from '../world/MapScene'
import { trackColor } from '../world/sprites'
import { SkyCard, type SkyApi } from './SkyCard'
import { WeeklyTests } from './Tests'

const ARTIFACT_STATE: Record<string, string> = {
  created: 'создан',
  saved: 'сохранён',
  committed: 'закоммичен',
  'not-saved': 'не сохранён',
  'given-by-tutor': 'выдан репетитором, не сохранён',
  unknown: 'не подтверждено',
}

export const artifactState = (state: string) => ARTIFACT_STATE[state] ?? state

interface Props {
  world: World
  cycle: CycleView
  level: ConditionLevel
  preview: ConditionLevel | null
  onPreview: (level: ConditionLevel | null) => void
  /** Надетая экипировка путника. */
  gear: string[]
  skyApi: SkyApi
}

export function PathTab({ world, cycle, level, preview, onPreview, gear, skyApi }: Props) {
  const [selected, setSelected] = useState<number>(cycle.current?.day.n ?? cycle.days[0].n)
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

      <DayCard day={day} cycle={cycle} checkpoint={week?.week.checkpoint} />

      <WeeklyTests cycle={cycle} />

      <SkyCard api={skyApi} />

      <ConditionPreview real={world.condition.level} missed={world.missedWorkdays} value={preview} onChange={onPreview} />
    </div>
  )
}

function DayCard({ day, cycle, checkpoint }: { day: DayView; cycle: CycleView; checkpoint?: string }) {
  const plan = day.plan
  const p = day.progress
  const isLastOfWeek = cycle.days.filter((d) => d.plan.week === plan.week).slice(-1)[0]?.n === day.n
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
          {p?.wallClockMinutes ? (
            <span className="chip">
              {p.wallClockMinutes} мин при плане {plan.plannedMinutes}
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
