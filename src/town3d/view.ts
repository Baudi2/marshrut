// Что показывает сцена города: настоящее состояние из журнала или предпросмотр будущей ступени.
import type { World } from '../game/engine'
import { SHOP, shopItem } from '../game/shop'
import { BUILDINGS, TIERS, maxLevel } from '../game/town'
import type { Season } from '../world/sky'
import { QUARTER_SLOTS } from './plan'
import type { TownSpecialView, TownView } from './town'

/** Особые постройки: файлы всех циклов по порядку появления. */
export function specialsOf(world: World): TownSpecialView[] {
  return world.cycles
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

export function townView(world: World, season: Season, neglect: number, gear: string[] = []): TownView {
  const { town } = world
  return {
    tier: town.tier,
    tierPending: town.tierPending,
    buildings: town.buildings.map((b) => ({ id: b.id, type: b.type, level: b.level, pending: b.pending })),
    specials: specialsOf(world),
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
    population: Math.max(TIERS[tier].residents, tier * 3),
    season,
    neglect,
    // Стоянка в предпросмотре чистая; на следующих ступенях показано всё, что к ним уже можно купить.
    decor: tier === 0 ? [] : SHOP.filter((item) => item.group === 'camp' && (item.tier ?? 0) <= tier).map((item) => item.id),
    brokenDecor: [],
    gear,
  }
}
