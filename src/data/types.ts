// Формат файлов data/cycles/<цикл>/plan.json и progress.json.
// Это описание — источник правды о том, какие значения понимает сайт.

export interface LinkRef {
  title: string
  url: string
}

export interface Resource {
  title: string
  links: LinkRef[]
  todo: string
  lang?: string
}

export interface PlanStep {
  n: number
  text: string
  minutes: number
}

export type DayMode = 'light' | 'deep' | 'retro'

export interface PlanDay {
  day: number
  week: number
  plannedDate: string
  plannedWeekday: string
  track: string
  /** Код трека из tracks[].code либо 'retro'. */
  trackCode: string
  mode: DayMode
  plannedMinutes: number
  minimum: string | null
  extension: string | null
  steps: PlanStep[]
  resources: Resource[]
  leetcode: {
    new: number[]
    repeatFromEmptyEditor: number[]
    pairIfFast: number[]
    noHints: number[]
  }
}

export interface PlanTrack {
  code: string
  name: string
  startLevel: string
  sessions: string
  budget: string
  target: string
  /** Ранг, который даёт этот цикл, и что для него нужно. */
  rank?: TrackRank
}

/**
 * Условие ранга. Ранг навыка даётся за подтверждённый результат цикла, а не за число занятий:
 * days — закрыто занятий трека; problems — задач решено, повторено с пустого редактора или решено без подсказок;
 * timed — задача решена сама на таймере; artifacts — файлы сохранены (id из camp);
 * tests — доля баллов по вопросам трека в недельных тестах при достаточном числе вопросов; ci — workflow зелёный.
 */
export type RankCriterion =
  | { kind: 'days'; need: number }
  | { kind: 'problems'; what: 'solved' | 'repeated' | 'nohints'; need: number }
  | { kind: 'timed'; problem: number }
  | { kind: 'artifacts'; items: string[] }
  | { kind: 'tests'; share: number; questions: number }
  | { kind: 'ci' }

export interface TrackRank {
  name: string
  criteria: RankCriterion[]
}

export interface PlanWeek {
  n: number
  title: string
  goal: string
  checkpoint: string
}

export type ProblemRole = 'baseline' | 'main' | 'pair' | 'baseline-final' | 'reserve'

export interface PlanProblem {
  id: number
  title: string
  url: string
  difficulty: string
  pattern: string
  role: ProblemRole
  plannedDay: number
  repeatDay?: number
  noHintsDay?: number
  pairId?: number
}

/** Ключевая точка маршрута — «перевал». */
export interface KeyPoint {
  day: number
  title: string
  what: string
}

/** Домик лагеря — файл или папка, которые растут вместе с планом. */
export interface CampItem {
  id: string
  repo: string
  /** Путь в репозитории; `*` заменяет любую часть имени. */
  path: string
  /** Короткая подпись под домиком; без неё берётся имя файла. */
  label?: string
  title: string
  kind: 'cabin' | 'hall' | 'tower'
  track: string | null
  /** День, когда файл появляется. */
  day: number
  /** Дни, когда файл дописывается. */
  growsOn: number[]
}

export interface BonusDay {
  afterDay: number
  week: number
  track: string
  text: string
  optional?: boolean
}

export interface Plan {
  meta: {
    title: string
    cycle: {
      n: number
      id: string
      name: string
      /** Что находится на вершине маршрута. */
      summit: string
      /** Звание за закрытый цикл. */
      rankOnComplete: string
    }
    [key: string]: unknown
  }
  tracks: PlanTrack[]
  weeks: PlanWeek[]
  days: PlanDay[]
  keyPoints?: KeyPoint[]
  camp?: CampItem[]
  bonusDays?: BonusDay[]
  leetcode: PlanProblem[]
  tutorPrompts?: string[]
}

/**
 * minimum — закрыт на минимуме; core — закрыт ядром; extension — ядро и расширение;
 * skipped — пропущен; in_progress — начат.
 */
