import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: пройден один перевал — день 2.
import progress from './fixtures/progress-2026-11-18.json'
import type { Ledger, Plan, Progress, RawCycle } from '../data/types'
import { buildWorld } from './engine'
import { REWARD_LIMIT, REWARD_SIZES, SIGN_GEMS, SIGN_MAX, redeemedGems, rewardProblem, signProblem, tidy } from './rewards'

const raw: RawCycle = { dir: '01-basic-month', plan: plan as unknown as Plan, progress: progress as unknown as Progress }
const world = (ledger: Partial<Ledger> = {}) => buildWorld([raw], [], '2026-11-18', { purchases: [], repairs: [], ...ledger })

describe('свои награды', () => {
  it('цена — по размеру: 2, 5 или 10 камней', () => {
    expect(REWARD_SIZES.map((size) => size.gems)).toEqual([2, 5, 10])
  })

  it('награду нельзя завести без названия, с чужой ценой, дважды и сверх лимита', () => {
    expect(rewardProblem('Вечер с игрой', 2, [])).toBeNull()
    expect(rewardProblem('   ', 2, [])).toBe('назови награду')
    expect(rewardProblem('Вечер с игрой', 1, [])).toBe('выбери размер награды')
    expect(rewardProblem('вечер  с игрой', 5, [{ id: 'a', name: 'Вечер с игрой', gems: 2 }])).toBe('такая награда уже есть в списке')
    expect(rewardProblem('х'.repeat(61), 2, [])).toMatch(/длиннее 60/)
    const full = Array.from({ length: REWARD_LIMIT }, (_, i) => ({ id: `r${i}`, name: `Награда ${i}`, gems: 2 }))
    expect(rewardProblem('Ещё одна', 2, full)).toMatch(/не больше 12/)
  })

  it('выкуп списывает камни; сам список наград ничего не стоит', () => {
    const before = world()
    const listed = world({ rewards: [{ id: 'a', name: 'Новая книга', gems: 5 }] })
    expect(listed.wallet.gems).toBe(before.wallet.gems)
    expect(listed.rewards).toHaveLength(1)
    const redeemed = [
      { at: '2026-11-18T10:00:00.000Z', name: 'Вечер с игрой', gems: 2 },
      { at: '2026-11-18T11:00:00.000Z', name: 'Вечер с игрой', gems: 2 },
    ]
    expect(redeemedGems(redeemed)).toBe(4)
    const after = world({ redeemed })
    expect(after.wallet.gems).toBe(before.wallet.gems - 4)
    expect(after.wallet.coins).toBe(before.wallet.coins)
    expect(after.redeemed).toHaveLength(2)
  })
})

describe('памятные знаки', () => {
  const passed = world().active.days.find((d) => d.keyPoint && d.done)!
  const ahead = world().active.days.find((d) => d.keyPoint && !d.done)!
  const plain = world().active.days.find((d) => !d.keyPoint && d.done)!

  it('знак ставится на пройденном перевале и стоит один камень', () => {
    expect(passed.n).toBe(2)
    const before = world()
    const after = world({ signs: [{ cycle: before.active.id, day: passed.n, text: 'Первый перевал взят', date: '2026-11-18' }] })
    expect(after.active.days.find((d) => d.n === passed.n)!.sign).toBe('Первый перевал взят')
    expect(after.signs).toHaveLength(1)
    expect(after.wallet.gems).toBe(before.wallet.gems - SIGN_GEMS)
  })

  it('запись не к месту не считается и камней не стоит: не перевал, не пройден, второй знак, чужой цикл', () => {
    const before = world()
    const id = before.active.id
    const after = world({
      signs: [
        { cycle: id, day: plain.n, text: 'обычный день', date: '2026-11-18' },
        { cycle: id, day: ahead.n, text: 'ещё не дошёл', date: '2026-11-18' },
        { cycle: 'нет такого', day: passed.n, text: 'чужой цикл', date: '2026-11-18' },
        { cycle: id, day: passed.n, text: 'первый', date: '2026-11-18' },
        { cycle: id, day: passed.n, text: 'второй', date: '2026-11-18' },
      ],
    })
    expect(after.signs.map((s) => s.text)).toEqual(['первый'])
    expect(after.wallet.gems).toBe(before.wallet.gems - SIGN_GEMS)
    expect(after.active.days.filter((d) => d.sign).map((d) => d.n)).toEqual([passed.n])
  })

  it('почему знак нельзя поставить', () => {
    expect(signProblem('Дошёл', passed, 1)).toBeNull()
    expect(signProblem('Дошёл', plain, 1)).toBe('знак ставится только на перевале')
    expect(signProblem('Дошёл', ahead, 1)).toBe('перевал ещё не пройден')
    expect(signProblem('Дошёл', { ...passed, sign: 'уже есть' }, 1)).toBe('на этом перевале знак уже стоит')
    expect(signProblem('  ', passed, 1)).toBe('напиши подпись')
    expect(signProblem('х'.repeat(SIGN_MAX + 1), passed, 1)).toMatch(/длиннее 40/)
    expect(signProblem('Дошёл', passed, 0)).toBe('не хватает камней: 1')
    expect(signProblem('Дошёл', undefined, 1)).toBe('знак ставится только на перевале')
  })

  it('подпись хранится без лишних пробелов', () => {
    expect(tidy('  Первый   перевал  ')).toBe('Первый перевал')
  })
})

describe('живые данные: награды и знаки', () => {
  it('каждый записанный знак стоит на пройденном перевале, цены наград — из размеров, камни не в минусе', async () => {
    const { offplan, rawCycles, repoPurchases, repoRedeemed, repoRepairs, repoRewards, repoSigns, repoTownActions } = await import('../data/load')
    const { toISO } = await import('./rules')
    const { rewardSize } = await import('./rewards')
    const live = buildWorld(rawCycles, offplan, toISO(new Date()), {
      purchases: repoPurchases,
      repairs: repoRepairs,
      town: repoTownActions,
      rewards: repoRewards,
      redeemed: repoRedeemed,
      signs: repoSigns,
    })
    expect(live.signs, 'знаки не на пройденных перевалах').toHaveLength(repoSigns.length)
    for (const item of [...repoRewards, ...repoRedeemed]) expect(rewardSize(item.gems), item.name).toBeDefined()
    expect(live.wallet.gems).toBeGreaterThanOrEqual(0)
    expect(live.wallet.coins).toBeGreaterThanOrEqual(0)
  })
})
