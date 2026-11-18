import { useMemo, useRef, type ReactNode } from 'react'
import { STAGE_LABEL, type CycleView } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import { useNarrow } from '../ui/bits'
import { Bench, Flagpole, Garden, Hearth, Lamp, Pot, Signpost, Stream, Well } from './extras'
import type { CampItem } from '../data/types'
import type { Sky } from './sky'
import { NightSky, PhaseTint, Precipitation, SkyArt, WeatherWash, skyClass } from './SkyLayers'
import { Building, Fire, Traveler, Tree, Tuft, rng, trackColor } from './sprites'

interface Props {
  cycle: CycleView
  level: ConditionLevel
  /** Занятий на этой неделе: от них зависит размер пламени. */
  sessionsThisWeek: number
  selected: string | null
  onSelect: (id: string) => void
  /** Купленное в лавке: постройки для поляны. */
  owned: string[]
  /** Надетая экипировка путника. */
  gear: string[]
  /** Сломанные постройки: рисуются покосившимися и серыми. */
  broken: string[]
  /** Сезон, время суток и погода. */
  sky: Sky
}

/** Окна домиков в координатах спрайта: в темноте они светятся поверх ночного оттенка. */
const WINDOWS: Record<CampItem['kind'], [number, number][]> = {
  cabin: [[8.5, -16]],
  hall: [
    [-21, -16],
    [14, -16],
  ],
  tower: [[-3.5, -33]],
}

function RepairMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
      <circle r={8.5} fill="var(--amber-soft)" stroke="var(--amber)" strokeWidth={1.5} />
      <path d="M-3.6 3.6 L3.6 -3.6 M-3.6 -3.6 L3.6 3.6" stroke="var(--amber-ink)" strokeWidth={2.2} strokeLinecap="round" />
    </g>
  )
}

export function basename(path: string): string {
  const clean = path.replace(/^\(|\)$/g, '')
  const parts = clean.split('/')
  const last = parts[parts.length - 1]
  return last.includes('*') && parts.length > 1 ? `${parts[parts.length - 2]}/` : last
}

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text)

