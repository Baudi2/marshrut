#!/usr/bin/env node
// Запись в данные сайта одной командой — вместо правки JSON руками.
// Примеры и список команд: node scripts/record.mjs help
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from './record-lib.mjs'

const HELP = `Запись в данные сайта. Даты — ГГГГ-ММ-ДД, время — ЧЧ:ММ; дату называй явно: часы в облаке другие.
День по умолчанию — текущий из position. Под каждой командой — пример; в квадратных скобках — необязательное.

Занятие
  session      занятие: строка в sessions и дата в записи дня. Записал в начале без --to — та же команда с --to допишет конец.
               Конец раньше начала — занятие перешло за полночь (не длиннее шести часов); дата — день начала
               session --date 2026-11-19 --from 16:00 --to 17:10 --topic "команды Gradle" [--topic "…"] [--day 3] [--insight "…"]
               --insight — своя строка после занятия: что Baudi понял, его словами. Одна строка до 280 знаков, одна на занятие.
               Идёт в летопись города и отчёт недели, очков не даёт; её можно не называть. Дописать позже или заменить —
               той же командой без тем; если занятие за дату одно, начало можно не называть:
               session --date 2026-11-19 --from 16:00 --insight "wrapper держит версию Gradle, чтобы сборка шла у всех одинаково"
  steps        шаги дня сделаны; позиция уходит на следующий шаг
               steps --done 2,3 --date 2026-11-19 [--day 3]
  day          день закрыт (minimum, core, extension) или пропущен (skipped); позиция уходит на следующий день.
               Закрыть можно день, у которого записано хотя бы одно занятие (session); пропуск — только с номером дня.
               Итог дня, заметку и минуты на деле можно записать сразу или отдельно, без --status
               day --status core --date 2026-11-19 [--summary "Gradle 1: команды и заметка"] [--note "…"] [--minutes 75] [--day 3]
               day --summary "Сделан шаг 1 из трёх" [--note "шаг 3 ждёт ноутбука"] [--minutes 70] [--day 3]
               day --status skipped --day 6
  artifact     файл дня и его состояние: created, saved, committed — построен; not-saved, given-by-tutor, unknown — стройка.
               Путь уже записан — меняется состояние; без --day берётся день, где он записан, иначе текущий
               artifact --path build/gradle-anatomy.md --state saved [--repo prep-basic] [--day 3] [--date 2026-11-19]
  check        проверка понимания: первый ответ как есть и вердикт (correct, partial, wrong); сама становится карточкой колоды
               check --date 2026-11-19 --track C1 --question "Что делает wrapper?" --first "качает Gradle" --verdict partial --answer "фиксирует версию Gradle"
  mistake      ошибка в журнал: что забыл или перепутал
               mistake --date 2026-11-19 --track A --text "перепутал .length и .size" [--problem 1512]
  beaten       ошибка №N из журнала побеждена: при повторе задачи не повторилась
               beaten --n 2 [--date 2026-11-19]
  todo         хвосты прошлых занятий (openItems), номер с единицы
               todo --add "шаг 3 ждёт ноутбука"   |   todo --done 1
  observation  наблюдение репетитора: как идут занятия
               observation --text "Теорию пересказывает верно, пробелы точечные" [--date 2026-11-19]

Задачи, тесты, замеры
  problem      попытка по задаче LeetCode из плана. Запись о задаче заводится сама; статус ставится по попыткам и не понижается.
               --kind: timed-<минут>, optimal-<минут>, rewrite-after-walkthrough, from-empty-editor, no-hints, duel
               --result: solved, not-solved; у решённой попытки --self yes|no — сам или с подсказкой
               problem --id 217 --date 2026-11-23 --kind timed-20 --minutes 14 --result solved --self yes [--approach "…"] [--notes "…"] [--problem-note "заметка к задаче"]
               --forecast — прогноз перед попыткой на таймере (timed-…, duel): сколько минут Baudi ожидал потратить, целое от 1 до 180.
               Называется до попытки, к записанной не дописывается; сайт копит «прогноз и факт», очков за точность нет
               problem --id 217 --date 2026-11-23 --kind timed-20 --forecast 10 --minutes 14 --result solved --self yes
               Несколько попыток одного занятия — списком, по порядку (поля как в progress.json, прогноз — поле forecast):
               problem --id 217 --json '[{"date":"2026-11-23","kind":"timed-20","minutes":20,"result":"not-solved"},{"date":"2026-11-23","kind":"rewrite-after-walkthrough","minutes":8,"result":"solved"}]'
  weekly       недельный тест: 10 вопросов, у каждого баллы 0–2 и код трека; score и max считает команда. Пересдача — новая запись
               weekly --week 1 --date 2026-11-20 --file тест.json [--note "…"] [--forecast 14]   |   … --json -   |   … --json '[{"q":"Что такое task?","track":"C1","points":2,"note":"…"}, …]'
               --forecast — прогноз перед тестом: сколько баллов из 20 Baudi ожидал набрать, целое от 0 до 20. Называется до теста,
               у пересдачи свой; сайт копит «прогноз и факт», очков за точность нет
               weekly --week 1 --date 2026-11-20 --forecast 14 --file тест.json
  week         неделя закрыта по чекпоинту: все её дни закрыты, результат недели подтверждён
               week --n 1 --date 2026-11-20
  baseline     замер в начале (start) или в конце (final) цикла: минуты и результат задачи на таймере, самооценка по трекам от 1 до 5.
               Минуты — из решённой попытки на таймере, уже записанной командой problem; задача не решена — только --result
               baseline --point start --scores A=2,B=1,C1=2,C2=1,E=3 [--date 2026-11-19]
               baseline --point final --minutes 12 --result "решил сам через HashSet" [--problem 349] [--day 28]
  ci           состояние workflow pet-проекта: hello — первый (hello-world), build — сборка; green или red
               ci --workflow hello --state green [--date 2026-11-20]
  event        событие вне дней: ci-fixed — починил красный CI
               event --type ci-fixed --date 2026-11-27 [--note "в workflow был не тот JDK"]

Перерывы
  break        плановый перерыв: объявляют заранее, рабочие дни внутри не считаются пропуском.
               На цикл даётся 10 рабочих дней: перерыв сверх лимита не записывается
               break --from 2026-12-28 --to 2027-01-08 [--reason "отпуск"]
  pause        пауза, которая уже случилась: привал на карте. Записывается по возвращении, после первого занятия
               pause --from 2026-10-28 --to 2026-11-10 [--note "вернулся и продолжил с дня 2"]

Колода и стороннее развитие
  card         своя карточка колоды; с --mistake N — из ошибки №N журнала: текст ошибки и трек берутся оттуда
               card --date 2026-11-19 --track B --q "Зачем нужен слой data?" --a "Прячет источники данных за репозиторием"
               card --date 2026-11-19 --mistake 5 --q "Что кэширует configuration cache?" --a "Граф задач" [--track C1]
  offplan      стороннее развитие: video, article, meetup, mock-interview, session, artifact, problem-self, problem-walkthrough
               offplan --date 2026-11-20 --kind video --title "Доклад про Gradle" --takeaway "…" --takeaway "…" [--source YouTube] [--track C1] [--minutes 40] [--with "…"]

Записи из браузера
  sync         единая запись с сайта (кнопка «Скопировать запись»): лавка, город и колода разом; применяется вся или никак.
               Понимает и старые виды записи — те же, что у ledger, town и deck
               sync --file запись.json   |   sync --json -   |   sync --json '{"ledger":{"purchases":[…]},"town":[…],"deck":{"reviews":[…],"cards":[…]}}'
  purchase     покупка из лавки; repair — то же для ремонта
               purchase --item lantern --date 2026-11-19   |   repair --item lantern --date 2026-12-01
  ledger       запись из лавки: покупки, ремонты, свои награды, выкупы, знаки
               ledger --file запись.json   |   ledger --json -   |   ledger --json '{"purchases":[…],"redeemed":[…],"signs":[…]}'
  town         журнал действий в городе: tier — новая ступень, build — стройка (type), upgrade — улучшение (id),
               trade — обмен (type: food, wood, brick), repair — починка постройки (id)
               town --file журнал.json   |   town --json -   |   town --json '[{"at":"2026-11-20T18:20:00","do":"build","type":"house"},{"at":"2026-12-02T10:00:00","do":"repair","id":"sawmill-1"}]'
  deck         запись колоды: ответы по карточкам и свои карточки (или просто список ответов)
               deck --file запись.json   |   deck --json -   |   deck --json '{"reviews":[{"card":"…","at":"…","ok":true}],"cards":[…]}'

Как передать JSON (weekly, problem, sync, ledger, town, deck)
  --file путь  запись лежит в файле (UTF-8). Работает в любой оболочке — это способ по умолчанию:
               файл создай инструментом записи файлов, не перенаправлением вывода в PowerShell
  --json -     запись приходит со стандартного ввода:
               bash:        node scripts/record.mjs sync --json - < запись.json   |   cat запись.json | node scripts/record.mjs sync --json -
               PowerShell:  Get-Content запись.json -Raw -Encoding UTF8 | node scripts/record.mjs sync --json -
               PowerShell, запись прямо в команде — здесь-строкой: три строки, закрывающее '@ стоит с начала строки
                            @'
                            {"town":[{"at":"2026-11-20T18:20:00","do":"tier"}]}
                            '@ | node scripts/record.mjs sync --json -
               Если за три секунды на ввод ничего не пришло, команда не ждёт дальше и говорит об этом.
  --json '…'   запись прямо в аргументе — только в bash, в одинарных кавычках.
               Windows PowerShell 5.1 выбрасывает из аргумента двойные кавычки: {"town":[…]} приходит как {town:[…]},
               а запись с пробелами ещё и распадается на слова. Команда такую запись не пишет, а говорит, что кавычки съедены.
  Испорченный по дороге текст команда не записывает и в других случаях: знаки вопроса вместо русских букв,
  текст не в той кодировке (Get-Content без -Encoding UTF8), файл не в UTF-8. Метка BOM и UTF-16 с меткой читаются.
  Текст обычных ключей PowerShell портит так же: --summary 'Разобрал "кэш"' придёт без кавычек — пиши «ёлочки».
  В Git Bash значение, которое начинается с косой черты, превращается в путь Windows ("/gradlew" → "C:/Program Files/Git/gradlew"):
  начинай текст не с неё.

Общее
  --dry        показать итог и ничего не записать
  --cycle      папка цикла в data/cycles (по умолчанию последняя)
  Строка «Внимание: …» в итоге — предупреждение: запись сделана, но её стоит перепроверить.
  После записи запусти npm test: он проверит данные целиком.`

