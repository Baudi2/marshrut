import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Sky } from '../world/sky'
import { Scenery } from './fx'
import { BOUNDS } from './plan'
import { Stage } from './stage'
import { TownScene, type Mark, type TownView } from './town'

/** «45 мин», «3 ч 12 мин», «23 ч» — как в design/DESIGN.md. */
export function fmtLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000))
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest && hours < 12 ? `${hours} ч ${rest} мин` : `${hours} ч`
}

interface Props {
  view: TownView
  sky: Sky
  selected: string | null
  onSelect: (id: string | null) => void
  /** Текущее время: по нему считаются таймеры. */
  now: number
  /** Карточка выбранного: открывается листом поверх нижней части карты, в том числе на весь экран. */
  sheet?: ReactNode
}

/** Окно в город: карта двигается и приближается, постройки выбираются нажатием. */
export function TownCanvas({ view, sky, selected, onSelect, now, sheet }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const sheetBox = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const scenery = useRef<Scenery | null>(null)
  const town = useRef<TownScene | null>(null)
  const marksRef = useRef<Mark[]>([])
  const select = useRef(onSelect)
  select.current = onSelect
  const [marks, setMarks] = useState<Mark[]>([])
  const [status, setStatus] = useState('Загружаю город…')
  // Кнопок на карте нет: движение выключается только настройкой системы «уменьшить движение».
  const [motion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  // Единственная постоянная кнопка на карте: развернуть её на весь экран и вернуть обратно.
  // Лист с карточкой появляется только по нажатию на постройку и закрывается крестиком или нажатием мимо.
  // Карта растягивается средствами страницы, а не браузера: так это работает и на айфоне.
  const [full, setFull] = useState(false)
  // Подсказка «двигай пальцем» нужна, пока карту не тронули.
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    if (!full) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = before
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  const shown = useMemo(() => marks.filter((mark) => mark.readyAt || mark.id === selected), [marks, selected])
  const shownRef = useRef<Mark[]>([])
  shownRef.current = shown

  useEffect(() => {
    if (!host.current) return
    const point = { x: 0, y: 0 }
    const narrow = host.current.clientWidth < 620
    const created = new Stage(host.current, {
      bounds: BOUNDS,
      center: [1, 0],
      span: narrow ? 46 : 78,
      minSpan: 16,
      maxSpan: 96,
      onTap: (id) => select.current(id),
      onFrame: () => {
        const box = overlay.current
        if (!box) return
        shownRef.current.forEach((mark, i) => {
          const el = box.children[i] as HTMLElement | undefined
          if (!el) return
          created.project(mark.at, point)
          el.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -100%)`
        })
      },
    })
    stage.current = created
    scenery.current = new Scenery(created)
    town.current = new TownScene(scenery.current)
    // Для проверочного скрипта (scripts/dev/scene-probe.js): только на локальном сайте.
    if (import.meta.env.DEV) (window as unknown as { town3d?: unknown }).town3d = created
    return () => {
      town.current?.dispose()
      created.dispose()
      stage.current = null
      scenery.current = null
      town.current = null
    }
  }, [])

  // Сцена пересобирается только когда меняется сам город, сезон или запустение.
  const key = JSON.stringify(view)
  useEffect(() => {
    const scene = town.current
    if (!scene) return
    let stale = false
    scene
      .build(view)
      .then(() => {
        if (stale) return
        marksRef.current = scene.marks
        setMarks(scene.marks)
        setStatus('')
        scene.select(selected)
      })
      .catch((error) => setStatus('Город не загрузился: ' + String(error?.message ?? error)))
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!stage.current || !scenery.current) return
    stage.current.setSky(sky, view.neglect)
    town.current?.setSky(sky)
    scenery.current.idle = view.neglect >= 2
    scenery.current.refreshLight()
  }, [sky, view.neglect])

  useEffect(() => {
    town.current?.select(selected)
  }, [selected, marks])

  // Лист закрывает нижнюю часть карты. Если выбранное оказалось под ним, карта плавно сдвигается вверх.
  const hasSheet = !!sheet
  useEffect(() => {
    const scene = stage.current
    const box = host.current
    const panel = sheetBox.current
    if (!scene || !box || !panel || !selected) return
    const mark = marksRef.current.find((m) => m.id === selected)
    if (!mark) return
    const at = scene.project(mark.at, { x: 0, y: 0 })
    const frame0 = box.getBoundingClientRect()
    const sheetAt = panel.getBoundingClientRect()
    // На широком экране лист стоит справа: то, что левее него, он не закрывает.
    if (at.x < sheetAt.left - frame0.left - 40 || at.x > sheetAt.right - frame0.left + 40) return
    const line = Math.max(64, sheetAt.top - frame0.top - 80)
    const total = line - at.y
    if (total >= 0) return
    if (!motion) {
      scene.panBy(0, total)
      return
    }
    let done = 0
    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - started) / 220)
      const eased = 1 - (1 - k) ** 3
      scene.panBy(0, total * eased - done)
      done = total * eased
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // Только при выборе: смена размера карты («на весь экран» и обратно) камеру не трогает.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hasSheet])

  useEffect(() => {
    if (stage.current) stage.current.motion = motion
    stage.current?.invalidate()
  }, [motion])

  // Метки переставляются при каждом кадре; после смены их набора нужен новый кадр.
  useEffect(() => {
    stage.current?.invalidate()
  }, [shown])

  return (
    <div className={`town3d${full ? ' is-full' : ''}`} ref={host} onPointerDown={(e) => !moved && (e.target as HTMLElement).tagName === 'CANVAS' && setMoved(true)}>
      <button
        className="town3d-full"
        onClick={() => setFull(!full)}
        aria-label={full ? 'Вернуть карту в обычный размер' : 'Развернуть карту на весь экран'}
        title={full ? 'Вернуть в обычный размер (Esc)' : 'На весь экран'}
        aria-pressed={full}
      >
        {full ? 'Свернуть' : 'На весь экран'}
      </button>
      <div className="town3d-overlay" ref={overlay}>
        {shown.map((mark) => (
          <span className={`town3d-tag${mark.readyAt ? ' is-timer' : ''}`} key={mark.id}>
            <b>{mark.title}</b>
            {mark.readyAt && mark.readyAt > now && <small>осталось {fmtLeft(mark.readyAt - now)}</small>}
          </span>
        ))}
      </div>
      {!moved && (
        <p className="town3d-hint">
          <span className="hint-touch">Двигай пальцем, приближай щипком.</span>
          <span className="hint-mouse">Карту двигает мышь. Масштаб — Ctrl + колесо.</span>
        </p>
      )}
      {status && <p className="town3d-status">{status}</p>}
      {sheet && (
        <div className="town3d-sheet" key={selected ?? ''} ref={sheetBox} role="region" aria-label="Выбранное на карте" aria-live="polite">
          <button className="town3d-sheet-close" onClick={() => onSelect(null)} aria-label="Закрыть карточку">
            ×
          </button>
          {sheet}
        </div>
      )}
    </div>
  )
}
