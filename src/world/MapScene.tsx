import { useMemo, useRef } from 'react'
import type { CycleView, DayView, NodeState } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import { useNarrow } from '../ui/bits'
import type { Sky } from './sky'
import { NightSky, PhaseTint, Precipitation, SkyArt, WeatherWash, skyClass } from './SkyLayers'
import { Fire, Flag, Rock, Tent, Traveler, Tree, Tuft, rng, trackColor } from './sprites'

interface Pt {
  x: number
  y: number
}

export const NODE_LABEL: Record<NodeState, string> = {
  ahead: 'впереди',
  current: 'текущий',
  minimum: 'сделан на минимуме',
  core: 'сделан ядром',
  extension: 'сделан с расширением',
  skipped: 'пропущен',
}

/** Гладкая кривая через точки, по одному отрезку на пару соседних точек. */
function segments(pts: Pt[]): string[] {
  const out: string[] = []
  const t = 0.19
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c = [
      p1.x + (p2.x - p0.x) * t,
      p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t,
      p2.y - (p3.y - p1.y) * t,
      p2.x,
      p2.y,
    ]
    out.push('C' + c.map((v) => v.toFixed(1)).join(' '))
  }
  return out
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

interface Props {
  cycle: CycleView
  level: ConditionLevel
  selected: number | null
  onSelect: (day: number) => void
  /** Надетая экипировка путника. */
  gear: string[]
  /** Сезон, время суток и погода. */
  sky: Sky
}