/** Какие ключи понимает каждая команда: незнакомый ключ — ошибка, а не молчаливый пропуск. */
const FLAGS = {
  session: ['date', 'from', 'to', 'day', 'topic', 'insight'],
  steps: ['done', 'day', 'date'],
  day: ['status', 'date', 'day', 'summary', 'note', 'minutes'],
  artifact: ['path', 'state', 'repo', 'day', 'date'],
  check: ['date', 'track', 'question', 'first', 'verdict', 'answer'],
  mistake: ['date', 'track', 'problem', 'text'],
  beaten: ['n', 'date'],
  todo: ['add', 'done'],
  observation: ['text', 'date'],
  problem: ['id', 'date', 'kind', 'minutes', 'result', 'self', 'approach', 'notes', 'forecast', 'problem-note', 'json', 'file'],
  weekly: ['week', 'date', 'note', 'forecast', 'json', 'file'],
  week: ['n', 'date'],
  baseline: ['point', 'minutes', 'result', 'scores', 'problem', 'day', 'date'],
  ci: ['workflow', 'state', 'date'],
  event: ['type', 'date', 'note'],
  break: ['from', 'to', 'reason'],
  pause: ['from', 'to', 'note'],
  card: ['date', 'track', 'q', 'a', 'mistake'],
  offplan: ['date', 'kind', 'title', 'source', 'track', 'minutes', 'with', 'takeaway'],
  sync: ['json', 'file'],
  purchase: ['item', 'date'],
  repair: ['item', 'date'],
  ledger: ['json', 'file'],
  town: ['json', 'file'],
  deck: ['json', 'file'],
}
const COMMON_FLAGS = ['dry', 'cycle', 'help']
/** Ключи, которым значение не нужно. */
const SWITCHES = ['dry', 'help', 'self']
const ATTEMPT_FLAGS = ['date', 'kind', 'minutes', 'result', 'self', 'approach', 'notes', 'forecast']

