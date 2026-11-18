// Запись в данные сайта одной командой: чистые функции для scripts/record.mjs.
// Каждая функция проверяет ввод, меняет переданный объект и возвращает строку-итог.
// При ошибке бросает RecordError и ничего не меняет.

export class RecordError extends Error {}

const fail = (message) => {
  throw new RecordError(message)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isDate = (value) => typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value))
const needDate = (value, name) => (isDate(value) ? value : fail(`${name}: нужна дата ГГГГ-ММ-ДД, получено «${value ?? ''}»`))
const needText = (value, name) => (typeof value === 'string' && value.trim() ? value.trim() : fail(`${name}: нужен непустой текст`))
const needTime = (value, name) => (value == null ? null : TIME.test(value) ? value : fail(`${name}: нужно время ЧЧ:ММ, получено «${value}»`))

export const DAY_STATUSES = ['minimum', 'core', 'extension', 'skipped']
const CLOSED = ['minimum', 'core', 'extension']
export const TOWN_DOES = ['tier', 'build', 'upgrade', 'trade']
const GOODS = ['food', 'wood', 'brick']
export const OFFPLAN_KINDS = ['video', 'article', 'meetup', 'mock-interview', 'session', 'artifact', 'problem-self', 'problem-walkthrough']
/** Сколько выводов нужно, чтобы запись засчиталась: как в src/game/side.ts. */
const TAKEAWAYS = { video: 2, article: 2, meetup: 2, 'mock-interview': 3 }
const VERDICTS = ['correct', 'partial', 'wrong']

/** Дата последней правки не уходит назад. */
const touch = (progress, date) => {
  if (date && !(progress.meta.updatedAt > date)) progress.meta.updatedAt = date
}

const planDay = (plan, n) => plan.days.find((d) => d.day === n) ?? fail(`в плане нет дня ${n}`)
const needTrack = (plan, code) => (plan.tracks.some((t) => t.code === code) ? code : fail(`трек «${code ?? ''}»: такого нет, есть ${plan.tracks.map((t) => t.code).join(', ')}`))

/** Запись дня в журнале; если её нет — заводит начатый день. */
function dayRecord(progress, n, date) {
  let record = progress.days.find((d) => d.day === n)
  if (!record) {
    record = { day: n, status: 'in_progress', dates: [], confirmed: true, stepsDone: [] }
    progress.days.push(record)
    progress.days.sort((a, b) => a.day - b.day)
  }
  if (date && !record.dates.includes(date)) {
    record.dates.push(date)
    record.dates.sort()
  }
  return record
}

/** Занятие: строка в sessions и дата в записи дня. */
export function addSession(plan, progress, input) {
  const date = needDate(input.date, 'date')
  const from = needTime(input.from, 'from')
  const to = needTime(input.to, 'to')
  if (from && to && to <= from) fail(`время: конец ${to} не позже начала ${from}`)
  const day = input.day ?? progress.position.currentDay
  planDay(plan, day)
  const topics = (input.topics ?? []).map((topic) => needText(topic, 'topic'))
  if (!topics.length) fail('нужна хотя бы одна тема занятия (--topic)')
  if (progress.sessions.some((s) => s.date === date && s.from === from)) fail(`занятие ${date}${from ? ' с ' + from : ''} уже записано`)
  progress.sessions.push({ date, from, to, day, topics })
  progress.sessions.sort((a, b) => (a.date + (a.from ?? '')).localeCompare(b.date + (b.from ?? '')))
  dayRecord(progress, day, date)
  touch(progress, date)
  return `Занятие ${date}${from ? ' ' + from : ''}${to ? '–' + to : ''} записано: день ${day}, тем ${topics.length}.`
}

