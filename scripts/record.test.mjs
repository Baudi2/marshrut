import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addDeckReviews, beatMistake } from './record-lib.mjs'
import { RecordError, addBreak, addCheck, addMistake, addOffplan, addPurchase, addSession, addTownActions, closeDay, editTodo, markSteps, mergeLedger } from './record-lib.mjs'

const plan = {
  tracks: [{ code: 'A' }, { code: 'C1' }],
  leetcode: [{ id: 1 }],
  days: [
    { day: 1, steps: [{ n: 1 }, { n: 2 }] },
    { day: 2, steps: [{ n: 1 }, { n: 2 }, { n: 3 }] },
    { day: 3, steps: [{ n: 1 }] },
  ],
}
const fresh = () => ({
  meta: { updatedAt: '2026-11-18' },
  position: { currentDay: 2, currentStep: 1, currentStepTitle: 'старое название', daysDone: 1, daysTotal: 3, startedAt: '2026-11-01', pauses: [] },
  days: [{ day: 1, status: 'core', dates: ['2026-11-17'], stepsDone: [1, 2] }],
  sessions: [{ date: '2026-11-17', from: '16:00', to: '17:00', day: 1, topics: ['тема'] }],
  leetcode: [],
  mistakes: [],
  knowledgeChecks: [],
  openItems: ['дочитать статью'],
  observations: [],
})

describe('запись занятия', () => {
  it('занятие добавляет строку, заводит день и двигает дату правки', () => {
    const p = fresh()
    expect(addSession(plan, p, { date: '2026-11-19', from: '16:00', to: '17:10', topics: ['Gradle: команды'] })).toMatch(/день 2/)
    expect(p.sessions.at(-1)).toEqual({ date: '2026-11-19', from: '16:00', to: '17:10', day: 2, topics: ['Gradle: команды'] })
    expect(p.days.find((d) => d.day === 2)).toMatchObject({ status: 'in_progress', dates: ['2026-11-19'], stepsDone: [] })
    expect(p.meta.updatedAt).toBe('2026-11-19')
  })

  it('время может быть не названо; дата правки назад не уходит', () => {
    const p = fresh()
    addSession(plan, p, { date: '2026-11-10', day: 1, topics: ['повтор'] })
    expect(p.sessions[0]).toMatchObject({ date: '2026-11-10', from: null, to: null })
    expect(p.days[0].dates).toEqual(['2026-11-10', '2026-11-17'])
    expect(p.meta.updatedAt).toBe('2026-11-18')
  })

  it('не принимает повтор, плохую дату, день не из плана и занятие без тем', () => {
    const bad = (input) => expect(() => addSession(plan, fresh(), input)).toThrow(RecordError)
    bad({ date: '2026-11-17', from: '16:00', topics: ['тема'] })
    bad({ date: '19.11.2026', topics: ['тема'] })
    bad({ date: '2026-11-19', day: 9, topics: ['тема'] })
    bad({ date: '2026-11-19', topics: [] })
    bad({ date: '2026-11-19', from: '17:00', to: '16:00', topics: ['тема'] })
  })

  it('шаги: отмечает сделанные, снимает их из открытых и ставит позицию на следующий', () => {
    const p = fresh()
    p.days.push({ day: 2, status: 'in_progress', dates: [], stepsDone: [], stepsOpen: [{ n: 1, what: 'а' }, { n: 2, what: 'б' }] })
    expect(markSteps(plan, p, { done: [1], date: '2026-11-19' })).toMatch(/Дальше шаг 2/)
    expect(p.days[1]).toMatchObject({ stepsDone: [1], stepsOpen: [{ n: 2, what: 'б' }], dates: ['2026-11-19'] })
    expect(p.position).toMatchObject({ currentDay: 2, currentStep: 2 })
    expect(p.position.currentStepTitle).toBeUndefined()
    expect(markSteps(plan, p, { done: [3, 2] })).toMatch(/все шаги/)
    expect(p.days[1].stepsDone).toEqual([1, 2, 3])
    expect(() => markSteps(plan, p, { done: [7] })).toThrow(/нет шага 7/)
  })

  it('закрытие дня считает закрытые дни и переводит позицию на следующий день', () => {
    const p = fresh()
    expect(closeDay(plan, p, { status: 'core', date: '2026-11-19' })).toMatch(/Закрыто дней: 2 из 3/)
    expect(p.days.find((d) => d.day === 2)).toMatchObject({ status: 'core', dates: ['2026-11-19'] })
    expect(p.position).toMatchObject({ currentDay: 3, currentStep: 1, daysDone: 2 })
    // пропущенный день закрытым не считается; последний день позицию не двигает
    closeDay(plan, p, { status: 'skipped' })
    expect(p.position).toMatchObject({ currentDay: 3, daysDone: 2 })
    expect(() => closeDay(plan, fresh(), { status: 'done', date: '2026-11-19' })).toThrow(/статус/)
    expect(() => closeDay(plan, fresh(), { status: 'core' })).toThrow(/date/)
  })

  it('проверка понимания, ошибка и хвосты', () => {
    const p = fresh()
    addCheck(plan, p, { date: '2026-11-19', track: 'C1', question: 'Что делает wrapper?', firstAnswer: 'качает Gradle', verdict: 'partial', answer: 'фиксирует версию Gradle' })
    expect(p.knowledgeChecks).toHaveLength(1)
    expect(() => addCheck(plan, p, { date: '2026-11-19', track: 'Z', question: 'в', firstAnswer: 'о', verdict: 'correct', answer: 'о' })).toThrow(/трек/)
    expect(() => addCheck(plan, p, { date: '2026-11-19', track: 'A', question: 'в', firstAnswer: 'о', verdict: 'почти', answer: 'о' })).toThrow(/вердикт/)
    addMistake(plan, p, { date: '2026-11-19', track: 'A', problemId: 1, text: 'забыл проверить пустой массив' })
    expect(p.mistakes[0]).toMatchObject({ problemId: 1, track: 'A' })
    expect(() => addMistake(plan, p, { date: '2026-11-19', track: 'A', problemId: 99, text: 'т' })).toThrow(/задачи 99/)
    editTodo(p, { add: 'шаг 3 ждёт ноутбука' })
    expect(editTodo(p, { done: 1 })).toMatch(/дочитать статью/)
    expect(p.openItems).toEqual(['шаг 3 ждёт ноутбука'])
    expect(() => editTodo(p, { done: 5 })).toThrow(RecordError)
  })
})

