import { useState } from 'react'
import { STAGE_LABEL, type BuildingView, type CycleView, type World } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import { ConditionPreview, TrackBadge } from '../ui/bits'
import { CampScene } from '../world/CampScene'
import type { Sky } from '../world/sky'
import { artifactState } from './PathTab'
import { Shop, type ShopApi } from './Shop'

interface Props {
  world: World
  cycle: CycleView
  level: ConditionLevel
  preview: ConditionLevel | null
  onPreview: (level: ConditionLevel | null) => void
  shop: ShopApi
  /** Сломанное с учётом предпросмотра. */
  broken: string[]
  sky: Sky
}

function advice(b: BuildingView, cycle: CycleView): string {
  const nextGrow = b.item.growsOn.find((n) => !cycle.days.find((d) => d.n === n)?.done)
  switch (b.stage) {
    case 0:
      return `Участок размечен. Файл появится в день ${b.item.day}.`
    case 1:
      return 'Стройка: файл ещё не сохранён в репозитории. Сохрани и закоммить его — домик достроится, это +10 XP.'
    case 2:
      return nextGrow ? `Дом построен. Пристройка появится, когда файл будет дописан в день ${nextGrow}.` : 'Дом построен.'
    default:
      return 'Дом с пристройкой: файл дописывался после создания.'
  }
}

export function CampTab({ world, cycle, level, preview, onPreview, shop, broken, sky }: Props) {
  const firstOpen = cycle.buildings.find((b) => b.stage === 1) ?? cycle.buildings[0]
  const [selected, setSelected] = useState<string | null>(firstOpen?.item.id ?? null)
  const building = cycle.buildings.find((b) => b.item.id === selected) ?? null
  const thisWeek = world.rhythm.length ? world.rhythm[world.rhythm.length - 1].sessions : 0
  const count = (stage: number) => cycle.buildings.filter((b) => (stage === 2 ? b.stage >= 2 : b.stage === stage)).length

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Лагерь</h2>
        <p className="muted">
          Каждый домик — файл из твоих репозиториев. Построено {count(2)}, строится {count(1)}, участков {count(0)}. Костёр
          тем больше, чем больше занятий на этой неделе.
        </p>
      </div>

      <CampScene
        cycle={cycle}
        level={level}
        sessionsThisWeek={thisWeek}
        selected={selected}
        onSelect={setSelected}
        owned={shop.owned}
        gear={shop.gear}
        broken={broken}
        sky={sky}
      />

      {building && (
        <div className="card" aria-live="polite">
          <div className="day-head">
            <div>
              <div className="eyebrow">{building.item.repo}</div>
              <h3>{building.item.title}</h3>
            </div>
            <div className="chips">
              <span className={`pill pill-stage-${building.stage}`}>{STAGE_LABEL[building.stage]}</span>
              {building.item.track && <TrackBadge code={building.item.track} />}
            </div>
          </div>
          <p>
            <code>{building.item.path}</code>
            {building.recorded && <span className="muted"> — в журнале: {artifactState(building.recorded)}</span>}
          </p>
          <p>{advice(building, cycle)}</p>
        </div>
      )}

      <Shop shop={shop} />

      <div className="card">
        <h3>Домики-файлы</h3>
        {[3, 2, 1, 0].map((stage) => {
          const list = cycle.buildings.filter((b) => b.stage === stage)
          if (!list.length) return null
          return (
            <div key={stage} className="build-group">
              <h4>
                {STAGE_LABEL[stage]} <span className="muted">· {list.length}</span>
              </h4>
              <ul className="build-list">
                {list.map((b) => (
                  <li key={b.item.id}>
                    <button className={selected === b.item.id ? 'is-on' : ''} onClick={() => setSelected(b.item.id)}>
                      <span>{b.item.title}</span>
                      <code>{b.item.path}</code>
                      <span className="muted">день {b.item.day}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <ConditionPreview real={world.condition.level} missed={world.missedWorkdays} value={preview} onChange={onPreview} />
    </div>
  )
}
