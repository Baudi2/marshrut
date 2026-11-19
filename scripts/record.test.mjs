import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { addDeckReviews, beatMistake } from './record-lib.mjs'
import { RecordError, addBreak, addCheck, addMistake, addOffplan, addPurchase, addSession, addTownActions, closeDay, editTodo, markSteps, mergeLedger } from './record-lib.mjs'
import {
  addAttempts,
  addCard,
  addEvent,
  addObservation,
  addPause,
  addWeeklyTest,
  browserSections,
  closeWeek,
  describeDay,
  mergeDeck,
  setArtifact,
  setBaseline,
  setCi,
  statusFromAttempts,
  syncBrowser,
} from './record-lib.mjs'

const plan = {
  tracks: [{ code: 'A' }, { code: 'C1' }],
  weeks: [
    { n: 1, checkpoint: 'репозиторий и первый замер' },
    { n: 2, checkpoint: 'первый CI' },
  ],
  leetcode: [
    { id: 1, title: 'Two Sum', url: 'https://leetcode.com/problems/two-sum/', role: 'main' },
    { id: 217, title: 'Contains Duplicate', url: 'https://leetcode.com/problems/contains-duplicate/', role: 'main' },
  ],
  camp: [
    { id: 'solutions', repo: 'prep-basic', path: 'algo/*.kt', title: 'Решения задач' },
    { id: 'baseline', repo: 'prep-basic', path: 'notes/baseline.md', title: 'Замер' },
    { id: 'workflow', repo: 'pet-project', path: '.github/workflows/android.yml', title: 'Workflow сборки' },
    { id: 'readme-prep', repo: 'prep-basic', path: 'README.md', title: 'Описание' },
    { id: 'readme-pet', repo: 'pet-project', path: 'README.md', title: 'Описание' },
  ],
  days: [
    { day: 1, week: 1, steps: [{ n: 1 }, { n: 2 }] },
    { day: 2, week: 1, steps: [{ n: 1 }, { n: 2 }, { n: 3 }] },
    { day: 3, week: 2, steps: [{ n: 1 }] },
  ],
}
const noScores = () => ({ algorithms: null, systemDesign: null, gradle: null, cicd: null, aiTutorAndTests: null })
const fresh = () => ({
  meta: { updatedAt: '2026-11-18' },
  position: { currentDay: 2, currentStep: 1, currentStepTitle: 'старое название', daysDone: 1, daysTotal: 3, startedAt: '2026-11-01', pauses: [] },
  days: [{ day: 1, status: 'core', dates: ['2026-11-17'], stepsDone: [1, 2] }],
  sessions: [{ date: '2026-11-17', from: '16:00', to: '17:00', day: 1, topics: ['тема'] }],
  leetcode: [],
  baseline: {
    start: { day: 1, problemId: 1, minutes: null, result: null, selfAssessment: noScores() },
    final: { day: 3, problemId: 217, minutes: null, result: null, selfAssessment: noScores() },
  },
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

  it('занятие, записанное без времени конца, дописывается: та же дата и то же начало', () => {
    const p = fresh()
    addSession(plan, p, { date: '2026-11-19', from: '15:30', topics: ['app/build.gradle.kts'] })
    expect(p.sessions.at(-1).to).toBeNull()
    expect(addSession(plan, p, { date: '2026-11-19', from: '15:30', to: '16:40', topics: ['каталог версий', 'app/build.gradle.kts'] })).toBe('Занятие 2026-11-19 15:30–16:40 дописано: день 2, тем 2.')
    expect(p.sessions.at(-1)).toEqual({ date: '2026-11-19', from: '15:30', to: '16:40', day: 2, topics: ['app/build.gradle.kts', 'каталог версий'] })
    expect(p.sessions).toHaveLength(2)
    // конец уже записан — это повтор
    expect(() => addSession(plan, p, { date: '2026-11-19', from: '15:30', to: '17:00', topics: ['тема'] })).toThrow(/уже записано/)
    // без нового времени конца дописывать нечего; чужой день не подходит
    const open = fresh()
    addSession(plan, open, { date: '2026-11-19', from: '15:30', topics: ['тема'] })
    expect(() => addSession(plan, open, { date: '2026-11-19', from: '15:30', topics: ['тема'] })).toThrow(/уже записано/)
    expect(() => addSession(plan, open, { date: '2026-11-19', from: '15:30', to: '16:40', day: 1 })).toThrow(/записано в дне 2, а не 1/)
    expect(() => addSession(plan, open, { date: '2026-11-19', from: '15:30', to: '15:00' })).toThrow(/не позже начала/)
    expect(open.sessions.at(-1).to).toBeNull()
  })

  it('не принимает повтор, плохую дату, день не из плана и занятие без тем', () => {
    const bad = (input) => expect(() => addSession(plan, fresh(), input)).toThrow(RecordError)
    bad({ date: '2026-11-17', from: '16:00', topics: ['тема'] })
    bad({ date: '19.11.2026', topics: ['тема'] })
    // даты, которой нет в календаре, тоже не бывает
    bad({ date: '2026-02-30', topics: ['тема'] })
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

describe('итог дня и артефакты', () => {
  it('итог, заметка и минуты на деле пишутся в запись дня и не трогают статус', () => {
    const p = fresh()
    expect(describeDay(plan, p, { day: 1, summary: ' Старт: репозиторий ', note: 'шаг 2 в чате не подтверждён', minutes: 100, today: '2026-11-19' })).toBe(
      'День 1: итог записан; заметка записана; на деле 100 мин.',
    )
    expect(p.days[0]).toMatchObject({ status: 'core', summary: 'Старт: репозиторий', note: 'шаг 2 в чате не подтверждён', wallClockMinutes: 100 })
    expect(p.meta.updatedAt).toBe('2026-11-19')
    // новый итог заменяет старый, и старый виден в ответе команды
    expect(describeDay(plan, p, { day: 1, summary: 'Старт: репозиторий и pet-проект', minutes: 110 })).toMatch(/итог заменён \(было: «Старт: репозиторий»\); на деле 110 мин \(было 100\)/)
    // без номера дня — текущий день; записи о нём ещё нет, она заводится начатой
    describeDay(plan, p, { summary: 'Замер' })
    expect(p.days.find((d) => d.day === 2)).toMatchObject({ status: 'in_progress', summary: 'Замер' })
    expect(p.position.currentDay).toBe(2)
  })

  it('итог дня: проверки ввода и повторный запуск', () => {
    const p = fresh()
    describeDay(plan, p, { day: 1, summary: 'Старт' })
    const snapshot = structuredClone(p)
    expect(describeDay(plan, p, { day: 1, summary: 'Старт' })).toMatch(/итог — без изменений/)
    expect(p).toEqual(snapshot)
    expect(() => describeDay(plan, p, { day: 1 })).toThrow(/нужен итог дня/)
    expect(() => describeDay(plan, p, { day: 9, summary: 'т' })).toThrow(/нет дня 9/)
    expect(() => describeDay(plan, p, { day: 1, summary: '  ' })).toThrow(/summary/)
    expect(() => describeDay(plan, p, { day: 1, minutes: 12.5 })).toThrow(/minutes/)
    expect(() => describeDay(plan, p, { day: 1, minutes: 0 })).toThrow(/minutes/)
    expect(() => describeDay(plan, p, { day: 1, note: 'т', date: 'вчера' })).toThrow(/date/)
    expect(p).toEqual(snapshot)
  })

  it('артефакт пишется в текущий день; тот же путь меняет состояние, а не дублируется', () => {
    const p = fresh()
    expect(setArtifact(plan, p, { path: 'algo/217-contains-duplicate.kt', state: 'not-saved', today: '2026-11-19' })).toBe(
      'День 2: algo/217-contains-duplicate.kt (prep-basic) — not-saved. Домик лагеря: «Решения задач».',
    )
    expect(p.days.find((d) => d.day === 2).artifacts).toEqual([{ repo: 'prep-basic', path: 'algo/217-contains-duplicate.kt', state: 'not-saved' }])
    // файл сохранён позже, когда текущий день уже другой: меняется прежняя запись
    p.position.currentDay = 3
    expect(setArtifact(plan, p, { path: 'algo/217-contains-duplicate.kt', state: 'committed' })).toMatch(/^День 2: .* — not-saved → committed\./)
    expect(p.days.flatMap((d) => d.artifacts ?? [])).toEqual([{ repo: 'prep-basic', path: 'algo/217-contains-duplicate.kt', state: 'committed' }])
    expect(p.days.find((d) => d.day === 3)).toBeUndefined()
  })

  it('артефакт: повторный запуск и запись того же файла в другой день не проходят', () => {
    const p = fresh()
    setArtifact(plan, p, { path: 'notes/baseline.md', state: 'saved' })
    const snapshot = structuredClone(p)
    expect(() => setArtifact(plan, p, { path: 'notes/baseline.md', state: 'saved' })).toThrow(/уже записан в состоянии saved/)
    expect(() => setArtifact(plan, p, { path: 'notes/baseline.md', state: 'committed', day: 3 })).toThrow(/уже записан в дне 2: у файла одна запись/)
    expect(p).toEqual(snapshot)
    // записан в двух днях руками — без номера дня не выбрать
    p.days[0].artifacts = [{ repo: 'prep-basic', path: 'notes/baseline.md', state: 'unknown' }]
    expect(() => setArtifact(plan, p, { path: 'notes/baseline.md', state: 'committed' })).toThrow(/в нескольких днях \(1, 2\)/)
    setArtifact(plan, p, { path: 'notes/baseline.md', state: 'committed', day: 1 })
    expect(p.days[0].artifacts[0].state).toBe('committed')
  })

  it('репозиторий берётся из плана; путь не из лагеря — предупреждение, а не ошибка', () => {
    const p = fresh()
    expect(setArtifact(plan, p, { path: '.github/workflows/android.yml', state: 'committed' })).toMatch(/\(pet-project\) — committed\. Домик лагеря: «Workflow сборки»/)
    // один путь в двух репозиториях и путь не из лагеря: репозиторий нужно назвать
    expect(() => setArtifact(plan, p, { path: 'README.md', state: 'saved' })).toThrow(/назови --repo \(в плане есть prep-basic, pet-project\)/)
    expect(() => setArtifact(plan, p, { path: 'notes/idea.md', state: 'saved' })).toThrow(/--repo/)
    setArtifact(plan, p, { path: 'README.md', repo: 'pet-project', state: 'saved' })
    const warned = setArtifact(plan, p, { path: 'notes/idea.md', repo: 'prep-basic', state: 'saved' })
    expect(warned).toMatch(/Внимание: путь не подходит ни к одному домику плана/)
    expect(warned).toMatch(/Домики prep-basic: algo\/\*\.kt, notes\/baseline\.md, README\.md/)
    expect(setArtifact(plan, p, { path: 'notes.md', repo: 'other', state: 'saved' })).toMatch(/Репозитория «other» в лагере плана нет/)
    expect(p.days.find((d) => d.day === 2).artifacts).toHaveLength(4)
    // записанный путь помнит свой репозиторий
    expect(setArtifact(plan, p, { path: 'notes/idea.md', state: 'committed' })).toMatch(/saved → committed/)
  })

  it('артефакт: проверки ввода', () => {
    const bad = (input, pattern) => {
      const p = fresh()
      expect(() => setArtifact(plan, p, { path: 'notes/baseline.md', state: 'saved', ...input })).toThrow(pattern)
      expect(p).toEqual(fresh())
    }
    bad({ state: 'done' }, /состояние «done»: нужно одно из created, saved, committed, not-saved, given-by-tutor, unknown/)
    bad({ state: undefined }, /состояние/)
    bad({ path: ' ' }, /path/)
    bad({ day: 9 }, /нет дня 9/)
    bad({ date: '2026-13-01' }, /date/)
  })
})

const attempt = (over = {}) => ({ date: '2026-11-19', kind: 'timed-20', minutes: 14, result: 'solved', selfSolved: true, ...over })
/** Журнал, где задача 217 решена самим на таймере 19.11. */
const solvedSelf = () => {
  const p = fresh()
  addAttempts(plan, p, { id: 217, attempts: [attempt()] })
  return p
}

describe('задачи LeetCode', () => {
  it('первая решённая попытка заводит запись с названием и ссылкой из плана', () => {
    const p = fresh()
    expect(addAttempts(plan, p, { id: 217, attempts: [attempt({ approach: 'HashSet', notes: 'подсмотрел синтаксис' })] })).toBe(
      'Задача 217 «Contains Duplicate»: попыток добавлено 1 (2026-11-19 timed-20, 14 мин — решил сам). Статус: solved-self.',
    )
    expect(p.leetcode).toEqual([
      {
        id: 217,
        title: 'Contains Duplicate',
        url: 'https://leetcode.com/problems/contains-duplicate/',
        status: 'solved-self',
        attempts: [{ date: '2026-11-19', kind: 'timed-20', minutes: 14, result: 'solved', selfSolved: true, approach: 'HashSet', notes: 'подсмотрел синтаксис' }],
      },
    ])
    expect(p.meta.updatedAt).toBe('2026-11-19')
  })

  it('не решил на таймере и переписал после разбора — «с разбором»; попытки одного занятия идут списком по порядку', () => {
    const p = fresh()
    const out = addAttempts(plan, p, {
      id: 217,
      attempts: [
        { date: '2026-11-19', kind: 'timed-20', minutes: 20, result: 'not-solved' },
        { date: '2026-11-19', kind: 'optimal-10', result: 'not-solved', selfSolved: false },
        { date: '2026-11-19', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved' },
      ],
    })
    expect(out).toMatch(/попыток добавлено 3 .*не решил.*переписал после разбора\)\. Статус: solved-with-walkthrough\./)
    expect(p.leetcode[0].status).toBe('solved-with-walkthrough')
    expect(p.leetcode[0].attempts.map((a) => [a.kind, a.minutes, a.selfSolved])).toEqual([
      ['timed-20', 20, false],
      ['optimal-10', null, false],
      ['rewrite-after-walkthrough', 8, false],
    ])
  })

  it('решил на таймере с подсказкой — тоже «с разбором»', () => {
    const p = fresh()
    addAttempts(plan, p, { id: 217, attempts: [attempt({ selfSolved: false })] })
    expect(p.leetcode[0].status).toBe('solved-with-walkthrough')
  })

  it('одна нерешённая попытка у новой задачи не записывается: статуса «пробовал» у сайта нет', () => {
    const p = fresh()
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ result: 'not-solved', selfSolved: false })] })).toThrow(/пробовал, не решил/)
    expect(p).toEqual(fresh())
  })

  it('статус растёт: сама → повтор с пустого редактора → без подсказок — и не понижается', () => {
    const p = solvedSelf()
    expect(addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-24', kind: 'from-empty-editor', minutes: 9 })] })).toMatch(/Статус: repeated-from-empty, был solved-self\./)
    // неудачный повтор и поздний разбор статус не трогают
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-26', kind: 'from-empty-editor', minutes: null, result: 'not-solved', selfSolved: false })] })
    addAttempts(plan, p, { id: 217, attempts: [{ date: '2026-11-27', kind: 'rewrite-after-walkthrough', result: 'solved' }] })
    expect(p.leetcode[0].status).toBe('repeated-from-empty')
    const early = addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-28', kind: 'no-hints', minutes: null })] })
    expect(early).toMatch(/Статус: solved-no-hints, был repeated-from-empty\./)
    expect(early).toMatch(/Внимание: после решения \(2026-11-19\) прошло меньше 14 дней/)
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-12-10', kind: 'from-empty-editor', minutes: 7 })] })
    expect(p.leetcode[0].status).toBe('solved-no-hints')
    expect(p.leetcode[0].attempts).toHaveLength(6)
    // через две недели предупреждения нет
    const late = solvedSelf()
    expect(addAttempts(plan, late, { id: 217, attempts: [attempt({ date: '2026-12-03', kind: 'no-hints', minutes: 11 })] })).not.toMatch(/Внимание/)
  })

  it('разбор в день своего решения: статус остаётся, а команда предупреждает, что очков станет меньше', () => {
    const p = solvedSelf()
    const out = addAttempts(plan, p, { id: 217, attempts: [{ date: '2026-11-19', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved' }] })
    expect(p.leetcode[0].status).toBe('solved-self')
    expect(out).toMatch(/Внимание: разбор записан тем же днём/)
  })

  it('разбор в другой день после своего решения очков не снижает — предупреждения нет', () => {
    const p = solvedSelf()
    const out = addAttempts(plan, p, { id: 217, attempts: [{ date: '2026-11-20', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved' }] })
    expect(p.leetcode[0].status).toBe('solved-self')
    expect(out).not.toMatch(/Внимание/)
  })

  it('после разбора решение на таймере не делает задачу «решённой самой»; записанный руками статус не понижается и не завышается', () => {
    const p = fresh()
    // как в настоящем журнале: перебором решил сам, оптимальное решение — после разбора
    p.leetcode = [
      {
        id: 217,
        title: 'Contains Duplicate',
        status: 'solved-with-walkthrough',
        attempts: [attempt({ date: '2026-11-12' }), { date: '2026-11-12', kind: 'optimal-10', minutes: 10, result: 'not-solved', selfSolved: false }, { date: '2026-11-12', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved', selfSolved: false }],
        nextRepeat: { day: 5, kind: 'from-empty-editor' },
      },
    ]
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-20', minutes: 6 })] })
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-21', kind: 'from-empty-editor', minutes: null, result: 'not-solved', selfSolved: false })] })
    expect(p.leetcode[0]).toMatchObject({ status: 'solved-with-walkthrough', nextRepeat: { day: 5, kind: 'from-empty-editor' } })
    // запланированный повтор сделан: статус растёт, напоминание снимается
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-23', kind: 'from-empty-editor', minutes: 9 })] })
    expect(p.leetcode[0].status).toBe('repeated-from-empty')
    expect(p.leetcode[0].nextRepeat).toBeUndefined()
    expect(statusFromAttempts(p.leetcode[0].attempts)).toBe('repeated-from-empty')
  })

  it('задача, решённая до плана, получает статус по первой же попытке', () => {
    const p = fresh()
    p.leetcode = [{ id: 1, title: 'Two Sum', status: 'solved-before-plan', attempts: [] }]
    expect(addAttempts(plan, p, { id: 1, attempts: [attempt({ kind: 'from-empty-editor', minutes: 12 })] })).toMatch(/repeated-from-empty, был solved-before-plan/)
    expect(p.leetcode).toHaveLength(1)
  })

  it('повтор и «без подсказок» считаются только после решения, в другой день и без подсказок', () => {
    const snapshot = solvedSelf()
    const bad = (over, pattern) => {
      const p = solvedSelf()
      expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt(over)] })).toThrow(pattern)
      expect(p).toEqual(snapshot)
    }
    bad({ kind: 'from-empty-editor' }, /повтор считается в другой день, после решения \(2026-11-19\)/)
    bad({ kind: 'no-hints', date: '2026-11-18' }, /в другой день/)
    bad({ kind: 'from-empty-editor', date: '2026-11-24', selfSolved: false }, /from-empty-editor засчитывается только без подсказок/)
    bad({ kind: 'no-hints', date: '2026-12-10', selfSolved: false }, /no-hints засчитывается только без подсказок/)
    // у новой задачи повторять нечего
    const p = fresh()
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'from-empty-editor' })] })).toThrow(/ещё не решена — повторять нечего/)
    expect(p).toEqual(fresh())
  })

  it('дуэль с собой: нужна первая попытка на таймере с минутами и другой день; итог говорит, засчитает ли её сайт', () => {
    const p = solvedSelf()
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'duel', minutes: 9 })] })).toThrow(/нужна дата позже первой попытки на таймере \(2026-11-19\)/)
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'duel', date: '2026-11-30', minutes: null })] })).toThrow(/нужны минуты/)
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'duel', date: '2026-11-30', minutes: 9, selfSolved: false })] })).toThrow(/duel засчитывается только без подсказок/)
    expect(addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'duel', date: '2026-11-30', minutes: 9 })] })).toMatch(/Дуэль с собой: 9 мин против 14 — быстрее, сайт её засчитает/)
    expect(addAttempts(plan, p, { id: 217, attempts: [attempt({ kind: 'duel', date: '2026-12-02', minutes: 14 })] })).toMatch(/не быстрее первой попытки, сайт её не засчитает/)
    expect(p.leetcode[0].status).toBe('solved-self')
    // первой попытки на таймере нет или у неё нет минут — сравнивать не с чем
    const before = fresh()
    before.leetcode = [{ id: 1, title: 'Two Sum', status: 'solved-before-plan', attempts: [] }]
    expect(() => addAttempts(plan, before, { id: 1, attempts: [attempt({ kind: 'duel' })] })).toThrow(/её в журнале нет/)
    before.leetcode[0].attempts = [{ date: '2026-11-01', kind: 'timed-20', minutes: null, result: 'not-solved', selfSolved: false }]
    expect(() => addAttempts(plan, before, { id: 1, attempts: [attempt({ kind: 'duel' })] })).toThrow(/не записаны минуты/)
  })

  it('попытка: проверки ввода', () => {
    const bad = (over, pattern, id = 217) => {
      const p = fresh()
      expect(() => addAttempts(plan, p, { id, attempts: [attempt(over)] })).toThrow(pattern)
      expect(p).toEqual(fresh())
    }
    bad({}, /в плане нет задачи 99/, 99)
    bad({}, /в плане нет задачи/, null)
    bad({ date: '19.11.2026' }, /попытка: date/)
    bad({ date: undefined }, /date/)
    bad({ kind: 'timed' }, /kind «timed»: нужен один из timed-<минут>, optimal-<минут>, rewrite-after-walkthrough, from-empty-editor, no-hints, duel/)
    bad({ kind: 'timed-0' }, /kind/)
    bad({ kind: 'быстро' }, /kind/)
    bad({ result: 'done' }, /result «done»: нужен solved или not-solved/)
    bad({ minutes: 0 }, /minutes/)
    bad({ minutes: 'быстро' }, /minutes/)
    bad({ minutes: null }, /нужны минуты/)
    bad({ selfSolved: undefined }, /скажи явно, сам решил или с подсказкой/)
    bad({ selfSolved: 'yes' }, /скажи явно/)
    bad({ result: 'not-solved' }, /не решена — значит, и не сама/)
    bad({ kind: 'rewrite-after-walkthrough' }, /после разбора — это не «сам»/)
    bad({ approach: '  ' }, /approach/)
    bad({ notes: 7 }, /notes/)
    expect(() => addAttempts(plan, fresh(), { id: 217, attempts: [attempt(), 'ещё одна'] })).toThrow(/попытка 2: нужен объект/)
    expect(() => addAttempts(plan, fresh(), { id: 217, attempts: 'timed-20' })).toThrow(/нужен список/)
    expect(() => addAttempts(plan, fresh(), { id: 217, attempts: [] })).toThrow(/нужна попытка/)
    expect(() => addAttempts(plan, fresh(), { id: 217, note: 'заметка' })).toThrow(/ещё нет записи/)
  })

  it('повторный запуск ничего не портит', () => {
    const p = solvedSelf()
    const snapshot = structuredClone(p)
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt()] })).toThrow(/попытка: уже записана \(2026-11-19, timed-20\)/)
    // та же попытка дважды в одном списке
    expect(() => addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-25' }), attempt({ date: '2026-11-25' })] })).toThrow(/попытка 2: уже записана/)
    expect(p).toEqual(snapshot)
  })

  it('попытки встают по датам; заметка к задаче; минуты сверх таймера — предупреждение', () => {
    const p = fresh()
    const out = addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-11-21', minutes: 25 })], note: ' решал без HashSet ' })
    expect(out).toMatch(/Внимание: 25 мин при таймере на 20 — в таймер не уложился/)
    expect(p.leetcode[0]).toMatchObject({ status: 'solved-self', notes: 'решал без HashSet' })
    // попытку прошлого занятия дописали позже: она встаёт на своё место
    addAttempts(plan, p, { id: 217, attempts: [{ date: '2026-11-20', kind: 'optimal-10', minutes: 10, result: 'not-solved' }] })
    expect(p.leetcode[0].attempts.map((a) => a.date)).toEqual(['2026-11-20', '2026-11-21'])
    expect(p.meta.updatedAt).toBe('2026-11-21')
    expect(addAttempts(plan, p, { id: 217, note: 'новая заметка', today: '2026-11-22' })).toBe('Задача 217 «Contains Duplicate»: заметка записана. Статус: solved-self.')
    expect(p.leetcode[0].notes).toBe('новая заметка')
    expect(p.leetcode[0].attempts).toHaveLength(2)
    expect(() => addAttempts(plan, p, { id: 217, note: ' ' })).toThrow(/problem-note/)
  })
})

