// Нарисованные кодом детали мира. Цвета — CSS-переменные, поэтому светлая тема даёт день, тёмная — ночь.
import type { CampItem } from '../data/types'

interface At {
  x: number
  y: number
  s?: number
}

const at = ({ x, y, s = 1 }: At) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`

export function trackColor(code: string | null | undefined): string {
  return code && ['A', 'B', 'C1', 'C2', 'E'].includes(code) ? `var(--t-${code})` : 'var(--roof)'
}

/** Детерминированный генератор: пейзаж одинаков при каждой отрисовке. */
export function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function Tree(p: At) {
  return (
    <g transform={at(p)}>
      <rect x={-1.5} y={-4} width={3} height={6} fill="var(--wood-dark)" />
      <path d="M0 -27 L9 -9 L-9 -9 Z" fill="var(--tree)" />
      <path d="M0 -19 L11 -2 L-11 -2 Z" fill="var(--tree-2)" />
    </g>
  )
}

export function Rock(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M-9 0 L-5 -8 L2 -11 L9 -4 L10 0 Z" fill="var(--rock)" />
      <path d="M2 -11 L9 -4 L10 0 L3 0 Z" fill="var(--rock-2)" />
    </g>
  )
}

export function Cloud(p: At) {
  return (
    <g transform={at(p)} fill="var(--cloud)">
      <ellipse cx={0} cy={0} rx={22} ry={8} />
      <ellipse cx={-10} cy={-6} rx={11} ry={8} />
      <ellipse cx={8} cy={-8} rx={13} ry={9} />
    </g>
  )
}

export function Tent(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M-15 0 L0 -19 L15 0 Z" fill="var(--canvas)" stroke="var(--wood-dark)" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M-4.5 0 L0 -10 L4.5 0 Z" fill="var(--wood-dark)" />
      <path d="M0 -19 L0 -23" stroke="var(--wood-dark)" strokeWidth={1.2} />
    </g>
  )
}

/** Трава на тропе и в лагере — знак запустения. */
export function Tuft(p: At) {
  return (
    <path
      transform={at(p)}
      d="M0 0 L-4 -7 M0 0 L0 -9 M0 0 L4 -7 M0 0 L-7 -3 M0 0 L7 -3"
      stroke="var(--weed)"
      strokeWidth={1.4}
      strokeLinecap="round"
      fill="none"
    />
  )
}

export function Flag({ x, y, color = 'var(--amber)' }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L0 -17" stroke="var(--wood-dark)" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M0.6 -17 L12 -13 L0.6 -9 Z" fill={color} />
    </g>
  )
}

/**
 * Костёр. 0 — горит, 1 — угли, 2 и 3 — погас.
 * size — насколько большое пламя: зависит от занятий за неделю.
 */
export function Fire({ x, y, level, size = 1, s = 1 }: At & { level: number; size?: number }) {
  return (
    <g transform={at({ x, y, s })}>
      {level === 0 && <ellipse cx={0} cy={-4} rx={26 * size} ry={11 * size} fill="var(--fire-glow)" />}
      <path d="M-11 0 L9 -5 M11 0 L-9 -5" stroke="var(--wood-dark)" strokeWidth={3.4} strokeLinecap="round" />
      {level === 0 && (
        <g transform={`scale(${size})`}>
          {/* Анимация живёт на вложенной группе, чтобы не затирать масштаб. */}
          <g className="flame">
            <path d="M0 -24 C7 -15 10 -10 6 -4 C4 -1 -4 -1 -6 -4 C-10 -10 -5 -14 0 -24 Z" fill="var(--fire)" />
            <path d="M0 -15 C3 -10 4 -7 2.5 -4 C1.5 -2.5 -1.5 -2.5 -2.5 -4 C-4 -7 -2 -10 0 -15 Z" fill="var(--fire-2)" />
          </g>
        </g>
      )}
      {level === 1 && (
        <g>
          <circle cx={-3} cy={-4} r={2.4} fill="var(--fire)" />
          <circle cx={3} cy={-3} r={1.8} fill="var(--fire)" />
          <circle cx={0} cy={-6} r={1.4} fill="var(--fire-2)" />
        </g>
      )}
      {level >= 2 && <ellipse cx={0} cy={-2} rx={8} ry={2.6} fill="var(--ash)" />}
    </g>
  )
}

/** Кот-спутник: сидит, хвост обёрнут вокруг лап. Цвета берутся из прежних переменных спутника. */
export function Cat(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M2.2 -1.4 q5 0.8 4.6 -3.8" stroke="var(--dog-dark)" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d="M-4.2 0 q-1.4 -7 2.6 -9.4 q4.6 1.6 4.4 9.4 Z" fill="var(--dog)" />
      <path d="M-1.6 0 V-4.2 M1 0 V-4.2" stroke="var(--dog-dark)" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={-1.4} cy={-11.2} r={3} fill="var(--dog)" />
      <path d="M-4.1 -12.4 L-4.2 -15.6 L-1.9 -13.7 Z M1.2 -12.4 L1.4 -15.6 L-0.9 -13.7 Z" fill="var(--dog-dark)" />
    </g>
  )
}

/**
 * Путник: идёт, пока погода ясная, и сидит, когда маршрут заброшен.
 * gear — надетая экипировка из лавки (id предметов из src/game/shop.ts).
 */
export function Traveler({ x, y, s = 1, sitting = false, gear = [] }: At & { sitting?: boolean; gear?: string[] }) {
  const has = (id: string) => gear.includes(id)
  const jacket = has('jacket-blue') ? 'var(--jacket-blue)' : has('jacket-green') ? 'var(--jacket-green)' : 'var(--traveler)'
  const head = sitting ? { x: 0.5, y: -15.5 } : { x: 0.2, y: -23 }
  const body = sitting ? { x: -3, y: -12, w: 6.5, h: 11 } : { x: -3.2, y: -19, w: 6.6, h: 12 }
  const hand = sitting ? { x: 11, y: -1 } : { x: 10.5, y: -8 }
  return (
    <g transform={at({ x, y, s })}>
      {has('lantern') && <circle cx={hand.x} cy={hand.y - 2.5} r={8.5} fill="var(--fire-glow)" />}
      {has('cape') && (
        <path
          d={`M${body.x + 1} ${body.y + 1} L${body.x - 6.5} ${body.y + body.h + 1.5} L${body.x + 3} ${body.y + body.h} Z`}
          fill="var(--cape)"
        />
      )}
      {sitting ? (
        <path d="M-2 -1 L6 -1 L9 0" stroke="var(--traveler-legs)" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M-1 -8 L-3 0 M1 -8 L3.5 0" stroke="var(--traveler-legs)" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M7 -15 L8.5 0" stroke="var(--wood-dark)" strokeWidth={1.3} strokeLinecap="round" />
        </>
      )}
      {has('pack') ? (
        <>
          <rect x={body.x - 5.4} y={body.y} width={5.8} height={body.h - 1} rx={2} fill="var(--wood)" />
          <rect x={body.x - 5.9} y={body.y - 3.3} width={6.8} height={3.3} rx={1.6} fill="var(--bedroll)" />
        </>
      ) : (
        <rect x={body.x - 3.8} y={body.y + 1} width={4.2} height={body.h - 3} rx={1.5} fill="var(--wood)" />
      )}
      <rect x={body.x} y={body.y} width={body.w} height={body.h} rx={2.6} fill={jacket} />
      {has('scarf') && (
        <>
          <rect x={body.x - 0.4} y={body.y - 0.4} width={body.w + 0.8} height={2.6} rx={1.3} fill="var(--scarf)" />
          <path d={`M${body.x + body.w - 1.4} ${body.y + 1.6} l1.8 4.6`} stroke="var(--scarf)" strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}
      <circle cx={head.x} cy={head.y} r={3.5} fill="var(--skin)" />
      {has('hat') && (
        <>
          <ellipse cx={head.x} cy={head.y - 2} rx={6.2} ry={1.5} fill="var(--hat)" />
          <path d={`M${head.x - 3.4} ${head.y - 2.2} q3.4 -6.6 6.8 0 Z`} fill="var(--hat)" />
        </>
      )}
      {has('lantern') && (
        <>
          <path d={`M${hand.x} ${hand.y - 6.6} v2.2`} stroke="var(--wood-dark)" strokeWidth={1} />
          <rect x={hand.x - 1.9} y={hand.y - 4.6} width={3.8} height={4.6} rx={0.8} fill="var(--window)" stroke="var(--wood-dark)" strokeWidth={0.8} />
        </>
      )}
      {has('cat') && <Cat x={sitting ? 19 : -16} y={0} />}
    </g>
  )
}

interface BuildingProps {
  kind: CampItem['kind']
  /** 0 — участок, 1 — стройка, 2 — дом, 3 — дом с пристройкой. */
  stage: 0 | 1 | 2 | 3
  color: string
  /** Свет в окнах и дым: гаснут, когда лагерь заброшен. */
  lit: boolean
}

function Window({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={7}
      height={7}
      rx={1}
      fill={lit ? 'var(--window)' : 'var(--window-off)'}
      stroke="var(--wood-dark)"
      strokeWidth={0.8}
    />
  )
}

function Smoke({ x, y }: { x: number; y: number }) {
  return (
    <g className="smoke" fill="var(--smoke)">
      <circle cx={x} cy={y - 5} r={2.6} />
      <circle cx={x + 3} cy={y - 11} r={3.4} />
      <circle cx={x + 1} cy={y - 18} r={4.2} />
    </g>
  )
}

/** Домик лагеря. Основание стоит в точке (0, 0). */
export function Building({ kind, stage, color, lit }: BuildingProps) {
  if (stage === 0) {
    return (
      <g>
        <ellipse cx={0} cy={0} rx={24} ry={6} fill="none" stroke="var(--plot)" strokeWidth={1.3} strokeDasharray="4 3.5" />
        <path d="M-13 0 L-13 -12" stroke="var(--wood-dark)" strokeWidth={1.3} />
        <rect x={-13} y={-14} width={10} height={6} rx={1} fill="var(--canvas)" stroke="var(--wood-dark)" strokeWidth={0.8} />
      </g>
    )
  }
  if (stage === 1) {
    return (
      <g fill="none" stroke="var(--wood)" strokeWidth={2.2} strokeLinecap="round">
        <ellipse cx={0} cy={0} rx={26} ry={6} fill="var(--dirt)" stroke="none" />
        <path d="M-16 0 L-16 -22 M16 0 L16 -22 M-19 -22 L19 -22" />
        <path d="M-19 -22 L0 -35 L19 -22" strokeDasharray="5 3.5" />
        <path d="M-16 0 L16 -22" strokeWidth={1.3} />
        <g stroke="var(--wood-dark)" strokeWidth={0.8} fill="var(--wood)">
          <circle cx={23} cy={-3} r={3} />
          <circle cx={29} cy={-3} r={3} />
          <circle cx={26} cy={-8} r={3} />
        </g>
        <path d="M0 -35 L0 -43" stroke="var(--wood-dark)" strokeWidth={1.2} />
        <path d="M0.5 -43 L9 -40 L0.5 -37 Z" fill={color} stroke="none" />
      </g>
    )
  }

  const grown = stage === 3
  const wall = { fill: 'var(--wood)', stroke: 'var(--wood-dark)', strokeWidth: 1 }

  if (kind === 'tower') {
    return (
      <g>
        {grown && (
          <g>
            <rect x={9} y={-13} width={15} height={13} {...wall} />
            <path d="M7 -13 L16.5 -21 L26 -13 Z" fill={color} opacity={0.82} />
          </g>
        )}
        <rect x={-9} y={-40} width={18} height={40} {...wall} />
        <rect x={-14} y={-46} width={28} height={6} rx={1} {...wall} />
        <path d="M-16 -46 L0 -61 L16 -46 Z" fill={color} />
        <Window x={-3.5} y={-33} lit={lit} />
        <rect x={-3.5} y={-11} width={7} height={11} fill="var(--wood-dark)" />
        {grown && <Flag x={0} y={-60} color={color} />}
      </g>
    )
  }

  if (kind === 'hall') {
    return (
      <g>
        {grown && <rect x={-21} y={-47} width={5} height={10} fill="var(--rock-2)" />}
        {grown && lit && <Smoke x={-18.5} y={-47} />}
        <rect x={-28} y={-22} width={56} height={22} {...wall} />
        <path d="M-33 -22 L-21 -39 L21 -39 L33 -22 Z" fill={color} />
        <rect x={-4.5} y={-14} width={9} height={14} fill="var(--wood-dark)" />
        <Window x={-21} y={-16} lit={lit} />
        <Window x={14} y={-16} lit={lit} />
        {grown && (
          <g>
            <rect x={28} y={-14} width={15} height={14} {...wall} />
            <path d="M26 -14 L35.5 -23 L45 -14 Z" fill={color} opacity={0.82} />
            <Flag x={0} y={-39} color={color} />
          </g>
        )}
      </g>
    )
  }

  return (
    <g>
      {grown && <rect x={-15} y={-41} width={5} height={10} fill="var(--rock-2)" />}
      {grown && lit && <Smoke x={-12.5} y={-41} />}
      <rect x={-20} y={-22} width={40} height={22} {...wall} />
      <path d="M-25 -22 L0 -41 L25 -22 Z" fill={color} />
      <rect x={-4} y={-13} width={8} height={13} fill="var(--wood-dark)" />
      <Window x={8.5} y={-16} lit={lit} />
      {grown && (
        <g>
          <rect x={20} y={-13} width={14} height={13} {...wall} />
          <path d="M18 -13 L27 -21 L36 -13 Z" fill={color} opacity={0.82} />
        </g>
      )}
    </g>
  )
}
