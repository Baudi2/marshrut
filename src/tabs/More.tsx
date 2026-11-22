import type { CycleView, World } from '../game/engine'
import { cycleCaption } from '../game/summary'
import type { SyncSummary } from '../game/sync'
import { plural } from '../ui/bits'
import { SkyCard, type SkyApi } from './SkyCard'
import { SyncNote } from './SyncNote'

/** Тема сайта: как в системе, светлая или тёмная. */
export type ThemeChoice = 'system' | 'light' | 'dark'

export interface ThemeApi {
  choice: ThemeChoice
  set: (choice: ThemeChoice) => void
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'Системная' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
]

const TURNS: [string, string, string] = ['учебный день', 'учебных дня', 'учебных дней']
const PROBLEMS: [string, string, string] = ['задача', 'задачи', 'задач']

/**
 * «Ещё»: разделы, которые открывают реже остальных, и настройки сайта.
 * На телефоне сюда ведёт пятый пункт нижней панели; на широком экране «Задачи», «Прирост» и «Навыки» стоят и в верхней строке.
 */
export function More({
  world,
  cycle,
  theme,
  skyApi,
  sync,
  updatedAt,
}: {
  world: World
  cycle: CycleView
  theme: ThemeApi
  skyApi: SkyApi
  sync: SyncSummary
  /** Когда обновлены данные цикла, уже в виде «19.11.2026». */
  updatedAt: string
}) {
  const solved = cycle.problems.filter((p) => p.state !== 'none').length
  const turns = new Set(world.sessionDates).size
  const ranks = world.ranksEarned
  const links: { href: string; title: string; note: string }[] = [
    {
      href: '#/problems',
      title: 'Задачи',
      note: `${cycle.problems.length} ${plural(cycle.problems.length, PROBLEMS)} цикла, решено ${solved}`,
    },
    { href: '#/growth', title: 'Прирост', note: 'Сравнение с собой: замер, проверки понимания, ритм, время' },
    { href: '#/skills', title: 'Навыки', note: ranks.length ? `Звания: ${ranks.join(' · ')}` : 'Ранги по трекам и что нужно для следующего' },
    { href: '#/trophies', title: 'Трофеи', note: `Получено ${world.trophies.filter((t) => t.earned).length} из ${world.trophies.length}` },
    { href: `#/cycle/${cycle.id}`, title: 'Итог цикла', note: cycleCaption(cycle) },
    {
      href: '#/chronicle',
      title: 'Летопись города',
      note: turns ? `Ход за ходом: ${turns} ${plural(turns, TURNS)}` : 'Появится после первого занятия',
    },
  ]

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Ещё</h2>
      </div>

      <nav className="card link-list" aria-label="Остальные разделы">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            <span>
              <b>{link.title}</b>
              <span className="muted small">{link.note}</span>
            </span>
            <span aria-hidden="true">→</span>
          </a>
        ))}
      </nav>

      <h3 className="more-title">Настройки</h3>

      <div className="card">
        <h3>Тема</h3>
        <div className="seg seg-3" role="group" aria-label="Тема сайта">
          {THEMES.map((item) => (
            <button key={item.id} className={theme.choice === item.id ? 'is-on' : ''} aria-pressed={theme.choice === item.id} onClick={() => theme.set(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="muted small">Краски мира от темы не зависят: ночь на карте наступает по часам.</p>
      </div>

      <SkyCard api={skyApi} />

      <div className="card">
        <h3>Запись из браузера</h3>
        {sync.count > 0 ? (
          <SyncNote sync={sync} plain />
        ) : (
          <p className="muted">
            Всё, что сделано на сайте, уже в репозитории. Когда появится новое — покупка, стройка, ответ по карточке, — здесь будет кнопка
            «Скопировать запись».
          </p>
        )}
      </div>

      <p className="muted small more-foot">
        Данные обновлены {updatedAt}. Очки, уровни и состояние мира считаются на сайте из журнала занятий.
      </p>
    </div>
  )
}