export function MapScene({ cycle, level, selected, onSelect, gear, sky }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(ref)

  const scene = useMemo(() => {
    const W = narrow ? 400 : 900
    const rowH = narrow ? 100 : 108
    const top = 132
    const bottom = 96
    const padX = narrow ? 36 : 110
    const maxStep = narrow ? 66 : 150
    const H = top + cycle.weeks.length * rowH + bottom

    const pos = new Map<number, Pt>()
    const rows = cycle.weeks.map((w, wi) => {
      const y = H - bottom - wi * rowH - rowH / 2 + 6
      const count = w.days.length
      const step = count > 1 ? Math.min((W - 2 * padX) / (count - 1), maxStep) : 0
      const width = step * (count - 1)
      const x0 = (W - width) / 2
      const ltr = wi % 2 === 0
      w.days.forEach((d, i) => {
        pos.set(d.n, { x: ltr ? x0 + i * step : x0 + width - i * step, y: y + Math.sin(d.n * 1.9) * 7 })
      })
      return { y, week: w }
    })

    const base: Pt = { x: narrow ? 44 : 118, y: H - 40 }
    const summit: Pt = { x: W / 2, y: 46 }
    const pts = [base, ...cycle.days.map((d) => pos.get(d.n)!), summit]
    const segs = segments(pts)

    // Путник стоит на текущем дне; если цикл пройден — на вершине.
    const here = cycle.current?.day.n ?? (cycle.done ? null : (cycle.days.find((d) => !d.done)?.n ?? null))
    const hereIdx = here === null ? pts.length - 1 : cycle.days.findIndex((d) => d.n === here) + 1
    const trail = `M${base.x} ${base.y} ` + segs.join(' ')
    const walked = `M${base.x} ${base.y} ` + segs.slice(0, hereIdx).join(' ')

    // Пейзаж: внизу лес, выше — камни.
    const rand = rng(cycle.n * 7919)
    const trees: (Pt & { s: number })[] = []
    const rocks: (Pt & { s: number })[] = []
    // Декор не садится на точки тропы и на подписи недель.
    const keepOut = [...pts, ...rows.map((row) => ({ x: W / 2, y: row.y + 44 }))]
    const free = (p: Pt) => keepOut.every((q) => Math.hypot(p.x - q.x, (p.y - q.y) * 1.6) > 46)
    rows.forEach((row, wi) => {
      const altitude = wi / Math.max(1, rows.length - 1)
      const want = Math.round((narrow ? 11 : 24) * (1 - altitude * 0.55))
      for (let i = 0; i < want; i++) {
        const p = { x: 14 + rand() * (W - 28), y: row.y + rowH / 2 + (rand() - 0.5) * 34, s: 0.85 + rand() * 0.55 }
        if (!free(p)) continue
        // Лес редеет с высотой: до середины склона — деревья, выше всё чаще камни.
        if (rand() > Math.max(0, altitude - 0.3) * 1.5) trees.push(p)
        else rocks.push(p)
      }
    })
    trees.sort((a, b) => a.y - b.y)

    // Трава запустения: на тропе впереди путника.
    const tufts: Pt[] = []
    const ahead = pts.slice(hereIdx, hereIdx + 9)
    for (let i = 0; i < ahead.length - 1; i++) {
      for (const f of [0.22, 0.5, 0.78]) {
        tufts.push({
          x: ahead[i].x + (ahead[i + 1].x - ahead[i].x) * f + (rand() - 0.5) * 8,
          y: ahead[i].y + (ahead[i + 1].y - ahead[i].y) * f + 5 + (rand() - 0.5) * 6,
        })
      }
    }

    return { W, H, top, rowH, pos, rows, base, summit, pts, trail, walked, here, hereIdx, trees, rocks, tufts }
  }, [cycle, narrow])

  const { W, H, top, pos, rows, base, summit, pts } = scene
  const r = narrow ? 14 : 16.5
  const peak = narrow ? 120 : 170
  const tuftCount = [0, 6, 14, scene.tufts.length][level]
  const herePt = pts[scene.hereIdx]
  const fogTop = Math.max(0, herePt.y - 70)

  const band = (i: number) => {
    const y = top - 34 + (i * (H - top + 34)) / 5
    const sway = i % 2 ? -16 : 16
    return `M0 ${y} Q${W * 0.25} ${y - sway} ${W * 0.5} ${y} T${W} ${y} L${W} ${H} L0 ${H} Z`
  }

  return (
    <div className="scene" ref={ref}>
      <svg className={skyClass(sky)} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Маршрут цикла ${cycle.n}: ${cycle.name}`}>
        <defs>
          <linearGradient id="map-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sky-1)" />
            <stop offset="1" stopColor="var(--sky-2)" />
          </linearGradient>
          <filter id="map-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        <g className={`art cond-${level}`}>
          <rect width={W} height={H} fill="url(#map-sky)" />
          <SkyArt W={W} top={top} sky={sky} narrow={narrow} />

          {/* Вершина: цель цикла */}
          <path d={`M${W / 2 - peak * 1.5} ${top} L${W / 2 - peak * 0.62} ${top - 62} L${W / 2 - peak * 0.2} ${top - 20} Z`} fill="var(--hill-far)" />
          <path d={`M${W / 2 + peak * 0.3} ${top - 10} L${W / 2 + peak * 0.85} ${top - 74} L${W / 2 + peak * 1.6} ${top} Z`} fill="var(--hill-far)" />
          <path d={`M${W / 2 - peak} ${top + 6} L${W / 2} 22 L${W / 2 + peak} ${top + 6} Z`} fill="var(--rock)" />
          <path d={`M${W / 2} 22 L${W / 2 + peak} ${top + 6} L${W / 2 + peak * 0.2} ${top + 6} Z`} fill="var(--rock-2)" />
          <path
            d={`M${W / 2 - 32} 54 L${W / 2} 22 L${W / 2 + 32} 54 L${W / 2 + 17} 47 L${W / 2 + 5} 58 L${W / 2 - 8} 47 L${W / 2 - 20} 57 Z`}
            fill="var(--snow)"
          />

          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={band(i)} fill={`var(--terrain-${i + 1})`} />
          ))}

          {scene.rocks.map((p, i) => (
            <Rock key={i} {...p} />
          ))}
          {scene.trees.map((p, i) => (
            <Tree key={i} {...p} />
          ))}

          <path className="trail trail-ahead" d={scene.trail} />
          <path className="trail trail-walked" d={scene.walked} />

          {scene.tufts.slice(0, tuftCount).map((p, i) => (
            <Tuft key={i} {...p} />
          ))}

          {/* Лагерь у подножия */}
          <Tent x={base.x - 6} y={base.y + 8} s={narrow ? 1 : 1.2} />

          {/* Привалы: прошлые паузы остаются на карте */}
          {cycle.pauses.map(({ afterDay, pause }) => {
            const a = pos.get(afterDay)
            const b = pos.get(afterDay + 1)
            if (!a || !b) return null
            const m = mid(a, b)
            return <Tent key={pause.from} x={m.x} y={m.y - 14} s={0.8} />
          })}

          {/* Буферные дни: тропинка в сторону, необязательная */}
          {cycle.weeks.map((w) => {
            if (!w.bonus) return null
            const a = pos.get(w.bonus.afterDay)
            const b = pos.get(w.bonus.afterDay + 1)
            if (!a || !b) return null
            const m = mid(a, b)
            return (
              <g key={w.week.n} className="bonus">
                <path d={`M${m.x} ${m.y} L${m.x} ${m.y - 24}`} />
                <rect x={m.x - 6} y={m.y - 36} width={12} height={12} transform={`rotate(45 ${m.x} ${m.y - 30})`} />
                <title>Буферный день: {w.bonus.text}</title>
              </g>
            )
          })}

          {level >= 2 && (
            <g className="fog" filter="url(#map-blur)" opacity={level === 2 ? 0.62 : 0.86}>
              <ellipse cx={W * 0.3} cy={fogTop * 0.35} rx={W * 0.55} ry={46} />
              <ellipse cx={W * 0.75} cy={fogTop * 0.7} rx={W * 0.5} ry={44} />
              <ellipse cx={W * 0.4} cy={fogTop} rx={W * 0.6} ry={40} />
              {level === 3 && <ellipse cx={W * 0.6} cy={herePt.y + 40} rx={W * 0.7} ry={54} />}
              {level === 3 && <ellipse cx={W * 0.3} cy={Math.min(H - 60, herePt.y + 130)} rx={W * 0.6} ry={46} />}
            </g>
          )}
        </g>

        {/* Время суток и погода ложатся поверх рисунка; свет и подписи — поверх них */}
        <PhaseTint W={W} H={H} phase={sky.phase} />
        <WeatherWash W={W} H={H} kind={sky.kind} />
        <NightSky W={W} top={top} sky={sky} narrow={narrow} />
        <g className={`art cond-${level}`}>
          <Fire x={base.x + 20} y={base.y + 12} level={level} s={0.7} />
        </g>
        <Precipitation W={W} H={H} kind={sky.kind} blur="map-blur" />

        {cycle.pauses.map(({ afterDay, pause }) => {
          const a = pos.get(afterDay)
          const b = pos.get(afterDay + 1)
          if (!a || !b) return null
          const m = mid(a, b)
          return (
            <text key={pause.from} className="map-note" x={m.x} y={m.y - 36} textAnchor="middle">
              привал · {pause.days} дн.
            </text>
          )
        })}

        {rows.map((row) => (
          <text key={row.week.week.n} className="map-week" x={W / 2} y={row.y + r + 27} textAnchor="middle">
            Неделя {row.week.week.n}
            {row.week.closed ? ' · закрыта' : ''}
            {row.week.test.state === 'open' && ' · тест открыт'}
            {row.week.test.state === 'done' && (
              <tspan className="map-gems">
                {' ' + '◆'.repeat(row.week.test.gems) + '◇'.repeat(3 - row.week.test.gems)}
              </tspan>
            )}
          </text>
        ))}

        <Flag x={summit.x} y={summit.y - 22} />
        <text className="map-summit" x={summit.x} y={summit.y - 4 + (narrow ? 62 : 66)} textAnchor="middle">
          {cycle.summit}
        </text>

        <g className={level === 3 ? 'nodes nodes-lost' : 'nodes'}>
          {cycle.days.map((d) => (
            <Node key={d.n} d={d} p={pos.get(d.n)!} r={r} selected={selected === d.n} onSelect={onSelect} />
          ))}
        </g>

        <Traveler x={herePt.x - r - 9} y={herePt.y + r - 2} s={narrow ? 1.05 : 1.2} sitting={level >= 2} gear={gear} />
      </svg>
    </div>
  )
}

function Node({
  d,
  p,
  r,
  selected,
  onSelect,
}: {
  d: DayView
  p: Pt
  r: number
  selected: boolean
  onSelect: (day: number) => void
}) {
  const label = `День ${d.n}, ${d.plan.track}: ${NODE_LABEL[d.state]}${d.keyPoint ? `. Перевал: ${d.keyPoint.title}` : ''}`
  return (
    <g
      className={`node node-${d.state}${selected ? ' is-selected' : ''}`}
      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(d.n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(d.n)
        }
      }}
    >
      <title>{label}</title>
      <circle r={r + 9} fill="transparent" />
      {selected && <circle className="node-ring" r={r + 5} />}
      {d.state === 'current' && <circle className="node-pulse" r={r + 5} />}
      {d.state === 'extension' && <circle className="node-outer" r={r + 3.5} />}
      <circle className="node-disc" r={r} />
      {d.state === 'skipped' && <path className="node-strike" d={`M${-r * 0.55} ${r * 0.55} L${r * 0.55} ${-r * 0.55}`} />}
      <text className="node-num" textAnchor="middle" dy="0.36em">
        {d.n}
      </text>
      <circle className="node-track" cx={r * 0.76} cy={r * 0.76} r={4.4} style={{ fill: trackColor(d.plan.trackCode) }} />
      {d.keyPoint && <Flag x={0} y={-r} />}
    </g>
  )
}