/** Шаги дня сделаны: stepsDone, stepsOpen и позиция. */
export function markSteps(plan, progress, input) {
  const day = input.day ?? progress.position.currentDay
  const steps = planDay(plan, day).steps ?? []
  const done = input.done ?? []
  if (!done.length) fail('нужны номера шагов (--done 2,3)')
  for (const n of done) if (!steps.some((s) => s.n === n)) fail(`в дне ${day} нет шага ${n}: есть ${steps.map((s) => s.n).join(', ')}`)
  const date = input.date === undefined ? undefined : needDate(input.date, 'date')
  const record = dayRecord(progress, day, date)
  record.stepsDone = [...new Set([...(record.stepsDone ?? []), ...done])].sort((a, b) => a - b)
  if (record.stepsOpen) record.stepsOpen = record.stepsOpen.filter((s) => !record.stepsDone.includes(s.n))
  const next = steps.find((s) => !record.stepsDone.includes(s.n))
  if (day === progress.position.currentDay && next) {
    progress.position.currentStep = next.n
    delete progress.position.currentStepTitle
  }
  touch(progress, date)
  return next
    ? `День ${day}: сделаны шаги ${record.stepsDone.join(', ')}. Дальше шаг ${next.n}.`
    : `День ${day}: сделаны все шаги (${record.stepsDone.join(', ')}). Закрой день командой day.`
}

/** День закрыт (minimum, core, extension) или пропущен (skipped); позиция уходит на следующий день. */
export function closeDay(plan, progress, input) {
  const day = input.day ?? progress.position.currentDay
  planDay(plan, day)
  if (!DAY_STATUSES.includes(input.status)) fail(`статус «${input.status ?? ''}»: нужен один из ${DAY_STATUSES.join(', ')}`)
  const date = input.status === 'skipped' && input.date === undefined ? undefined : needDate(input.date, 'date')
  const record = dayRecord(progress, day, input.status === 'skipped' ? undefined : date)
  record.status = input.status
  if (input.status === 'core' || input.status === 'extension') delete record.stepsOpen
  progress.position.daysDone = progress.days.filter((d) => CLOSED.includes(d.status)).length
  const next = plan.days.find((d) => d.day > day)
  if (day === progress.position.currentDay && next) {
    progress.position.currentDay = next.day
    progress.position.currentStep = next.steps?.[0]?.n ?? 1
    delete progress.position.currentStepTitle
  }
  touch(progress, date)
  return `День ${day}: статус ${input.status}. Закрыто дней: ${progress.position.daysDone} из ${progress.position.daysTotal}. Позиция: день ${progress.position.currentDay}, шаг ${progress.position.currentStep}.`
}

/** Плановый перерыв. Лимит рабочих дней на цикл проверяет npm test. */
export function addBreak(progress, input) {
  const from = needDate(input.from, 'from')
  const to = needDate(input.to, 'to')
  if (to < from) fail(`перерыв: конец ${to} раньше начала ${from}`)
  const breaks = progress.breaks ?? []
  const clash = breaks.find((item) => item.from <= to && from <= item.to)
  if (clash) fail(`перерыв пересекается с уже записанным ${clash.from} — ${clash.to}`)
  const item = { from, to }
  if (input.reason) item.reason = needText(input.reason, 'reason')
  progress.breaks = [...breaks, item].sort((a, b) => a.from.localeCompare(b.from))
  touch(progress, input.today)
  return `Плановый перерыв ${from} — ${to} записан. Лимит рабочих дней на цикл проверит npm test.`
}

/** Проверка понимания: первый ответ как есть и вердикт. */
export function addCheck(plan, progress, input) {
  const date = needDate(input.date, 'date')
  if (!VERDICTS.includes(input.verdict)) fail(`вердикт «${input.verdict ?? ''}»: нужен один из ${VERDICTS.join(', ')}`)
  progress.knowledgeChecks.push({
    date,
    track: needTrack(plan, input.track),
    question: needText(input.question, 'question'),
    firstAnswer: needText(input.firstAnswer, 'first'),
    verdict: input.verdict,
    answer: needText(input.answer, 'answer'),
  })
  touch(progress, date)
  return `Проверка понимания записана: трек ${input.track}, вердикт ${input.verdict}.`
}

/** Ошибка: что забыл или перепутал. */
export function addMistake(plan, progress, input) {
  const date = needDate(input.date, 'date')
  if (input.problemId != null && !plan.leetcode.some((p) => p.id === input.problemId)) fail(`в плане нет задачи ${input.problemId}`)
  progress.mistakes.push({ date, track: needTrack(plan, input.track), problemId: input.problemId ?? null, text: needText(input.text, 'text') })
  touch(progress, date)
  return `Ошибка записана: трек ${input.track}.`
}

