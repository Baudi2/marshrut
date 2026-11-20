import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { CONDITIONS, type ConditionLevel } from '../game/rules'
import { DAYS, fmtDate, plural } from '../game/text'
import { trackColor } from '../world/sprites'

export { DAYS, fmtDate, plural }

/** Текст плана: `код` в обратных кавычках и ссылки [текст](адрес). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\(https?:[^)]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
        const link = /^\[([^\]]+)\]\((https?:[^)]+)\)$/.exec(part)
        if (link) {
          return (
            <a key={i} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          )
        }
        return part
      })}
    </>
  )
}

export function TrackBadge({ code, name }: { code: string; name?: string }) {
  if (code === 'retro') return <span className="track-badge">ретро</span>
  return (
    <span className="track-badge">
      <i style={{ background: trackColor(code) }} />
      {code}
      {name ? ` · ${name}` : ''}
    </span>
  )
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0
  return (
    <span className="meter" role="img" aria-label={label} title={label}>
      <span style={{ width: `${(share * 100).toFixed(1)}%` }} />
    </span>
  )
}

export function Tile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}

/** true, когда блок уже порога: сцены перестраиваются под телефон. */
export function useNarrow(ref: RefObject<HTMLElement | null>, breakpoint = 620): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < breakpoint))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, breakpoint])
  return narrow
}

interface TimerState {
  running: boolean
  startedAt: number
  banked: number
}

const IDLE: TimerState = { running: false, startedAt: 0, banked: 0 }

function clock(totalSeconds: number): string {
  const s = Math.abs(totalSeconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Таймер шага. Переживает перезагрузку страницы; после нуля считает перерасход. */
export function Timer({ id, minutes }: { id: string; minutes: number }) {
  const key = `timer:${id}`
  const [state, setState] = useState<TimerState>(() => {
    try {
      return { ...IDLE, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
    } catch {
      return IDLE
    }
  })
  const [, tick] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // без хранилища таймер работает до перезагрузки
    }
  }, [key, state])

  useEffect(() => {
    if (!state.running) return
    const timer = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [state.running])

  const elapsed = state.banked + (state.running ? Date.now() - state.startedAt : 0)
  const left = minutes * 60 - Math.floor(elapsed / 1000)
  const started = state.running || state.banked > 0

  return (
    <div className={`timer${left < 0 ? ' is-over' : ''}`}>
      <div className="timer-face" aria-live="off">
        {left < 0 ? '+' : ''}
        {clock(left)}
      </div>
      <div className="timer-note">{left < 0 ? 'сверх плана' : `из ${minutes} мин по плану`}</div>
      <div className="timer-actions">
        {state.running ? (
          <button className="btn" onClick={() => setState({ running: false, startedAt: 0, banked: elapsed })}>
            Пауза
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => setState({ running: true, startedAt: Date.now(), banked: state.banked })}
          >
            {started ? 'Продолжить' : 'Старт'}
          </button>
        )}
        {started && (
          <button className="btn btn-quiet" onClick={() => setState(IDLE)}>
            Сбросить
          </button>
        )}
      </div>
    </div>
  )
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер обмена недоступен: текст остаётся на экране, его можно выделить вручную
    }
  }
  return (
    <button className="btn" onClick={copy}>
      {copied ? 'Скопировано' : label}
    </button>
  )
}

/** Состояние мира: сколько пропущено и что это значит. Посмотреть другие стадии можно в меню разработчика. */
export function ConditionCard({
  real,
  missed,
  firewood = 0,
  covered = 0,
  breaks,
}: {
  real: ConditionLevel
  missed: number
  /** Сколько рабочих дней пропуска прикрывает запас дров и сколько уже прикрыто. */
  firewood?: number
  covered?: number
  /** Плановые перерывы цикла: использовано рабочих дней, лимит и дата конца идущего перерыва. */
  breaks?: { used: number; limit: number; until: string | null }
}) {
  return (
    <div className="card preview">
      <div className="preview-head">
        <div>
          <h3>Состояние маршрута: {CONDITIONS[real].name.toLowerCase()}</h3>
          <p className="muted">
            {missed === 0
              ? 'Пропущенных рабочих дней нет.'
              : `Без занятия ${missed} ${plural(missed, ['рабочий день', 'рабочих дня', 'рабочих дней'])}.`}{' '}
            Один пропуск ничего не меняет, со второго подряд мир начинает зарастать. Очки при этом не отнимаются, а первое
            занятие возвращает порядок. Настоящая погода считается отдельно.
            {firewood > 0 &&
              ` Запас дров в дровнике прикрывает до ${firewood} ${plural(firewood, ['рабочего дня', 'рабочих дней', 'рабочих дней'])} пропуска` +
                (covered > 0 ? `; сейчас прикрыто ${covered}.` : '.')}
            {breaks?.until && ` Объявлен плановый перерыв до ${fmtDate(breaks.until)}: эти дни пропуском не считаются.`}
            {breaks && breaks.used > 0 && ` Плановых перерывов в цикле: ${breaks.used} из ${breaks.limit} рабочих дней.`}
          </p>
        </div>
      </div>
      <p className="preview-look">
        <b>{CONDITIONS[real].name}.</b> {CONDITIONS[real].look}
      </p>
    </div>
  )
}