export type DayStatus = 'minimum' | 'core' | 'extension' | 'skipped' | 'in_progress'

/**
 * Состояние артефакта. Построенным домик считается при created, saved или committed.
 * Остальные значения (not-saved, given-by-tutor, unknown) — стройка.
 */
export interface ProgressArtifact {
  repo: string
  path: string
  state: string
}

export interface ProgressDay {
  day: number
  status: DayStatus
  dates: string[]
  confirmed?: boolean
  plannedMinutes?: number
  wallClockMinutes?: number
  summary?: string
  stepsDone?: number[]
  stepsOpen?: { n: number; what: string }[]
  artifacts?: ProgressArtifact[]
  note?: string
}

export interface Session {
  date: string
  from: string | null
  to: string | null
  day: number
  topics: string[]
  /** Своя строка после занятия: что понял, своими словами. Идёт в летопись города и в отчёт недели. Очков не даёт. */
  insight?: string
}

/**
 * kind: timed-<минут> — попытка на таймере; rewrite-after-walkthrough — переписал после разбора;
 * from-empty-editor — повтор с пустого редактора; no-hints — без подсказок через 2–3 недели;
 * duel — дуэль с собой: старая задача заново на таймере, в зачёт идёт время быстрее первой попытки.
 * result: solved | not-solved.
 */
export interface Attempt {
  date: string
  kind: string
  minutes: number | null
  result: string
  selfSolved: boolean
  approach?: string
  notes?: string
  /** Прогноз перед попыткой на таймере: сколько минут, по собственной оценке, уйдёт. Очков за точность нет. */
  forecast?: number
}

/**
 * status: solved-with-walkthrough | solved-self | repeated-from-empty | solved-no-hints | solved-before-plan.
 */
export interface ProgressProblem {
  id: number
  title: string
  url?: string
  status: string
  attempts: Attempt[]
  nextRepeat?: { day: number; kind: string }
  notes?: string
}

export interface SelfAssessment {
  algorithms: number | null
  systemDesign: number | null
  gradle: number | null
  cicd: number | null
  aiTutorAndTests: number | null
}

export interface BaselinePoint {
  day: number
  date?: string
  problemId: number
  minutes: number | null
  result: string | null
  selfAssessment: SelfAssessment
}

export interface Mistake {
  date: string
  track: string
  problemId: number | null
  text: string
  /** true, когда ошибка не повторилась при повторе задачи. */
  beaten?: boolean
}

export interface KnowledgeCheck {
  date: string
  track: string
  question: string
  firstAnswer: string
  verdict: 'correct' | 'partial' | 'wrong'
  answer: string
}

export interface Pause {
  from: string
  to: string
  days: number
  note?: string
}

/** Плановый перерыв: отпуск, болезнь, командировка. Даты включительно. Рабочие дни внутри не считаются пропуском. */
export interface PlannedBreak {
  from: string
  to: string
  reason?: string
}

export interface Progress {
  meta: { updatedAt: string; [key: string]: unknown }
  position: {
    currentDay: number
    currentStep: number
    currentStepTitle?: string
    daysDone: number
    daysTotal: number
    startedAt: string
    pauses: Pause[]
  }
  days: ProgressDay[]
  sessions: Session[]
  leetcode: ProgressProblem[]
  baseline: { start: BaselinePoint; final: BaselinePoint }
  mistakes: Mistake[]
  knowledgeChecks: KnowledgeCheck[]
  petProject?: {
    ci?: { helloWorldWorkflow: string | null; buildWorkflow: string | null }
    [key: string]: unknown
  }
  openItems: string[]
  observations: string[]
  /** Плановые перерывы цикла: не больше десяти рабочих дней на цикл. */
  breaks?: PlannedBreak[]
  /** Недели, закрытые по чекпоинту. */
  weeks?: { n: number; closed: boolean; date?: string }[]
  /** События вне дней: ci-fixed — починил красный CI. */
  events?: { date: string; type: string; note?: string }[]
  /** Недельные тесты. За тест даются камни; при пересдаче считается лучшая попытка. */
  weeklyTests?: WeeklyTest[]
}

