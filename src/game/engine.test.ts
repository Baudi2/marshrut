import { describe, expect, it } from 'vitest'
import plan from '../../data/cycles/01-basic-month/plan.json'
// Снимок прогресса на 18.11.2026: живой progress.json меняется после каждого занятия.
import progress from './fixtures/progress-2026-11-18.json'
import { offplan, rawCycles } from '../data/load'
import type { Plan, Progress, RawCycle } from '../data/types'
import { buildWorld } from './engine'
import { BREAK_LIMIT, conditionLevel, gemsForScore, levelFor, missedWorkdays, pausedDays, roman, toISO } from './rules'
import { SHOP, canAfford, shopItem } from './shop'
import { BREAKS_BY_LEVEL, repairCost } from './repair'
import { repoPurchases, repoRepairs } from '../data/load'

const raw: RawCycle = {
  dir: '01-basic-month',
  plan: plan as unknown as Plan,
  progress: progress as unknown as Progress,
}

/** Копия цикла с правкой прогресса — чтобы проверять правила на будущих состояниях. */
function withProgress(patch: (p: Progress) => void): RawCycle {
  const copy = structuredClone(raw)
  patch(copy.progress)
  return copy
}

describe('уровни и ранги', () => {
  it('уровень открывается при 100·L·(L−1) XP: новый уровень — не раньше недели занятий', () => {
    expect(levelFor(0).n).toBe(1)
    expect(levelFor(199).n).toBe(1)
    expect(levelFor(200).n).toBe(2)
    expect(levelFor(599).n).toBe(2)
    expect(levelFor(600).n).toBe(3)
    // цикл 1, пройденный ядром
    expect(levelFor(2250).n).toBe(5)
  })

  it('внутри уровня считается остаток до следующего', () => {
    expect(levelFor(130)).toMatchObject({ n: 1, floor: 0, next: 200, into: 130, span: 200 })
  })

  it('римские цифры', () => {
    expect([1, 4, 9, 14].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV'])
  })
})

describe('состояние мира', () => {
  it('считает только рабочие дни между занятием и сегодня', () => {
    expect(missedWorkdays('2026-11-18', '2026-11-18')).toBe(0)
    expect(missedWorkdays('2026-11-18', '2026-11-19')).toBe(0)
    // пт 13.11 → ср 18.11: пропущены пн и вт
    expect(missedWorkdays('2026-11-13', '2026-11-18')).toBe(2)
    // выходные не считаются
    expect(missedWorkdays('2026-11-13', '2026-11-16')).toBe(0)
  })

  it('один пропуск ничего не меняет, со второго мир портится', () => {
    expect([0, 1, 2, 3, 4, 7, 8].map(conditionLevel)).toEqual([0, 0, 1, 1, 2, 2, 3])
  })
})

describe('цикл 1 на 18.11.2026', () => {
  const world = buildWorld([raw], [], '2026-11-18')
  const cycle = world.active

  it('позиция: день 3, шаг 2', () => {
    expect(cycle.daysDone).toBe(2)
    expect(cycle.current?.day.n).toBe(3)
    expect(cycle.current?.step?.n).toBe(2)
    expect(cycle.days[2].state).toBe('current')
    expect(cycle.days[3].state).toBe('ahead')
  })

  it('очки: два дня, два артефакта, задача с разбором, возвращение', () => {
    expect(world.events.map((e) => [e.label, e.xp])).toEqual([
      ['День 1 закрыт ядром (глубокий)', 50],
      ['День 2 закрыт ядром (лёгкий)', 30],
      ['Артефакт: (репозиторий и папки)', 10],
      ['Артефакт: (новый проект Empty Activity)', 10],
      ['Задача 1512: решена с разбором', 10],
      ['Возвращение после паузы в 14 дней', 20],
    ])
    expect(world.totalXp).toBe(130)
    expect(world.level.n).toBe(1)
  })

  it('очки трека складываются из его событий', () => {
    const xp = Object.fromEntries(world.tracks.map((t) => [t.track.code, t.xp]))
    expect(xp).toEqual({ A: 40, B: 50, C1: 0, C2: 0, E: 0 })
  })

  it('задачи: 1512 с разбором, повтор в день 5, Two Sum вне плана', () => {
    const p1512 = cycle.problems.find((p) => p.id === 1512)!
    expect(p1512).toMatchObject({ state: 'walkthrough', timedMinutes: 14, timedLimit: 20, repeatDay: 5 })
    expect(cycle.problems.find((p) => p.id === 1)).toMatchObject({ state: 'before', role: 'offplan' })
    expect(cycle.problems.filter((p) => p.role === 'pair')).toHaveLength(9)
  })

  it('лагерь: два дома построены, шесть строятся, остальное — участки', () => {
    const byStage = (stage: number) => cycle.buildings.filter((b) => b.stage === stage).map((b) => b.item.id)
    expect(byStage(2)).toEqual(['hq', 'pet'])
    expect(byStage(1)).toEqual(['layers', 'cheatsheet', 'solutions', 'algo-mistakes', 'baseline', 'gradle-anatomy'])
    expect(byStage(0)).toHaveLength(14)
  })

  it('привал стоит после дня 1', () => {
    expect(cycle.pauses).toHaveLength(1)
    expect(cycle.pauses[0].afterDay).toBe(1)
  })

  it('мир ясный в день занятия и портится при пропусках', () => {
    expect(world.condition.level).toBe(0)
    expect(buildWorld([raw], [], '2026-11-23').condition.level).toBe(1)
    expect(buildWorld([raw], [], '2026-11-27').condition.level).toBe(2)
    expect(buildWorld([raw], [], '2026-12-07').condition.level).toBe(3)
  })

  it('ритм: занятия по неделям, неделя паузы пустая', () => {
    expect(world.rhythm.map((w) => w.sessions)).toEqual([1, 0, 2, 2])
  })
})

describe('правила на будущих состояниях', () => {
  it('повтор и решение без подсказок дают очки по одному разу', () => {
    const cycle = withProgress((p) => {
      const problem = p.leetcode.find((x) => x.id === 1512)!
      problem.status = 'solved-no-hints'
      problem.attempts.push(
        { date: '2026-11-20', kind: 'from-empty-editor', minutes: 7, result: 'solved', selfSolved: true },
        { date: '2026-11-21', kind: 'from-empty-editor', minutes: 5, result: 'solved', selfSolved: true },
        { date: '2026-12-07', kind: 'no-hints', minutes: 9, result: 'solved', selfSolved: true },
      )
    })
    const xp = buildWorld([cycle], [], '2026-12-07')
      .events.filter((e) => e.label.startsWith('Задача 1512'))
      .map((e) => e.xp)
    expect(xp).toEqual([10, 15, 30])
  })

  it('сохранённый файл достраивает домик и даёт очки', () => {
    const cycle = withProgress((p) => {
      p.days[1].artifacts!.find((a) => a.path === 'notes/baseline.md')!.state = 'saved'
    })
    const world = buildWorld([cycle], [], '2026-11-18')
    expect(world.active.buildings.find((b) => b.item.id === 'baseline')!.stage).toBe(2)
    expect(world.totalXp).toBe(140)
  })

  it('минимум, расширение, зелёный CI и закрытая неделя', () => {
    const cycle = withProgress((p) => {
      p.days[2].status = 'extension'
      p.days.push({ day: 4, status: 'minimum', dates: ['2026-11-19'] })
      p.petProject!.ci!.helloWorldWorkflow = 'green'
      p.weeks = [{ n: 1, closed: true, date: '2026-11-19' }]
    })
    const world = buildWorld([cycle], [], '2026-11-19')
    // 130 + день 3 (50 + 25) + минимум 10 + CI 40 + неделя 50
    expect(world.totalXp).toBe(305)
    expect(world.active.days[3].state).toBe('minimum')
  })

  it('занятие вне плана даёт очки и сбрасывает запустение', () => {
    const world = buildWorld(
      [raw],
      [{ date: '2026-12-04', kind: 'session', title: 'Статья про Paging', track: 'B' }],
      '2026-12-07',
    )
    expect(world.totalXp).toBe(150)
    expect(world.condition.level).toBe(0)
  })
})

describe('монеты, камни и лавка', () => {
  /** Неделя 1 закрыта целиком: дни 3 и 4 сделаны. */
  const weekOneDone = (extra?: (p: Progress) => void) =>
    withProgress((p) => {
      p.days[2].status = 'core'
      p.days.push({ day: 4, status: 'core', dates: ['2026-11-20'] })
      p.position.currentDay = 5
      p.position.currentStep = 1
      extra?.(p)
    })

  it('монеты даются за ежедневный прогресс, но не за возвращение после паузы', () => {
    const world = buildWorld([raw], [], '2026-11-18')
    // камень — за пройденный перевал «Baseline» (день 2) и ещё один — за трофей «Возвращение»
    expect(world.wallet).toMatchObject({ coinsEarned: 110, coins: 110, gemsEarned: 2, gems: 2 })
    expect(world.gemLog).toEqual([
      { label: 'Перевал: Baseline', gems: 1, date: '2026-11-12' },
      { label: 'Трофей: Возвращение', gems: 1, date: '2026-11-11' },
    ])
    expect(world.events.find((e) => e.label.startsWith('Возвращение'))!.coins).toBe(0)
  })

  it('камни считаются от доли баллов', () => {
    expect([20, 18, 17, 14, 13, 10, 9, 0].map((score) => gemsForScore(score, 20))).toEqual([3, 3, 2, 2, 1, 1, 0, 0])
  })

  it('тест закрыт, пока не пройдены все дни недели', () => {
    const week = buildWorld([raw], [], '2026-11-18').active.weeks[0]
    expect(week.test).toMatchObject({ state: 'locked', daysLeft: 2, gems: 0 })
    expect(week.test.checks).toHaveLength(10)
  })

  it('тест открывается, когда неделя пройдена, и даёт камни после сдачи', () => {
    expect(buildWorld([weekOneDone()], [], '2026-11-20').active.weeks[0].test.state).toBe('open')
    const world = buildWorld(
      [weekOneDone((p) => (p.weeklyTests = [{ week: 1, date: '2026-11-20', score: 16, max: 20 }]))],
      [],
      '2026-11-20',
    )
    expect(world.active.weeks[0].test).toMatchObject({ state: 'done', gems: 2 })
    // два камня за тест, один за перевал и один за трофей «Возвращение»
    expect(world.wallet.gems).toBe(4)
  })

  it('при пересдаче считается лучшая попытка', () => {
    const world = buildWorld(
      [
        weekOneDone((p) => {
          p.weeklyTests = [
            { week: 1, date: '2026-11-20', score: 9, max: 20 },
            { week: 1, date: '2026-11-24', score: 19, max: 20 },
          ]
        }),
      ],
      [],
      '2026-11-24',
    )
    expect(world.active.weeks[0].test.attempts).toHaveLength(2)
    // три за лучшую попытку, один за перевал и один за трофей «Возвращение»
    expect(world.wallet.gemsEarned).toBe(5)
  })

  it('покупка списывает цену один раз, неизвестные предметы не считаются', () => {
    const bought = (item: string) => ({ item, date: '2026-11-18' })
    const world = buildWorld([raw], [], '2026-11-18', {
      purchases: [bought('scarf'), bought('scarf'), bought('нет-такого')],
      repairs: [],
    })
    expect(world.owned).toEqual(['scarf'])
    expect(world.wallet).toMatchObject({ coinsSpent: 60, coins: 50 })
    expect(canAfford(shopItem('pot')!, world.wallet)).toBe(false)
    expect(canAfford(shopItem('cape')!, world.wallet)).toBe(false)
  })

  it('дуэль с собой засчитывается, только если вышло быстрее первой попытки', () => {
    const duel = (minutes: number) =>
      withProgress((p) => {
        p.leetcode
          .find((x) => x.id === 1512)!
          .attempts.push({ date: '2026-12-01', kind: 'duel', minutes, result: 'solved', selfSolved: true })
      })
    const won = (cycle: RawCycle) => buildWorld([cycle], [], '2026-12-01').events.filter((e) => e.label.includes('дуэль'))
    expect(won(duel(9))).toMatchObject([{ xp: 15, coins: 15, label: 'Задача 1512: дуэль с собой, 9 мин против 14' }])
    expect(won(duel(14))).toEqual([])
  })

  it('у каждого предмета лавки одна цена: монеты либо камни', () => {
    for (const item of SHOP) expect(!!item.coins !== !!item.gems, item.id).toBe(true)
    expect(new Set(SHOP.map((item) => item.id)).size).toBe(SHOP.length)
  })
})

describe('стороннее развитие', () => {
  const video = (date: string, takeaways: string[] = ['первый вывод', 'второй вывод']) =>
    ({ date, kind: 'video' as const, title: 'Доклад про Compose', source: 'YouTube', track: 'B', takeaways })

  it('видео засчитывается только с записанными выводами', () => {
    const world = buildWorld([raw], [video('2026-11-19'), video('2026-11-20', ['один вывод'])], '2026-11-20')
    expect(world.side.map((s) => [s.counted, s.xp, s.why])).toEqual([
      [true, 10, null],
      [false, 0, 'нужно выводов: 2, записано 1'],
    ])
    expect(world.totalXp).toBe(140)
    expect(world.tracks.find((t) => t.track.code === 'B')!.xp).toBe(60)
  })

  it('десять роликов за день — одно занятие', () => {
    const world = buildWorld([raw], [video('2026-11-19'), video('2026-11-19'), video('2026-11-19')], '2026-11-19')
    expect(world.side.filter((s) => s.counted)).toHaveLength(1)
    expect(world.side[1].why).toBe('за этот день такая запись уже засчитана')
  })

  it('засчитанная запись считается днём занятий, незасчитанная — нет', () => {
    const empty = { date: '2026-12-04', kind: 'meetup' as const, title: 'Посидели с коллегами' }
    expect(buildWorld([raw], [empty], '2026-12-07').condition.level).toBe(3)
    const useful = { ...empty, takeaways: ['как у них устроен релизный цикл', 'что спрашивают на System Design'] }
    const world = buildWorld([raw], [useful], '2026-12-07')
    expect(world.condition.level).toBe(0)
    expect(world.totalXp).toBe(145)
  })

  it('тестовое собеседование даёт камень, но не чаще раза в неделю', () => {
    const mock = (date: string) => ({
      date,
      kind: 'mock-interview' as const,
      title: 'Тестовое собеседование',
      with: 'коллега',
      takeaways: ['плаваю в сложности алгоритмов', 'хорошо объяснил слои', 'забыл про обработку ошибок'],
    })
    const world = buildWorld([raw], [mock('2026-11-20'), mock('2026-11-23'), mock('2026-11-27')], '2026-11-27')
    expect(world.side.map((s) => [s.xp, s.gems])).toEqual([[40, 1], [40, 0], [40, 1]])
    // один камень за перевал, один за трофей «Возвращение» и два за собеседования
    expect(world.wallet.gemsEarned).toBe(4)
  })
})

describe('ранги навыков', () => {
  const rankOf = (world: ReturnType<typeof buildWorld>, code: string) => world.tracks.find((t) => t.track.code === code)!.rank

  it('пара занятий ранга не даёт: на 18.11 у всех треков ранг I и открытый зачёт', () => {
    const world = buildWorld([raw], [], '2026-11-18')
    for (const t of world.tracks) expect(t.rank).toMatchObject({ n: 1, title: null, next: { name: 'База', done: false } })
    expect(rankOf(world, 'A').next!.items.map((i) => [i.label, i.have, i.need, i.done])).toEqual([
      ['Задач решено', 1, 11, false],
      ['Повторено с пустого редактора', 0, 9, false],
      ['Решено без подсказок через 2–3 недели', 0, 3, false],
      ['Задача 349 решена на таймере без разбора', 0, 1, false],
      ['Файлов сохранено в репозитории', 0, 3, false],
      ['Вопросы трека в недельных тестах: от 70% баллов', 0, 70, false],
    ])
  })

  /** Трек C2 сдан целиком: три занятия, зелёный CI, два файла, вопросы тестов. */
  const ciDone = (points: number, questions = 4) =>
    withProgress((p) => {
      for (const day of [7, 17, 27]) {
        p.days.push({
          day,
          status: 'core',
          dates: ['2026-12-0' + (day % 9 || 9)],
          artifacts:
            day === 7
              ? [
                  { repo: 'pet-project', path: '.github/workflows/android.yml', state: 'committed' },
                  { repo: 'prep-basic', path: 'build/ci-notes.md', state: 'saved' },
                ]
              : [],
        })
      }
      p.petProject!.ci!.buildWorkflow = 'green'
      p.weeklyTests = [
        {
          week: 2,
          date: '2026-12-08',
          score: points * questions,
          max: 20,
          questions: Array.from({ length: questions }, (_, i) => ({ q: 'вопрос ' + i, points, track: 'C2' })),
        },
      ]
    })

  it('ранг II даётся, когда выполнены все условия трека', () => {
    const world = buildWorld([ciDone(2)], [], '2026-12-09')
    expect(rankOf(world, 'C2')).toEqual({ n: 2, title: 'База', next: null })
    // соседний трек от этого не вырос
    expect(rankOf(world, 'C1').n).toBe(1)
  })

  it('без знаний ранга нет: слабые ответы или мало вопросов в тестах его не дают', () => {
    const weak = rankOf(buildWorld([ciDone(1)], [], '2026-12-09'), 'C2')
    expect(weak.n).toBe(1)
    expect(weak.next!.items.filter((i) => !i.done).map((i) => i.detail)).toEqual(['4 из 8 баллов'])
    const few = rankOf(buildWorld([ciDone(2, 2)], [], '2026-12-09'), 'C2')
    expect(few.next!.items.filter((i) => !i.done).map((i) => i.detail)).toEqual(['вопросов пока 2 из 4'])
  })
})

describe('город в общем расчёте', () => {
  it('без действий город — стоянка, а особые постройки считаются из файлов', () => {
    const world = buildWorld([raw], [], '2026-11-18')
    expect(world.town).toMatchObject({ tier: 0, population: 0 })
    expect(world.means).toEqual({ coins: 110, gems: 2, specials: 2 })
  })

  it('траты на город списываются из общего кошелька, ходы идут по дням занятий', () => {
    const town = [
      { at: '2026-11-18T18:00:00', do: 'tier' as const },
      { at: '2026-11-18T18:10:00', do: 'build' as const, type: 'house' },
    ]
    const world = buildWorld([raw], [], '2026-11-18', { purchases: [], repairs: [], town })
    expect(world.town).toMatchObject({ tier: 1, housing: 2, spent: { coins: 80, gems: 0 } })
    expect(world.wallet).toMatchObject({ coinsSpent: 80, coins: 30 })
    // занятия были 27.10, 11.11, 12.11, 17.11 и 18.11 — все до первой постройки, кроме хода в день стройки
    expect(world.town.turns).toBe(5)
  })
})

describe('починка', () => {
  const purchases = [
    { item: 'pot', date: '2026-11-18' },
    { item: 'signpost', date: '2026-11-18' },
    { item: 'bench', date: '2026-11-18' },
    { item: 'hat', date: '2026-11-18' },
  ]
  const session = (date: string) => ({ date, from: null, to: null, day: 3, topics: [] })
  /** Последнее занятие 18.11, затем перерыв и возвращение в указанные даты. */
  const backOn = (...dates: string[]) => withProgress((p) => p.sessions.push(...dates.map(session)))
  const broken = (cycle: RawCycle, today: string, repairs: { item: string; date: string }[] = []) =>
    buildWorld([cycle], [], today, { purchases, repairs }).damage

  it('ремонт стоит пятую часть цены, вещь за камни — 50 монет', () => {
    const cost = (id: string) => repairCost(shopItem(id)!)
    expect(['pot', 'signpost', 'bench', 'lamps'].map(cost)).toEqual([20, 20, 20, 60])
    expect(cost('flagpole')).toBe(50)
  })

  it('короткий перерыв ничего не ломает', () => {
    expect(broken(raw, '2026-11-18')).toEqual([])
    expect(broken(raw, '2026-11-23')).toEqual([])
  })

  it('без покупок ломаться нечему', () => {
    expect(buildWorld([raw], [], '2026-12-07').damage).toEqual([])
  })

  it('перерыв 4–7 рабочих дней ломает одну постройку, от 8 — две; экипировка цела', () => {
    const one = broken(raw, '2026-11-27')
    const two = broken(raw, '2026-12-07')
    expect(one).toHaveLength(1)
    expect(two).toHaveLength(2)
    // пока перерыв длится, уже сломанное не подменяется другим
    expect(two.map((d) => d.item)).toContain(one[0].item)
    expect(two.every((d) => d.item !== 'hat' && d.healsIn === null && d.since === '2026-11-18')).toBe(true)
  })

  it('после возвращения чинится само за три занятия', () => {
    expect(broken(backOn('2026-12-07'), '2026-12-07').map((d) => d.healsIn)).toEqual([2, 2])
    expect(broken(backOn('2026-12-07', '2026-12-08'), '2026-12-08').map((d) => d.healsIn)).toEqual([1, 1])
    expect(broken(backOn('2026-12-07', '2026-12-08', '2026-12-09'), '2026-12-09')).toEqual([])
  })

  it('ремонт за монеты чинит сразу и списывается один раз', () => {
    const cycle = backOn('2026-12-07')
    const [first, second] = broken(cycle, '2026-12-07')
    const repairs = [
      { item: first.item, date: '2026-12-07' },
      { item: first.item, date: '2026-12-07' },
    ]
    expect(broken(cycle, '2026-12-07', repairs).map((d) => d.item)).toEqual([second.item])
    const spent = (r: typeof repairs) => buildWorld([cycle], [], '2026-12-07', { purchases, repairs: r }).wallet.coinsSpent
    expect(spent(repairs) - spent([])).toBe(first.cost)
  })

  it('старый ремонт не защищает от нового перерыва', () => {
    const repairs = [{ item: 'pot', date: '2026-11-10' }]
    expect(broken(raw, '2026-12-07', repairs)).toHaveLength(2)
  })
})

describe('сторожевая башня', () => {
  const purchases = [
    { item: 'pot', date: '2026-11-18' },
    { item: 'signpost', date: '2026-11-18' },
    { item: 'bench', date: '2026-11-18' },
  ]
  const tower = [{ at: '2026-11-18T10:00:00', do: 'build' as const, type: 'tower' }]

  it('под её присмотром долгий перерыв ломает одно украшение, а не два', () => {
    const open = buildWorld([raw], [], '2026-12-07', { purchases, repairs: [] })
    const guarded = buildWorld([raw], [], '2026-12-07', { purchases, repairs: [], town: tower })
    expect(open.damage).toHaveLength(2)
    expect(guarded.damage).toHaveLength(1)
    expect(open.damage.map((d) => d.item)).toContain(guarded.damage[0].item)
  })
})

describe('плановый перерыв', () => {
  const purchases = [
    { item: 'pot', date: '2026-11-18' },
    { item: 'signpost', date: '2026-11-18' },
  ]
  /** Последнее занятие 18.11 (среда); перерыв объявлен с 19.11. */
  const withBreak = (to: string) => withProgress((p) => (p.breaks = [{ from: '2026-11-19', to, reason: 'отпуск' }]))

  it('считаются только рабочие дни, и не больше лимита на цикл', () => {
    expect(pausedDays([{ from: '2026-11-19', to: '2026-11-25' }]).size).toBe(5)
    expect(pausedDays([{ from: '2026-11-21', to: '2026-11-22' }]).size).toBe(0)
    const long = pausedDays([{ from: '2026-11-19', to: '2026-12-31' }])
    expect(long.size).toBe(BREAK_LIMIT)
    // десять рабочих дней с 19.11 кончаются 2.12; 3.12 уже обычный пропуск
    expect(long.has('2026-12-02')).toBe(true)
    expect(long.has('2026-12-03')).toBe(false)
  })

  it('дни объявленного перерыва не считаются пропуском: мир не зарастает и ничего не ломается', () => {
    const plain = buildWorld([raw], [], '2026-11-27', { purchases, repairs: [] })
    const rested = buildWorld([withBreak('2026-11-27')], [], '2026-11-27', { purchases, repairs: [] })
    expect(plain.condition.level).toBeGreaterThanOrEqual(2)
    expect(plain.damage.length).toBeGreaterThan(0)
    expect(rested.missedWorkdays).toBe(0)
    expect(rested.condition.level).toBe(0)
    expect(rested.damage).toEqual([])
    expect(rested.breaks).toEqual({ used: 7, limit: BREAK_LIMIT, until: '2026-11-27' })
  })

  it('после конца перерыва пропуски снова считаются, а сверх лимита перерыв не прикрывает', () => {
    const back = buildWorld([withBreak('2026-11-20')], [], '2026-11-26', { purchases, repairs: [] })
    // прикрыты 19 и 20 ноября; 23, 24, 25 — обычные пропуски
    expect(back.missedWorkdays).toBe(3)
    expect(back.breaks.until).toBeNull()
    const tooLong = buildWorld([withBreak('2026-12-31')], [], '2026-12-10', { purchases, repairs: [] })
    expect(tooLong.missedWorkdays).toBe(missedWorkdays('2026-12-02', '2026-12-10'))
    expect(tooLong.breaks.until).toBeNull()
  })
})

describe('запас дров', () => {
  // Лагерь и дровник поставлены 18.11: запас — один рабочий день.
  const town = [
    { at: '2026-11-18T10:00:00', do: 'tier' as const },
    { at: '2026-11-18T11:00:00', do: 'build' as const, type: 'woodshed' },
  ]
  const purchases = [
    { item: 'pot', date: '2026-11-18' },
    { item: 'signpost', date: '2026-11-18' },
    { item: 'bench', date: '2026-11-18' },
  ]
  const plain = (today: string) => buildWorld([raw], [], today, { purchases, repairs: [] })
  const stocked = (today: string) => buildWorld([raw], [], today, { purchases, repairs: [], town })

  it('дровник прикрывает столько рабочих дней пропуска, сколько в нём запаса', () => {
    const before = plain('2026-11-23')
    const after = stocked('2026-11-23')
    expect(after.town.firewood).toBe(1)
    expect(before.missedWorkdays).toBeGreaterThan(1)
    expect(after.missedWorkdays).toBe(before.missedWorkdays)
    expect(after.covered).toBe(1)
    expect(after.condition.level).toBe(conditionLevel(before.missedWorkdays - 1))
  })

  it('без пропуска запас не тратится, без дровника ничего не прикрыто', () => {
    expect(stocked('2026-11-18').covered).toBe(0)
    expect(plain('2026-11-23').covered).toBe(0)
  })

  it('поломки считаются по тому, что осталось после дров', () => {
    for (const today of ['2026-11-24', '2026-11-27', '2026-12-01', '2026-12-07']) {
      const before = plain(today)
      const after = stocked(today)
      expect(after.damage.length, today).toBe(BREAKS_BY_LEVEL[conditionLevel(before.missedWorkdays - 1)])
      expect(after.damage.length, today).toBeLessThanOrEqual(before.damage.length)
    }
  })
})

describe('живые данные: перерывы', () => {
  it('у плановых перерывов даты по порядку и в лимите', () => {
    for (const cycle of rawCycles) {
      const breaks = cycle.progress.breaks ?? []
      for (const item of breaks) expect(item.from <= item.to, `${item.from}–${item.to}`).toBe(true)
      const asked = breaks.reduce((sum, item) => sum + pausedDays([item], 999).size, 0)
      expect(asked, 'рабочих дней перерыва в цикле').toBeLessThanOrEqual(BREAK_LIMIT)
    }
  })
})

describe('живые данные', () => {
  // Ловит ошибки в progress.json до деплоя: сломанный формат, день не из плана, неизвестная задача.
  const world = buildWorld(rawCycles, offplan, toISO(new Date()))

  it('циклы читаются, очки сходятся с журналом событий', () => {
    expect(world.cycles.length).toBeGreaterThan(0)
    expect(world.totalXp).toBe(world.events.reduce((sum, e) => sum + e.xp, 0))
    expect(world.events.every((e) => e.xp > 0)).toBe(true)
  })

  it('каждый цикл либо пройден, либо стоит на дне и шаге из плана', () => {
    for (const cycle of world.cycles) {
      if (cycle.done) continue
      const { position } = cycle.raw.progress
      expect(cycle.current, `цикл ${cycle.id}: день ${position.currentDay} не найден в плане`).not.toBeNull()
      const stepsLeft = cycle.current!.day.plan.steps.some((s) => !cycle.current!.day.stepsDone.includes(s.n))
      if (stepsLeft) {
        expect(cycle.current!.step, `цикл ${cycle.id}: шаг ${position.currentStep} не найден в дне`).not.toBeNull()
      }
    }
  })

  it('дни из журнала есть в плане, статусы известны', () => {
    for (const cycle of world.cycles) {
      const planned = new Set(cycle.days.map((d) => d.n))
      for (const d of cycle.raw.progress.days) {
        expect(planned.has(d.day), `цикл ${cycle.id}: дня ${d.day} нет в плане`).toBe(true)
        expect(['minimum', 'core', 'extension', 'skipped', 'in_progress']).toContain(d.status)
      }
    }
  })

  it('недельные тесты относятся к неделям плана, баллы не больше максимума', () => {
    for (const cycle of world.cycles) {
      const weeks = new Set(cycle.weeks.map((w) => w.week.n))
      for (const t of cycle.raw.progress.weeklyTests ?? []) {
        expect(weeks.has(t.week), `цикл ${cycle.id}: недели ${t.week} нет в плане`).toBe(true)
        expect(t.score).toBeLessThanOrEqual(t.max)
      }
    }
  })

  it('записанные покупки есть в лавке и оплачены', () => {
    for (const p of repoPurchases) expect(shopItem(p.item), p.item).toBeDefined()
    for (const r of repoRepairs) expect(shopItem(r.item), r.item).toBeDefined()
    const ledger = { purchases: repoPurchases, repairs: repoRepairs }
    const wallet = buildWorld(rawCycles, offplan, toISO(new Date()), ledger).wallet
    expect(wallet.coins).toBeGreaterThanOrEqual(0)
    expect(wallet.gems).toBeGreaterThanOrEqual(0)
  })

  it('задачи из журнала названы статусом, который понимает сайт', () => {
    const known = ['solved-with-walkthrough', 'solved-self', 'repeated-from-empty', 'solved-no-hints', 'solved-before-plan']
    for (const cycle of world.cycles) {
      for (const p of cycle.raw.progress.leetcode) expect(known, `задача ${p.id}`).toContain(p.status)
    }
  })
})