describe('запись вне занятия', () => {
  it('плановый перерыв: даты по порядку, без пересечений', () => {
    const p = fresh()
    addBreak(p, { from: '2026-12-28', to: '2027-01-08', reason: 'отпуск' })
    expect(p.breaks).toEqual([{ from: '2026-12-28', to: '2027-01-08', reason: 'отпуск' }])
    expect(() => addBreak(p, { from: '2027-01-05', to: '2027-01-06' })).toThrow(/пересекается/)
    expect(() => addBreak(p, { from: '2027-02-05', to: '2027-02-01' })).toThrow(/раньше/)
  })

  it('покупка: только предмет из лавки и только один раз; ремонт можно повторять в другой день', () => {
    const ledger = { purchases: [], repairs: [] }
    addPurchase(ledger, ['pot', 'bench'], { item: 'pot', date: '2026-11-19' })
    expect(() => addPurchase(ledger, ['pot', 'bench'], { item: 'pot', date: '2026-11-20' })).toThrow(/уже куплен/)
    expect(() => addPurchase(ledger, ['pot', 'bench'], { item: 'castle', date: '2026-11-20' })).toThrow(/в лавке нет/)
    addPurchase(ledger, ['pot'], { item: 'pot', date: '2026-12-01', repair: true })
    addPurchase(ledger, ['pot'], { item: 'pot', date: '2026-12-20', repair: true })
    expect(ledger).toEqual({ purchases: [{ item: 'pot', date: '2026-11-19' }], repairs: [{ item: 'pot', date: '2026-12-01' }, { item: 'pot', date: '2026-12-20' }] })
  })

  it('запись из лавки целиком: покупки, награды, выкупы и знаки; повторы пропускаются, плохая запись не пишет ничего', () => {
    const file = { purchases: [{ item: 'pot', date: '2026-11-19' }], repairs: [] }
    const record = {
      purchases: [{ item: 'pot', date: '2026-11-19' }, { item: 'bench', date: '2026-11-20' }],
      repairs: [],
      rewards: [{ id: 'r1', name: 'Новая книга', gems: 5 }],
      redeemed: [{ at: '2026-11-20T18:00:00.000Z', name: 'Новая книга', gems: 5 }],
      signs: [{ cycle: '01-basic-month', day: 2, text: 'Первый перевал', date: '2026-11-20' }],
    }
    expect(mergeLedger(file, ['pot', 'bench'], record)).toMatch(/покупок 1, ремонтов 0, наград в список 1, выкупов 1, знаков 1/)
    expect(mergeLedger(file, ['pot', 'bench'], record)).toMatch(/покупок 0, ремонтов 0, наград в список 0, выкупов 0, знаков 0/)
    expect(file.purchases).toHaveLength(2)
    expect(file.signs).toEqual(record.signs)
    const bad = { purchases: [{ item: 'hat', date: '2026-11-21' }], signs: [{ cycle: '01-basic-month', day: 'два', text: 'т', date: '2026-11-21' }] }
    expect(() => mergeLedger(file, ['pot', 'bench', 'hat'], bad)).toThrow(/signs, запись 1/)
    expect(file.purchases).toHaveLength(2)
    expect(() => mergeLedger(file, ['pot'], [])).toThrow(RecordError)
  })

  it('журнал города: записи добавляются как есть, повторы пропускаются, порядок по времени', () => {
    const file = { actions: [{ at: '2026-11-20T18:05:00', do: 'tier' }] }
    const journal = [
      { at: '2026-11-20T18:20:00', do: 'build', type: 'house' },
      { at: '2026-11-20T18:05:00', do: 'tier' },
      { at: '2026-11-20T18:10:00', do: 'trade', type: 'wood' },
    ]
    expect(addTownActions(file, journal)).toBe('Действий добавлено: 2, уже были в журнале: 1.')
    expect(file.actions.map((a) => a.do)).toEqual(['tier', 'trade', 'build'])
    expect(() => addTownActions(file, [{ at: 'вчера', do: 'tier' }])).toThrow(/время ISO/)
    expect(() => addTownActions(file, [{ at: '2026-11-21T10:00:00', do: 'build' }])).toThrow(/type/)
    expect(() => addTownActions(file, [{ at: '2026-11-21T10:00:00', do: 'trade', type: 'gold' }])).toThrow(/обмена/)
  })

  it('стороннее развитие: без нужного числа выводов запись не принимается', () => {
    const file = { entries: [] }
    const video = { date: '2026-11-20', kind: 'video', title: 'Доклад про Gradle', source: 'YouTube', track: 'C1', minutes: 40 }
    expect(() => addOffplan(plan, file, { ...video, takeaways: ['одна мысль'] })).toThrow(/нужно выводов: 2/)
    addOffplan(plan, file, { ...video, takeaways: ['первая', 'вторая'] })
    expect(file.entries[0]).toEqual({ ...video, takeaways: ['первая', 'вторая'] })
    expect(() => addOffplan(plan, file, { date: '2026-11-20', kind: 'mock-interview', title: 'Собеседование', takeaways: ['1', '2'] })).toThrow(/нужно выводов: 3/)
    expect(() => addOffplan(plan, file, { date: '2026-11-20', kind: 'podcast', title: 'Подкаст' })).toThrow(/kind/)
  })
})

