// Экипировка путника на сцене города: что из купленного в лавке видно на фигуре и как.
// Здесь только описание деталей, без three.js: файл проверяется тестами.

export interface GearPart {
  /** box — ящик w × h × d; cylinder — радиус низа, радиус верха, высота. */
  shape: 'box' | 'cylinder'
  /** Середина основания детали в метрах от ног путника: X — вправо, Y — вверх, Z — вперёд. */
  at: [number, number, number]
  size: [number, number, number]
  color: string
  /** Поворот в радианах вокруг осей X и Z: скатка лежит поперёк спины, плащ чуть отклонён. */
  tilt?: [number, number]
  /** Светится: фонарь. */
  glow?: boolean
}

/** Куртка путника: основной цвет и цвет рукавов. Красная — пока не надета другая. */
export function jacketColors(gear: string[]): [string, string] {
  if (gear.includes('jacket-blue')) return ['#2f5f9e', '#4274b5']
  if (gear.includes('jacket-green')) return ['#3d7a52', '#52906a']
  return ['#b5432f', '#c85a3f']
}

/** Детали надетой экипировки для путника ростом height. */
export function gearParts(gear: string[], height: number): GearPart[] {
  const h = height
  const parts: GearPart[] = []
  if (gear.includes('hat')) {
    parts.push({ shape: 'cylinder', at: [0, h * 0.905, 0.02], size: [0.33, 0.33, 0.05], color: '#7a5a3e' })
    parts.push({ shape: 'cylinder', at: [0, h * 0.92, 0.02], size: [0.24, 0.2, 0.2], color: '#8a6748' })
  }
  if (gear.includes('scarf')) {
    parts.push({ shape: 'cylinder', at: [0, h * 0.76, 0.02], size: [0.2, 0.22, 0.13], color: '#d9b24a' })
    parts.push({ shape: 'box', at: [0.13, h * 0.61, 0.17], size: [0.12, 0.34, 0.05], color: '#d9b24a' })
  }
  if (gear.includes('cape')) {
    parts.push({ shape: 'box', at: [0, h * 0.36, -0.27], size: [0.7, h * 0.42, 0.05], color: '#4a5878', tilt: [-0.1, 0] })
  }
  if (gear.includes('pack')) {
    // У путника уже есть рюкзак; большой — это короб повыше и скатка-спальник сверху.
    parts.push({ shape: 'box', at: [0, h * 0.5, -0.36], size: [0.52, h * 0.28, 0.26], color: '#7d6a4a' })
    parts.push({ shape: 'cylinder', at: [-0.33, h * 0.81, -0.34], size: [0.14, 0.14, 0.66], color: '#a38658', tilt: [0, -Math.PI / 2] })
  }
  if (gear.includes('lantern')) {
    parts.push({ shape: 'box', at: [0.36, h * 0.38, 0.1], size: [0.15, 0.2, 0.15], color: '#ffd58a', glow: true })
    parts.push({ shape: 'box', at: [0.36, h * 0.47, 0.1], size: [0.19, 0.04, 0.19], color: '#55575c' })
  }
  return parts
}

/** Кот-спутник идёт рядом с путником. */
export const hasCat = (gear: string[]) => gear.includes('cat')
