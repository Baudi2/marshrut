// Что показывает сцена города: настоящее состояние из журнала или предпросмотр будущей ступени.
import type { CycleView, World } from '../game/engine'
import { SHOP, shopItem } from '../game/shop'
import { BUILDINGS, TIERS, maxLevel } from '../game/town'
import type { Season } from '../world/sky'
import { QUARTER_SLOTS } from './plan'
import type { TownMonumentView, TownSpecialView, TownView } from './town'

type Cycles = Pick<CycleView, 'id' | 'n' | 'name' | 'done' | 'buildings'>[]

/**
 * Цикл свёрнут в памятник: он закрыт, и после него уже начат следующий.
 * Пока следующего цикла нет, постройки-файлы закрытого цикла стоят в слободе как стояли —
 * памятник появляется рядом, а место в слободе освобождается, только когда оно понадобится.
 */
export const folded = (cycle: Cycles[number], cycles: Cycles): boolean => cycle.done && cycles.some((other) => other.n > cycle.n)

/** Особые постройки: файлы всех несвёрнутых циклов по порядку появления. */
export function specialsOf(world: { cycles: Cycles }): TownSpecialView[] {
  return world.cycles
    .filter((cycle) => !folded(cycle, world.cycles))
    .flatMap((cycle) =>
      cycle.buildings.map((b) => ({
        id: `file:${cycle.id}:${b.item.id}`,
        kind: b.item.kind,
        track: b.item.track,
        stage: b.stage,
        title: b.item.title,
      })),
    )
    .slice(0, QUARTER_SLOTS)
}

/** Памятники: по одному на каждый закрытый цикл, по порядку циклов. */
export function monumentsOf(world: { cycles: Cycles }): TownMonumentView[] {
  return world.cycles
    .filter((cycle) => cycle.done)
    .sort((a, b) => a.n - b.n)
    .map((cycle) => ({ id: `cycle:${cycle.id}`, n: cycle.n, title: `Памятник цикла ${cycle.n}: ${cycle.name}` }))
}

export function townView(world: World, season: Season, neglect: number, gear: string[] = []): TownView {
  const { town } = world
  return {
    tier: town.tier,
    tierPending: town.tierPending,
    buildings: town.buildings.map((b) => ({ id: b.id, type: b.type, level: b.level, pending: b.pending, broken: !!b.broken })),
    specials: specialsOf(world),
    monuments: monumentsOf(world),
    population: town.population,
    season,
    neglect,
    decor: world.owned.filter((id) => shopItem(id)?.group === 'camp'),
    brokenDecor: world.damage.map((d) => d.item),
    gear,
  }
}

/**
 * Как город может выглядеть на ступени: все постройки, которые она разрешает,
 * на уровнях около предельного. Это только картинка: в журнал ничего не пишется.
 */
export function previewView(tier: number, world: World, season: Season, neglect: number, gear: string[] = []): TownView {
  const top = maxLevel(tier)
  const buildings = BUILDINGS.flatMap((type) =>
    Array.from({ length: type.count[tier] }, (_, i) => ({
      id: `${type.id}-${i + 1}`,
      type: type.id,
      // Первые постройки типа старше поздних: так город выглядит выросшим, а не поставленным разом.
      level: Math.max(1, Math.min(5, top - (i % 3 === 2 ? 2 : i % 2), top - Math.max(0, type.tier - tier + 1))),
      pending: null,
    })),
  )
  const need = TIERS[tier].specials
  const specials = specialsOf(world).map((special, i) => ({ ...special, stage: i < need ? Math.max(2, special.stage) : special.stage }))
  return {
    tier,
    tierPending: null,
    buildings,
    specials,
    // Памятники — только настоящие: предпросмотр не обещает закрытых циклов.
    monuments: monumentsOf(world),
    population: Math.max(TIERS[tier].residents, tier * 3),
    season,
    neglect,
    // Стоянка в предпросмотре чистая; на следующих ступенях показано всё, что к ним уже можно купить.
    decor: tier === 0 ? [] : SHOP.filter((item) => item.group === 'camp' && (item.tier ?? 0) <= tier).map((item) => item.id),
    brokenDecor: [],
    gear,
  }
}