const LEDGER_FILE = 'data/purchases.json'
const TOWN_FILE = 'data/town.json'
const DECK_FILE = 'data/deck.json'

// RECORD_ROOT — другая папка проекта вместо этой: так тесты пишут в копию данных, а не в настоящие файлы.
const root = path.resolve(process.env.RECORD_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
const [command = 'help', ...rest] = process.argv.slice(2)
const wrong = (message) => {
  throw new lib.RecordError(message)
}

// --ключ значение; повтор ключа собирает список; ключ без значения — флаг.
const args = {}
function parseArgs() {
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) wrong(rest.includes('--json') ? lib.splitJsonHint(rest[i]) : `лишнее слово «${rest[i]}»: значения с пробелами бери в кавычки`)
    const key = rest[i].slice(2)
    const value = i + 1 < rest.length && !rest[i + 1].startsWith('--') ? rest[++i] : true
    args[key] = key in args ? [].concat(args[key], value) : value
  }
}
const one = (key) => (Array.isArray(args[key]) ? args[key][args[key].length - 1] : args[key] === true ? undefined : args[key])
const many = (key) => (args[key] === undefined || args[key] === true ? [] : [].concat(args[key]))
const toNumber = (key, value) => (String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : wrong(`--${key}: нужно число, получено «${value}»`))
const num = (key) => (one(key) === undefined ? undefined : toNumber(key, one(key)))
const nums = (key) => many(key).flatMap((value) => String(value).split(',')).map((value) => toNumber(key, value))
/** --self, --self yes, --self no. */
function yesNo(key) {
  if (args[key] === undefined) return undefined
  if (args[key] === true) return true
  const value = String(one(key)).toLowerCase()
  if (['yes', 'да', 'true'].includes(value)) return true
  if (['no', 'нет', 'false'].includes(value)) return false
  return wrong(`--${key}: нужно yes или no, получено «${one(key)}»`)
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Сколько ждать первых данных со стандартного ввода. Без конвейера ввод может так и не закрыться: команда не должна зависнуть.
 * RECORD_STDIN_WAIT_MS — другой срок: так тест проверяет это быстро.
 */
const STDIN_WAIT_MS = Number(process.env.RECORD_STDIN_WAIT_MS) || 3000

/** Стандартный ввод целиком; null — ввода нет: команда запущена с клавиатуры или за STDIN_WAIT_MS ничего не пришло. */
function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve(null)
  return new Promise((resolve) => {
    const chunks = []
    const giveUp = () => {
      process.stdin.removeAllListeners()
      process.stdin.destroy()
      resolve(null)
    }
    const timer = setTimeout(giveUp, STDIN_WAIT_MS)
    process.stdin.on('data', (chunk) => {
      clearTimeout(timer)
      chunks.push(chunk)
    })
    process.stdin.on('end', () => {
      clearTimeout(timer)
      resolve(Buffer.concat(chunks))
    })
    process.stdin.on('error', () => {
      clearTimeout(timer)
      giveUp()
    })
  })
}
let stdin = null