/** Десять вопросов: шесть по треку A и четыре по C1, баллы 0, 1, 2 по кругу — всего 9 из 20. */
const questions = (over = {}) =>
  Array.from({ length: 10 }, (_, i) => ({ q: `Вопрос ${i + 1}`, track: i < 6 ? 'A' : 'C1', points: i % 3, ...(i === 0 ? { note: 'упустил wrapper' } : {}), ...over }))
/** Журнал, где закрыты оба дня первой недели. */
const weekDone = () => {
  const p = fresh()
  p.days.push({ day: 2, status: 'minimum', dates: ['2026-11-19'], stepsDone: [] })
  return p
}

describe('недельный тест и чекпоинт недели', () => {
  it('тест записывается, баллы считает команда; пересдача — новая запись с той же неделей', () => {
    const p = weekDone()
    expect(addWeeklyTest(plan, p, { week: 1, date: '2026-11-20', record: questions(), note: 'сдавал с телефона' })).toBe('Тест недели 1 записан: 9 из 20. По трекам: A 6 из 12, C1 3 из 8.')
    expect(p.weeklyTests).toHaveLength(1)
    expect(p.weeklyTests[0]).toMatchObject({ week: 1, date: '2026-11-20', score: 9, max: 20, note: 'сдавал с телефона' })
    expect(p.weeklyTests[0].questions.slice(0, 2)).toEqual([
      { q: 'Вопрос 1', track: 'A', points: 0, note: 'упустил wrapper' },
      { q: 'Вопрос 2', track: 'A', points: 1 },
    ])
    expect(p.meta.updatedAt).toBe('2026-11-20')
    // запись в том виде, в каком её выдаёт задание теста: неделя, дата и баллы внутри
    const retake = { week: 1, date: '2026-11-21', score: 20, max: 20, questions: questions({ points: 2 }) }
    expect(addWeeklyTest(plan, p, { record: retake })).toMatch(/20 из 20\. .*Попыток по этой неделе: 2, лучшая — 20 из 20; сайт берёт лучшую\./)
    expect(p.weeklyTests.map((t) => [t.week, t.date, t.score])).toEqual([
      [1, '2026-11-20', 9],
      [1, '2026-11-21', 20],
    ])
    // повторный запуск той же записи ничего не добавляет
    const snapshot = structuredClone(p)
    expect(() => addWeeklyTest(plan, p, { record: retake })).toThrow(/этот тест недели 1 за 2026-11-21 уже записан/)
    expect(p).toEqual(snapshot)
  })

  it('тест: проверки ввода', () => {
    const bad = (input, pattern, p = weekDone()) => {
      const snapshot = structuredClone(p)
      expect(() => addWeeklyTest(plan, p, { week: 1, date: '2026-11-20', record: questions(), ...input })).toThrow(pattern)
      expect(p).toEqual(snapshot)
    }
    bad({ week: 7 }, /в плане нет недели 7: есть 1, 2/)
    bad({ week: undefined }, /в плане нет недели/)
    bad({ date: 'вчера' }, /date/)
    // тест открыт, когда закрыты все дни недели; пропущенный день закрытым не считается
    bad({}, /тест недели 1 ещё закрыт: не закрыты дни 2/, fresh())
    bad({ week: 2 }, /не закрыты дни 3/)
    const skipped = fresh()
    skipped.days.push({ day: 2, status: 'skipped', dates: [] })
    bad({}, /не закрыты дни 2/, skipped)
    bad({ date: '2026-11-18' }, /дата теста 2026-11-18 раньше последнего занятия недели \(2026-11-19\)/)
    bad({ record: questions().slice(0, 9) }, /в недельном тесте 10 вопросов, получено 9/)
    bad({ record: [...questions(), { q: 'Одиннадцатый', track: 'A', points: 2 }] }, /получено 11/)
    bad({ record: questions({ track: 'Z' }) }, /вопрос 1: трек «Z»/)
    bad({ record: questions({ track: undefined }) }, /вопрос 1: трек/)
    bad({ record: questions({ points: 3 }) }, /вопрос 1: points — 0, 1 или 2/)
    bad({ record: questions({ points: 1.5 }) }, /points/)
    bad({ record: questions({ points: '2' }) }, /points/)
    bad({ record: questions({ q: 'Один и тот же' }) }, /вопрос «Один и тот же» в тесте дважды/)
    bad({ record: questions({ q: ' ' }) }, /вопрос 1: q/)
    bad({ record: { questions: questions(), score: 16 } }, /в записи score 16, а по вопросам выходит 9/)
    bad({ record: { questions: questions(), max: 10 } }, /max 10/)
    bad({ record: 'десять вопросов' }, /нужна запись теста/)
    bad({ record: { week: 1 } }, /нужен список/)
  })

  it('неделя закрывается по чекпоинту один раз и только когда закрыты все её дни', () => {
    const p = weekDone()
    p.weeks = [{ n: 1, closed: false }]
    expect(closeWeek(plan, p, { n: 1, date: '2026-11-20' })).toBe('Неделя 1 закрыта по чекпоинту, 2026-11-20. Чекпоинт, который этим подтверждён: репозиторий и первый замер.')
    expect(p.weeks).toEqual([{ n: 1, closed: true, date: '2026-11-20' }])
    const snapshot = structuredClone(p)
    expect(() => closeWeek(plan, p, { n: 1, date: '2026-11-21' })).toThrow(/неделя 1 уже закрыта по чекпоинту \(2026-11-20\)/)
    expect(() => closeWeek(plan, p, { n: 2, date: '2026-11-21' })).toThrow(/неделя 2 ещё идёт: не закрыты дни 3/)
    expect(() => closeWeek(plan, p, { n: 9, date: '2026-11-21' })).toThrow(/нет недели 9/)
    expect(p).toEqual(snapshot)
    expect(() => closeWeek(plan, weekDone(), { n: 1 })).toThrow(/date/)
    expect(() => closeWeek(plan, weekDone(), { n: 1, date: '2026-11-18' })).toThrow(/раньше последнего занятия недели/)
  })
})

