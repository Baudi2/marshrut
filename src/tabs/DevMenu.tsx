// Меню разработчика: всё, что нужно для проверки сайта, а не для учёбы.
// Попасть сюда можно пятью быстрыми нажатиями на слово «Маршрут» в шапке или по адресу #/dev.
// Переключатели ничего не записывают: меняют только картинку и сбрасываются при перезагрузке страницы.
import { useState } from 'react'
import { CONDITIONS, type ConditionLevel } from '../game/rules'
import { TIERS } from '../game/town'
import { KINDS, KIND_NAME, PHASES, PHASE_NAME, SEASONS, SEASON_NAME, type Sky, type SkyOverride } from '../world/sky'

/** Предпросмотры: что сайт показывает вместо настоящего состояния. null и пустой объект — «как на самом деле». */
export interface DevState {
  /** Запустение: как будто пропущено столько-то рабочих дней. */
  condition: ConditionLevel | null
  /** Сезон, время суток и погода. */
  sky: SkyOverride
  /** Ступень города: как он может выглядеть, когда дорастёт. */
  stage: number | null
}

export const DEV_OFF: DevState = { condition: null, sky: {}, stage: null }

export const devActive = (dev: DevState) => dev.condition !== null || dev.stage !== null || Object.keys(dev.sky).length > 0

/** Что сейчас подменено — одной строкой, для полосы под шапкой. */
export function devSummary(dev: DevState): string {
  const parts: string[] = []
  if (dev.condition !== null) parts.push(`состояние мира — «${CONDITIONS[dev.condition].name.toLowerCase()}»`)
  const sky = [dev.sky.season && SEASON_NAME[dev.sky.season], dev.sky.phase && PHASE_NAME[dev.sky.phase], dev.sky.kind && KIND_NAME[dev.sky.kind]].filter(Boolean)
  if (sky.length) parts.push(`небо — ${sky.join(', ')}`)
  if (dev.stage !== null) parts.push(`город — «${TIERS[dev.stage].name}»`)
  return parts.join('; ')
}

const CONDITION_LABELS = ['без пропусков', '2–3 дня', '4–7 дней', '8 и больше']

/** Ключи сайта в памяти браузера и сколько в них лежит. Таймеры шагов сведены в одну строку. */
function storedKeys(): { key: string; size: number }[] {
  try {
    const rows: { key: string; size: number }[] = []
    let timers = 0
    let timerSize = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      const size = (localStorage.getItem(key) ?? '').length
      if (key.startsWith('timer:')) {
        timers++
        timerSize += size
      } else rows.push({ key, size })
    }
    rows.sort((a, b) => a.key.localeCompare(b.key))
    if (timers) rows.push({ key: `timer:… (таймеров шагов: ${timers})`, size: timerSize })
    return rows
  } catch {
    return []
  }
}

interface Props {
  dev: DevState
  onChange: (next: DevState) => void
  /** Настоящее состояние: чтобы было видно, от чего предпросмотр отличается. */
  real: { condition: ConditionLevel; sky: Sky; stage: number; missed: number }
  /** Когда обновлялись данные цикла. */
  updatedAt: string
}