async function run() {
  parseArgs()
  if (command === 'help' || args.help) return console.log(HELP)
  if (!FLAGS[command]) wrong(`команды «${command}» нет. Список: node scripts/record.mjs help`)
  const known = (key) => FLAGS[command].includes(key) || COMMON_FLAGS.includes(key)
  for (const key of Object.keys(args)) {
    if (!known(key)) wrong(`у команды ${command} нет ключа --${key}. Есть: ${FLAGS[command].map((name) => '--' + name).join(', ')}`)
    if ([].concat(args[key]).includes(true) && !SWITCHES.includes(key)) {
      // Значение, которое начинается с «--», разбор принял за следующий ключ.
      const taken = Object.keys(args).find((other) => !known(other))
      wrong(`у ключа --${key} нет значения${taken ? `: «--${taken}» команда приняла за ключ — текст значения не должен начинаться с «--»` : ''}`)
    }
  }
  if (one('json') === '-') stdin = await readStdin()

  const cycles = fs.readdirSync(path.join(root, 'data/cycles')).sort()
  const cycle = one('cycle') ?? cycles[cycles.length - 1]
  if (!cycles.includes(cycle)) wrong(`цикла «${cycle}» нет в data/cycles: есть ${cycles.join(', ')}`)
  const planFile = `data/cycles/${cycle}/plan.json`
  const progressFile = `data/cycles/${cycle}/progress.json`
  const plan = readJson(planFile)
  /** Проверки понимания всех циклов: среди них ищутся повторы своих карточек. */
  const allChecks = () =>
    cycles.flatMap((dir) => {
      const file = `data/cycles/${dir}/progress.json`
      return fs.existsSync(path.join(root, file)) ? (readJson(file).knowledgeChecks ?? []) : []
    })

  // Какой файл правит команда и что она с ним делает. У sync файлов несколько: files вместо file.
  const inProgress = (apply) => ({ file: progressFile, apply })
  const commands = {
    session: () =>
      inProgress((p) => {
        if (many('insight').length > 1) wrong(`своя строка одна на занятие, а --insight назван несколько раз (${many('insight').length}): оставь один`)
        return lib.addSession(plan, p, { date: one('date'), from: one('from'), to: one('to'), day: num('day'), topics: many('topic'), insight: one('insight') })
      }),
    steps: () => inProgress((p) => lib.markSteps(plan, p, { day: num('day'), done: nums('done'), date: one('date') })),
    day: () =>
      inProgress((p) => {
        // Номер дня берём до закрытия: оно переводит позицию на следующий день.
        const day = num('day') ?? p.position.currentDay
        // Пропуск без номера дня повторный запуск не отличит от нового: вторая такая команда пропустила бы и следующий день.
        if (one('status') === 'skipped' && num('day') === undefined) wrong(`пропуск дня: назови день явно — day --status skipped --day ${day}. Без номера повторный запуск пропустил бы и следующий день`)
        const about = { summary: one('summary'), note: one('note'), minutes: num('minutes') }
        const described = Object.values(about).some((value) => value !== undefined)
        const lines = []
        if (one('status') !== undefined || !described) lines.push(lib.closeDay(plan, p, { day, dayByPosition: num('day') === undefined, status: one('status'), date: one('date') }))
        if (described) lines.push(lib.describeDay(plan, p, { day, ...about, date: one('date'), today: today() }))
        return lines.join('\n')
      }),
    artifact: () => inProgress((p) => lib.setArtifact(plan, p, { day: num('day'), repo: one('repo'), path: one('path'), state: one('state'), date: one('date'), today: today() })),
    check: () =>
      inProgress((p) =>
        lib.addCheck(plan, p, { date: one('date'), track: one('track'), question: one('question'), firstAnswer: one('first'), verdict: one('verdict'), answer: one('answer') }),
      ),
    mistake: () => inProgress((p) => lib.addMistake(plan, p, { date: one('date'), track: one('track'), problemId: num('problem'), text: one('text') })),
    todo: () => inProgress((p) => lib.editTodo(p, { add: one('add'), done: num('done'), today: today() })),
    beaten: () => inProgress((p) => lib.beatMistake(p, { n: num('n'), date: one('date'), today: today() })),
    observation: () => inProgress((p) => lib.addObservation(p, { text: one('text'), date: one('date'), today: today() })),
    problem: () => inProgress((p) => lib.addAttempts(plan, p, { id: num('id'), attempts: attemptsInput(), note: one('problem-note'), today: today() })),
    weekly: () => inProgress((p) => lib.addWeeklyTest(plan, p, { week: num('week'), date: one('date'), note: one('note'), forecast: num('forecast'), record: jsonInput('вопросы теста') })),
    week: () => inProgress((p) => lib.closeWeek(plan, p, { n: num('n'), date: one('date') })),
    baseline: () =>
      inProgress((p) =>
        lib.setBaseline(plan, p, {
          point: one('point'),
          minutes: num('minutes'),
          result: one('result'),
          scores: scoresInput(),
          problemId: num('problem'),
          day: num('day'),
          date: one('date'),
          today: today(),
        }),
      ),
    ci: () => inProgress((p) => lib.setCi(p, { workflow: one('workflow'), state: one('state'), date: one('date'), today: today() })),
    event: () => inProgress((p) => lib.addEvent(p, { type: one('type'), date: one('date'), note: one('note') })),
    break: () => inProgress((p) => lib.addBreak(p, { from: one('from'), to: one('to'), reason: one('reason'), today: today() })),
    pause: () => inProgress((p) => lib.addPause(p, { from: one('from'), to: one('to'), note: one('note'), today: today() })),
    card: () => ({
      file: DECK_FILE,
      apply: (f) => lib.addCard(plan, readJson(progressFile), f, allChecks(), { date: one('date'), track: one('track'), question: one('q'), answer: one('a'), mistake: num('mistake') }),
    }),
    deck: () => ({ file: DECK_FILE, apply: (f) => lib.mergeDeck(plan, f, allChecks(), jsonInput('запись колоды')) }),
    purchase: () => ({ file: LEDGER_FILE, apply: (f) => lib.addPurchase(f, shopIds(), { item: one('item'), date: one('date') }) }),
    repair: () => ({ file: LEDGER_FILE, apply: (f) => lib.addPurchase(f, shopIds(), { item: one('item'), date: one('date'), repair: true }) }),
    ledger: () => ({ file: LEDGER_FILE, apply: (f) => lib.mergeLedger(f, shopIds(), jsonInput('запись из лавки')) }),
    town: () => ({ file: TOWN_FILE, apply: (f) => lib.addTownActions(f, townInput()) }),
    sync: () => ({
      files: { ledger: LEDGER_FILE, town: TOWN_FILE, deck: DECK_FILE },
      apply: (files) => lib.syncBrowser(plan, files, shopIds(), allChecks(), jsonInput('запись из браузера')),
    }),
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

  // Пишутся только файлы, в которых что-то изменилось; при ошибке не пишется ни один.
  const spec = commands[command]()
  const paths = spec.files ?? { file: spec.file }
  const data = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, readJson(file)]))
  const before = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)]))
  const summary = spec.files ? spec.apply(data) : spec.apply(data.file)
  const changed = Object.keys(paths).filter((key) => JSON.stringify(data[key]) !== before[key])
  if (!args.dry) for (const key of changed) fs.writeFileSync(path.join(root, paths[key]), JSON.stringify(data[key], null, 2) + '\n')
  console.log(summary)
  const names = changed.map((key) => paths[key]).join(', ')
  if (!changed.length) console.log('Данные не изменились: файлы не тронуты.')
  else console.log(args.dry ? `Пробный запуск: ${names} — без изменений на диске.` : `Записано в ${names}. Проверь: npm test`)
}