describe('CI, события, замер, наблюдения и паузы', () => {
  it('состояние workflow: первый зелёный, красный и запрет гасить единственный зелёный', () => {
    const p = fresh()
    p.petProject = { kind: 'Empty Activity', ci: { helloWorldWorkflow: null, buildWorkflow: null } }
    expect(setCi(p, { workflow: 'build', state: 'red', today: '2026-11-25' })).toBe('CI: buildWorkflow — не было → red.')
    const green = setCi(p, { workflow: 'build', state: 'green', date: '2026-11-27' })
    expect(green).toMatch(/red → green/)
    expect(green).toMatch(/первый зелёный workflow/)
    expect(green).toMatch(/event --type ci-fixed/)
    expect(p.petProject).toEqual({ kind: 'Empty Activity', ci: { helloWorldWorkflow: null, buildWorkflow: 'green' } })
    expect(p.meta.updatedAt).toBe('2026-11-27')
    const snapshot = structuredClone(p)
    expect(() => setCi(p, { workflow: 'build', state: 'green' })).toThrow(/buildWorkflow уже green/)
    expect(() => setCi(p, { workflow: 'build', state: 'red' })).toThrow(/очки не отнимаются/)
    expect(() => setCi(p, { workflow: 'deploy', state: 'green' })).toThrow(/workflow «deploy»: нужен hello/)
    expect(() => setCi(p, { workflow: 'hello', state: 'yellow' })).toThrow(/состояние «yellow»: нужно green или red/)
    expect(() => setCi(p, { workflow: 'hello', state: 'green', date: '27.11' })).toThrow(/date/)
    expect(p).toEqual(snapshot)
    // пока есть другой зелёный, сборку можно отметить красной
    setCi(p, { workflow: 'helloWorldWorkflow', state: 'green' })
    setCi(p, { workflow: 'build', state: 'red' })
    expect(p.petProject.ci).toEqual({ helloWorldWorkflow: 'green', buildWorkflow: 'red' })
  })

  it('раздел petProject заводится, если его не было', () => {
    const p = fresh()
    setCi(p, { workflow: 'hello', state: 'green' })
    expect(p.petProject).toEqual({ ci: { helloWorldWorkflow: 'green', buildWorkflow: null } })
  })

  it('событие ci-fixed: только при зелёном workflow и одно на дату', () => {
    const p = fresh()
    expect(() => addEvent(p, { type: 'ci-fixed', date: '2026-11-27' })).toThrow(/Сначала отметь workflow зелёным/)
    setCi(p, { workflow: 'build', state: 'green' })
    expect(addEvent(p, { type: 'ci-fixed', date: '2026-11-27', note: 'в workflow был не тот JDK' })).toBe('Событие записано: ci-fixed, 2026-11-27.')
    addEvent(p, { type: 'ci-fixed', date: '2026-11-25' })
    expect(p.events).toEqual([
      { date: '2026-11-25', type: 'ci-fixed' },
      { date: '2026-11-27', type: 'ci-fixed', note: 'в workflow был не тот JDK' },
    ])
    const snapshot = structuredClone(p)
    expect(() => addEvent(p, { type: 'ci-fixed', date: '2026-11-27' })).toThrow(/событие ci-fixed за 2026-11-27 уже записано/)
    expect(() => addEvent(p, { type: 'party', date: '2026-11-28' })).toThrow(/сайт знает только ci-fixed/)
    expect(() => addEvent(p, { type: 'ci-fixed', date: 'завтра' })).toThrow(/date/)
    expect(() => addEvent(p, { type: 'ci-fixed', date: '2026-11-28', note: ' ' })).toThrow(/note/)
    expect(p).toEqual(snapshot)
  })

  it('замер: самооценка по трекам, минуты — только из записанной попытки на таймере', () => {
    const p = fresh()
    expect(setBaseline(plan, p, { point: 'start', scores: { A: 2, C1: 3 }, today: '2026-11-19' })).toBe('Замер в начале цикла: самооценка A 2, C1 3.')
    expect(p.baseline.start.selfAssessment).toEqual({ ...noScores(), algorithms: 2, gradle: 3 })
    expect(p.baseline.start.date).toBeUndefined()
    // записываются только названные треки
    setBaseline(plan, p, { point: 'start', scores: { A: 3 } })
    expect(p.baseline.start.selfAssessment).toEqual({ ...noScores(), algorithms: 3, gradle: 3 })

    expect(() => setBaseline(plan, p, { point: 'start', minutes: 14, result: 'решил перебором' })).toThrow(/у задачи 1 такой за 14 мин в журнале нет\. Сначала запиши её командой problem/)
    addAttempts(plan, p, { id: 1, attempts: [attempt({ date: '2026-11-12', minutes: 14 })] })
    expect(() => setBaseline(plan, p, { point: 'start', minutes: 14 })).toThrow(/нужен результат словами/)
    expect(() => setBaseline(plan, p, { point: 'start', minutes: 13, result: 'решил перебором' })).toThrow(/за 13 мин в журнале нет/)
    expect(setBaseline(plan, p, { point: 'start', minutes: 14, result: 'решил перебором' })).toBe('Замер в начале цикла: результат записан; 14 мин, 2026-11-12.')
    expect(p.baseline.start).toEqual({ day: 1, date: '2026-11-12', problemId: 1, minutes: 14, result: 'решил перебором', selfAssessment: { ...noScores(), algorithms: 3, gradle: 3 } })
    expect(Object.keys(p.baseline.start)).toEqual(['day', 'date', 'problemId', 'minutes', 'result', 'selfAssessment'])

    // финал: задача не решена — только результат словами, минут нет
    setBaseline(plan, p, { point: 'final', result: 'не решил за 20 минут' })
    expect(p.baseline.final).toMatchObject({ minutes: null, result: 'не решил за 20 минут' })
    addAttempts(plan, p, { id: 217, attempts: [attempt({ date: '2026-12-04', minutes: 9 })] })
    expect(setBaseline(plan, p, { point: 'final', minutes: 9, result: 'решил сам через HashSet', scores: { A: 4 } })).toMatch(/9 мин, 2026-12-04; самооценка A 4\. В начале было 14 мин, стало 9\./)
    expect(p.baseline.final).toMatchObject({ day: 3, date: '2026-12-04', problemId: 217, minutes: 9, result: 'решил сам через HashSet' })
    // повторный запуск оставляет то же самое
    const snapshot = structuredClone(p)
    setBaseline(plan, p, { point: 'final', minutes: 9, result: 'решил сам через HashSet', scores: { A: 4 } })
    expect(p.baseline).toEqual(snapshot.baseline)
  })

  it('замер: день и задача меняются; проверки ввода', () => {
    const p = fresh()
    setBaseline(plan, p, { point: 'start', day: 2, problemId: 217 })
    expect(p.baseline.start).toMatchObject({ day: 2, problemId: 217 })
    const snapshot = structuredClone(p)
    const bad = (input, pattern, usedPlan = plan) => {
      expect(() => setBaseline(usedPlan, p, { point: 'start', ...input })).toThrow(pattern)
      expect(p).toEqual(snapshot)
    }
    bad({ point: 'middle', scores: { A: 2 } }, /точка «middle»: нужна start/)
    bad({}, /нужно что-то записать/)
    bad({ scores: { A: 0 } }, /самооценка A: нужна оценка от 1 до 5/)
    bad({ scores: { A: 6 } }, /от 1 до 5/)
    bad({ scores: { A: 2.5 } }, /от 1 до 5/)
    bad({ scores: { B: 2 } }, /самооценка: трек «B»: такого нет/)
    bad({ scores: { X: 2 } }, /для трека X сайт её не ведёт/, { ...plan, tracks: [...plan.tracks, { code: 'X' }] })
    bad({ day: 9 }, /нет дня 9/)
    bad({ problemId: 99 }, /в плане нет задачи 99/)
    bad({ minutes: 0, result: 'т' }, /minutes/)
    bad({ result: ' ' }, /result/)
    bad({ scores: { A: 2 }, date: 'сегодня' }, /date/)
    const empty = fresh()
    delete empty.baseline
    expect(() => setBaseline(plan, empty, { point: 'start', scores: { A: 2 } })).toThrow(/в журнале нет точек baseline/)
  })

  it('наблюдение добавляется один раз', () => {
    const p = fresh()
    expect(addObservation(p, { text: ' Занятия идут дольше плана ', date: '2026-11-19' })).toBe('Наблюдение записано, всего 1.')
    expect(p.observations).toEqual(['Занятия идут дольше плана'])
    expect(p.meta.updatedAt).toBe('2026-11-19')
    expect(() => addObservation(p, { text: 'Занятия идут дольше плана' })).toThrow(/уже записано/)
    expect(() => addObservation(p, { text: ' ' })).toThrow(/text/)
    expect(() => addObservation(p, { text: 'Другое', date: '19.11' })).toThrow(/date/)
    expect(p.observations).toHaveLength(1)
  })

  it('пауза записывается по возвращении: между занятиями и без занятий внутри', () => {
    const p = fresh()
    expect(() => addPause(p, { from: '2026-11-18', to: '2026-11-29' })).toThrow(/после паузы ещё нет занятия/)
    p.sessions.push({ date: '2026-11-30', from: null, to: null, day: 2, topics: ['возвращение'] })
    expect(addPause(p, { from: '2026-11-18', to: '2026-11-29', note: 'болел', today: '2026-11-30' })).toBe('Пауза 2026-11-18 — 2026-11-29 записана: дней 12.')
    expect(p.position.pauses).toEqual([{ from: '2026-11-18', to: '2026-11-29', days: 12, note: 'болел' }])
    const snapshot = structuredClone(p)
    expect(() => addPause(p, { from: '2026-11-18', to: '2026-11-29' })).toThrow(/пересекается с уже записанной/)
    expect(() => addPause(p, { from: '2026-11-25', to: '2026-12-02' })).toThrow(/пересекается/)
    expect(() => addPause(p, { from: '2026-11-10', to: '2026-11-12' })).toThrow(/до паузы нет ни одного занятия/)
    expect(() => addPause(p, { from: '2026-11-29', to: '2026-11-18' })).toThrow(/раньше начала/)
    expect(() => addPause(p, { from: '18.11', to: '2026-11-29' })).toThrow(/from/)
    expect(p).toEqual(snapshot)
    const busy = fresh()
    busy.sessions.push({ date: '2026-11-30', from: null, to: null, day: 2, topics: ['т'] })
    expect(() => addPause(busy, { from: '2026-11-16', to: '2026-11-20' })).toThrow(/внутри паузы есть занятия: 2026-11-17/)
    // дни считаются по календарю, обе даты включительно, и через перевод часов тоже
    busy.sessions.unshift({ date: '2026-10-20', from: null, to: null, day: 1, topics: ['т'] })
    addPause(busy, { from: '2026-10-21', to: '2026-11-16' })
    expect(busy.position.pauses[0].days).toBe(27)
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
    expect(mergeLedger(file, ['pot', 'bench'], record)).toMatch(/покупок 1, ремонтов 0, наград в список 1, выкупов 1, знаков 1; уже были: 1\./)
    expect(mergeLedger(file, ['pot', 'bench'], record)).toMatch(/покупок 0, ремонтов 0, наград в список 0, выкупов 0, знаков 0; уже были: 5\./)
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

const card = (over = {}) => ({ date: '2026-11-19', track: 'A', question: 'Зачем нужен HashSet?', answer: 'Быстро проверить, есть ли элемент.', ...over })
const review = (over = {}) => ({ card: '2026-11-12-abc', at: '2026-11-19T10:00:00.000Z', ok: true, ...over })

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

  it('своя карточка: поля по порядку, текст без лишних пробелов, список cards заводится сам', () => {
    const file = { reviews: [] }
    expect(addCard(plan, fresh(), file, [], card({ question: '  Зачем   нужен\nHashSet? ', answer: ' Быстро проверить,\n\nесть ли элемент. ' }))).toBe(
      'Своя карточка записана: трек A, из заметок. Своих карточек за 2026-11-19: 1 из 5.',
    )
    expect(file).toEqual({ reviews: [], cards: [{ date: '2026-11-19', track: 'A', question: 'Зачем нужен HashSet?', answer: 'Быстро проверить, есть ли элемент.', source: 'note' }] })
    expect(Object.keys(file.cards[0])).toEqual(['date', 'track', 'question', 'answer', 'source'])
    // карточки лежат по датам
    addCard(plan, fresh(), file, [], card({ date: '2026-11-12', question: 'Что делает getOrPut?' }))
    expect(file.cards.map((c) => c.date)).toEqual(['2026-11-12', '2026-11-19'])
  })

  it('карточка из ошибки: текст ошибки и трек берутся из журнала, названный трек важнее', () => {
    const file = { reviews: [], cards: [] }
    const p = fresh()
    p.mistakes = [{ date: '2026-11-17', track: 'C1', problemId: null, text: 'спутал  configuration cache  с UP-TO-DATE' }]
    expect(addCard(plan, p, file, [], { date: '2026-11-19', question: 'Что кэширует configuration cache?', answer: 'Граф задач.', mistake: 1 })).toMatch(/трек C1, из журнала ошибок/)
    expect(file.cards[0]).toEqual({ date: '2026-11-19', track: 'C1', question: 'Что кэширует configuration cache?', answer: 'Граф задач.', source: 'mistake', mistake: 'спутал configuration cache с UP-TO-DATE' })
    expect(Object.keys(file.cards[0])).toEqual(['date', 'track', 'question', 'answer', 'source', 'mistake'])
    addCard(plan, p, file, [], card({ question: 'Когда задача UP-TO-DATE?', mistake: 1 }))
    expect(file.cards[1]).toMatchObject({ track: 'A', source: 'mistake' })
    expect(() => addCard(plan, p, file, [], card({ question: 'Ещё вопрос', mistake: 2 }))).toThrow(/ошибка №2: есть номера с 1 по 1/)
    expect(() => addCard(plan, p, file, [], card({ question: 'Ещё вопрос', mistake: 0 }))).toThrow(/ошибка №0/)
    expect(file.cards).toHaveLength(2)
  })

  it('повтор карточки пропускается с сообщением: тот же вопрос в этот или другой день, среди карточек и проверок понимания', () => {
    const file = { reviews: [], cards: [] }
    const checks = [{ date: '2026-11-17', track: 'C1', question: 'Что такое task в Gradle?', firstAnswer: 'о', verdict: 'partial', answer: 'о' }]
    addCard(plan, fresh(), file, checks, card())
    const snapshot = structuredClone(file)
    expect(addCard(plan, fresh(), file, checks, card())).toBe('Карточка не добавлена, это повтор: «Зачем нужен HashSet?» — такой вопрос уже есть среди своих карточек (2026-11-19).')
    // другая дата, регистр и пробелы — всё равно тот же вопрос
    expect(addCard(plan, fresh(), file, checks, card({ date: '2026-11-25', question: ' зачем  НУЖЕН hashset? ' }))).toMatch(/это повтор/)
    expect(addCard(plan, fresh(), file, checks, card({ question: 'что такое TASK в gradle?' }))).toMatch(/такой вопрос уже есть среди проверок понимания \(2026-11-17\)/)
    expect(file).toEqual(snapshot)
    // без списка cards повтор его не заводит
    const empty = { reviews: [] }
    addCard(plan, fresh(), empty, checks, card({ question: 'Что такое task в Gradle?' }))
    expect(empty).toEqual({ reviews: [] })
  })

  it('своя карточка: проверки ввода и границы длины', () => {
    const bad = (over, pattern) => {
      const file = { reviews: [], cards: [] }
      expect(() => addCard(plan, fresh(), file, [], card(over))).toThrow(pattern)
      expect(file.cards).toEqual([])
    }
    bad({ date: '19.11.2026' }, /карточка: date/)
    bad({ date: '2026-02-30' }, /date/)
    bad({ track: 'B' }, /карточка: трек «B»: такого нет, есть A, C1/)
    bad({ track: undefined }, /трек/)
    bad({ question: 'Да' }, /вопрос короче 3 знаков/)
    // длина считается после обрезки краёв и схлопывания пробелов
    bad({ question: ' а \n  ' }, /вопрос короче 3 знаков/)
    bad({ question: `${'в'.repeat(100)}  \n  ${'в'.repeat(100)}` }, /вопрос длиннее 200 знаков, сейчас 201/)
    bad({ question: undefined }, /вопрос короче 3 знаков/)
    bad({ question: 'в'.repeat(201) }, /вопрос длиннее 200 знаков, сейчас 201/)
    bad({ answer: '   ' }, /нужен ответ/)
    bad({ answer: undefined }, /нужен ответ/)
    bad({ answer: 'о'.repeat(601) }, /ответ длиннее 600 знаков, сейчас 601/)
    // ровно на границе — проходит
    const file = { reviews: [] }
    addCard(plan, fresh(), file, [], card({ question: 'Что', answer: 'о' }))
    addCard(plan, fresh(), file, [], card({ question: 'в'.repeat(200), answer: 'о'.repeat(600) }))
    expect(file.cards).toHaveLength(2)
  })

  it('шестая своя карточка за одну дату — ошибка; проверки понимания в счёт не идут', () => {
    const file = { reviews: [] }
    const checks = Array.from({ length: 7 }, (_, i) => ({ date: '2026-11-19', question: `Проверка ${i + 1}` }))
    for (let i = 1; i <= 5; i++) addCard(plan, fresh(), file, checks, card({ question: `Вопрос номер ${i}` }))
    const snapshot = structuredClone(file)
    expect(() => addCard(plan, fresh(), file, checks, card({ question: 'Вопрос номер 6' }))).toThrow(/карточка: за 2026-11-19 уже 5 своих карточек, больше на одну дату сайт не принимает/)
    expect(file).toEqual(snapshot)
    // повтор при полном дне — всё ещё повтор, а не ошибка
    expect(addCard(plan, fresh(), file, checks, card({ question: 'Вопрос номер 3' }))).toMatch(/это повтор/)
    addCard(plan, fresh(), file, checks, card({ date: '2026-11-20', question: 'Вопрос номер 6' }))
    expect(file.cards).toHaveLength(6)
  })

  it('запись колоды: старый вид — список ответов, новый — объект с ответами и карточками', () => {
    const file = { reviews: [review()] }
    expect(mergeDeck(plan, file, [], [review(), review({ card: '2026-11-17-xyz', at: '2026-11-19T09:00:00.000Z', ok: false })])).toMatch(
      /Ответов по карточкам добавлено: 1, уже были: 1\. Своих карточек добавлено: 0, пропущено повторов: 0\./,
    )
    expect(file).toEqual({ reviews: [review({ card: '2026-11-17-xyz', at: '2026-11-19T09:00:00.000Z', ok: false }), review()] })

    const checks = [{ date: '2026-11-17', question: 'Что такое task в Gradle?' }]
    const record = {
      reviews: [review({ at: '2026-11-22T10:00:00.000Z' })],
      cards: [
        card({ question: '  Зачем   нужен HashSet? ' }),
        { date: '2026-11-19', track: 'C1', question: 'Что кэширует configuration cache?', answer: 'Граф задач.', source: 'mistake', mistake: ' спутал кэши ', id: 'лишнее поле' },
        card({ question: 'Что такое task в Gradle?', source: 'note' }),
      ].map((item) => ({ source: 'note', ...item })),
    }
    const out = mergeDeck(plan, file, checks, record)
    expect(out).toMatch(/Ответов по карточкам добавлено: 1, уже были: 0\. Своих карточек добавлено: 2, пропущено повторов: 1 \(«Что такое task в Gradle\?» — такой вопрос уже есть среди проверок понимания \(2026-11-17\)\)\./)
    expect(file.reviews).toHaveLength(3)
    // карточки ложатся в файл чистыми: текст обрезан, лишних полей нет
    expect(file.cards).toEqual([
      { date: '2026-11-19', track: 'A', question: 'Зачем нужен HashSet?', answer: 'Быстро проверить, есть ли элемент.', source: 'note' },
      { date: '2026-11-19', track: 'C1', question: 'Что кэширует configuration cache?', answer: 'Граф задач.', source: 'mistake', mistake: 'спутал кэши' },
    ])
    // повторный запуск ничего не добавляет
    const snapshot = structuredClone(file)
    expect(mergeDeck(plan, file, checks, record)).toMatch(/добавлено: 0, уже были: 1\. Своих карточек добавлено: 0, пропущено повторов: 3/)
    expect(file).toEqual(snapshot)
    // одни карточки, без ответов
    mergeDeck(plan, file, checks, { cards: [{ ...card({ date: '2026-11-20', question: 'Что делает getOrPut?' }), source: 'note' }] })
    expect(file.cards).toHaveLength(3)
  })

  it('запись колоды проверяется вся: плохая карточка, шестая за дату или плохой ответ не пишут ничего', () => {
    const own = (over = {}) => ({ source: 'note', ...card(over) })
    const bad = (record, pattern) => {
      const file = { reviews: [review()], cards: [own({ question: 'Уже записанный вопрос' })] }
      const snapshot = structuredClone(file)
      expect(() => mergeDeck(plan, file, [], record)).toThrow(pattern)
      expect(file).toEqual(snapshot)
    }
    const good = review({ at: '2026-11-22T10:00:00.000Z' })
    bad({ reviews: [good], cards: [own({ question: 'Первый вопрос' }), own({ question: 'Да' })] }, /карточка 2: вопрос короче 3 знаков/)
    bad({ reviews: [good], cards: [own({ track: 'B' })] }, /карточка 1: трек «B»/)
    bad({ reviews: [good], cards: [own({ source: 'video' })] }, /карточка 1: источник «video»: нужен note \(из заметок\) или mistake/)
    bad({ reviews: [good], cards: [card()] }, /карточка 1: источник/)
    bad({ reviews: [good], cards: [own({ source: 'mistake' })] }, /карточка 1: у карточки из ошибки должен быть текст ошибки/)
    bad({ reviews: [good], cards: [own({ source: 'mistake', mistake: '  ' })] }, /текст ошибки/)
    bad({ reviews: [good], cards: [own({ answer: 'о'.repeat(601) })] }, /карточка 1: ответ длиннее 600 знаков/)
    bad({ reviews: [good], cards: [own({ date: 'вчера' })] }, /карточка 1: date/)
    bad({ reviews: [good], cards: ['вопрос'] }, /карточка 1: нужен объект/)
    bad({ reviews: [good], cards: Array.from({ length: 5 }, (_, i) => own({ question: `Вопрос номер ${i + 1}` })) }, /карточка 5: за 2026-11-19 уже 5 своих карточек/)
    bad({ reviews: [{ card: 'x', at: 'вчера', ok: true }], cards: [own()] }, /ответ 1/)
    bad({ reviews: 'много', cards: [own()] }, /reviews: нужен список/)
    bad({ reviews: [good], cards: {} }, /cards: нужен список/)
    bad({ reviews: [], cards: [] }, /нужен непустой список/)
    bad({}, /нужен непустой список/)
    bad([], /нужен непустой список/)
    bad('запись', /нужна запись колоды/)
    bad(null, /нужна запись колоды/)
  })
})

const files = () => ({ ledger: { note: 'лавка', purchases: [], repairs: [] }, town: { note: 'город', actions: [] }, deck: { note: 'колода', reviews: [] } })
const action = (over = {}) => ({ at: '2026-11-20T18:20:00', do: 'build', type: 'house', ...over })

describe('единая запись из браузера', () => {
  const record = () => ({
    ledger: { purchases: [{ item: 'pot', date: '2026-11-19' }], signs: [{ cycle: '01-basic-month', day: 2, text: 'Первый перевал', date: '2026-11-20' }] },
    town: [action(), action({ at: '2026-11-20T18:05:00', do: 'tier', type: undefined })],
    deck: { reviews: [review()], cards: [{ source: 'note', ...card() }] },
  })

  it('разделы раскладываются по трём файлам, итог — по строке на раздел; повторный запуск ничего не добавляет', () => {
    const f = files()
    const lines = syncBrowser(plan, f, ['pot'], [], record()).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^Лавка\. Из лавки добавлено: покупок 1, ремонтов 0, наград в список 0, выкупов 0, знаков 1; уже были: 0\./)
    expect(lines[1]).toBe('Город. Действий добавлено: 2, уже были в журнале: 0.')
    expect(lines[2]).toMatch(/^Колода\. Ответов по карточкам добавлено: 1, уже были: 0\. Своих карточек добавлено: 1, пропущено повторов: 0\./)
    expect(f.ledger).toMatchObject({ note: 'лавка', purchases: [{ item: 'pot', date: '2026-11-19' }], signs: [{ day: 2 }] })
    expect(f.town.actions.map((a) => a.do)).toEqual(['tier', 'build'])
    expect(f.deck).toEqual({ note: 'колода', reviews: [review()], cards: [{ ...card(), source: 'note' }] })

    const snapshot = structuredClone(f)
    const again = syncBrowser(plan, f, ['pot'], [], record()).split('\n')
    expect(again[0]).toMatch(/покупок 0, .*знаков 0; уже были: 2\./)
    expect(again[1]).toBe('Город. Действий добавлено: 0, уже были в журнале: 2.')
    expect(again[2]).toMatch(/добавлено: 0, уже были: 1\. Своих карточек добавлено: 0, пропущено повторов: 1/)
    expect(f).toEqual(snapshot)
  })

  it('запись применяется вся или никак: один негодный раздел — и не меняется ни один файл', () => {
    const bad = (change, pattern) => {
      const f = files()
      const broken = record()
      change(broken)
      expect(() => syncBrowser(plan, f, ['pot'], [], broken)).toThrow(pattern)
      expect(f).toEqual(files())
    }
    // колода идёт последней: лавка и город к этому времени уже проверены, но в файлы не попадают
    bad((r) => (r.deck.cards[0].track = 'B'), /колода: карточка 1: трек «B»/)
    bad((r) => (r.deck.cards = Array.from({ length: 6 }, (_, i) => ({ source: 'note', ...card({ question: `Вопрос номер ${i + 1}` }) }))), /колода: карточка 6: за 2026-11-19 уже 5 своих карточек/)
    bad((r) => (r.deck.reviews[0].ok = 'да'), /колода: ответ 1/)
    bad((r) => (r.town[1].at = 'вчера'), /город: действие 2: поле at/)
    bad((r) => (r.ledger.purchases[0].item = 'castle'), /лавка: purchases, запись 1/)
  })

  it('в записи только непустые разделы: остальные файлы не трогаются', () => {
    const f = files()
    expect(syncBrowser(plan, f, ['pot'], [], { deck: { reviews: [review()] } })).toMatch(/^Колода\. /)
    expect(f.ledger).toEqual(files().ledger)
    expect(f.town).toEqual(files().town)
    expect(browserSections({ ledger: { purchases: [] }, town: [], deck: { cards: [{ source: 'note', ...card() }] } })).toEqual({ deck: { cards: [{ source: 'note', ...card() }] } })
  })

  it('понимает старые виды записи: лавка, список действий города, список ответов, объект колоды', () => {
    const ledger = { purchases: [{ item: 'pot', date: '2026-11-19' }], repairs: [] }
    expect(browserSections(ledger)).toEqual({ ledger })
    expect(browserSections([action()])).toEqual({ town: [action()] })
    expect(browserSections({ actions: [action()] })).toEqual({ town: [action()] })
    expect(browserSections(action())).toEqual({ town: [action()] })
    expect(browserSections([review()])).toEqual({ deck: { reviews: [review()] } })
    expect(browserSections({ reviews: [review()], cards: [] })).toEqual({ deck: { reviews: [review()], cards: [] } })

    const f = files()
    expect(syncBrowser(plan, f, ['pot'], [], ledger)).toMatch(/^Лавка\. Из лавки добавлено: покупок 1/)
    expect(syncBrowser(plan, f, ['pot'], [], [action()])).toBe('Город. Действий добавлено: 1, уже были в журнале: 0.')
    expect(syncBrowser(plan, f, ['pot'], [], [review()])).toMatch(/^Колода\. Ответов по карточкам добавлено: 1/)
    expect(syncBrowser(plan, f, ['pot'], [], { cards: [{ source: 'note', ...card() }] })).toMatch(/Своих карточек добавлено: 1/)
    expect([f.ledger.purchases.length, f.town.actions.length, f.deck.reviews.length, f.deck.cards.length]).toEqual([1, 1, 1, 1])
  })

  it('непонятная запись — ошибка, а не молчаливый пропуск', () => {
    const bad = (value, pattern) => {
      const f = files()
      expect(() => syncBrowser(plan, f, ['pot'], [], value)).toThrow(pattern)
      expect(f).toEqual(files())
    }
    bad({}, /в записи пусто/)
    bad([], /в записи пусто/)
    bad({ ledger: { purchases: [] }, town: [] }, /в записи пусто/)
    bad('запись', /нужна запись из браузера/)
    bad(null, /нужна запись из браузера/)
    bad([action(), review()], /не понять, что это за список/)
    bad(['build'], /не понять, что это за список/)
    bad({ shop: [] }, /в записи нет знакомых разделов: ledger, town, deck/)
    bad({ purchases: [], reviews: [review()] }, /смешаны разные виды: запись лавки, запись колоды/)
    bad({ ledger: { purchases: [] }, purchases: [] }, /смешаны разные виды/)
    bad({ deck: { reviews: [review()] }, quests: [1] }, /незнакомое поле «quests»/)
    bad({ ledger: { coins: [5] } }, /ledger: незнакомое поле «coins», бывают purchases, repairs, rewards, redeemed, signs/)
    bad({ deck: { reviews: [review()], decks: [] } }, /deck: незнакомое поле «decks»/)
    bad({ ledger: [{ item: 'pot', date: '2026-11-19' }] }, /ledger: нужен объект/)
    bad({ ledger: { purchases: 'pot' } }, /ledger\.purchases: нужен список/)
    bad({ town: { at: '2026-11-20T18:20:00', do: 'tier' } }, /town: нужен список действий города/)
    bad({ deck: [review()] }, /deck: нужен объект/)
  })
})

describe('что записала команда, то и понимает сайт', () => {
  // Правила сайта подключаются здесь, а не в начале файла: если их сейчас правят, остальные тесты команды не падают вместе с ними.
  const realPlan = JSON.parse(fs.readFileSync('data/cycles/01-basic-month/plan.json', 'utf8'))
  let site
  beforeAll(async () => {
    const [engine, deck, rules] = await Promise.all([import('../src/game/engine.ts'), import('../src/game/deck.ts'), import('../src/game/rules.ts')])
    site = { ...engine, ...deck, ...rules }
  })
  const blank = () => ({
    meta: { updatedAt: '2026-10-27' },
    position: { currentDay: 1, currentStep: 1, daysDone: 0, daysTotal: realPlan.days.length, startedAt: '2026-10-27', pauses: [] },
    days: [],
    sessions: [],
    leetcode: [],
    baseline: {
      start: { day: 2, problemId: 1512, minutes: null, result: null, selfAssessment: noScores() },
      final: { day: 28, problemId: 349, minutes: null, result: null, selfAssessment: noScores() },
    },
    mistakes: [],
    knowledgeChecks: [],
    openItems: [],
    observations: [],
  })
  const worldOf = (progress, ledger) => site.buildWorld([{ dir: '01-basic-month', plan: realPlan, progress }], [], '2026-12-31', ledger)
  const labels = (world) => world.events.map((e) => e.label)
  /** Четыре дня первой недели: по занятию в день, все закрыты ядром. */
  const firstWeek = () => {
    const p = blank()
    for (const [i, date] of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].entries()) {
      addSession(realPlan, p, { date, topics: [`день ${i + 1}`] })
      closeDay(realPlan, p, { status: 'core', date })
    }
    return p
  }

  it('попытки по задаче: статус, первая попытка на таймере, повтор и дуэль', () => {
    const p = firstWeek()
    addAttempts(realPlan, p, { id: 1512, attempts: [attempt({ date: '2026-11-03', minutes: 14 })] })
    let problem = worldOf(p).active.problems.find((item) => item.id === 1512)
    expect(problem).toMatchObject({ title: 'Number of Good Pairs', state: 'self', timedMinutes: 14, timedLimit: 20 })
    expect(problem.progress.url).toBe('https://leetcode.com/problems/number-of-good-pairs/')
    expect(labels(worldOf(p))).toContain('Задача 1512: решена сама')

    addAttempts(realPlan, p, { id: 1512, attempts: [attempt({ date: '2026-11-09', kind: 'from-empty-editor', minutes: 9 })] })
    addAttempts(realPlan, p, { id: 1512, attempts: [attempt({ date: '2026-11-20', kind: 'duel', minutes: 8 })] })
    addAttempts(realPlan, p, { id: 1512, attempts: [attempt({ date: '2026-11-25', kind: 'no-hints', minutes: 10 })] })
    const world = worldOf(p)
    problem = world.active.problems.find((item) => item.id === 1512)
    expect(problem.state).toBe('nohints')
    expect(labels(world)).toEqual(expect.arrayContaining(['Задача 1512: повтор с пустого редактора', 'Задача 1512: без подсказок', 'Задача 1512: дуэль с собой, 8 мин против 14']))
    expect(world.trophies.find((t) => t.id === 'empty-editor').earned).toBe(true)
    expect(world.trophies.find((t) => t.id === 'duel').earned).toBe(true)

    // решение после разбора сайт читает как «с разбором»
    addAttempts(realPlan, p, {
      id: 217,
      attempts: [
        { date: '2026-11-09', kind: 'timed-20', minutes: 20, result: 'not-solved' },
        { date: '2026-11-09', kind: 'rewrite-after-walkthrough', minutes: 8, result: 'solved' },
      ],
    })
    expect(worldOf(p).active.problems.find((item) => item.id === 217).state).toBe('walkthrough')
    expect(labels(worldOf(p))).toContain('Задача 217: решена с разбором')
    // все статусы, которые ставит команда, сайт знает
    for (const item of p.leetcode) expect(site.PROBLEM_STATE_LABEL[worldOf(p).active.problems.find((v) => v.id === item.id).state]).not.toBe('не начата')
  })

  it('недельный тест открывает сайт по тем же дням; баллы дают камни, вопросы трека идут в зачёт', () => {
    const p = firstWeek()
    const tracked = questions().map((item, i) => ({ ...item, track: i < 6 ? 'A' : 'C1', points: 2 }))
    expect(worldOf(p).active.weeks[0].test.state).toBe('open')
    addWeeklyTest(realPlan, p, { week: 1, date: '2026-11-06', record: tracked })
    const week = worldOf(p).active.weeks[0]
    expect(week.test).toMatchObject({ state: 'done', gems: site.gemsForScore(20, 20) })
    expect(week.test.best).toMatchObject({ score: 20, max: 20 })
    const rank = worldOf(p).tracks.find((t) => t.track.code === 'A').rank.next
    expect(rank.items.find((item) => item.unit === '%')).toMatchObject({ have: 100, done: true })
    // неделя с незакрытым днём закрыта и для сайта, и для команды
    expect(worldOf(p).active.weeks[1].test.state).toBe('locked')
    expect(() => addWeeklyTest(realPlan, p, { week: 2, date: '2026-11-13', record: tracked })).toThrow(/ещё закрыт/)

    closeWeek(realPlan, p, { n: 1, date: '2026-11-06' })
    expect(worldOf(p).active.weeks[0].closed).toBe(true)
    expect(labels(worldOf(p))).toContain('Неделя 1 закрыта по чекпоинту')
  })

  it('артефакт достраивает домик лагеря; итог дня виден в записи дня', () => {
    const p = firstWeek()
    setArtifact(realPlan, p, { path: 'notes/baseline.md', state: 'not-saved', day: 2 })
    expect(worldOf(p).active.buildings.find((b) => b.item.id === 'baseline')).toMatchObject({ stage: 1, recorded: 'not-saved' })
    setArtifact(realPlan, p, { path: 'notes/baseline.md', state: 'saved' })
    setArtifact(realPlan, p, { path: 'algo/1512-number-of-good-pairs.kt', state: 'committed', day: 2 })
    const world = worldOf(p)
    expect(world.active.buildings.find((b) => b.item.id === 'baseline')).toMatchObject({ stage: 2, recorded: 'saved' })
    expect(world.active.buildings.find((b) => b.item.id === 'solutions').stage).toBeGreaterThanOrEqual(2)
    expect(labels(world)).toEqual(expect.arrayContaining(['Артефакт: notes/baseline.md', 'Артефакт: algo/1512-number-of-good-pairs.kt']))
    // все состояния, которые принимает команда: построенные — те же, что у сайта
    expect(site.BUILT_STATES).toEqual(['created', 'saved', 'committed'])

    describeDay(realPlan, p, { day: 2, summary: 'Замер: задача 1512 на таймере', minutes: 100 })
    expect(worldOf(p).active.days[1].progress).toMatchObject({ summary: 'Замер: задача 1512 на таймере', wallClockMinutes: 100 })
  })

  it('CI, событие, замер и пауза дают на сайте очки, трофеи и самооценку', () => {
    const p = firstWeek()
    setCi(p, { workflow: 'hello', state: 'green' })
    addEvent(p, { type: 'ci-fixed', date: '2026-11-05' })
    let world = worldOf(p)
    expect(labels(world)).toEqual(expect.arrayContaining(['Workflow впервые зелёный', 'Красный CI починен']))
    expect(world.trophies.filter((t) => ['green', 'red-green'].includes(t.id)).map((t) => t.earned)).toEqual([true, true])

    addAttempts(realPlan, p, { id: 1512, attempts: [attempt({ date: '2026-11-03', minutes: 14 })] })
    addAttempts(realPlan, p, { id: 349, attempts: [attempt({ date: '2026-11-25', minutes: 9 })] })
    setBaseline(realPlan, p, { point: 'start', minutes: 14, result: 'решил перебором', scores: { A: 2, B: 1, C1: 2, C2: 1, E: 3 } })
    setBaseline(realPlan, p, { point: 'final', minutes: 9, result: 'решил сам', scores: { A: 4 } })
    world = worldOf(p)
    expect(world.tracks.map((t) => [t.track.code, t.selfStart, t.selfFinal])).toEqual([
      ['A', 2, 4],
      ['B', 1, null],
      ['C1', 2, null],
      ['C2', 1, null],
      ['E', 3, null],
    ])
    expect(world.trophies.find((t) => t.id === 'faster')).toMatchObject({ earned: true, date: '2026-11-25' })
    const timed = world.tracks.find((t) => t.track.code === 'A').rank.next.items.find((item) => item.label.includes('349'))
    expect(timed.done).toBe(true)

    addSession(realPlan, p, { date: '2026-11-25', topics: ['возвращение'] })
    addPause(p, { from: '2026-11-06', to: '2026-11-24' })
    world = worldOf(p)
    expect(world.active.pauses).toHaveLength(1)
    expect(labels(world)).toContain('Возвращение после паузы в 19 дней')
    expect(world.trophies.find((t) => t.id === 'return').earned).toBe(true)
  })

  it('свои карточки проходят проверку сайта и попадают в колоду под тем же номером', () => {
    const p = firstWeek()
    addCheck(realPlan, p, { date: '2026-11-03', track: 'C1', question: 'Что такое task в Gradle?', firstAnswer: 'о', verdict: 'partial', answer: 'о' })
    addMistake(realPlan, p, { date: '2026-11-03', track: 'A', text: 'перепутал   .length и .size' })
    const file = { reviews: [] }
    addCard(realPlan, p, file, p.knowledgeChecks, card({ track: 'B', question: '  Зачем нужен\nслой data? ' }))
    addCard(realPlan, p, file, p.knowledgeChecks, { date: '2026-11-19', question: 'Чем .length отличается от .size?', answer: 'Строка и коллекция.', mistake: 1 })
    mergeDeck(realPlan, file, p.knowledgeChecks, { cards: [{ date: '2026-11-20', track: 'E', question: 'Зачем нужен AGENTS.md?', answer: 'Правила для ИИ.', source: 'note' }] })
    expect(addCard(realPlan, p, file, p.knowledgeChecks, card({ question: 'что такое TASK в gradle?' }))).toMatch(/это повтор/)
    const tracks = realPlan.tracks.map((t) => t.code)
    expect(site.ownCardsProblems(file.cards, tracks)).toEqual([])
    // лимит на дату у команды и у сайта один
    for (let i = 1; i <= 3; i++) addCard(realPlan, p, file, p.knowledgeChecks, card({ question: `Вопрос номер ${i}` }))
    expect(() => addCard(realPlan, p, file, p.knowledgeChecks, card({ question: 'Вопрос номер 4' }))).toThrow(/уже 5 своих карточек/)
    expect(site.ownCardsProblems([...file.cards, { ...card({ question: 'Вопрос номер 4' }), source: 'note' }], tracks)).toHaveLength(1)
    expect(site.ownCardsProblems(file.cards, tracks)).toEqual([])

    const world = worldOf(p, { purchases: [], repairs: [], reviews: [], cards: file.cards })
    const own = world.deck.filter((item) => item.source !== 'check')
    expect(own).toHaveLength(file.cards.length)
    expect(own.map((item) => item.id).sort()).toEqual(file.cards.map((item) => site.cardId(item)).sort())
    expect(own.find((item) => item.source === 'mistake')).toMatchObject({ track: 'A', mistake: 'перепутал .length и .size', question: 'Чем .length отличается от .size?' })
    expect(world.deck.find((item) => item.question === 'Зачем нужен слой data?')).toMatchObject({ source: 'note', track: 'B', due: '2026-11-20' })
  })
})

