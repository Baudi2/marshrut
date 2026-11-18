// Слои неба. Порядок на сцене: рисунок в дневной палитре сезона → оттенок времени суток →
// пелена пасмурной погоды → источники света (луна, звёзды, огонь, окна) → осадки и туман → подписи.
// Ночь получается из оттенка и света, а не из второй палитры, поэтому сезоны, время и погода сочетаются свободно.
import type { Phase, Sky, WeatherKind } from './sky'
import { Cloud, rng } from './sprites'

interface Box {
  W: number
  H: number
}

const GRAY_SKY: WeatherKind[] = ['overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm']

/** Солнце и облака. Рисуются внутри рисунка, до оттенка времени суток. */
export function SkyArt({ W, top, sky, narrow }: { W: number; top: number; sky: Sky; narrow: boolean }) {
  const rand = rng(977)
  const count = Math.round((sky.clouds / 100) * (narrow ? 5 : 9))
  const clouds = Array.from({ length: count }, (_, i) => ({
    x: ((i + 0.5) / count) * W + (rand() - 0.5) * 60,
    y: 22 + rand() * Math.max(20, top - 70),
    s: (narrow ? 0.6 : 0.85) + rand() * 0.5,
  }))
  const low = sky.phase === 'dawn' || sky.phase === 'dusk'
  return (
    <g>
      {sky.phase !== 'night' && !GRAY_SKY.includes(sky.kind) && (
        <circle
          cx={W - (narrow ? 44 : 90)}
          cy={low ? top - 44 : 46}
          r={narrow ? 15 : 19}
          fill={low ? 'var(--sun-low)' : 'var(--sun)'}
        />
      )}
      <g className={GRAY_SKY.includes(sky.kind) ? 'clouds clouds-gray' : 'clouds'}>
        {clouds.map((c, i) => (
          <Cloud key={i} {...c} />
        ))}
      </g>
    </g>
  )
}

/** Оттенок времени суток поверх рисунка. */
export function PhaseTint({ W, H, phase }: Box & { phase: Phase }) {
  if (phase === 'day') return null
  return (
    <g className={`tint tint-${phase}`} pointerEvents="none">
      <rect width={W} height={H} className="tint-main" />
      {phase !== 'night' && <rect width={W} height={H * 0.5} className="tint-glow" />}
    </g>
  )
}

/** Серая пелена в пасмурную погоду. */
export function WeatherWash({ W, H, kind }: Box & { kind: WeatherKind }) {
  const opacity = { clear: 0, cloudy: 0, overcast: 0.16, fog: 0.12, drizzle: 0.18, rain: 0.24, snow: 0.12, storm: 0.38 }[kind]
  if (!opacity) return null
  return <rect width={W} height={H} fill="var(--wash)" opacity={opacity} pointerEvents="none" />
}

/** Луна и звёзды. Рисуются поверх оттенка: это источники света. */
export function NightSky({ W, top, sky, narrow }: { W: number; top: number; sky: Sky; narrow: boolean }) {
  if (sky.phase !== 'night' || GRAY_SKY.includes(sky.kind)) return null
  const rand = rng(31337)
  const stars = Array.from({ length: narrow ? 22 : 46 }, () => ({
    x: rand() * W,
    y: rand() * (top - 10),
    r: 0.6 + rand() * 0.9,
    o: 0.4 + rand() * 0.6,
  }))
  const mx = W - (narrow ? 44 : 90)
  return (
    <g pointerEvents="none">
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="var(--star)" opacity={s.o} />
      ))}
      <circle cx={mx} cy={46} r={narrow ? 21 : 27} fill="var(--moon-glow)" />
      <circle cx={mx} cy={46} r={narrow ? 13 : 17} fill="var(--moon)" />
    </g>
  )
}

/** Осадки и туман. Капли и снежинки повторяются через высоту сцены, поэтому падение бесшовное. */
export function Precipitation({ W, H, kind, blur }: Box & { kind: WeatherKind; blur: string }) {
  if (kind === 'fog') {
    return (
      <g className="weather-fog" filter={`url(#${blur})`} pointerEvents="none">
        <ellipse cx={W * 0.3} cy={H * 0.3} rx={W * 0.6} ry={44} />
        <ellipse cx={W * 0.75} cy={H * 0.55} rx={W * 0.55} ry={48} />
        <ellipse cx={W * 0.35} cy={H * 0.8} rx={W * 0.6} ry={42} />
      </g>
    )
  }
  const amount = { drizzle: 0.35, rain: 0.8, storm: 1.3, snow: 0.7 }[kind as 'rain']
  if (!amount) return null
  const rand = rng(kind === 'snow' ? 505 : 404)
  const marks = Array.from({ length: Math.round((W / 9) * amount) }, () => ({
    x: rand() * (W + 40) - 20,
    y: rand() * H,
    v: rand(),
  }))
  const snow = kind === 'snow'
  return (
    <g className={snow ? 'precip snow' : 'precip rain'} pointerEvents="none">
      <g className="fall" style={{ ['--fall' as string]: `${H}px` }}>
        {[0, -H].map((shift) =>
          marks.map((m, i) =>
            snow ? (
              <circle key={`${shift}-${i}`} cx={m.x} cy={m.y + shift} r={1.1 + m.v * 1.5} />
            ) : (
              <path key={`${shift}-${i}`} d={`M${m.x.toFixed(1)} ${(m.y + shift).toFixed(1)} l-3 ${(9 + m.v * 8).toFixed(1)}`} />
            ),
          ),
        )}
      </g>
    </g>
  )
}

/** Классы корневого svg: по ним выбирается палитра сезона и цвет подписей. */
export const skyClass = (sky: Sky) => `season-${sky.season} sky-${sky.phase}`