describe('колода и журнал ошибок', () => {
  it('ответы по карточкам добавляются как есть, повторы пропускаются', () => {
    const file = { reviews: [{ card: '2026-11-12-abc', at: '2026-11-19T10:00:00.000Z', ok: true }] }
    const record = [
      { card: '2026-11-12-abc', at: '2026-11-19T10:00:00.000Z', ok: true },
      { card: '2026-11-17-xyz', at: '2026-11-19T09:00:00.000Z', ok: false },
    ]
    expect(addDeckReviews(file, record)).toMatch(/добавлено: 1, уже были: 1/)
    expect(file.reviews.map((r) => r.card)).toEqual(['2026-11-17-xyz', '2026-11-12-abc'])
    expect(() => addDeckReviews(file, [{ card: 'x', at: 'вчера', ok: true }])).toThrow(/ответ 1/)
    expect(() => addDeckReviews(file, [{ card: 'x', at: '2026-11-19T10:00:00.000Z', ok: 'да' }])).toThrow(RecordError)
    expect(() => addDeckReviews(file, [])).toThrow(RecordError)
  })

  it('ошибка отмечается побеждённой по номеру и только один раз', () => {
    const p = fresh()
    p.mistakes = [
      { date: '2026-11-12', track: 'A', problemId: 1, text: 'забыл синтаксис цикла' },
      { date: '2026-11-17', track: 'C1', problemId: null, text: 'спутал кэши' },
    ]
    expect(beatMistake(p, { n: 2, date: '2026-11-20' })).toMatch(/спутал кэши/)
    expect(p.mistakes.map((m) => !!m.beaten)).toEqual([false, true])
    expect(p.meta.updatedAt).toBe('2026-11-20')
    expect(() => beatMistake(p, { n: 2 })).toThrow(/уже отмечена/)
    expect(() => beatMistake(p, { n: 3 })).toThrow(RecordError)
  })
})

describe('команда на живых данных', () => {
  it('занятие записывается в копию настоящего журнала и не ломает его формат', () => {
    const dir = `data/cycles/${fs.readdirSync('data/cycles').sort().at(-1)}`
    const realPlan = JSON.parse(fs.readFileSync(`${dir}/plan.json`, 'utf8'))
    const progress = JSON.parse(fs.readFileSync(`${dir}/progress.json`, 'utf8'))
    const before = progress.sessions.length
    addSession(realPlan, progress, { date: '2099-01-05', from: '10:00', to: '11:00', topics: ['проверка команды'] })
    expect(progress.sessions).toHaveLength(before + 1)
    expect(progress.days.find((d) => d.day === progress.position.currentDay).dates).toContain('2099-01-05')
  })
})