describe('команда на живых данных', () => {
  const dir = `data/cycles/${fs.readdirSync('data/cycles').sort().at(-1)}`

  it('занятие записывается в копию настоящего журнала и не ломает его формат', () => {
    const realPlan = JSON.parse(fs.readFileSync(`${dir}/plan.json`, 'utf8'))
    const progress = JSON.parse(fs.readFileSync(`${dir}/progress.json`, 'utf8'))
    const before = progress.sessions.length
    addSession(realPlan, progress, { date: '2099-01-05', from: '10:00', to: '11:00', topics: ['проверка команды'] })
    expect(progress.sessions).toHaveLength(before + 1)
    expect(progress.days.find((d) => d.day === progress.position.currentDay).dates).toContain('2099-01-05')
  })

  it('новые команды работают на копии настоящего журнала: задача, итог дня, артефакт, наблюдение', () => {
    const realPlan = JSON.parse(fs.readFileSync(`${dir}/plan.json`, 'utf8'))
    const progress = JSON.parse(fs.readFileSync(`${dir}/progress.json`, 'utf8'))
    const untouched = realPlan.leetcode.find((item) => !progress.leetcode.some((got) => got.id === item.id))
    if (untouched) {
      addAttempts(realPlan, progress, { id: untouched.id, attempts: [attempt({ date: '2099-01-05' })] })
      expect(progress.leetcode.at(-1)).toMatchObject({ id: untouched.id, title: untouched.title, url: untouched.url, status: 'solved-self' })
    }
    describeDay(realPlan, progress, { summary: 'проверка команды', today: '2099-01-05' })
    expect(progress.days.find((d) => d.day === progress.position.currentDay).summary).toBe('проверка команды')
    const house = realPlan.camp.find((item) => !item.path.includes('*') && !progress.days.some((d) => (d.artifacts ?? []).some((a) => a.path === item.path)))
    if (house) expect(setArtifact(realPlan, progress, { path: house.path, state: 'saved' })).not.toMatch(/Внимание/)
    addObservation(progress, { text: 'проверка команды записи', today: '2099-01-05' })
    expect(progress.observations.at(-1)).toBe('проверка команды записи')
    expect(progress.meta.updatedAt).toBe('2099-01-05')
  })
})

