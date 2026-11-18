// Лавка: что можно купить за монеты и камни.
// Покупки ничего не ускоряют и не подменяют прогресс: домики-файлы, очки и дни купить нельзя.

export interface ShopItem {
  id: string
  /** gear — экипировка путника, camp — украшения города (название группы осталось от лагеря). */
  group: 'gear' | 'camp'
  name: string
  about: string
  coins?: number
  gems?: number
  /** Предметы одного слота носятся по одному. */
  slot?: 'jacket'
  /** С какой ступени города можно купить. Без поля — с самой стоянки. */
  tier?: number
}

export const SHOP: ShopItem[] = [
  { id: 'scarf', group: 'gear', name: 'Шарф', about: 'Яркий шарф поверх куртки.', coins: 60 },
  { id: 'hat', group: 'gear', name: 'Шляпа', about: 'Широкие поля — от солнца на склоне.', coins: 120 },
  { id: 'jacket-blue', group: 'gear', name: 'Синяя куртка', about: 'Вместо красной.', coins: 150, slot: 'jacket' },
  { id: 'jacket-green', group: 'gear', name: 'Зелёная куртка', about: 'Вместо красной.', coins: 150, slot: 'jacket' },
  { id: 'pack', group: 'gear', name: 'Большой рюкзак', about: 'С притороченным спальником.', coins: 180 },
  { id: 'lantern', group: 'gear', name: 'Фонарь', about: 'Висит на поясе; ночью светит вокруг путника.', coins: 220 },
  { id: 'cape', group: 'gear', name: 'Плащ', about: 'За знания, а не за часы.', gems: 3 },
  { id: 'cat', group: 'gear', name: 'Кот-спутник', about: 'Сидит у костра, в городе ходит рядом по площади.', gems: 6 },

  // Украшения города. Огород, колодец и очаг стали обычными постройками и центром поселения,
  // мост открывается сам вместе с «Лагерем» — поэтому в лавке их больше нет.
  { id: 'pot', group: 'camp', name: 'Котелок', about: 'Тренога с котелком над костром.', coins: 80 },
  { id: 'signpost', group: 'camp', name: 'Указатель', about: 'Столб со стрелками у тропы.', coins: 100 },
  { id: 'bench', group: 'camp', name: 'Скамьи', about: 'Места у костра; в городе — у костровища на площади.', coins: 120 },
  { id: 'lamps', group: 'camp', name: 'Фонари', about: 'У домов, на площади и на мосту. Без них ночью светят только костры и окна.', coins: 320, tier: 1 },
  { id: 'flagpole', group: 'camp', name: 'Флагшток', about: 'Высокий флаг на площади.', gems: 2, tier: 1 },
]

export const shopItem = (id: string): ShopItem | undefined => SHOP.find((item) => item.id === id)

export interface Wallet {
  coinsEarned: number
  coinsSpent: number
  coins: number
  gemsEarned: number
  gemsSpent: number
  gems: number
}

/** extra — траты вне лавки: ремонты и город. */
export function walletFor(
  coinsEarned: number,
  gemsEarned: number,
  owned: string[],
  extra: { coins: number; gems: number } = { coins: 0, gems: 0 },
): Wallet {
  const items = [...new Set(owned)].map(shopItem).filter((item): item is ShopItem => !!item)
  const coinsSpent = items.reduce((sum, item) => sum + (item.coins ?? 0), 0) + extra.coins
  const gemsSpent = items.reduce((sum, item) => sum + (item.gems ?? 0), 0) + extra.gems
  return {
    coinsEarned,
    coinsSpent,
    coins: coinsEarned - coinsSpent,
    gemsEarned,
    gemsSpent,
    gems: gemsEarned - gemsSpent,
  }
}

export const canAfford = (item: ShopItem, wallet: Wallet): boolean =>
  wallet.coins >= (item.coins ?? 0) && wallet.gems >= (item.gems ?? 0)
