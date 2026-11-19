// Запись в данные сайта одной командой: чистые функции для scripts/record.mjs.
// Каждая функция проверяет ввод, меняет переданный объект и возвращает строку-итог.
// При ошибке бросает RecordError и ничего не меняет.
// Строка «Внимание: …» в итоге — предупреждение: запись сделана, но её стоит перепроверить.

export class RecordError extends Error {}

const fail = (message) => {
  throw new RecordError(message)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_MS = 86_400_000
/** Дата ГГГГ-ММ-ДД, которая есть в календаре: 2026-02-30 не проходит. */
const isDate = (value) => {
  if (typeof value !== 'string' || !ISO.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}
/** Номер дня по календарю: разность двух таких чисел — дни между датами. */
const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS
const needDate = (value, name) => (isDate(value) ? value : fail(`${name}: нужна дата ГГГГ-ММ-ДД, получено «${value ?? ''}»`))
const needText = (value, name) => (typeof value === 'string' && value.trim() ? value.trim() : fail(`${name}: нужен непустой текст`))
const needTime = (value, name) => (value == null ? null : TIME.test(value) ? value : fail(`${name}: нужно время ЧЧ:ММ, получено «${value}»`))
const needMinutes = (value, name) => (Number.isFinite(value) && value > 0 ? value : fail(`${name}: нужно число минут больше нуля`))
/** Текст без лишних пробелов: края обрезаны, пробелы внутри схлопнуты — как tidy в src/game/rewards.ts. */
const tidy = (text) => text.trim().replace(/\s+/g, ' ')

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
const needTrack = (plan, code, where = '') =>
  plan.tracks.some((t) => t.code === code) ? code : fail(`${where}трек «${code ?? ''}»: такого нет, есть ${plan.tracks.map((t) => t.code).join(', ')}`)

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

/**
 * Занятие: строка в sessions и дата в записи дня.
 * Занятие, записанное в начале без времени конца, можно дописать: та же дата и то же начало, теперь с концом.
 */
export function addSession(plan, progress, input) {
  const date = needDate(input.date, 'date')
  const from = needTime(input.from, 'from')
  const to = needTime(input.to, 'to')
  if (from && to && to <= from) fail(`время: конец ${to} не позже начала ${from}`)
  const topics = (input.topics ?? []).map((topic) => needText(topic, 'topic'))
  const known = progress.sessions.find((s) => s.date === date && s.from === from)
  if (known && from && to && known.to == null) {
    if (input.day !== undefined && input.day !== known.day) fail(`занятие ${date} с ${from} записано в дне ${known.day}, а не ${input.day}`)
    known.to = to
    known.topics = [...new Set([...known.topics, ...topics])]
    touch(progress, date)
    return `Занятие ${date} ${from}–${to} дописано: день ${known.day}, тем ${known.topics.length}.`
  }
  const day = input.day ?? progress.position.currentDay
  planDay(plan, day)
  if (!topics.length) fail('нужна хотя бы одна тема занятия (--topic)')
  if (known) fail(`занятие ${date}${from ? ' с ' + from : ''} уже записано`)
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

/**
 * Запись из лавки (кнопка «Скопировать запись»): покупки, ремонты, свои награды, их выкупы и памятные знаки.
 * Сначала проверяется вся запись, потом добавляется; повторы пропускаются.
 */
export function mergeLedger(file, shopIds, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('нужна запись из лавки: объект с полями purchases, repairs, rewards, redeemed, signs')
  const text = (value) => typeof value === 'string' && value.trim() !== ''
  const price = (value) => Number.isInteger(value) && value > 0
  const bought = (p) => shopIds.includes(p.item) && isDate(p.date)
  const rules = {
    purchases: { title: 'покупок', key: (p) => p.item, ok: bought },
    repairs: { title: 'ремонтов', key: (p) => `${p.item}|${p.date}`, ok: bought },
    rewards: { title: 'наград в список', key: (r) => r.id, ok: (r) => text(r.id) && text(r.name) && price(r.gems) },
    redeemed: { title: 'выкупов', key: (r) => `${r.at}|${r.name}`, ok: (r) => text(r.at) && !Number.isNaN(Date.parse(r.at)) && text(r.name) && price(r.gems) },
    signs: { title: 'знаков', key: (s) => `${s.cycle}|${s.day}`, ok: (s) => text(s.cycle) && Number.isInteger(s.day) && text(s.text) && isDate(s.date) },
  }
  for (const [name, rule] of Object.entries(rules)) {
    const incoming = record[name] ?? []
    if (!Array.isArray(incoming)) fail(`${name}: нужен список`)
    incoming.forEach((item, i) => {
      if (!item || typeof item !== 'object' || !rule.ok(item)) fail(`${name}, запись ${i + 1}: не тот формат`)
    })
  }
  const added = []
  let repeats = 0
  for (const [name, rule] of Object.entries(rules)) {
    file[name] ??= []
    const known = new Set(file[name].map(rule.key))
    const incoming = record[name] ?? []
    const fresh = incoming.filter((item) => !known.has(rule.key(item)) && known.add(rule.key(item)))
    file[name].push(...fresh)
    added.push(`${rule.title} ${fresh.length}`)
    repeats += incoming.length - fresh.length
  }
  return `Из лавки добавлено: ${added.join(', ')}; уже были: ${repeats}. Баланс и места знаков проверит npm test.`
}

function checkReviews(reviews) {
  reviews.forEach((review, i) => {
    const ok = review && typeof review.card === 'string' && review.card && typeof review.at === 'string' && !Number.isNaN(Date.parse(review.at)) && typeof review.ok === 'boolean'
    if (!ok) fail(`ответ ${i + 1}: нужны card, at (время ISO) и ok (true или false)`)
  })
}

/** Добавляет проверенные ответы; возвращает, сколько из них новых. */
function pushReviews(file, reviews) {
  file.reviews ??= []
  const key = (r) => `${r.card}|${r.at}`
  const known = new Set(file.reviews.map(key))
  const fresh = reviews.filter((r) => !known.has(key(r)) && known.add(key(r))).map((r) => ({ card: r.card, at: r.at, ok: r.ok }))
  file.reviews.push(...fresh)
  file.reviews.sort((a, b) => a.at.localeCompare(b.at))
  return fresh.length
}

/** Ответы по карточкам колоды с сайта, data/deck.json: добавляются как есть, повторы пропускаются. */
export function addDeckReviews(file, reviews) {
  if (!Array.isArray(reviews) || !reviews.length) fail('нужен непустой список ответов по карточкам')
  checkReviews(reviews)
  const added = pushReviews(file, reviews)
  return `Ответов по карточкам добавлено: ${added}, уже были: ${reviews.length - added}. Что карточки существуют, проверит npm test.`
}

// --- Свои карточки колоды, data/deck.json → cards ---

/** Границы своей карточки — как в src/game/deck.ts: по ним же data/deck.json проверяет npm test. */
const CARD = { questionMin: 3, questionMax: 200, answerMax: 600, perDay: 5 }
const CARD_SOURCES = ['note', 'mistake']
const sameQuestion = (a, b) => typeof a === 'string' && typeof b === 'string' && tidy(a).toLowerCase() === tidy(b).toLowerCase()

/**
 * Своя карточка в том виде, в каком она ляжет в файл: тексты обрезаны и со схлопнутыми пробелами,
 * поля по порядку date, track, question, answer, source и mistake. От текста вопроса сайт считает номер карточки.
 */
function cleanCard(plan, raw, where) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${where}: нужен объект с полями date, track, question, answer, source`)
  const date = needDate(raw.date, `${where}: date`)
  const question = typeof raw.question === 'string' ? tidy(raw.question) : ''
  if (question.length < CARD.questionMin) fail(`${where}: вопрос короче ${CARD.questionMin} знаков`)
  if (question.length > CARD.questionMax) fail(`${where}: вопрос длиннее ${CARD.questionMax} знаков, сейчас ${question.length}`)
  const answer = typeof raw.answer === 'string' ? tidy(raw.answer) : ''
  if (!answer) fail(`${where}: нужен ответ`)
  if (answer.length > CARD.answerMax) fail(`${where}: ответ длиннее ${CARD.answerMax} знаков, сейчас ${answer.length}`)
  const track = needTrack(plan, raw.track, `${where}: `)
  if (!CARD_SOURCES.includes(raw.source)) fail(`${where}: источник «${raw.source ?? ''}»: нужен note (из заметок) или mistake (из журнала ошибок)`)
  const card = { date, track, question, answer, source: raw.source }
  if (raw.source === 'mistake') {
    const mistake = typeof raw.mistake === 'string' ? tidy(raw.mistake) : ''
    if (!mistake) fail(`${where}: у карточки из ошибки должен быть текст ошибки (mistake)`)
    card.mistake = mistake
  }
  return card
}

/** Почему карточка — повтор: тот же вопрос уже есть, пусть с другой датой, регистром букв или пробелами. null — не повтор. */
function cardRepeat(card, cards, checks) {
  const twin = cards.find((other) => sameQuestion(other.question, card.question))
  if (twin) return `такой вопрос уже есть среди своих карточек (${twin.date})`
  const check = checks.find((other) => sameQuestion(other.question, card.question))
  return check ? `такой вопрос уже есть среди проверок понимания (${check.date})` : null
}

/** Кладёт проверенные карточки в список: повторы пропускает, шестую за одну дату не принимает. */
function placeCards(cards, checks, incoming, where) {
  const skipped = []
  let added = 0
  incoming.forEach((card, i) => {
    const repeat = cardRepeat(card, cards, checks)
    if (repeat) return skipped.push(`«${card.question}» — ${repeat}`)
    if (cards.filter((other) => other.date === card.date).length >= CARD.perDay) {
      fail(`${where(i)}: за ${card.date} уже ${CARD.perDay} своих карточек, больше на одну дату сайт не принимает: колода растёт от учёбы, а не от набивания`)
    }
    cards.push(card)
    added++
  })
  cards.sort((a, b) => a.date.localeCompare(b.date))
  return { added, skipped }
}

/**
 * Своя карточка колоды. checks — проверки понимания всех циклов: вопрос, который уже есть там или среди карточек, — повтор.
 * С номером ошибки (с единицы, по порядку в mistakes) карточка делается из журнала ошибок: текст ошибки и трек берутся оттуда.
 */
export function addCard(plan, progress, file, checks, input) {
  const raw = { date: input.date, track: input.track, question: input.question, answer: input.answer, source: 'note' }
  if (input.mistake !== undefined) {
    const n = input.mistake
    if (!Number.isInteger(n) || n < 1 || n > progress.mistakes.length) fail(`ошибка №${n}: есть номера с 1 по ${progress.mistakes.length}`)
    const mistake = progress.mistakes[n - 1]
    Object.assign(raw, { source: 'mistake', mistake: mistake.text, track: input.track ?? mistake.track })
  }
  const card = cleanCard(plan, raw, 'карточка')
  const cards = [...(file.cards ?? [])]
  const { added, skipped } = placeCards(cards, checks, [card], () => 'карточка')
  if (!added) return `Карточка не добавлена, это повтор: ${skipped[0]}.`
  file.cards = cards
  const sameDay = cards.filter((other) => other.date === card.date).length
  return `Своя карточка записана: трек ${card.track}, ${card.source === 'mistake' ? 'из журнала ошибок' : 'из заметок'}. Своих карточек за ${card.date}: ${sameDay} из ${CARD.perDay}.`
}

/**
 * Запись колоды с сайта: список ответов (старый вид) или объект { reviews, cards }.
 * Сначала проверяется вся запись, потом добавляется; повторы ответов и карточек пропускаются.
 */
export function mergeDeck(plan, file, checks, record) {
  const shape = Array.isArray(record) ? { reviews: record } : record
  if (!shape || typeof shape !== 'object') fail('нужна запись колоды: список ответов или объект с полями reviews и cards')
  const reviews = shape.reviews ?? []
  const incoming = shape.cards ?? []
  if (!Array.isArray(reviews)) fail('reviews: нужен список ответов по карточкам')
  if (!Array.isArray(incoming)) fail('cards: нужен список своих карточек')
  if (!reviews.length && !incoming.length) fail('нужен непустой список ответов по карточкам или своих карточек')
  checkReviews(reviews)
  const where = (i) => `карточка ${i + 1}`
  const cards = [...(file.cards ?? [])]
  const placed = placeCards(
    cards,
    checks,
    incoming.map((raw, i) => cleanCard(plan, raw, where(i))),
    where,
  )
  const added = pushReviews(file, reviews)
  if (incoming.length) file.cards = cards
  const repeats = placed.skipped.length ? ` (${placed.skipped.join('; ')})` : ''
  return `Ответов по карточкам добавлено: ${added}, уже были: ${reviews.length - added}. Своих карточек добавлено: ${placed.added}, пропущено повторов: ${placed.skipped.length}${repeats}. Что карточки ответов существуют, проверит npm test.`
}

// --- Единая запись из браузера ---

const SECTION_KEYS = ['ledger', 'town', 'deck']
const LEDGER_KEYS = ['purchases', 'repairs', 'rewards', 'redeemed', 'signs']
const DECK_KEYS = ['reviews', 'cards']
const ACTION_KEYS = ['at', 'do', 'type', 'id']
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * Разбирает запись из браузера на разделы: ledger — лавка, town — действия города, deck — колода.
 * Понимает единую запись (формат — src/game/sync.ts) и старые виды: объект лавки, список действий города,
 * список ответов по карточкам, объект колоды. Пустые разделы не в счёт; незнакомое поле — ошибка, а не молчаливый пропуск.
 */
export function browserSections(record) {
  let parts
  if (Array.isArray(record)) {
    if (!record.length) fail('в записи пусто: переносить нечего')
    if (record.every((item) => isObject(item) && 'do' in item)) parts = { town: record }
    else if (record.every((item) => isObject(item) && 'card' in item)) parts = { deck: { reviews: record } }
    else fail('не понять, что это за список: у действий города есть поле do, у ответов по карточкам — card')
  } else if (!isObject(record)) {
    fail('нужна запись из браузера: объект с разделами ledger, town, deck')
  } else {
    const keys = Object.keys(record)
    if (!keys.length) fail('в записи пусто: переносить нечего')
    const forms = [
      { name: 'единая запись (ledger, town, deck)', own: SECTION_KEYS, read: () => ({ ledger: record.ledger, town: record.town, deck: record.deck }) },
      { name: 'запись лавки', own: LEDGER_KEYS, read: () => ({ ledger: record }) },
      { name: 'запись колоды', own: DECK_KEYS, read: () => ({ deck: record }) },
      { name: 'журнал города', own: ['actions'], read: () => ({ town: record.actions }) },
      { name: 'действие города', own: ACTION_KEYS, read: () => ({ town: [record] }) },
    ].filter((form) => keys.some((key) => form.own.includes(key)))
    if (!forms.length) fail('в записи нет знакомых разделов: ledger, town, deck')
    if (forms.length > 1) fail(`в записи смешаны разные виды: ${forms.map((form) => form.name).join(', ')}. Нужен один`)
    const extra = keys.filter((key) => !forms[0].own.includes(key))
    if (extra.length) fail(`незнакомое поле «${extra[0]}»: ${forms[0].name} — это ${forms[0].own.join(', ')}`)
    parts = forms[0].read()
  }
  const inside = (name, value, own) => {
    if (!isObject(value)) fail(`${name}: нужен объект с полями ${own.join(', ')}`)
    const extra = Object.keys(value).filter((key) => !own.includes(key))
    if (extra.length) fail(`${name}: незнакомое поле «${extra[0]}», бывают ${own.join(', ')}`)
    for (const key of own) if (value[key] !== undefined && !Array.isArray(value[key])) fail(`${name}.${key}: нужен список`)
    return own.some((key) => value[key]?.length)
  }
  const filled = {}
  if (parts.ledger !== undefined && inside('ledger', parts.ledger, LEDGER_KEYS)) filled.ledger = parts.ledger
  if (parts.town !== undefined) {
    if (!Array.isArray(parts.town)) fail('town: нужен список действий города')
    if (parts.town.length) filled.town = parts.town
  }
  if (parts.deck !== undefined && inside('deck', parts.deck, DECK_KEYS)) filled.deck = parts.deck
  if (!Object.keys(filled).length) fail('в записи пусто: переносить нечего')
  return filled
}

/**
 * Запись из браузера целиком: files — { ledger, town, deck }, содержимое data/purchases.json, data/town.json и data/deck.json.
 * Разделы раскладываются теми же функциями, что у команд ledger, town и deck.
 * Запись применяется вся или никак: если хоть один раздел не прошёл проверку, ни один файл не меняется.
 */
export function syncBrowser(plan, files, shopIds, checks, record) {
  const parts = browserSections(record)
  const draft = structuredClone(files)
  const section = (name, run) => {
    try {
      return `${name}. ${run()}`
    } catch (error) {
      if (error instanceof RecordError) fail(`${name.toLowerCase()}: ${error.message}`)
      throw error
    }
  }
  const lines = []
  if (parts.ledger) lines.push(section('Лавка', () => mergeLedger(draft.ledger, shopIds, parts.ledger)))
  if (parts.town) lines.push(section('Город', () => addTownActions(draft.town, parts.town)))
  if (parts.deck) lines.push(section('Колода', () => mergeDeck(plan, draft.deck, checks, parts.deck)))
  for (const key of Object.keys(parts)) Object.assign(files[key], draft[key])
  return lines.join('\n')
}

/** Ошибка из журнала побеждена: при повторе задачи не повторилась. Номер — с единицы, по порядку в mistakes. */
export function beatMistake(progress, input) {
  const index = input.n
  if (!Number.isInteger(index) || index < 1 || index > progress.mistakes.length) fail(`ошибка №${index}: есть номера с 1 по ${progress.mistakes.length}`)
  const mistake = progress.mistakes[index - 1]
  if (mistake.beaten) fail(`ошибка №${index} уже отмечена побеждённой`)
  mistake.beaten = true
  touch(progress, input.date === undefined ? input.today : needDate(input.date, 'date'))
  return `Ошибка побеждена: «${mistake.text}».`
}

// --- Задачи LeetCode, progress.json → leetcode ---

/** Попытка на время: timed-20 — на таймере, optimal-10 — заход на оптимальное решение. Число — лимит минут. */
const TIMED_KIND = /^(timed|optimal)-[1-9]\d*$/
const PLAIN_KINDS = ['rewrite-after-walkthrough', 'from-empty-editor', 'no-hints', 'duel']
export const ATTEMPT_KINDS = ['timed-<минут>', 'optimal-<минут>', ...PLAIN_KINDS]
const ATTEMPT_RESULTS = ['solved', 'not-solved']
/** Повторы: в зачёт идут только решённые без подсказок и только в другой день, после решения. */
const REPEAT_KINDS = ['from-empty-editor', 'no-hints']
/** Статусы задачи по возрастанию. Команда статус только поднимает. */
export const PROBLEM_STATUSES = ['solved-before-plan', 'solved-with-walkthrough', 'solved-self', 'repeated-from-empty', 'solved-no-hints']
/** «Без подсказок» по плану — через две-три недели после решения. */
const NO_HINTS_GAP_DAYS = 14

/** Само решение задачи — на таймере или после разбора, а не повтор и не дуэль. */
const isBaseSolve = (a) => a.result === 'solved' && !REPEAT_KINDS.includes(a.kind) && a.kind !== 'duel'
const isTimed = (a) => typeof a.kind === 'string' && a.kind.startsWith('timed')

/**
 * Статус, который следует из попыток, — так, как их читает сайт (src/game/engine.ts, src/game/trophies.ts).
 * Решённый повтор с пустого редактора и решение без подсказок дают свои статусы. Иначе: был разбор — «с разбором»,
 * даже если до разбора задача решена сама перебором (очки сайт считает так же); разбора не было — «сама».
 * null — решённой попытки нет: такого статуса у сайта нет.
 */
export function statusFromAttempts(attempts) {
  const solved = attempts.filter((a) => a.result === 'solved')
  if (solved.some((a) => a.kind === 'no-hints')) return 'solved-no-hints'
  if (solved.some((a) => a.kind === 'from-empty-editor')) return 'repeated-from-empty'
  if (!solved.some(isBaseSolve)) return null
  const walkthrough = attempts.some((a) => a.kind === 'rewrite-after-walkthrough') || solved.some((a) => !a.selfSolved)
  return walkthrough ? 'solved-with-walkthrough' : 'solved-self'
}

/** Попытка в том виде, в каком она ляжет в файл. */
function cleanAttempt(raw, where) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${where}: нужен объект с полями date, kind, result`)
  const date = needDate(raw.date, `${where}: date`)
  const kind = raw.kind
  if (typeof kind !== 'string' || !(TIMED_KIND.test(kind) || PLAIN_KINDS.includes(kind))) fail(`${where}: kind «${kind ?? ''}»: нужен один из ${ATTEMPT_KINDS.join(', ')}`)
  if (!ATTEMPT_RESULTS.includes(raw.result)) fail(`${where}: result «${raw.result ?? ''}»: нужен solved или not-solved`)
  const solved = raw.result === 'solved'
  const onTime = TIMED_KIND.test(kind)
  const minutes = raw.minutes == null ? null : needMinutes(raw.minutes, `${where}: minutes`)
  if (solved && minutes === null && (onTime || kind === 'duel')) fail(`${where}: у решённой попытки на время нужны минуты (minutes)`)
  let selfSolved = false
  if (!solved) {
    if (raw.selfSolved === true) fail(`${where}: не решена — значит, и не сама: selfSolved (--self) здесь только no`)
  } else if (kind === 'rewrite-after-walkthrough') {
    if (raw.selfSolved === true) fail(`${where}: переписал после разбора — это не «сам». Решил сам — запиши попытку на таймере`)
  } else {
    if (typeof raw.selfSolved !== 'boolean') fail(`${where}: скажи явно, сам решил или с подсказкой: selfSolved true или false (--self yes или --self no)`)
    if (!raw.selfSolved && !onTime) fail(`${where}: ${kind} засчитывается только без подсказок. Подглядывал — запиши result not-solved`)
    selfSolved = raw.selfSolved
  }
  const attempt = { date, kind, minutes, result: raw.result, selfSolved }
  if (raw.approach != null) attempt.approach = needText(raw.approach, `${where}: approach`)
  if (raw.notes != null) attempt.notes = needText(raw.notes, `${where}: notes`)
  return attempt
}

/** Решённые повтор и дуэль должны идти после решения, в другой день. attempts — все попытки задачи по порядку дат. */
function checkAttemptOrder(attempt, attempts, hadStatus, where) {
  if (attempt.result !== 'solved') return
  if (REPEAT_KINDS.includes(attempt.kind)) {
    const first = attempts.filter(isBaseSolve)[0]
    if (!first && !hadStatus) fail(`${where}: задача ещё не решена — повторять нечего. Сначала запиши само решение`)
    if (first && !(first.date < attempt.date)) fail(`${where}: повтор считается в другой день, после решения (${first.date})`)
  }
  if (attempt.kind === 'duel') {
    const first = attempts.find(isTimed)
    if (!first) fail(`${where}: дуэль сравнивают с первой попыткой на таймере, а её в журнале нет`)
    if (first.minutes == null) fail(`${where}: дуэль сравнивают с первой попыткой на таймере (${first.date}), а у неё не записаны минуты`)
    if (!(first.date < attempt.date)) fail(`${where}: дуэль — старая задача заново: нужна дата позже первой попытки на таймере (${first.date})`)
  }
}

const attemptOutcome = (a) => (a.result !== 'solved' ? 'не решил' : a.kind === 'rewrite-after-walkthrough' ? 'переписал после разбора' : a.selfSolved ? 'решил сам' : 'решил с подсказкой')

/**
 * Попытки по задаче LeetCode: одна или несколько за занятие, по порядку. Задача должна быть в плане;
 * записи о ней ещё нет — заводится с названием и ссылкой из плана. Статус выставляется по попыткам и не понижается.
 * note — заметка к задаче целиком (не к попытке).
 */
export function addAttempts(plan, progress, input) {
  const planned =
    plan.leetcode.find((p) => p.id === input.id) ??
    fail(`в плане нет задачи ${input.id ?? ''}. Задача вне плана — это стороннее развитие: offplan --kind problem-self или problem-walkthrough`)
  const record = progress.leetcode.find((p) => p.id === planned.id)
  const incoming = input.attempts ?? []
  if (!Array.isArray(incoming)) fail('попытки: нужен список')
  const note = input.note === undefined ? undefined : needText(input.note, 'problem-note')
  if (!incoming.length && note === undefined) fail('нужна попытка (--date, --kind, --result) или заметка к задаче (--problem-note)')
  if (!incoming.length && !record) fail(`у задачи ${planned.id} ещё нет записи: заметку добавь вместе с первой попыткой`)

  const before = record?.attempts ?? []
  const where = (i) => (incoming.length > 1 ? `попытка ${i + 1}` : 'попытка')
  const same = (a, b) => a.date === b.date && a.kind === b.kind && a.result === b.result && (a.minutes ?? null) === (b.minutes ?? null) && !!a.selfSolved === !!b.selfSolved
  const fresh = []
  incoming.forEach((raw, i) => {
    const attempt = cleanAttempt(raw, where(i))
    if ([...before, ...fresh].some((other) => same(other, attempt))) fail(`${where(i)}: уже записана (${attempt.date}, ${attempt.kind})`)
    fresh.push(attempt)
  })
  // Порядок по датам; внутри одного дня — как записывали.
  const attempts = [...before, ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  fresh.forEach((attempt, i) => checkAttemptOrder(attempt, attempts, !!record?.status, where(i)))

  const rank = (status) => PROBLEM_STATUSES.indexOf(status)
  const derived = statusFromAttempts(attempts)
  const status = rank(derived) > rank(record?.status) ? derived : record?.status
  if (!status) {
    fail(
      `задача ${planned.id}: решённой попытки нет, а статуса «пробовал, не решил» сайт не знает. ` +
        `Запиши её вместе с решением после разбора одной командой: problem --id ${planned.id} --json '[{попытка на таймере}, {rewrite-after-walkthrough}]'`,
    )
  }

  const remarks = []
  const firstTimed = attempts.find(isTimed)
  const firstSolve = attempts.filter(isBaseSolve)[0]
  for (const attempt of fresh) {
    if (attempt.result !== 'solved') continue
    const limit = Number(attempt.kind.split('-')[1])
    if (isTimed(attempt) && attempt.minutes > limit) {
      remarks.push(`Внимание: ${attempt.minutes} мин при таймере на ${limit} — в таймер не уложился, а сайт засчитает попытку как решённую на таймере. Проверь, что это так.`)
    }
    if (attempt.kind === 'no-hints' && firstSolve && dayNumber(attempt.date) - dayNumber(firstSolve.date) < NO_HINTS_GAP_DAYS) {
      remarks.push(`Внимание: после решения (${firstSolve.date}) прошло меньше ${NO_HINTS_GAP_DAYS} дней, а «без подсказок» по плану — через две-три недели.`)
    }
    if (attempt.kind === 'duel') {
      remarks.push(
        attempt.minutes < firstTimed.minutes
          ? `Дуэль с собой: ${attempt.minutes} мин против ${firstTimed.minutes} — быстрее, сайт её засчитает.`
          : `Дуэль с собой: ${attempt.minutes} мин против ${firstTimed.minutes} — не быстрее первой попытки, сайт её не засчитает.`,
      )
    }
  }
  // Разбор не позже первого своего решения делает задачу «решённой с разбором» (правило сайта: solvedAfterWalkthrough
  // в src/game/engine.ts). Разбор в другой день, после своего решения, очков не снижает.
  const isWalk = (a) => a.kind === 'rewrite-after-walkthrough'
  const firstSelf = attempts.find((a) => a.result === 'solved' && a.selfSolved && !isWalk(a))
  const walkedEarly = (list) => list.some((a) => isWalk(a) && !(firstSelf && firstSelf.date < a.date))
  if (record && rank(record.status) >= rank('solved-self') && !walkedEarly(before) && walkedEarly(fresh) && planned.role !== 'pair') {
    remarks.push(
      'Внимание: разбор записан тем же днём, что и своё решение, — сайт считает такую задачу решённой с разбором, очков за неё станет меньше. Разбор в другой день очков не снижает.',
    )
  }

  const was = record?.status
  if (record) {
    record.attempts = attempts
    record.status = status
    // Запланированный повтор сделан — напоминание больше не нужно.
    if (record.nextRepeat && fresh.some((a) => a.result === 'solved' && a.kind === record.nextRepeat.kind)) delete record.nextRepeat
    if (note !== undefined) record.notes = note
  } else {
    const item = { id: planned.id, title: planned.title ?? `Задача ${planned.id}` }
    if (planned.url) item.url = planned.url
    Object.assign(item, { status, attempts })
    if (note !== undefined) item.notes = note
    progress.leetcode.push(item)
  }
  touch(progress, fresh.length ? fresh.map((a) => a.date).sort().at(-1) : input.today)

  const said = fresh.map((a) => `${a.date} ${a.kind}${a.minutes !== null ? `, ${a.minutes} мин` : ''} — ${attemptOutcome(a)}`)
  const head = `Задача ${planned.id}${planned.title ? ` «${planned.title}»` : ''}: ${fresh.length ? `попыток добавлено ${fresh.length} (${said.join('; ')})` : 'заметка записана'}.`
  return [`${head} Статус: ${status}${was && was !== status ? `, был ${was}` : ''}.`, ...remarks].join('\n')
}

// --- Недели: тест и чекпоинт ---

/** В недельном тесте 10 вопросов, за каждый от 0 до 2 баллов — как в CLAUDE.md и src/game/weekly.ts. */
const WEEKLY_QUESTIONS = 10
const WEEKLY_POINTS = [0, 1, 2]

/** Неделя плана: какие её дни ещё не закрыты и дата последнего занятия. Тест открыт, когда закрыты все, — так же решает сайт. */
function weekState(plan, progress, n) {
  const week = plan.weeks.find((w) => w.n === n) ?? fail(`в плане нет недели ${n ?? ''}: есть ${plan.weeks.map((w) => w.n).join(', ')}`)
  const days = plan.days.filter((d) => d.week === week.n).map((d) => d.day)
  const records = progress.days.filter((d) => days.includes(d.day))
  const open = days.filter((day) => !CLOSED.includes(records.find((d) => d.day === day)?.status))
  const lastDate = records.flatMap((d) => d.dates ?? []).sort().at(-1) ?? null
  return { week, open, lastDate }
}

/**
 * Недельный тест. record — список вопросов или объект с полем questions (такой выдаёт задание теста);
 * week, date и note можно назвать отдельно — они важнее тех, что в записи. Баллы считает команда.
 * Пересдача — новая запись с той же неделей: сайт берёт лучшую попытку.
 */
export function addWeeklyTest(plan, progress, input) {
  const raw = Array.isArray(input.record) ? { questions: input.record } : input.record
  if (!raw || typeof raw !== 'object') fail('нужна запись теста: список вопросов или объект с полем questions')
  const { week, open, lastDate } = weekState(plan, progress, input.week ?? raw.week)
  const date = needDate(input.date ?? raw.date, 'date')
  if (open.length) fail(`тест недели ${week.n} ещё закрыт: не закрыты дни ${open.join(', ')}. Тест сдают, когда закрыты все дни недели`)
  if (lastDate && date < lastDate) fail(`дата теста ${date} раньше последнего занятия недели (${lastDate})`)
  if (!Array.isArray(raw.questions)) fail('вопросы теста: нужен список { q, track, points, note }')
  if (raw.questions.length !== WEEKLY_QUESTIONS) {
    fail(`в недельном тесте ${WEEKLY_QUESTIONS} вопросов, получено ${raw.questions.length}. Камни и зачёт на ранг сайт считает по доле баллов: тест другой длины с остальными не сравнить`)
  }
  const questions = raw.questions.map((item, i) => {
    const where = `вопрос ${i + 1}`
    if (!item || typeof item !== 'object') fail(`${where}: нужен объект { q, track, points, note }`)
    const question = { q: needText(item.q, `${where}: q`), track: needTrack(plan, item.track, `${where}: `) }
    question.points = WEEKLY_POINTS.includes(item.points) ? item.points : fail(`${where}: points — 0, 1 или 2, получено «${item.points ?? ''}»`)
    if (item.note != null && item.note !== '') question.note = needText(item.note, `${where}: note`)
    return question
  })
  const twice = questions.find((item, i) => questions.findIndex((other) => other.q === item.q) !== i)
  if (twice) fail(`вопрос «${twice.q}» в тесте дважды`)
  const score = questions.reduce((sum, item) => sum + item.points, 0)
  const max = questions.length * 2
  if (raw.score != null && raw.score !== score) fail(`в записи score ${raw.score}, а по вопросам выходит ${score}: проверь баллы`)
  if (raw.max != null && raw.max !== max) fail(`в записи max ${raw.max}, а по вопросам выходит ${max}`)

  const tests = progress.weeklyTests ?? []
  const print = (test) => JSON.stringify((test.questions ?? []).map((item) => [item.q, item.points]))
  const test = { week: week.n, date, score, max, questions }
  const note = input.note ?? raw.note
  if (note != null && note !== '') test.note = needText(note, 'note')
  if (tests.some((other) => other.week === test.week && other.date === date && print(other) === print(test))) fail(`этот тест недели ${week.n} за ${date} уже записан`)
  progress.weeklyTests = [...tests, test].sort((a, b) => a.week - b.week || a.date.localeCompare(b.date))
  touch(progress, date)

  const byTrack = plan.tracks
    .map((t) => ({ code: t.code, asked: questions.filter((item) => item.track === t.code) }))
    .filter((t) => t.asked.length)
    .map((t) => `${t.code} ${t.asked.reduce((sum, item) => sum + item.points, 0)} из ${t.asked.length * 2}`)
  const attempts = progress.weeklyTests.filter((other) => other.week === week.n)
  const best = attempts.reduce((top, other) => (other.score / other.max > top.score / top.max ? other : top))
  const retake = attempts.length > 1 ? ` Попыток по этой неделе: ${attempts.length}, лучшая — ${best.score} из ${best.max}; сайт берёт лучшую.` : ''
  return `Тест недели ${week.n} записан: ${score} из ${max}. По трекам: ${byTrack.join(', ')}.${retake}`
}

/** Неделя закрыта по чекпоинту: все её дни закрыты и результат недели подтверждён. Дважды не закрывается. */
export function closeWeek(plan, progress, input) {
  const { week, open, lastDate } = weekState(plan, progress, input.n)
  const date = needDate(input.date, 'date')
  if (open.length) fail(`неделя ${week.n} ещё идёт: не закрыты дни ${open.join(', ')}`)
  if (lastDate && date < lastDate) fail(`дата ${date} раньше последнего занятия недели (${lastDate})`)
  const weeks = progress.weeks ?? []
  const known = weeks.find((w) => w.n === week.n)
  if (known?.closed) fail(`неделя ${week.n} уже закрыта по чекпоинту${known.date ? ` (${known.date})` : ''}`)
  progress.weeks = [...weeks.filter((w) => w.n !== week.n), { n: week.n, closed: true, date }].sort((a, b) => a.n - b.n)
  touch(progress, date)
  return `Неделя ${week.n} закрыта по чекпоинту, ${date}.${week.checkpoint ? ` Чекпоинт, который этим подтверждён: ${week.checkpoint}.` : ''}`
}

// --- Запись дня: итог, заметка, артефакты ---

/** Итог дня (summary), заметка (note) и сколько минут день занял на деле (wallClockMinutes). Статус дня не меняется. */
export function describeDay(plan, progress, input) {
  const day = input.day ?? progress.position.currentDay
  planDay(plan, day)
  const changes = {}
  if (input.summary !== undefined) changes.summary = needText(input.summary, 'summary')
  if (input.note !== undefined) changes.note = needText(input.note, 'note')
  if (input.minutes !== undefined) changes.wallClockMinutes = Number.isInteger(input.minutes) && input.minutes > 0 ? input.minutes : fail('minutes: нужно целое число минут, сколько день занял на деле')
  if (!Object.keys(changes).length) fail('нужен итог дня (--summary), заметка (--note) или минуты на деле (--minutes)')
  const date = input.date === undefined ? input.today : needDate(input.date, 'date')
  const record = dayRecord(progress, day)
  const names = { summary: 'итог', note: 'заметка', wallClockMinutes: 'минут на деле' }
  let changed = false
  const said = Object.entries(changes).map(([key, value]) => {
    const old = record[key]
    if (old === value) return `${names[key]} — без изменений`
    record[key] = value
    changed = true
    if (key === 'wallClockMinutes') return `на деле ${value} мин${old ? ` (было ${old})` : ''}`
    return `${names[key]} ${old ? `заменён${key === 'note' ? 'а' : ''} (было: «${old}»)` : `записан${key === 'note' ? 'а' : ''}`}`
  })
  if (changed) touch(progress, date)
  return `День ${day}: ${said.join('; ')}.`
}

/** Состояния артефакта, которые знает сайт: при первых трёх домик построен, остальные — стройка. */
export const ARTIFACT_STATES = ['created', 'saved', 'committed', 'not-saved', 'given-by-tutor', 'unknown']

/** Подходит ли путь файла к пути домика из plan.json → camp; `*` заменяет любую часть имени — как в src/game/engine.ts. */
function pathMatches(pattern, path) {
  if (!pattern.includes('*')) return pattern === path
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(path)
}

/**
 * Артефакт дня: файл и его состояние. У файла одна запись на весь журнал: если путь уже записан,
 * меняется состояние, а новая строка не появляется. Без номера дня берётся день, где файл уже записан, иначе текущий.
 */
export function setArtifact(plan, progress, input) {
  const path = needText(input.path, 'path')
  if (!ARTIFACT_STATES.includes(input.state)) fail(`состояние «${input.state ?? ''}»: нужно одно из ${ARTIFACT_STATES.join(', ')}`)
  const camp = plan.camp ?? []
  const everywhere = progress.days.flatMap((d) => (d.artifacts ?? []).map((a) => ({ day: d.day, artifact: a })))
  let repo = input.repo
  if (repo === undefined) {
    const repos = [...new Set([...everywhere.filter((e) => e.artifact.path === path).map((e) => e.artifact.repo), ...camp.filter((item) => pathMatches(item.path, path)).map((item) => item.repo)])]
    if (repos.length !== 1) fail(`не понять, в каком репозитории «${path}»: назови --repo (в плане есть ${[...new Set(camp.map((item) => item.repo))].join(', ')})`)
    repo = repos[0]
  } else repo = needText(repo, 'repo')

  const holders = everywhere.filter((e) => e.artifact.repo === repo && e.artifact.path === path)
  if (input.day === undefined && new Set(holders.map((e) => e.day)).size > 1) fail(`«${path}» записан в нескольких днях (${holders.map((e) => e.day).join(', ')}): назови --day`)
  if (input.day !== undefined && holders.length && !holders.some((e) => e.day === input.day)) {
    fail(`«${path}» уже записан в дне ${holders[0].day}: у файла одна запись. Чтобы поменять состояние, запусти без --day или с --day ${holders[0].day}`)
  }
  const day = input.day ?? holders[0]?.day ?? progress.position.currentDay
  planDay(plan, day)
  const known = holders.find((e) => e.day === day)?.artifact
  if (known?.state === input.state) fail(`«${path}» уже записан в состоянии ${input.state} (день ${day})`)
  const date = input.date === undefined ? input.today : needDate(input.date, 'date')

  const was = known?.state
  if (known) known.state = input.state
  else {
    const record = dayRecord(progress, day)
    record.artifacts = [...(record.artifacts ?? []), { repo, path, state: input.state }]
  }
  touch(progress, date)

  const house = camp.find((item) => item.repo === repo && pathMatches(item.path, path))
  const lines = [`День ${day}: ${path} (${repo}) — ${was ? `${was} → ${input.state}` : input.state}.${house ? ` Домик лагеря: «${house.title ?? house.id}».` : ''}`]
  if (!house) {
    const paths = camp.filter((item) => item.repo === repo).map((item) => item.path)
    lines.push(
      `Внимание: путь не подходит ни к одному домику плана — запись останется в журнале дня, но домик в лагере от неё не достроится. ` +
        (paths.length ? `Домики ${repo}: ${paths.join(', ')}.` : `Репозитория «${repo}» в лагере плана нет, есть ${[...new Set(camp.map((item) => item.repo))].join(', ')}.`),
    )
  }
  return lines.join('\n')
}

// --- CI, события, замер, наблюдения, паузы ---

const CI_WORKFLOWS = { hello: 'helloWorldWorkflow', build: 'buildWorkflow' }
export const CI_STATES = ['green', 'red']
const hasGreen = (ci) => Object.values(ci ?? {}).some((value) => value === 'green')

/**
 * Состояние workflow pet-проекта: hello — первый, hello-world; build — сборка. Сайт смотрит, есть ли зелёный.
 * Последний зелёный красным не отмечается: первый зелёный workflow уже засчитан, а очки не отнимаются.
 */
export function setCi(progress, input) {
  const key = CI_WORKFLOWS[input.workflow] ?? (Object.values(CI_WORKFLOWS).includes(input.workflow) ? input.workflow : fail(`workflow «${input.workflow ?? ''}»: нужен hello (первый, hello-world) или build (сборка)`))
  if (!CI_STATES.includes(input.state)) fail(`состояние «${input.state ?? ''}»: нужно ${CI_STATES.join(' или ')}`)
  const date = input.date === undefined ? input.today : needDate(input.date, 'date')
  const ci = { helloWorldWorkflow: null, buildWorkflow: null, ...(progress.petProject?.ci ?? {}) }
  const was = ci[key]
  if (was === input.state) fail(`${key} уже ${input.state}`)
  const next = { ...ci, [key]: input.state }
  if (hasGreen(ci) && !hasGreen(next)) fail('это единственный зелёный workflow: сайт уже засчитал его, а очки не отнимаются, поэтому красным он не отмечается. Когда починишь — запиши event --type ci-fixed')
  progress.petProject = { ...(progress.petProject ?? {}), ci: next }
  touch(progress, date)
  const lines = [`CI: ${key} — ${was ?? 'не было'} → ${input.state}.`]
  if (!hasGreen(ci) && hasGreen(next)) lines.push('Это первый зелёный workflow: сайт его засчитает.')
  if (was === 'red' && input.state === 'green') lines.push('Был красным. Если это починка упавшего CI — запиши событие: event --type ci-fixed --date …')
  return lines.join('\n')
}

/** События, которые понимает сайт: ci-fixed — починил красный CI. */
export const EVENT_TYPES = ['ci-fixed']

/** Событие вне дней. Одно событие каждого вида на дату: повторный запуск ничего не добавит. */
export function addEvent(progress, input) {
  const date = needDate(input.date, 'date')
  if (!EVENT_TYPES.includes(input.type)) fail(`событие «${input.type ?? ''}»: сайт знает только ${EVENT_TYPES.join(', ')}`)
  if (input.type === 'ci-fixed' && !hasGreen(progress.petProject?.ci)) fail('ci-fixed — это красный CI, который снова зелёный. Сначала отметь workflow зелёным: ci --workflow build --state green')
  const events = progress.events ?? []
  if (events.some((e) => e.type === input.type && e.date === date)) fail(`событие ${input.type} за ${date} уже записано`)
  const event = { date, type: input.type }
  if (input.note !== undefined) event.note = needText(input.note, 'note')
  progress.events = [...events, event].sort((a, b) => a.date.localeCompare(b.date))
  touch(progress, date)
  return `Событие записано: ${input.type}, ${date}.`
}

/** Какое поле самооценки у трека — как SELF_KEY в src/game/engine.ts. */
const SELF_KEY = { A: 'algorithms', B: 'systemDesign', C1: 'gradle', C2: 'cicd', E: 'aiTutorAndTests' }

/**
 * Замер в начале (start) или в конце (final) цикла: минуты и результат задачи на таймере, самооценка по трекам от 1 до 5.
 * Минуты берутся только из решённой попытки на таймере, уже записанной командой problem: оттуда же дата замера.
 * scores — { код трека: оценка }; записываются только названные треки.
 */
export function setBaseline(plan, progress, input) {
  if (input.point !== 'start' && input.point !== 'final') fail(`точка «${input.point ?? ''}»: нужна start (замер в начале) или final (замер в конце)`)
  if (!progress.baseline?.start || !progress.baseline?.final) fail('в журнале нет точек baseline.start и baseline.final: их заводят вместе с циклом')
  const point = progress.baseline[input.point]
  const next = { day: point.day, date: point.date, problemId: point.problemId, minutes: point.minutes ?? null, result: point.result ?? null }
  const said = []
  if (input.day !== undefined) {
    next.day = planDay(plan, input.day).day
    said.push(`день ${next.day}`)
  }
  if (input.problemId !== undefined) {
    next.problemId = plan.leetcode.some((p) => p.id === input.problemId) ? input.problemId : fail(`в плане нет задачи ${input.problemId}`)
    said.push(`задача ${next.problemId}`)
  }
  if (input.result !== undefined) {
    next.result = needText(input.result, 'result')
    said.push('результат записан')
  }
  if (input.minutes !== undefined) {
    const minutes = needMinutes(input.minutes, 'minutes')
    const attempt = progress.leetcode.find((p) => p.id === next.problemId)?.attempts.find((a) => isTimed(a) && a.result === 'solved' && a.minutes === minutes)
    if (!attempt) {
      fail(
        `замер — это решённая попытка на таймере, а у задачи ${next.problemId} такой за ${minutes} мин в журнале нет. ` +
          'Сначала запиши её командой problem. Если задача не решена, минуты не называй: только --result',
      )
    }
    if (!next.result) fail('к минутам замера нужен результат словами: --result "…"')
    next.minutes = minutes
    next.date = attempt.date
    said.push(`${minutes} мин, ${attempt.date}`)
  }
  const assessment = { ...point.selfAssessment }
  const scores = Object.entries(input.scores ?? {})
  for (const [code, value] of scores) {
    needTrack(plan, code, 'самооценка: ')
    const key = SELF_KEY[code] ?? fail(`самооценка: для трека ${code} сайт её не ведёт, есть ${Object.keys(SELF_KEY).join(', ')}`)
    if (!Number.isInteger(value) || value < 1 || value > 5) fail(`самооценка ${code}: нужна оценка от 1 до 5`)
    assessment[key] = value
  }
  if (scores.length) said.push(`самооценка ${scores.map(([code, value]) => `${code} ${value}`).join(', ')}`)
  if (!said.length) fail('нужно что-то записать: --minutes и --result, --scores A=2,B=1, --problem или --day')
  const date = input.date === undefined ? input.today : needDate(input.date, 'date')

  if (next.date === undefined) delete next.date
  progress.baseline[input.point] = { ...next, selfAssessment: assessment }
  touch(progress, date)
  const { start, final } = progress.baseline
  const compare = input.point === 'final' && input.minutes !== undefined && start.minutes != null ? ` В начале было ${start.minutes} мин, стало ${final.minutes}.` : ''
  return `Замер ${input.point === 'start' ? 'в начале' : 'в конце'} цикла: ${said.join('; ')}.${compare}`
}

/** Наблюдение репетитора: как идут занятия. Показывается на вкладке «Прирост». */
export function addObservation(progress, input) {
  const text = needText(input.text, 'text')
  if (progress.observations.includes(text)) fail('такое наблюдение уже записано')
  const date = input.date === undefined ? input.today : needDate(input.date, 'date')
  progress.observations.push(text)
  touch(progress, date)
  return `Наблюдение записано, всего ${progress.observations.length}.`
}

/**
 * Пауза, которая уже случилась: привал на карте маршрута. Записывается по возвращении — между двумя занятиями,
 * без занятий внутри. Дни считаются по календарю, обе даты включительно. Плановый перерыв — другая команда, break.
 */
export function addPause(progress, input) {
  const from = needDate(input.from, 'from')
  const to = needDate(input.to, 'to')
  if (to < from) fail(`пауза: конец ${to} раньше начала ${from}`)
  const pauses = progress.position.pauses ?? []
  const clash = pauses.find((item) => item.from <= to && from <= item.to)
  if (clash) fail(`пауза пересекается с уже записанной ${clash.from} — ${clash.to}`)
  const dates = [...new Set(progress.sessions.map((s) => s.date))].sort()
  const inside = dates.filter((date) => from <= date && date <= to)
  if (inside.length) fail(`внутри паузы есть занятия: ${inside.join(', ')}`)
  if (!dates.some((date) => date < from)) fail('до паузы нет ни одного занятия: пауза — это перерыв между занятиями')
  if (!dates.some((date) => date > to)) fail('после паузы ещё нет занятия: паузу записывают по возвращении. Сначала запиши занятие')
  const pause = { from, to, days: dayNumber(to) - dayNumber(from) + 1 }
  if (input.note !== undefined) pause.note = needText(input.note, 'note')
  progress.position.pauses = [...pauses, pause].sort((a, b) => a.from.localeCompare(b.from))
  touch(progress, input.today)
  return `Пауза ${from} — ${to} записана: дней ${pause.days}.`
}
