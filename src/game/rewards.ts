// Свои награды и памятные знаки: на что ещё тратятся камни.
// Своя награда — награда из настоящей жизни, которую игрок назначает себе сам; на игру она не влияет.
// Памятный знак — подпись игрока на пройденном перевале.
// Камни дают только перевалы, недельные тесты и трофеи, поэтому и то и другое всегда стоит за знаниями.
import type { Redeemed, Reward } from '../data/types'

export interface RewardSize {
  id: 'small' | 'medium' | 'large'
  name: string
  gems: number
  hint: string
}

/**
 * Цену награды игрок не назначает: он выбирает размер.
 * За цикл выходит до 18 камней, и они же нужны на ступени города, — большая награда стоит больше половины цикла.
 */
export const REWARD_SIZES: RewardSize[] = [
  { id: 'small', name: 'малая', gems: 2, hint: 'приятная мелочь' },
  { id: 'medium', name: 'средняя', gems: 5, hint: 'то, чего ждёшь неделю' },
  { id: 'large', name: 'большая', gems: 10, hint: 'то, ради чего стоит закрыть цикл' },
]

export const REWARD_LIMIT = 12
export const REWARD_NAME_MAX = 60
/** Цена памятного знака. */
export const SIGN_GEMS = 1
export const SIGN_MAX = 40

/** Текст от игрока: без пробелов по краям и без двойных пробелов. */
export const tidy = (text: string) => text.trim().replace(/\s+/g, ' ')

export const rewardSize = (gems: number): RewardSize | undefined => REWARD_SIZES.find((size) => size.gems === gems)

/** Почему награду нельзя завести. null — можно. */
export function rewardProblem(name: string, gems: number, existing: Reward[]): string | null {
  const clean = tidy(name)
  if (!clean) return 'назови награду'
  if (clean.length > REWARD_NAME_MAX) return `название длиннее ${REWARD_NAME_MAX} знаков`
  if (!rewardSize(gems)) return 'выбери размер награды'
  if (existing.some((reward) => reward.name.toLowerCase() === clean.toLowerCase())) return 'такая награда уже есть в списке'
  if (existing.length >= REWARD_LIMIT) return `в списке не больше ${REWARD_LIMIT} наград: убери лишнюю`
  return null
}

/** Сколько камней ушло на выкупленные награды. */
export const redeemedGems = (redeemed: Redeemed[]): number => redeemed.reduce((sum, item) => sum + item.gems, 0)

/** Почему знак нельзя поставить. null — можно. */
export function signProblem(
  text: string,
  day: { done: boolean; keyPoint: unknown; sign: string | null } | undefined,
  gems: number,
): string | null {
  if (!day || !day.keyPoint) return 'знак ставится только на перевале'
  if (!day.done) return 'перевал ещё не пройден'
  if (day.sign) return 'на этом перевале знак уже стоит'
  const clean = tidy(text)
  if (!clean) return 'напиши подпись'
  if (clean.length > SIGN_MAX) return `подпись длиннее ${SIGN_MAX} знаков`
  if (gems < SIGN_GEMS) return `не хватает камней: ${SIGN_GEMS - gems}`
  return null
}