/**
 * Тест по материалу недели. Ведёт репетитор: 10 вопросов, каждый ответ — от 0 до 2 баллов.
 */
export interface WeeklyTest {
  week: number
  date: string
  score: number
  max: number
  /** track — код трека вопроса: по нему считается зачёт на ранг. */
  questions?: { q: string; points: number; note?: string; track?: string }[]
  note?: string
  /** Прогноз перед тестом: сколько баллов из max ожидал набрать. Очков за точность нет. */
  forecast?: number
}

/** Покупка или ремонт в лавке, data/purchases.json. */
export interface Purchase {
  item: string
  date: string
}

/** Своя награда: игрок назначает себе награду из настоящей жизни. Цена в камнях — по размеру, src/game/rewards.ts. */
export interface Reward {
  id: string
  name: string
  gems: number
}

/** Выкуп своей награды. Название и цена записаны как были в момент выкупа: список наград потом можно менять. */
export interface Redeemed {
  at: string
  name: string
  gems: number
}

/** Памятный знак на пройденном перевале: подпись игрока. cycle — папка цикла, day — номер дня-перевала. */
export interface MemorialSign {
  cycle: string
  day: number
  text: string
  date: string
}

/** Ответ по карточке колоды, data/deck.json. card — номер карточки (src/game/deck.ts), ok — знал или нет. */
export interface DeckReview {
  card: string
  at: string
  ok: boolean
}

/**
 * Своя карточка колоды, data/deck.json → cards: вопрос и ответ, которые игрок записал сам.
 * source: note — из заметок; mistake — из журнала ошибок, тогда в mistake лежит текст этой ошибки.
 * Вопрос — от 3 до 200 знаков, ответ — от 1 до 600; track — код трека из плана. Проверка — src/game/deck.ts.
 * Номер карточки считается по дате и вопросу, как у проверок понимания: текст записанного вопроса не правят.
 */
export interface OwnCard {
  date: string
  track: string
  question: string
  answer: string
  source: 'note' | 'mistake'
  mistake?: string
}

/** Всё, что сделал игрок: покупки, ремонты, награды, знаки, повторы колоды и действия в городе — из репозитория и из браузера. */
export interface Ledger {
  purchases: Purchase[]
  repairs: Purchase[]
  /** Журнал действий в городе, data/town.json. */
  town?: import('../game/town').TownAction[]
  /** Список своих наград, журнал их выкупов и памятные знаки — тоже в data/purchases.json. */
  rewards?: Reward[]
  redeemed?: Redeemed[]
  signs?: MemorialSign[]
  /** Ответы по карточкам колоды, data/deck.json. */
  reviews?: DeckReview[]
  /** Свои карточки колоды, там же. */
  cards?: OwnCard[]
}

/**
 * Стороннее развитие, data/offplan.json: всё полезное вне плана.
 * kind: session — занятие; artifact — сохранённый файл; problem-self и problem-walkthrough — задача;
 * video — видео или доклад; article — статья или глава книги; meetup — встреча с коллегами;
 * mock-interview — тестовое собеседование.
 * Видео, статья, встреча и собеседование засчитываются, только если записаны выводы (takeaways):
 * правила — в src/game/side.ts.
 */
export interface OffplanEntry {
  date: string
  kind:
    | 'session'
    | 'artifact'
    | 'problem-self'
    | 'problem-walkthrough'
    | 'video'
    | 'article'
    | 'meetup'
    | 'mock-interview'
  title: string
  track?: string | null
  minutes?: number
  /** Откуда: YouTube, Boosty, ссылка, название встречи. */
  source?: string
  /** С кем: для встреч и собеседований. */
  with?: string
  /** Что вынес: по одной мысли на строку. */
  takeaways?: string[]
}

export interface RawCycle {
  dir: string
  plan: Plan
  progress: Progress
}
