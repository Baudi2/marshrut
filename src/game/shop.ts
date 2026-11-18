// Лавка: что можно купить за монеты и камни.
// Покупки ничего не ускоряют и не подменяют прогресс: домики-файлы, очки и дни купить нельзя.

export interface ShopItem {
  id: string
  /** gear — экипировка путника, camp — обустройство лагеря. */
  group: 'gear' | 'camp'
  name: string
  about: string
  coins?: number
  gems?: number
  /** Предметы одного слота носятся по одному. */
  slot?: 'jacket'
}

export const SHOP: ShopItem[] = [
  { id: 'scarf', group: 'gear', name: 'Шарф', about: 'Яркий шарф поверх куртки.', coins: 60 },
  { id: 'hat', group: 'gear', name: 'Шляпа', about: 'Широкие поля — от солнца на склоне.', coins: 120 },
  { id: 'jacket-blue', group: 'gear', name: 'Синяя куртка', about: 'Вместо красной.', coins: 150, slot: 'jacket' },
  { id: 'jacket-green', group: 'gear', name: 'Зелёная куртка', about: 'Вместо красной.', coins: 150, slot: 'jacket' },
  { id: 'pack', group: 'gear', name: 'Большой рюкзак', about: 'С притороченным спальником.', coins: 180 },
  { id: 'lantern', group: 'gear', name: 'Фонарь', about: 'Светит в тёмной теме.', coins: 220 },
  { id: 'cape', group: 'gear', name: 'Плащ', about: 'За знания, а не за часы.', gems: 3 },
  { id: 'dog', group: 'gear', name: 'Пёс-спутник', about: 'Идёт рядом по карте и сидит у костра.', gems: 6 },

  { id: 'pot', group: 'camp', name: 'Котелок', about: 'Тренога с котелком над костром.', coins: 80 },
  { id: 'signpost', group: 'camp', name: 'Указатель', about: 'Столб со стрелками у входа в лагерь.', coins: 100 },
  { id: 'bench', group: 'camp', name: 'Скамья', about: 'Бревно у костра.', coins: 120 },
  { id: 'hearth', group: 'camp', name: 'Каменный очаг', about: 'Кольцо камней вокруг костра.', coins: 200 },
  { id: 'garden', group: 'camp', name: 'Огород', about: 'Грядки с краю поляны.', coins: 260 },
  { id: 'lamps', group: 'camp', name: 'Фонари', about: 'Два фонаря на столбах. Гаснут, когда лагерь заброшен.', coins: 320 },
  { id: 'well', group: 'camp', name: 'Колодец', about: 'Каменный, с навесом.', coins: 400 },
  { id: 'flagpole', group: 'camp', name: 'Флагшток', about: 'Высокий флаг над поляной.', gems: 2 },
  { id: 'bridge', group: 'camp', name: 'Ручей с мостиком', about: 'Ручей вдоль края поляны и мостик через него.', gems: 5 },
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