export function CampScene({ cycle, level, sessionsThisWeek, selected, onSelect, owned, gear, broken, sky }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(ref)

  const scene = useMemo(() => {
    const W = narrow ? 400 : 900
    const cols = narrow ? 4 : 6
    const slotH = narrow ? 94 : 108
    const pad = narrow ? 10 : 56
    const top = 104
    const fireZone = 152
    const items = cycle.buildings
    const rowsN = Math.ceil(items.length / cols)
    const H = top + rowsN * slotH + fireZone
    const slotW = (W - 2 * pad) / cols
    const fire = { x: W / 2, y: H - 62 }

    // Лагерь растёт от костра наружу: первые файлы — в ближнем ряду.
    const placed = items.map((b, i) => {
      const row = Math.floor(i / cols)
      const inRow = Math.min(cols, items.length - row * cols)
      const x0 = (W - inRow * slotW) / 2 + slotW / 2
      return {
        b,
        x: x0 + (i % cols) * slotW + (row % 2 ? 7 : -7),
        y: H - fireZone - row * slotH - 30,
      }
    })

    const rand = rng(cycle.n * 104729)
    const treeCount = narrow ? 13 : 28
    const treeline = Array.from({ length: treeCount }, (_, i) => ({
      x: (i + 0.5) * (W / treeCount) + (rand() - 0.5) * 14,
      y: top - 8 + (rand() - 0.5) * 16,
      s: 1.1 + rand() * 0.7,
    })).sort((a, b) => a.y - b.y)
    const tufts = Array.from({ length: 40 }, () => ({
      x: 16 + rand() * (W - 32),
      y: top + 24 + rand() * (H - top - 40),
    }))

    return { W, H, top, fire, placed, treeline, tufts, slotW }
  }, [cycle, narrow])

  const { W, H, top, fire, placed } = scene
  const scale = narrow ? 0.92 : 1.22
  const tuftCount = [0, 10, 24, 40][level]
  const flame = 0.75 + 0.2 * Math.min(3, sessionsThisWeek)
  const labelSize = narrow ? 9.5 : 11
  const maxChars = Math.floor(scene.slotW / (labelSize * 0.61))
  const has = (id: string) => owned.includes(id)
  const isBroken = (id: string) => broken.includes(id)
  const lit = level < 2
  const dark = sky.phase === 'night' || sky.phase === 'dusk'
  const k = narrow ? 0.95 : 1.3

  // Купленные постройки вокруг костра: [ключ, id предмета, x, y, картинка].
  const lampY = fire.y - 38
  const spots: [string, string, number, number, ReactNode][] = [
    ['garden', 'garden', W * 0.14, fire.y + 6, <Garden x={W * 0.14} y={fire.y + 6} s={k} />],
    ['well', 'well', W * 0.88, fire.y + 4, <Well x={W * 0.88} y={fire.y + 4} s={k} />],
    ['lamp-a', 'lamps', W * 0.2, lampY, <Lamp x={W * 0.2} y={lampY} s={k} lit={lit && !isBroken('lamps')} />],
    ['lamp-b', 'lamps', W * 0.8, lampY, <Lamp x={W * 0.8} y={lampY} s={k} lit={lit && !isBroken('lamps')} />],
    ['flagpole', 'flagpole', W * 0.27, fire.y - 4, <Flagpole x={W * 0.27} y={fire.y - 4} s={k} />],
    ['signpost', 'signpost', W * (narrow ? 0.75 : 0.72), fire.y + 2, <Signpost x={W * (narrow ? 0.75 : 0.72)} y={fire.y + 2} s={k} />],
    ['bench', 'bench', fire.x - 46 * k, fire.y + 8, <Bench x={fire.x - 46 * k} y={fire.y + 8} s={k} />],
  ]
  const placedSpots = spots.filter(([, id]) => has(id))

  return (
    <div className="scene" ref={ref}>
      <svg className={skyClass(sky)} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Лагерь: файлы, которые растут вместе с планом">
        <defs>
          <linearGradient id="camp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sky-1)" />
            <stop offset="1" stopColor="var(--sky-2)" />
          </linearGradient>
          <filter id="camp-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>

        <g className={`art cond-${level}`}>
          <rect width={W} height={top} fill="url(#camp-sky)" />
          <SkyArt W={W} top={top} sky={sky} narrow={narrow} />
          <path d={`M0 ${top - 30} Q${W * 0.3} ${top - 62} ${W * 0.55} ${top - 34} T${W} ${top - 44} L${W} ${top} L0 ${top} Z`} fill="var(--hill-far)" />
          <rect y={top - 10} width={W} height={H - top + 10} fill="var(--terrain-4)" />
          <ellipse cx={W / 2} cy={H - 52} rx={W * 0.47} ry={84} fill="var(--terrain-5)" />
          {scene.treeline.map((p, i) => (
            <Tree key={i} {...p} />
          ))}

          {/* Тропинки протаптываются к построенным домикам */}
          {placed
            .filter((p) => p.b.stage >= 2)
            .map((p) => (
              <path
                key={p.b.item.id}
                className="footpath"
                d={`M${fire.x} ${fire.y - 4} Q${(fire.x + p.x) / 2} ${p.y + 30} ${p.x} ${p.y + 4}`}
              />
            ))}

          {has('bridge') && (
            <g className={isBroken('bridge') ? 'worn' : undefined}>
              <Stream W={W} H={H} />
            </g>
          )}
          {placedSpots.map(([key, id, x, y, art]) => (
            <g key={key} className={isBroken(id) ? 'worn' : undefined} transform={isBroken(id) ? `rotate(-7 ${x} ${y})` : undefined}>
              {art}
            </g>
          ))}
          {has('hearth') && (
            <g className={isBroken('hearth') ? 'worn' : undefined}>
              <Hearth x={fire.x} y={fire.y} s={k} />
            </g>
          )}

          {scene.tufts.slice(0, tuftCount).map((p, i) => (
            <Tuft key={i} {...p} />
          ))}
        </g>

        {/* Домики: сначала рисунок, затем оттенок времени суток, затем свет, подписи и нажатия */}
        {[...placed]
          .sort((a, b) => a.y - b.y)
          .map(({ b, x, y }) => (
            <g key={b.item.id} className={`art cond-${level}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})`}>
              <Building kind={b.item.kind} stage={b.stage} color={trackColor(b.item.track)} lit={lit} />
            </g>
          ))}

        <PhaseTint W={W} H={H} phase={sky.phase} />
        <WeatherWash W={W} H={H} kind={sky.kind} />
        <NightSky W={W} top={top} sky={sky} narrow={narrow} />
        {dark && lit && has('lamps') && !isBroken('lamps') && (
          <>
            <Lamp x={W * 0.2} y={lampY} s={k} lit />
            <Lamp x={W * 0.8} y={lampY} s={k} lit />
          </>
        )}

        {[...placed]
          .sort((a, b) => a.y - b.y)
          .map(({ b, x, y }) => {
            const isSelected = selected === b.item.id
            const label = `${b.item.title}: ${STAGE_LABEL[b.stage]}`
            return (
              <g
                key={b.item.id}
                className={`building stage-${b.stage}${isSelected ? ' is-selected' : ''}`}
                transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => onSelect(b.item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(b.item.id)
                  }
                }}
              >
                <title>{label}</title>
                <rect x={-scene.slotW / 2 + 2} y={-70} width={scene.slotW - 4} height={92} fill="transparent" />
                {isSelected && <ellipse className="building-ring" cx={0} cy={1} rx={38 * scale} ry={10 * scale} fill="none" />}
                {dark && lit && b.stage >= 2 && (
                  <g transform={`scale(${scale})`}>
                    {WINDOWS[b.item.kind].map(([wx, wy]) => (
                      <g key={wx}>
                        <circle cx={wx + 3.5} cy={wy + 3.5} r={10} fill="var(--fire-glow)" />
                        <rect x={wx} y={wy} width={7} height={7} rx={1} fill="var(--window)" />
                      </g>
                    ))}
                  </g>
                )}
                <text className="building-label" y={18} textAnchor="middle" style={{ fontSize: labelSize }}>
                  {cut(b.item.label ?? basename(b.item.path), maxChars)}
                </text>
              </g>
            )
          })}

        <g className={`art cond-${level}`}>
          <Fire x={fire.x} y={fire.y} level={level} size={flame} s={narrow ? 1.25 : 1.5} />
          {has('pot') && (
            <g className={isBroken('pot') ? 'worn' : undefined} transform={isBroken('pot') ? `rotate(9 ${fire.x} ${fire.y})` : undefined}>
              <Pot x={fire.x} y={fire.y} s={k} />
            </g>
          )}
        </g>

        {/* Метки ремонта — поверх построек */}
        {placedSpots.filter(([, id]) => isBroken(id)).map(([key, , x, y]) => (
          <RepairMark key={key} x={x + 15 * k} y={y - 30 * k} />
        ))}
        {has('bridge') && isBroken('bridge') && <RepairMark x={W * 0.3} y={H - 50} />}
        {has('hearth') && isBroken('hearth') && <RepairMark x={fire.x - 26 * k} y={fire.y - 12} />}
        {has('pot') && isBroken('pot') && <RepairMark x={fire.x + 20 * k} y={fire.y - 34 * k} />}
        <Traveler x={fire.x + (narrow ? 34 : 42)} y={fire.y + 4} s={narrow ? 1.3 : 1.5} sitting gear={gear} />
        <Precipitation W={W} H={H} kind={sky.kind} blur="camp-blur" />

        {level >= 2 && (
          <g className="fog" filter="url(#camp-blur)" opacity={level === 2 ? 0.5 : 0.8}>
            <ellipse cx={W * 0.25} cy={top + 40} rx={W * 0.5} ry={50} />
            <ellipse cx={W * 0.8} cy={H * 0.45} rx={W * 0.5} ry={56} />
            {level === 3 && <ellipse cx={W * 0.35} cy={H * 0.7} rx={W * 0.6} ry={52} />}
          </g>
        )}
      </svg>
    </div>
  )
}
