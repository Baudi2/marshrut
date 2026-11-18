import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import models from '../town3d/models.gen.json'
import { fillBoard, type BoardCell, type BoardLabel } from '../town3d/board'
import { catalogRows } from '../town3d/catalog'
import { Scenery } from '../town3d/fx'
import { Stage } from '../town3d/stage'
import { KINDS, KIND_NAME, PHASES, PHASE_NAME, SEASONS, SEASON_NAME, type Phase, type Season, type Sky, type WeatherKind } from '../world/sky'

/** Сырые модели набора по одной в клетке: чтобы видеть, с чем работаем. */
function rawRows(prefix: string, perRow = 8): BoardCell[][] {
  const keys = Object.keys(models).filter((key) => key.startsWith(prefix + '/'))
  const rows: BoardCell[][] = []
  for (let i = 0; i < keys.length; i += perRow) {
    rows.push(keys.slice(i, i + perRow).map((key) => ({ title: key.split('/')[1], look: (b) => b.model(key) })))
  }
  return rows
}

const SETS: Record<string, { name: string; rows: () => BoardCell[][]; pitch: number }> = {
  catalog: { name: 'Постройки по уровням', rows: catalogRows, pitch: 16 },
  r: { name: 'Набор: Fantasy RTS', rows: () => rawRows('r'), pitch: 14 },
  v: { name: 'Набор: Medieval Village', rows: () => rawRows('v'), pitch: 14 },
  f: { name: 'Набор: ферма и лодки', rows: () => [...rawRows('f'), ...rawRows('s')], pitch: 16 },
}

/** Каталог построек: все уровни рядом, с переключателями сезона, времени суток и погоды. */
export default function TownLab() {
  const host = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const scenery = useRef<Scenery | null>(null)
  const labels = useRef<BoardLabel[]>([])
  const [set, setSet] = useState('catalog')
  const [season, setSeason] = useState<Season>('summer')
  const [phase, setPhase] = useState<Phase>('day')
  const [kind, setKind] = useState<WeatherKind>('clear')
  const [neglect, setNeglect] = useState(0)
  const [status, setStatus] = useState('Загружаю модели…')
  const [shown, setShown] = useState<BoardLabel[]>([])

  const sky = useMemo<Sky>(() => ({ season, phase, kind, clouds: 0, temperature: null, live: false }), [season, phase, kind])

  useEffect(() => {
    if (!host.current) return
    const point = { x: 0, y: 0 }
    const created = new Stage(host.current, {
      bounds: { minX: -20, maxX: 400, minZ: -20, maxZ: 400 },
      center: [30, 20],
      span: 70,
      minSpan: 12,
      maxSpan: 260,
      onFrame: () => {
        const box = overlay.current
        if (!box) return
        labels.current.forEach((label, i) => {
          const el = box.children[i] as HTMLElement | undefined
          if (!el) return
          created.project(label.at, point)
          el.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, 0)`
        })
      },
    })
    stage.current = created
    scenery.current = new Scenery(created)
    ;(window as unknown as { lab?: unknown }).lab = { stage: created, THREE }
    return () => {
      created.dispose()
      stage.current = null
      scenery.current = null
    }
  }, [])

  useEffect(() => {
    const s = scenery.current
    if (!s) return
    let stale = false
    setStatus('Загружаю модели…')
    const chosen = SETS[set]
    fillBoard(s, chosen.rows(), season, chosen.pitch)
      .then((result) => {
        if (stale) return
        labels.current = result.labels
        setShown(result.labels)
        setStatus('')
        stage.current?.invalidate()
      })
      .catch((error) => setStatus('Не удалось загрузить модели: ' + String(error?.message ?? error)))
    return () => {
      stale = true
    }
  }, [set, season])

  useEffect(() => {
    const s = scenery.current
    if (!stage.current || !s) return
    stage.current.setSky(sky, neglect)
    s.idle = neglect >= 2
    s.refreshLight()
  }, [sky, neglect])

  return (
    <section className="page">
      <h1>Каталог построек</h1>
      <div className="lab-controls">
        <label>
          Что показать
          <select value={set} onChange={(e) => setSet(e.target.value)}>
            {Object.entries(SETS).map(([id, value]) => (
              <option key={id} value={id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Сезон
          <select value={season} onChange={(e) => setSeason(e.target.value as Season)}>
            {SEASONS.map((v) => (
              <option key={v} value={v}>
                {SEASON_NAME[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Время
          <select value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>
            {PHASES.map((v) => (
              <option key={v} value={v}>
                {PHASE_NAME[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Погода
          <select value={kind} onChange={(e) => setKind(e.target.value as WeatherKind)}>
            {KINDS.map((v) => (
              <option key={v} value={v}>
                {KIND_NAME[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Запустение
          <select value={neglect} onChange={(e) => setNeglect(Number(e.target.value))}>
            {[0, 1, 2, 3].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="town3d lab-scene" ref={host}>
        <div className="town3d-overlay" ref={overlay}>
          {shown.map((label, i) => (
            <span className="town3d-tag" key={i}>
              <b>{label.title}</b>
              {label.note && <small>{label.note}</small>}
            </span>
          ))}
        </div>
        {status && <p className="town3d-status">{status}</p>}
      </div>
    </section>
  )
}
