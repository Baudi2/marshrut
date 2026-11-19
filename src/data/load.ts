import type { OffplanEntry, Plan, Progress, Purchase, RawCycle } from './types'
import offplanFile from '../../data/offplan.json'
import purchasesFile from '../../data/purchases.json'
import deckFile from '../../data/deck.json'
import type { DeckReview, MemorialSign, Redeemed, Reward } from './types'
import townFile from '../../data/town.json'
import type { TownAction } from '../game/town'

// Каждая папка data/cycles/<NN-id>/ — один цикл. Новый цикл подхватывается сам.
const plans = import.meta.glob<Plan>('../../data/cycles/*/plan.json', {
  eager: true,
  import: 'default',
})
const progresses = import.meta.glob<Progress>('../../data/cycles/*/progress.json', {
  eager: true,
  import: 'default',
})

export const rawCycles: RawCycle[] = Object.keys(plans)
  .sort()
  .flatMap((path) => {
    const progress = progresses[path.replace('plan.json', 'progress.json')]
    if (!progress) return []
    return [{ dir: path.split('/').slice(-2)[0], plan: plans[path], progress }]
  })

export const offplan = (offplanFile as { entries: OffplanEntry[] }).entries

/** Покупки, уже записанные в репозиторий. */
export const repoPurchases = (purchasesFile as { purchases: Purchase[] }).purchases

/** Действия в городе, уже записанные в репозиторий. */
export const repoTownActions = (townFile as { actions: TownAction[] }).actions

/** Ремонты, уже записанные в репозиторий. */
export const repoRepairs = (purchasesFile as { repairs?: Purchase[] }).repairs ?? []

/** Свои награды, их выкупы и памятные знаки, уже записанные в репозиторий. */
const extras = purchasesFile as { rewards?: Reward[]; redeemed?: Redeemed[]; signs?: MemorialSign[] }
export const repoRewards = extras.rewards ?? []
export const repoRedeemed = extras.redeemed ?? []
export const repoSigns = extras.signs ?? []

/** Ответы по карточкам колоды, уже записанные в репозиторий. */
export const repoReviews = (deckFile as { reviews: DeckReview[] }).reviews