export function DevMenu({ dev, onChange, real, updatedAt }: Props) {
  const [keys] = useState(storedKeys)
  const pickSky = <K extends keyof SkyOverride>(key: K, value: string) => {
    const sky = { ...dev.sky }
    if (value) sky[key] = value as SkyOverride[K]
    else delete sky[key]
    onChange({ ...dev, sky })
  }
  const shown = dev.condition ?? real.condition

  return (
    <div className="stack dev">
      <div className="section-head">
        <h2>Меню разработчика</h2>
        <p className="muted">
          Здесь лежит то, что нужно для проверки сайта, а не для учёбы. Переключатели ничего не записывают: меняют только картинку
          и сбрасываются при перезагрузке страницы.
        </p>
      </div>

      <div className="card">
        <div className="dev-head">
          <h3>Запустение</h3>
          <span className="muted small">
            на самом деле: {CONDITIONS[real.condition].name.toLowerCase()}, пропущено {real.missed}
          </span>
        </div>
        <div className="seg" role="group" aria-label="Как выглядят пропуски рабочих дней">
          {CONDITION_LABELS.map((label, i) => (
            <button
              key={label}
              className={shown === i ? 'is-on' : ''}
              aria-pressed={shown === i}
              onClick={() => onChange({ ...dev, condition: i === real.condition ? null : (i as ConditionLevel) })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="small">
          <b>{CONDITIONS[shown].name}.</b> {CONDITIONS[shown].look} Видно на карте маршрута и в городе.
        </p>
      </div>

      <div className="card">
        <div className="dev-head">
          <h3>Небо</h3>
          <span className="muted small">
            на самом деле: {SEASON_NAME[real.sky.season]}, {PHASE_NAME[real.sky.phase]}, {KIND_NAME[real.sky.kind]}
          </span>
        </div>
        <div className="selects">
          <label>
            Сезон
            <select className="field" value={dev.sky.season ?? ''} onChange={(e) => pickSky('season', e.target.value)}>
              <option value="">как сейчас</option>
              {SEASONS.map((s) => (
                <option key={s} value={s}>
                  {SEASON_NAME[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Время суток
            <select className="field" value={dev.sky.phase ?? ''} onChange={(e) => pickSky('phase', e.target.value)}>
              <option value="">как сейчас</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {PHASE_NAME[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Погода
            <select className="field" value={dev.sky.kind ?? ''} onChange={(e) => pickSky('kind', e.target.value)}>
              <option value="">как сейчас</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_NAME[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="dev-head">
          <h3>Ступень города</h3>
          <span className="muted small">на самом деле: {TIERS[real.stage].name.toLowerCase()}</span>
        </div>
        <p className="muted small">
          Как город может выглядеть на ступени: все постройки, которые она разрешает, и все украшения. Это картинка, а не прогноз;
          строить и чинить в предпросмотре нельзя.
        </p>
        <div className="seg" role="group" aria-label="Предпросмотр ступени города">
          <button className={dev.stage === null ? 'is-on' : ''} aria-pressed={dev.stage === null} onClick={() => onChange({ ...dev, stage: null })}>
            Как есть
          </button>
          {TIERS.map((tier) => (
            <button key={tier.n} className={dev.stage === tier.n ? 'is-on' : ''} aria-pressed={dev.stage === tier.n} onClick={() => onChange({ ...dev, stage: tier.n })}>
              {tier.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Посмотреть</h3>
        <ul className="plain">
          <li>
            <a href="#/path">Карта маршрута</a> <span className="muted">— запустение и небо</span>
          </li>
          <li>
            <a href="#/town">Город</a> <span className="muted">— запустение, небо и ступень</span>
          </li>
          <li>
            <a href="#/lab">Каталог построек</a> <span className="muted">— все уровни каждой постройки рядом, со своими переключателями</span>
          </li>
        </ul>
        <div className="row">
          <button className="btn" disabled={!devActive(dev)} onClick={() => onChange(DEV_OFF)}>
            Сбросить всё
          </button>
        </div>
      </div>

      <details className="card fold">
        <summary>
          Что хранится в этом браузере <span className="muted">· {keys.length}</span>
        </summary>
        {keys.length > 0 ? (
          <ul className="plain dev-keys">
            {keys.map((row) => (
              <li key={row.key}>
                <code>{row.key}</code> <span className="muted">— {row.size} зн.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Ничего: всё перенесено в репозиторий или на сайте ещё ничего не делалось.</p>
        )}
        <p className="muted small">Только список, отсюда ничего не удаляется. Данные цикла в репозитории обновлены {updatedAt}.</p>
      </details>
    </div>
  )
}