describe('команда целиком', () => {
  const COMMANDS = [
    'session', 'steps', 'day', 'artifact', 'check', 'mistake', 'beaten', 'todo', 'observation', 'problem', 'weekly', 'week', 'baseline',
    'ci', 'event', 'break', 'pause', 'card', 'offplan', 'sync', 'purchase', 'repair', 'ledger', 'town', 'deck',
  ]
  const DATA = ['data/purchases.json', 'data/town.json', 'data/deck.json', 'data/offplan.json']
  const cli = (argv, env = {}) => {
    const run = spawnSync(process.execPath, ['scripts/record.mjs', ...argv], { encoding: 'utf8', env: { ...process.env, ...env } })
    return { out: run.stdout + run.stderr, code: run.status }
  }
  const cycleDir = `data/cycles/${fs.readdirSync('data/cycles').sort().at(-1)}`
  const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8')

  it('help называет каждую команду и даёт к ней пример', () => {
    const { out, code } = cli(['help'])
    expect(code).toBe(0)
    for (const name of COMMANDS) expect(out, name).toContain(`${name} --`)
    for (const name of COMMANDS.filter((item) => item !== 'repair')) expect(out, name).toMatch(new RegExp(`^  ${name} `, 'm'))
  })

  it('каждая команда из help есть; незнакомые команда и ключ, ключ без значения — ошибка', () => {
    for (const name of COMMANDS) expect(cli([name, '--dry']).out, name).not.toMatch(/команды «/)
    expect(cli(['quest', '--dry'])).toMatchObject({ code: 1, out: expect.stringMatching(/Не записано: команды «quest» нет/) })
    expect(cli(['problem', '--id', '217', '--note', 'заметка', '--dry'])).toMatchObject({ code: 1, out: expect.stringMatching(/у команды problem нет ключа --note\. Есть: --id, --date, --kind/) })
    expect(cli(['todo', '--add', '--dry'])).toMatchObject({ code: 1, out: expect.stringMatching(/у ключа --add нет значения/) })
    expect(cli(['week', '--n', 'первая', '--date', '2026-11-20', '--dry'])).toMatchObject({ code: 1, out: expect.stringMatching(/--n: нужно число/) })
    expect(cli(['observation', '--text', 'проба', '--cycle', '99-нет'])).toMatchObject({ code: 1, out: expect.stringMatching(/цикла «99-нет» нет/) })
  })

  it('пробный запуск на настоящих данных показывает итог и ничего не пишет', () => {
    const watched = [...DATA, `${cycleDir}/progress.json`]
    const before = watched.map((file) => read('.', file))
    const text = `проба команды записи ${Date.now()}`
    expect(cli(['observation', '--text', text, '--date', '2099-01-05', '--dry'])).toMatchObject({ code: 0, out: expect.stringMatching(/Наблюдение записано[^]*Пробный запуск: .*progress\.json — без изменений на диске\./) })
    const record = JSON.stringify({ town: [{ at: '2099-01-05T10:00:00', do: 'tier' }], deck: { reviews: [{ card: '2099-01-05-proba', at: '2099-01-05T10:00:00.000Z', ok: true }] } })
    expect(cli(['sync', '--json', record, '--dry'])).toMatchObject({ code: 0, out: expect.stringMatching(/Город\. Действий добавлено: 1[^]*Колода\. Ответов по карточкам добавлено: 1[^]*Пробный запуск: data\/town\.json, data\/deck\.json/) })
    expect(watched.map((file) => read('.', file))).toEqual(before)
  })

  it('настоящая запись — в копии данных: файлы пишутся, повтор их не трогает, негодная запись не меняет ни одного', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'record-test-'))
    try {
      fs.cpSync('data', path.join(root, 'data'), { recursive: true })
      fs.mkdirSync(path.join(root, 'src/game'), { recursive: true })
      fs.copyFileSync('src/game/shop.ts', path.join(root, 'src/game/shop.ts'))
      const env = { RECORD_ROOT: root }
      const real = [...DATA, `${cycleDir}/progress.json`].map((file) => read('.', file))
      const progressFile = `${cycleDir}/progress.json`

      const text = `проба команды записи ${Date.now()}`
      expect(cli(['observation', '--text', text, '--date', '2099-01-05'], env)).toMatchObject({ code: 0, out: expect.stringMatching(/Записано в .*progress\.json\. Проверь: npm test/) })
      const progress = JSON.parse(read(root, progressFile))
      expect(progress.observations.at(-1)).toBe(text)
      expect(progress.meta.updatedAt).toBe('2099-01-05')
      expect(read(root, progressFile).endsWith('}\n')).toBe(true)
      expect(cli(['observation', '--text', text], env)).toMatchObject({ code: 1, out: expect.stringMatching(/Не записано: такое наблюдение уже записано/) })

      // итог дня вместе со статусом: итог ложится в закрытый день, а не в следующий
      const day = progress.position.currentDay
      expect(cli(['day', '--status', 'core', '--date', '2099-01-05', '--summary', 'проба: день закрыт', '--minutes', '75'], env).code).toBe(0)
      const closed = JSON.parse(read(root, progressFile)).days.find((d) => d.day === day)
      expect(closed).toMatchObject({ status: 'core', summary: 'проба: день закрыт', wallClockMinutes: 75 })

      // задача, CI с событием и артефакт: берём то, чего в журнале ещё нет
      const planData = JSON.parse(read(root, `${cycleDir}/plan.json`))
      const journal = () => JSON.parse(read(root, progressFile))
      const untouched = planData.leetcode.find((item) => !journal().leetcode.some((got) => got.id === item.id))
      if (untouched) {
        const id = String(untouched.id)
        expect(cli(['problem', '--id', id, '--date', '2099-01-05', '--kind', 'timed-20', '--minutes', '14', '--result', 'solved', '--self', 'yes', '--approach', 'проба'], env).code).toBe(0)
        expect(journal().leetcode.at(-1)).toMatchObject({
          id: untouched.id,
          status: 'solved-self',
          attempts: [{ date: '2099-01-05', kind: 'timed-20', minutes: 14, result: 'solved', selfSolved: true, approach: 'проба' }],
        })
        const repeat = JSON.stringify([{ date: '2099-01-12', kind: 'from-empty-editor', minutes: 9, result: 'solved', selfSolved: true }])
        expect(cli(['problem', '--id', id, '--json', repeat], env).code).toBe(0)
        expect(journal().leetcode.at(-1)).toMatchObject({ status: 'repeated-from-empty', attempts: [{ kind: 'timed-20' }, { kind: 'from-empty-editor' }] })
        expect(cli(['problem', '--id', id, '--json', repeat], env)).toMatchObject({ code: 1, out: expect.stringMatching(/уже записана/) })
        expect(journal().leetcode.at(-1).attempts).toHaveLength(2)
      }
      if (!Object.values(journal().petProject?.ci ?? {}).includes('green')) {
        expect(cli(['ci', '--workflow', 'hello', '--state', 'green', '--date', '2099-01-05'], env).code).toBe(0)
        expect(journal().petProject.ci.helloWorldWorkflow).toBe('green')
      }
      expect(cli(['event', '--type', 'ci-fixed', '--date', '2099-01-06', '--note', 'проба'], env).code).toBe(0)
      expect(journal().events.at(-1)).toEqual({ date: '2099-01-06', type: 'ci-fixed', note: 'проба' })
      const house = planData.camp.find((item) => !item.path.includes('*') && !journal().days.some((d) => (d.artifacts ?? []).some((a) => a.path === item.path)))
      if (house) {
        const recorded = () => journal().days.flatMap((d) => d.artifacts ?? []).filter((a) => a.path === house.path)
        expect(cli(['artifact', '--path', house.path, '--state', 'not-saved', '--repo', house.repo], env).code).toBe(0)
        expect(cli(['artifact', '--path', house.path, '--state', 'saved'], env)).toMatchObject({ code: 0, out: expect.stringMatching(/not-saved → saved/) })
        expect(recorded()).toEqual([{ repo: house.repo, path: house.path, state: 'saved' }])
      }

      // единая запись: два файла меняются, третий нет
      const track = planData.tracks[0].code
      const own = { date: '2099-01-05', track, question: `Проба команды записи ${Date.now()}?`, answer: 'Да.', source: 'note' }
      const record = { town: [{ at: '2099-01-05T10:00:00', do: 'tier' }], deck: { cards: [own] } }
      const ledgerBefore = read(root, 'data/purchases.json')
      expect(cli(['sync', '--json', JSON.stringify(record)], env)).toMatchObject({ code: 0, out: expect.stringMatching(/Записано в data\/town\.json, data\/deck\.json\./) })
      expect(JSON.parse(read(root, 'data/town.json')).actions).toContainEqual({ at: '2099-01-05T10:00:00', do: 'tier' })
      expect(JSON.parse(read(root, 'data/deck.json')).cards).toContainEqual(own)
      expect(read(root, 'data/purchases.json')).toBe(ledgerBefore)
      // повтор: всё уже записано
      const synced = DATA.map((file) => read(root, file))
      expect(cli(['sync', '--json', JSON.stringify(record)], env)).toMatchObject({ code: 0, out: expect.stringMatching(/Данные не изменились: файлы не тронуты\./) })
      // негодная колода: город в той же записи годный, но не пишется и он
      const broken = { town: [{ at: '2099-01-06T10:00:00', do: 'tier' }], deck: { cards: [{ ...own, question: 'Да' }] } }
      expect(cli(['sync', '--json', JSON.stringify(broken)], env)).toMatchObject({ code: 1, out: expect.stringMatching(/Не записано: колода: карточка 1: вопрос короче 3 знаков/) })
      expect(DATA.map((file) => read(root, file))).toEqual(synced)

      // своя карточка командой: та же проверка повтора, что в записи из браузера
      expect(cli(['card', '--date', '2099-01-06', '--track', track, '--q', own.question.toUpperCase(), '--a', 'Да.'], env)).toMatchObject({ code: 0, out: expect.stringMatching(/Карточка не добавлена, это повтор[^]*Данные не изменились/) })

      // настоящие данные всё это время не менялись
      expect([...DATA, progressFile].map((file) => read('.', file))).toEqual(real)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
