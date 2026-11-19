#!/usr/bin/env node
// Запись в данные сайта одной командой — вместо правки JSON руками.
// Примеры и список команд: node scripts/record.mjs help
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from './record-lib.mjs'

const HELP = `Запись в данные сайта. Даты — ГГГГ-ММ-ДД, время — ЧЧ:ММ. День по умолчанию — текущий из position.

  session  --date D [--from ЧЧ:ММ] [--to ЧЧ:ММ] [--day N] --topic "…" [--topic "…"]
           занятие: строка в sessions и дата в записи дня
  steps    --done 2,3 [--day N] [--date D]
           шаги дня сделаны; позиция уходит на следующий шаг
  day      --status minimum|core|extension|skipped --date D [--day N]
           день закрыт или пропущен; позиция уходит на следующий день
  check    --date D --track C1 --question "…" --first "ответ Baudi" --verdict correct|partial|wrong --answer "…"
  mistake  --date D --track A [--problem 1] --text "…"
  todo     --add "…"   |   todo --done N        хвосты прошлых занятий (openItems), номер с единицы
  break    --from D --to D [--reason "отпуск"]  плановый перерыв
  purchase --item id --date D                   покупка из лавки;  repair — то же для ремонта
  ledger   --json '{"purchases":[…],"redeemed":[…],"signs":[…]}'  |  ledger --file запись.json
           запись из лавки целиком (кнопка «Скопировать запись»): покупки, ремонты, свои награды, выкупы, знаки
  town     --json '[{"at":"…","do":"build","type":"house"}]'  |  town --file журнал.json
  offplan  --date D --kind video --title "…" [--source "…"] [--track B] [--minutes 40] [--with "…"] --takeaway "…" --takeaway "…"

  --dry    показать итог и ничего не записать
  --cycle  папка цикла в data/cycles (по умолчанию последняя)

Задачи LeetCode (leetcode[]), недельные тесты (weeklyTests) и артефакты дня (days[].artifacts)
команда не пишет: их формат — в CLAUDE.md и src/data/types.ts, правь JSON руками.
После записи запусти npm test: он проверит данные целиком.`

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [command = 'help', ...rest] = process.argv.slice(2)

// --ключ значение; повтор ключа собирает список; ключ без значения — флаг.
const args = {}
function parseArgs() {
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) throw new lib.RecordError(`лишнее слово «${rest[i]}»: значения с пробелами бери в кавычки`)
    const key = rest[i].slice(2)
    const value = i + 1 < rest.length && !rest[i + 1].startsWith('--') ? rest[++i] : true
    args[key] = key in args ? [].concat(args[key], value) : value
  }
}
const one = (key) => (Array.isArray(args[key]) ? args[key][args[key].length - 1] : args[key] === true ? undefined : args[key])
const many = (key) => (args[key] === undefined || args[key] === true ? [] : [].concat(args[key]))
const num = (key) => (one(key) === undefined ? undefined : Number(one(key)))
const nums = (key) => many(key).flatMap((value) => String(value).split(',')).map(Number)

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function run() {
  parseArgs()
  if (command === 'help' || args.help) return console.log(HELP)

  const cycles = fs.readdirSync(path.join(root, 'data/cycles')).sort()
  const cycle = one('cycle') ?? cycles[cycles.length - 1]
  const planFile = `data/cycles/${cycle}/plan.json`
  const progressFile = `data/cycles/${cycle}/progress.json`
  const plan = readJson(planFile)

  // Какой файл правит команда и что она с ним делает.
  const inProgress = (apply) => ({ file: progressFile, apply })
  const commands = {
    session: () => inProgress((p) => lib.addSession(plan, p, { date: one('date'), from: one('from'), to: one('to'), day: num('day'), topics: many('topic') })),
    steps: () => inProgress((p) => lib.markSteps(plan, p, { day: num('day'), done: nums('done'), date: one('date') })),
    day: () => inProgress((p) => lib.closeDay(plan, p, { day: num('day'), status: one('status'), date: one('date') })),
    check: () =>
      inProgress((p) =>
        lib.addCheck(plan, p, { date: one('date'), track: one('track'), question: one('question'), firstAnswer: one('first'), verdict: one('verdict'), answer: one('answer') }),
      ),
    mistake: () => inProgress((p) => lib.addMistake(plan, p, { date: one('date'), track: one('track'), problemId: num('problem'), text: one('text') })),
    todo: () => inProgress((p) => lib.editTodo(p, { add: one('add'), done: num('done'), today: today() })),
    break: () => inProgress((p) => lib.addBreak(p, { from: one('from'), to: one('to'), reason: one('reason'), today: today() })),
    purchase: () => ({ file: 'data/purchases.json', apply: (f) => lib.addPurchase(f, shopIds(), { item: one('item'), date: one('date') }) }),
    repair: () => ({ file: 'data/purchases.json', apply: (f) => lib.addPurchase(f, shopIds(), { item: one('item'), date: one('date'), repair: true }) }),
    ledger: () => ({ file: 'data/purchases.json', apply: (f) => lib.mergeLedger(f, shopIds(), jsonInput('запись из лавки')) }),
    town: () => ({ file: 'data/town.json', apply: (f) => lib.addTownActions(f, townInput()) }),
    offplan: () => ({
      file: 'data/offplan.json',
      apply: (f) =>
        lib.addOffplan(plan, f, {
          date: one('date'),
          kind: one('kind'),
          title: one('title'),
          source: one('source'),
          track: one('track'),
          minutes: num('minutes'),
          with: one('with'),
          takeaways: many('takeaway'),
        }),
    }),
  }
  if (!commands[command]) throw new lib.RecordError(`команды «${command}» нет. Список: node scripts/record.mjs help`)

  const { file, apply } = commands[command]()
  const data = readJson(file)
  const summary = apply(data)
  if (!args.dry) fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n')
  console.log(summary)
  console.log(args.dry ? `Пробный запуск: ${file} не изменён.` : `Записано в ${file}. Проверь: npm test`)
}

/** id предметов лавки — из каталога в src/game/shop.ts. */
function shopIds() {
  const text = fs.readFileSync(path.join(root, 'src/game/shop.ts'), 'utf8')
  return [...text.matchAll(/\{ id: '([^']+)', group:/g)].map((match) => match[1])
}

/** JSON из --json или из файла --file. */
function jsonInput(what) {
  const text = one('file') ? fs.readFileSync(path.resolve(one('file')), 'utf8') : one('json')
  if (!text) throw new lib.RecordError(`нужен JSON (${what}): --json '…' или --file путь`)
  try {
    return JSON.parse(text)
  } catch {
    throw new lib.RecordError(`${what}: не читается как JSON`)
  }
}

/** Журнал города: одна запись или список. */
function townInput() {
  const parsed = jsonInput('журнал города')
  return Array.isArray(parsed) ? parsed : (parsed.actions ?? [parsed])
}

try {
  run()
} catch (error) {
  if (!(error instanceof lib.RecordError)) throw error
  console.error(`Не записано: ${error.message}`)
  process.exitCode = 1
}