/** Хвосты прошлых занятий: добавить или снять по номеру (с единицы). */
export function editTodo(progress, input) {
  if (input.add !== undefined) {
    progress.openItems.push(needText(input.add, 'add'))
    touch(progress, input.today)
    return `Хвост записан, всего ${progress.openItems.length}.`
  }
  const index = input.done
  if (!Number.isInteger(index) || index < 1 || index > progress.openItems.length) fail(`хвост №${index}: есть номера с 1 по ${progress.openItems.length}`)
  const [removed] = progress.openItems.splice(index - 1, 1)
  touch(progress, input.today)
  return `Хвост снят: «${removed}». Осталось ${progress.openItems.length}.`
}

/** Покупка или ремонт из лавки, data/purchases.json. shopIds — id предметов из src/game/shop.ts. */
export function addPurchase(ledger, shopIds, input) {
  const date = needDate(input.date, 'date')
  if (!shopIds.includes(input.item)) fail(`предмет «${input.item ?? ''}»: такого в лавке нет, есть ${shopIds.join(', ')}`)
  const list = input.repair ? ledger.repairs : ledger.purchases
  if (!input.repair && list.some((p) => p.item === input.item)) fail(`«${input.item}» уже куплен`)
  if (input.repair && list.some((p) => p.item === input.item && p.date === date)) fail(`ремонт «${input.item}» за ${date} уже записан`)
  list.push({ item: input.item, date })
  return `${input.repair ? 'Ремонт' : 'Покупка'} записан${input.repair ? '' : 'а'}: ${input.item}, ${date}. Баланс проверит npm test.`
}

/** Журнал действий в городе, data/town.json: записи с сайта добавляются как есть, повторы пропускаются. */
export function addTownActions(file, actions) {
  if (!Array.isArray(actions) || !actions.length) fail('нужен непустой список действий')
  const clean = actions.map((action, i) => {
    const where = `действие ${i + 1}`
    if (!action || typeof action.at !== 'string' || Number.isNaN(Date.parse(action.at))) fail(`${where}: поле at — время ISO`)
    if (!TOWN_DOES.includes(action.do)) fail(`${where}: поле do — одно из ${TOWN_DOES.join(', ')}`)
    if (action.do === 'build' && !action.type) fail(`${where}: у стройки нужен type`)
    if (action.do === 'upgrade' && !action.id) fail(`${where}: у улучшения нужен id`)
    if (action.do === 'trade' && !GOODS.includes(action.type)) fail(`${where}: у обмена type — ${GOODS.join(', ')}`)
    const item = { at: action.at, do: action.do }
    if (action.type) item.type = action.type
    if (action.id) item.id = action.id
    return item
  })
  const key = (a) => `${a.at}|${a.do}|${a.type ?? ''}|${a.id ?? ''}`
  const known = new Set(file.actions.map(key))
  const fresh = clean.filter((a) => !known.has(key(a)) && known.add(key(a)))
  file.actions.push(...fresh)
  file.actions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return `Действий добавлено: ${fresh.length}, уже были в журнале: ${clean.length - fresh.length}.`
}

/** Стороннее развитие, data/offplan.json. Без нужного числа выводов запись не принимается. */
export function addOffplan(plan, file, input) {
  const date = needDate(input.date, 'date')
  if (!OFFPLAN_KINDS.includes(input.kind)) fail(`kind «${input.kind ?? ''}»: нужен один из ${OFFPLAN_KINDS.join(', ')}`)
  const takeaways = (input.takeaways ?? []).map((text) => needText(text, 'takeaway'))
  const need = TAKEAWAYS[input.kind] ?? 0
  if (takeaways.length < need) fail(`для ${input.kind} нужно выводов: ${need}, получено ${takeaways.length}. Спроси их у Baudi, не придумывай`)
  const entry = { date, kind: input.kind, title: needText(input.title, 'title') }
  if (input.source) entry.source = needText(input.source, 'source')
  if (input.track) entry.track = needTrack(plan, input.track)
  if (input.minutes !== undefined) entry.minutes = Number.isFinite(input.minutes) && input.minutes > 0 ? input.minutes : fail('minutes: нужно число минут')
  if (input.with) entry.with = needText(input.with, 'with')
  if (takeaways.length) entry.takeaways = takeaways
  file.entries.push(entry)
  file.entries.sort((a, b) => a.date.localeCompare(b.date))
  return `Стороннее развитие записано: ${input.kind}, «${entry.title}», выводов ${takeaways.length}.`
}