/** id предметов лавки — из каталога в src/game/shop.ts. */
function shopIds() {
  const text = fs.readFileSync(path.join(root, 'src/game/shop.ts'), 'utf8')
  return [...text.matchAll(/\{ id: '([^']+)', group:/g)].map((match) => match[1])
}

/** JSON из ключа --json, из файла --file или со стандартного ввода (--json -). Что дошло испорченным — разбирает lib.parseJsonInput. */
function jsonInput(what) {
  const file = one('file')
  const json = one('json')
  if (file !== undefined && json !== undefined) wrong('запись задана и в --json, и в --file: оставь что-то одно')
  if (file !== undefined) {
    const full = path.resolve(file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) wrong(`файла «${file}» нет${path.isAbsolute(file) ? '' : ` (искал ${full})`}`)
    return lib.parseJsonInput(lib.decodeText(fs.readFileSync(full), `файл ${file}`), what, 'file')
  }
  if (json === '-') {
    if (stdin === null) wrong(`${what}: на стандартный ввод ничего не пришло. Подай запись через конвейер (… | node scripts/record.mjs ${command} --json -) или дай --file путь`)
    return lib.parseJsonInput(lib.decodeText(stdin, 'стандартный ввод'), what, 'stdin')
  }
  if (json === undefined) wrong(`нужен JSON (${what}): --file путь, --json - (со стандартного ввода) или --json '…'`)
  return lib.parseJsonInput(json, what, 'json')
}

/** Журнал города: одна запись или список. */
function townInput() {
  const parsed = jsonInput('журнал города')
  return Array.isArray(parsed) ? parsed : (parsed?.actions ?? [parsed])
}

/** Попытки по задаче: одна из ключей команды или список из --json. Без попытки — только заметка к задаче. */
function attemptsInput() {
  const typed = ATTEMPT_FLAGS.filter((key) => args[key] !== undefined)
  if (one('json') !== undefined || one('file') !== undefined) {
    if (typed.length) wrong(`попытки заданы и списком, и ключами (--${typed.join(', --')}): оставь что-то одно`)
    const parsed = jsonInput('попытки по задаче')
    return Array.isArray(parsed) ? parsed : [parsed]
  }
  if (!typed.length) return []
  return [{ date: one('date'), kind: one('kind'), minutes: num('minutes'), result: one('result'), selfSolved: yesNo('self'), approach: one('approach'), notes: one('notes'), forecast: num('forecast') }]
}

/** Самооценка: --scores A=2,B=1 → { A: 2, B: 1 }. */
function scoresInput() {
  const pairs = many('scores').flatMap((value) => String(value).split(',')).filter((pair) => pair.trim())
  if (!pairs.length) return undefined
  return Object.fromEntries(
    pairs.map((pair) => {
      const [code, value, ...extra] = pair.split('=')
      if (!code.trim() || value === undefined || extra.length) wrong(`--scores: нужен вид A=2,B=1, получено «${pair}»`)
      return [code.trim(), toNumber('scores', value)]
    }),
  )
}

try {
  await run()
} catch (error) {
  if (!(error instanceof lib.RecordError)) throw error
  console.error(`Не записано: ${error.message}`)
  process.exitCode = 1
}
