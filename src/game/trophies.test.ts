import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: одна пауза в 14 дней и возвращение 11.11.
import progress from './fixtures/progress-2026-11-18.json'
import type { Plan, Progress, RawCycle } from '../data/types'
import { buildWorld } from './engine'
import { trophiesFor } from './trophies'

const raw: RawCycle = { dir: '01-basic-month', plan: plan as unknown as Plan, progress: progress as unknown as Progress }
const world = (patch?: (p: Progress) => void) => {
  const copy = structuredClone(raw)
  patch?.(copy.progress)
  return buildWorld([copy], [], '2026-12-30')
}
const trophy = (w: ReturnType<typeof world>, id: string) => w.trophies.find((t) => t.id === id)!
const attempt = (kind: string, date: string, minutes = 10) => ({ date, kind, minutes, result: 'solved', selfSolved: true })

describe('трофеи', () => {
  it('на снимке получен один трофей — возвращение после паузы, и он принёс камень', () => {
    const w = world()
    expect(w.trophies).toHaveLength(8)
    expect(w.trophies.filter((t) => t.earned).map((t) => t.id)).toEqual(['return'])
    expect(trophy(w, 'return')).toMatchObject({ earned: true, date: '2026-11-11', gems: 1 })
    expect(w.gemLog.filter((g) => g.label.startsWith('Трофей'))).toEqual([{ label: 'Трофей: Возвращение', gems: 1, date: '2026-11-11' }])
    expect(w.wallet.gems).toBe(w.gemLog.reduce((sum, g) => sum + g.gems, 0))
  })

  it('короткая пауза возвращением не считается', () => {
    const w = world((p) => {
      p.position.pauses = [{ from: '2026-11-13', to: '2026-11-16', days: 4 }]
    })
    expect(trophy(w, 'return').earned).toBe(false)
  })

  it('с пустого редактора: первый удачный повтор', () => {
    const w = world((p) => {
      p.leetcode[0].attempts.push(attempt('from-empty-editor', '2026-11-20'))
    })
    expect(trophy(w, 'empty-editor')).toMatchObject({ earned: true, date: '2026-11-20' })
  })

  it('зелёный CI и починенный красный — два разных трофея', () => {
    const w = world((p) => {
      p.petProject = { ...p.petProject, ci: { helloWorldWorkflow: 'green', buildWorkflow: null } }
    })
    expect(trophy(w, 'green').earned).toBe(true)
    expect(trophy(w, 'red-green').earned).toBe(false)
    const fixed = world((p) => {
      p.events = [{ date: '2026-12-01', type: 'ci-fixed' }]
    })
    expect(trophy(fixed, 'red-green')).toMatchObject({ earned: true, date: '2026-12-01' })
  })

  it('три без подсказок: нужны три разные задачи', () => {
    const solved = (id: number, date: string) => ({ id, title: 'задача', status: 'solved-no-hints', attempts: [attempt('no-hints', date)] })
    const two = world((p) => {
      p.leetcode.push(solved(217, '2026-12-10'), solved(242, '2026-12-11'))
    })
    expect(trophy(two, 'no-hints')).toMatchObject({ earned: false, progress: '2 из 3' })
    const three = world((p) => {
      p.leetcode.push(solved(217, '2026-12-10'), solved(242, '2026-12-11'), solved(125, '2026-12-12'))
    })
    expect(trophy(three, 'no-hints')).toMatchObject({ earned: true, date: '2026-12-12', gems: 2, progress: '3 из 3' })
  })

  it('быстрее себя: финальный замер быстрее стартового', () => {
    const slower = world((p) => {
      p.baseline.final = { ...p.baseline.final, minutes: 20, result: 'solved', date: '2026-12-20' }
    })
    expect(trophy(slower, 'faster').earned).toBe(false)
    const faster = world((p) => {
      p.baseline.final = { ...p.baseline.final, minutes: 9, result: 'solved', date: '2026-12-20' }
    })
    expect(trophy(faster, 'faster')).toMatchObject({ earned: true, date: '2026-12-20', gems: 2 })
  })

  it('коллекция паттерна: решение после разбора не считается', () => {
    expect(trophy(world(), 'pattern')).toMatchObject({ earned: false, progress: '0 из 2' })
    const half = world((p) => {
      p.leetcode.push({ id: 387, title: 'задача', status: 'solved-self', attempts: [attempt('timed-20', '2026-11-25')] })
    })
    expect(trophy(half, 'pattern')).toMatchObject({ earned: false, progress: '1 из 2' })
    const full = world((p) => {
      p.leetcode[0].status = 'repeated-from-empty'
      p.leetcode.push({ id: 387, title: 'задача', status: 'solved-self', attempts: [attempt('timed-20', '2026-11-25')] })
    })
    expect(trophy(full, 'pattern')).toMatchObject({ earned: true, progress: '2 из 2' })
  })

  it('архитектор: три сохранённых файла по System Design', () => {
    const cycles = structuredClone(world().cycles)
    const design = cycles[0].buildings.filter((b) => b.item.track === 'B')
    expect(design.length).toBeGreaterThanOrEqual(3)
    for (const b of design) b.stage = 0
    design[0].stage = 2
    design[1].stage = 3
    expect(trophiesFor(cycles).find((t) => t.id === 'architect')).toMatchObject({ earned: false, progress: '2 из 3' })
    design[2].stage = 2
    expect(trophiesFor(cycles).find((t) => t.id === 'architect')).toMatchObject({ earned: true, progress: '3 из 3' })
  })
})
