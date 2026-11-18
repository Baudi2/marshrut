// То, что покупается в лавке: постройки для поляны, значки валют и картинки предметов.
import { Fire, Traveler } from './sprites'

interface At {
  x: number
  y: number
  s?: number
}

const at = ({ x, y, s = 1 }: At) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`

export function CoinIcon() {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx={8} cy={8} r={6.4} fill="var(--coin)" stroke="var(--coin-edge)" strokeWidth={1.4} />
      <path d="M8 4.9 V11.1" stroke="var(--coin-edge)" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

export function GemIcon({ off = false }: { off?: boolean }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.6 L14 6.2 L8 14.6 L2 6.2 Z" fill={off ? 'none' : 'var(--gem)'} stroke="var(--gem-edge)" strokeWidth={1.3} strokeLinejoin="round" />
      {!off && <path d="M2 6.2 H14 M5.4 6.2 L8 14.6 L10.6 6.2" stroke="var(--gem-edge)" strokeWidth={0.8} fill="none" />}
    </svg>
  )
}

/** Камни за тест: заработанные закрашены, остальные — контуром. */
export function Gems({ count, of }: { count: number; of: number }) {
  return (
    <span className="gems" role="img" aria-label={`Камней: ${count} из ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <GemIcon key={i} off={i >= count} />
      ))}
    </span>
  )
}

export function Hearth(p: At) {
  return (
    <g transform={at(p)}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <ellipse
            key={i}
            cx={Math.cos(a) * 18}
            cy={-1 + Math.sin(a) * 6.5}
            rx={3.8}
            ry={2.7}
            fill={i % 2 ? 'var(--rock)' : 'var(--rock-2)'}
          />
        )
      })}
    </g>
  )
}

export function Pot(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M-13 2 L0 -35 L13 2 M0 -35 L0 -21" stroke="var(--wood-dark)" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d="M-6.5 -21 h13 v3 a6.5 6.5 0 0 1 -13 0 Z" fill="var(--pot)" />
    </g>
  )
}

export function Bench(p: At) {
  return (
    <g transform={at(p)}>
      <rect x={-11.5} y={-3.5} width={3} height={3.5} fill="var(--wood-dark)" />
      <rect x={8.5} y={-3.5} width={3} height={3.5} fill="var(--wood-dark)" />
      <rect x={-14} y={-8.5} width={28} height={5.2} rx={2.6} fill="var(--wood)" stroke="var(--wood-dark)" strokeWidth={0.9} />
    </g>
  )
}

export function Signpost(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M0 0 V-33" stroke="var(--wood-dark)" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M1 -32 h13 l4 3 l-4 3 h-13 Z" fill="var(--canvas)" stroke="var(--wood-dark)" strokeWidth={0.8} />
      <path d="M-1 -23 h-12 l-4 3 l4 3 h12 Z" fill="var(--canvas)" stroke="var(--wood-dark)" strokeWidth={0.8} />
    </g>
  )
}

export function Garden(p: At) {
  return (
    <g transform={at(p)}>
      <rect x={-21} y={-10} width={42} height={12} rx={3} fill="var(--dirt)" stroke="var(--wood-dark)" strokeWidth={0.7} />
      {[-15, -7.5, 0, 7.5, 15].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-6.5} r={2.5} fill="var(--tree)" />
          <circle cx={cx} cy={-1.5} r={2.1} fill="var(--tree-2)" />
        </g>
      ))}
    </g>
  )
}

export function Lamp({ lit, ...p }: At & { lit: boolean }) {
  return (
    <g transform={at(p)}>
      {lit && <circle cx={6} cy={-24} r={14} fill="var(--fire-glow)" />}
      <path d="M0 0 V-28 h6" stroke="var(--wood-dark)" strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <rect x={3.5} y={-27.5} width={5} height={6.5} rx={1} fill={lit ? 'var(--window)' : 'var(--window-off)'} stroke="var(--wood-dark)" strokeWidth={0.8} />
    </g>
  )
}

export function Well(p: At) {
  return (
    <g transform={at(p)}>
      <path d="M-8 -11 V-26 M8 -11 V-26 M0 -26 V-17" stroke="var(--wood-dark)" strokeWidth={1.7} />
      <rect x={-2.6} y={-17} width={5.2} height={4.2} fill="var(--wood)" />
      <rect x={-10.5} y={-11} width={21} height={11} rx={2} fill="var(--rock)" stroke="var(--rock-2)" strokeWidth={1} />
      <path d="M-10.5 -5.5 H10.5" stroke="var(--rock-2)" strokeWidth={0.8} />
      <path d="M-14 -25 L0 -35 L14 -25 Z" fill="var(--roof)" />
    </g>
  )
}

export function Flagpole(p: At) {
  return (
    <g transform={at(p)}>
      <ellipse cx={-3} cy={0} rx={4} ry={2.4} fill="var(--rock)" />
      <ellipse cx={3.5} cy={0.5} rx={3.6} ry={2.2} fill="var(--rock-2)" />
      <path d="M0 0 V-63" stroke="var(--wood-dark)" strokeWidth={2} strokeLinecap="round" />
      <path d="M1 -63 Q11 -67 22 -61 V-49 Q11 -55 1 -50 Z" fill="var(--flag)" />
    </g>
  )
}

/** Ручей вдоль нижнего края поляны и мостик через него. */
export function Stream({ W, H }: { W: number; H: number }) {
  const y = H - 20
  const d = `M0 ${y} Q${W * 0.25} ${y - 14} ${W * 0.5} ${y} T${W} ${y - 4}`
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke="var(--water)" strokeWidth={11} />
      <path d={d} stroke="var(--water-2)" strokeWidth={1.8} strokeDasharray="9 15" />
      <g transform={`translate(${W * 0.3} ${y - 7})`}>
        <path d="M-17 5 Q0 -7 17 5" stroke="var(--wood)" strokeWidth={6.5} />
        <path d="M-17 -2 Q0 -14 17 -2 M-17 5 V-2 M17 5 V-2 M0 -1 V-8" stroke="var(--wood-dark)" strokeWidth={1.4} />
      </g>
    </g>
  )
}

/** Картинка предмета для лавки. */
export function ItemArt({ id }: { id: string }) {
  const art = () => {
    switch (id) {
      case 'pot':
        return (
          <>
            <Fire x={24} y={43} level={0} s={0.85} />
            <Pot x={24} y={43} s={0.95} />
          </>
        )
      case 'hearth':
        return (
          <>
            <Hearth x={24} y={38} s={1} />
            <Fire x={24} y={38} level={0} s={0.8} />
          </>
        )
      case 'bench':
        return <Bench x={24} y={32} s={1.4} />
      case 'signpost':
        return <Signpost x={24} y={45} s={1.2} />
      case 'garden':
        return <Garden x={24} y={32} s={1.05} />
      case 'lamps':
        return <Lamp x={19} y={45} s={1.35} lit />
      case 'well':
        return <Well x={24} y={43} s={1.15} />
      case 'flagpole':
        return <Flagpole x={15} y={46} s={0.68} />
      case 'bridge':
        return (
          <g transform="translate(0 -6)">
            <Stream W={48} H={52} />
          </g>
        )
      case 'cat':
        return <Traveler x={31} y={43} s={1.5} gear={[id]} />
      default:
        return <Traveler x={22} y={44} s={1.7} gear={[id]} />
    }
  }
  return (
    <svg className="item-art" viewBox="0 0 48 48" aria-hidden="true">
      {art()}
    </svg>
  )
}
