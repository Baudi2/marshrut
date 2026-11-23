import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { offplan, rawCycles, repoCards, repoPurchases, repoRedeemed, repoRepairs, repoReviews, repoRewards, repoSigns, repoTownActions } from './data/load'
import type { DeckReview, MemorialSign, OwnCard, Purchase, Redeemed, Reward } from './data/types'
import { cardId, dueCards, makeOwnCard, newCardProblem } from './game/deck'
import { ReviewTab, type DeckApi } from './tabs/ReviewTab'
import { rewardProblem, signProblem, tidy } from './game/rewards'
import { syncSummary } from './game/sync'
import { blockers, type TownAction } from './game/town'
import type { TownApi, TownSection } from './tabs/TownTab'
import { buildWorld } from './game/engine'
import { lastTurn } from './game/chronicle'
import { worldAt, type WorldInputs } from './game/history'
import { toISO } from './game/rules'
import { SHOP, canAfford, shopItem } from './game/shop'
import type { ShopApi } from './tabs/Shop'
import type { SkyApi } from './tabs/SkyCard'
import { CoinIcon, GemIcon } from './world/extras'
import { computeSky, fetchWeather, type Place, type Weather } from './world/sky'
import { ChroniclePage } from './tabs/Chronicle'
import { CycleSummary } from './tabs/CycleSummary'
import { levelNameOf } from './town3d/names'
import { DEV_OFF, DevMenu, devActive, devSummary, type DevState } from './tabs/DevMenu'
import { Growth } from './tabs/Growth'
import { More, type ThemeChoice } from './tabs/More'
import { PathTab, type SignApi } from './tabs/PathTab'
import { Problems } from './tabs/Problems'
import { Skills } from './tabs/Skills'
import { Today } from './tabs/Today'
import { Trophies } from './tabs/Trophies'
import { Meter } from './ui/bits'
import { TabIcon } from './ui/icons'

// Каталог построек тянет за собой three.js, поэтому грузится отдельно и только по запросу.
const TownLab = lazy(() => import('./tabs/TownLab'))
const TownTab = lazy(() => import('./tabs/TownTab'))

/**
 * Разделы. На телефоне в нижней панели пять пунктов: «Задачи», «Прирост» и «Навыки» (wide) открываются через «Ещё».
 * На широком экране все стоят в одной строке.
 */
const TABS = [
  { id: 'today', label: 'Сегодня', wide: false },
  { id: 'path', label: 'Путь', wide: false },
  { id: 'town', label: 'Город', wide: false },
  { id: 'review', label: 'Повтор', wide: false },
  { id: 'problems', label: 'Задачи', wide: true },
  { id: 'growth', label: 'Прирост', wide: true },
  { id: 'skills', label: 'Навыки', wide: true },
  { id: 'more', label: 'Ещё', wide: false },
] as const

type TabId = (typeof TABS)[number]['id'] | 'lab' | 'cycle' | 'dev' | 'chronicle' | 'trophies'

/** Страницы без своего пункта в нижней панели телефона: на них подсвечен пункт «Ещё». */
const UNDER_MORE: TabId[] = ['problems', 'growth', 'skills', 'cycle', 'chronicle', 'trophies']

function readTab(): TabId {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'lab') return 'lab'
  // Меню разработчика: адрес нигде не показан, вход — пять быстрых нажатий на название сайта.
  if (hash === 'dev') return 'dev'
  // Летопись города: страница без вкладки, вход — с «Города» и из карточки итога на «Сегодня».
  if (hash === 'chronicle') return 'chronicle'
  // Трофеи: вход с «Прироста» и из «Ещё».
  if (hash === 'trophies') return 'trophies'
  // Итог цикла — тоже страница без вкладки: #/cycle или #/cycle/<id цикла>.
  if (hash === 'cycle' || hash.startsWith('cycle/')) return 'cycle'
  // Прежний адрес лагеря ведёт в город.
  if (hash === 'camp') return 'town'
  // У города три подраздела: #/town, #/town/shop, #/town/files.
  if (hash.startsWith('town/')) return 'town'
  return TABS.find((t) => t.id === hash)?.id ?? 'today'
}

/** Подраздел города из адреса. */
function readTownSection(): TownSection {
  const part = /^#\/?town\/([a-z]+)/.exec(location.hash)?.[1]
  return part === 'shop' || part === 'files' ? part : 'map'
}

/** Цикл из адреса #/cycle/<id>. null — id не назван: показывается активный цикл. */
function readSummaryId(): string | null {
  const id = /^#\/?cycle\/([^/?]+)/.exec(location.hash)?.[1]
  if (!id) return null
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // без хранилища покупки живут до перезагрузки
  }
}

const sameRecord = (a: Purchase, b: Purchase) => a.item === b.item && a.date === b.date
const sameAction = (a: TownAction, b: TownAction) => a.at === b.at && a.do === b.do && a.type === b.type && a.id === b.id
/** Номера своих карточек, уже записанных в репозиторий. */
const repoCardIds = new Set(repoCards.map(cardId))

/** Тема, выбранная на сайте. Пока не выбрана — как в системе. */
function currentTheme(): ThemeChoice {
  const stamped = document.documentElement.dataset.theme
  return stamped === 'light' || stamped === 'dark' ? stamped : 'system'
}

export function App() {
  const [tab, setTab] = useState<TabId>(readTab)
  const [summaryId, setSummaryId] = useState(readSummaryId)
  const [townSection, setTownSection] = useState(readTownSection)
  const [theme, setTheme] = useState(currentTheme)
  // Предпросмотры из меню разработчика: живут, пока открыта страница, и ничего не записывают.
  const [dev, setDev] = useState<DevState>(DEV_OFF)
  const preview = dev.condition
  const skyOverride = dev.sky
  const brandTaps = useRef<number[]>([])

  // Покупки и ремонты: сразу в браузер, позже Claude Code переносит их в data/purchases.json.
  const [localBuys, setLocalBuys] = useState<Purchase[]>(() => readJSON('purchases', []))
  const [localRepairs, setLocalRepairs] = useState<Purchase[]>(() => readJSON('repairs', []))
  const [unequipped, setUnequipped] = useState<string[]>(() => readJSON('unequipped', []))
  // Свои награды, их выкупы и памятные знаки: тоже сначала в браузер, потом в data/purchases.json.
  const [localRewards, setLocalRewards] = useState<Reward[]>(() => readJSON('rewards', []))
  const [hiddenRewards, setHiddenRewards] = useState<string[]>(() => readJSON('rewards-hidden', []))
  const [localRedeemed, setLocalRedeemed] = useState<Redeemed[]>(() => readJSON('redeemed', []))
  const [localSigns, setLocalSigns] = useState<MemorialSign[]>(() => readJSON('signs', []))
  // Ответы по карточкам колоды и свои карточки: сразу в браузер, позже — в data/deck.json.
  const [localReviews, setLocalReviews] = useState<DeckReview[]>(() => readJSON('deck-reviews', []))
  const [localCards, setLocalCards] = useState<OwnCard[]>(() => readJSON('deck-cards', []))
  // Действия в городе: сразу в браузер, позже Claude Code переносит их в data/town.json.
  const [localTown, setLocalTown] = useState<TownAction[]>(() => readJSON('town-actions', []))

  // Небо: место для погоды хранится в браузере, погода обновляется раз в полчаса.
  const [place, setPlaceState] = useState<Place | null>(() => readJSON('place', null))
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setWeather(null)
    setWeatherError(null)
    if (!place) return
    let stale = false
    const key = `${place.lat},${place.lon}`
    const cached = readJSON<{ key: string; weather: Weather } | null>('weather', null)
    if (cached && cached.key === key && Date.now() - cached.weather.fetchedAt < 30 * 60 * 1000) {
      setWeather(cached.weather)
    }
    const load = () =>
      fetchWeather(place)
        .then((fresh) => {
          if (stale) return
          setWeather(fresh)
          setWeatherError(null)
          writeJSON('weather', { key, weather: fresh })
        })
        .catch(() => {
          if (!stale) setWeatherError('погода не загрузилась, проверь сеть.')
        })
    if (!cached || cached.key !== key || Date.now() - cached.weather.fetchedAt >= 30 * 60 * 1000) load()
    const timer = setInterval(load, 30 * 60 * 1000)
    return () => {
      stale = true
      clearInterval(timer)
    }
  }, [place])

  const skyApi: SkyApi = {
    sky: computeSky(now, place, weather, skyOverride),
    place,
    error: weatherError,
    setPlace: (next) => {
      setPlaceState(next)
      writeJSON('place', next)
    },
  }

  const today = toISO(now)
  // То, что есть только в этом браузере.
  const freshRewards = localRewards.filter((r) => !repoRewards.some((x) => x.id === r.id))
  const freshRedeemed = localRedeemed.filter((r) => !repoRedeemed.some((x) => x.at === r.at && x.name === r.name))
  const freshSigns = localSigns.filter((s) => !repoSigns.some((x) => x.cycle === s.cycle && x.day === s.day))
  const freshReviews = localReviews.filter((r) => !repoReviews.some((x) => x.card === r.card && x.at === r.at))
  const ledger = useMemo(
    () => ({
      reviews: [...repoReviews, ...localReviews.filter((r) => !repoReviews.some((x) => x.card === r.card && x.at === r.at))],
      cards: [...repoCards, ...localCards.filter((c) => !repoCardIds.has(cardId(c)))],
      rewards: [...repoRewards, ...localRewards.filter((r) => !repoRewards.some((x) => x.id === r.id))].filter((r) => !hiddenRewards.includes(r.id)),
      redeemed: [...repoRedeemed, ...localRedeemed.filter((r) => !repoRedeemed.some((x) => x.at === r.at && x.name === r.name))],
      signs: [...repoSigns, ...localSigns.filter((s) => !repoSigns.some((x) => x.cycle === s.cycle && x.day === s.day))],
      purchases: [...repoPurchases, ...localBuys.filter((p) => !repoPurchases.some((r) => r.item === p.item))],
      repairs: [...repoRepairs, ...localRepairs.filter((p) => !repoRepairs.some((r) => sameRecord(r, p)))],
      town: [...repoTownActions, ...localTown.filter((action) => !repoTownActions.some((r) => sameAction(r, action)))],
    }),
    [localBuys, localRepairs, localTown, localRewards, hiddenRewards, localRedeemed, localSigns, localReviews, localCards],
  )
  const world = useMemo(() => buildWorld(rawCycles, offplan, today, ledger, now), [today, ledger, now])
  const [cycleId, setCycleId] = useState(world.active.id)
  const cycle = world.cycles.find((c) => c.id === cycleId) ?? world.active
  const level = preview ?? world.condition.level
  // Город из летописи: учебный день, на который показана сцена. Живёт, пока открыта страница.
  const [townDate, setTownDate] = useState<string | null>(null)
  const turns = useMemo(() => [...new Set(world.sessionDates)].sort(), [world.sessionDates])
  const inputs = useMemo<WorldInputs>(() => ({ rawCycles, offplan, ledger }), [ledger])
  const past = useMemo(() => (townDate ? { date: townDate, world: worldAt(inputs, townDate, now) } : null), [townDate, inputs, now])
  // Итог последнего занятия для «Сегодня»: считается при каждом открытии, это два-четыре мира.
  const turn = useMemo(() => lastTurn(inputs, today, { now, world, levelName: levelNameOf }), [inputs, today, now, world])
  const showTownAt = (date: string) => {
    setTownDate(date)
    location.hash = '#/town'
  }

  const gear = world.owned.filter((id) => shopItem(id)?.group === 'gear' && !unequipped.includes(id))
  const saveUnequipped = (next: string[]) => {
    const unique = [...new Set(next)]
    setUnequipped(unique)
    writeJSON('unequipped', unique)
  }
  /** Предметы того же слота: носится один. */
  const rivals = (id: string) => {
    const slot = shopItem(id)?.slot
    return slot ? SHOP.filter((o) => o.slot === slot && o.id !== id).map((o) => o.id) : []
  }

  const shop: ShopApi = {
    wallet: world.wallet,
    owned: world.owned,
    gear,
    damage: world.damage,
    tier: world.town.tier,
    rewards: world.rewards,
    redeemed: world.redeemed,
    unsynced: {
      purchases: localBuys.filter((p) => !repoPurchases.some((r) => r.item === p.item)),
      repairs: localRepairs.filter((p) => !repoRepairs.some((r) => sameRecord(r, p))),
      rewards: freshRewards.filter((r) => !hiddenRewards.includes(r.id)),
      redeemed: freshRedeemed,
      signs: freshSigns,
    },
    addReward: (name, gems) => {
      const problem = rewardProblem(name, gems, world.rewards)
      if (problem) return problem
      const next = [...localRewards, { id: `r${Date.now().toString(36)}`, name: tidy(name), gems }]
      setLocalRewards(next)
      writeJSON('rewards', next)
      return null
    },
    removeReward: (id) => {
      const next = localRewards.filter((r) => r.id !== id)
      setLocalRewards(next)
      writeJSON('rewards', next)
      // Награду из репозитория сайт удалить не может: она просто скрывается в этом браузере.
      if (repoRewards.some((r) => r.id === id)) {
        const hidden = [...hiddenRewards, id]
        setHiddenRewards(hidden)
        writeJSON('rewards-hidden', hidden)
      }
    },
    redeem: (id) => {
      const reward = world.rewards.find((r) => r.id === id)
      if (!reward || world.wallet.gems < reward.gems) return
      const next = [...localRedeemed, { at: new Date().toISOString(), name: reward.name, gems: reward.gems }]
      setLocalRedeemed(next)
      writeJSON('redeemed', next)
    },
    undoRedeem: freshRedeemed.length
      ? () => {
          const last = freshRedeemed[freshRedeemed.length - 1]
          const next = localRedeemed.filter((r) => r !== last)
          setLocalRedeemed(next)
          writeJSON('redeemed', next)
        }
      : null,
    buy: (id) => {
      const item = shopItem(id)
      if (!item || world.owned.includes(id) || !canAfford(item, world.wallet) || (item.tier ?? 0) > world.town.tier) return
      const next = [...localBuys, { item: id, date: today }]
      setLocalBuys(next)
      writeJSON('purchases', next)
      saveUnequipped([...unequipped.filter((x) => x !== id), ...rivals(id)])
    },
    toggle: (id) => {
      if (unequipped.includes(id)) saveUnequipped([...unequipped.filter((x) => x !== id), ...rivals(id)])
      else saveUnequipped([...unequipped, id])
    },
    repair: (ids) => {
      const due = world.damage.filter((d) => ids.includes(d.item))
      if (!due.length || due.reduce((sum, d) => sum + d.cost, 0) > world.wallet.coins) return
      const next = [...localRepairs, ...due.map((d) => ({ item: d.item, date: today }))]
      setLocalRepairs(next)
      writeJSON('repairs', next)
    },
  }

  const sameSign = (s: MemorialSign, cycleId: string, day: number) => s.cycle === cycleId && s.day === day
  const signApi: SignApi = {
    gems: world.wallet.gems,
    put: (cycleId, dayN, text) => {
      const day = world.cycles.find((c) => c.id === cycleId)?.days.find((d) => d.n === dayN)
      const problem = signProblem(text, day, world.wallet.gems)
      if (problem) return problem
      const next = [...localSigns, { cycle: cycleId, day: dayN, text: tidy(text), date: today }]
      setLocalSigns(next)
      writeJSON('signs', next)
      return null
    },
    isFresh: (cycleId, dayN) => freshSigns.some((s) => sameSign(s, cycleId, dayN)),
    remove: (cycleId, dayN) => {
      const next = localSigns.filter((s) => !sameSign(s, cycleId, dayN))
      setLocalSigns(next)
      writeJSON('signs', next)
    },
  }

  const saveReviews = (next: DeckReview[]) => {
    setLocalReviews(next)
    writeJSON('deck-reviews', next)
  }
  const saveCards = (next: OwnCard[]) => {
    setLocalCards(next)
    writeJSON('deck-cards', next)
  }
  // Свои карточки, которые есть только в этом браузере. Карточка, совпавшая номером с проверкой понимания,
  // в колоду не попала — в запись для репозитория она тоже не идёт.
  const ownInDeck = new Set(world.deck.filter((c) => c.source !== 'check').map((c) => c.id))
  const freshCards = localCards.filter((c) => !repoCardIds.has(cardId(c)) && ownInDeck.has(cardId(c)))
  const isFreshCard = (id: string) => freshCards.some((c) => cardId(c) === id)
  const deckApi: DeckApi = {
    today,
    unsynced: { reviews: freshReviews, cards: freshCards },
    review: (card, ok) => saveReviews([...localReviews, { card, at: new Date().toISOString(), ok }]),
    undo: freshReviews.length
      ? () => {
          const last = freshReviews[freshReviews.length - 1]
          saveReviews(localReviews.filter((r) => r !== last))
        }
      : null,
    addCard: (draft) => {
      const card = makeOwnCard(draft, toISO(new Date()))
      const problem = newCardProblem(
        card,
        world.tracks.map((t) => t.track.code),
        world.deck,
      )
      if (problem) return problem
      saveCards([...localCards, card])
      return null
    },
    isFresh: isFreshCard,
    removeCard: (id) => {
      // Карточку из репозитория сайт убрать не может.
      if (!isFreshCard(id)) return
      saveCards(localCards.filter((c) => cardId(c) !== id))
      saveReviews(localReviews.filter((r) => r.card !== id))
    },
  }

  const unsyncedTown = localTown.filter((action) => !repoTownActions.some((r) => sameAction(r, action)))
  const saveTown = (next: TownAction[]) => {
    setLocalTown(next)
    writeJSON('town-actions', next)
    // Город пересчитывается на текущую минуту, а не на последнюю пятиминутную отметку.
    setNow(new Date())
  }
  const townApi: TownApi = {
    unsynced: unsyncedTown,
    act: (action) => {
      if (blockers(world.town, action, world.means).length) return
      saveTown([...localTown, { at: new Date().toISOString(), ...action }])
    },
    undo: () => {
      const last = unsyncedTown[unsyncedTown.length - 1]
      if (last) saveTown(localTown.filter((action) => action !== last))
    },
  }

  // Одна запись на весь сайт: всё, чего ещё нет в репозитории.
  const sync = syncSummary({ ...shop.unsynced, town: unsyncedTown, reviews: freshReviews, cards: freshCards })

  // Когда достраивается ближайшая стройка, город пересчитывается сам.
  const nextReady = Math.min(
    ...world.town.buildings.map((b) => b.pending?.readyAt ?? Infinity),
    world.town.tierPending?.readyAt ?? Infinity,
  )
  useEffect(() => {
    if (!Number.isFinite(nextReady)) return
    const timer = setTimeout(() => setNow(new Date()), Math.max(1000, nextReady - Date.now() + 1000))
    return () => clearTimeout(timer)
  }, [nextReady])

  useEffect(() => {
    const onHash = () => {
      setTab(readTab())
      setSummaryId(readSummaryId())
      setTownSection(readTownSection())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Потайной вход в меню разработчика: пять нажатий на название за две с половиной секунды.
  const tapBrand = () => {
    const at = Date.now()
    brandTaps.current = [...brandTaps.current.filter((t) => at - t < 2500), at]
    if (brandTaps.current.length < 5) return
    brandTaps.current = []
    location.hash = '#/dev'
  }

  // «Как в системе» снимает отметку с корня страницы: дальше тему выбирает prefers-color-scheme.
  const chooseTheme = (next: ThemeChoice) => {
    if (next === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    try {
      if (next === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
    } catch {
      // тема просто не запомнится
    }
    setTheme(next)
  }

  const updatedAt = String(cycle.raw.progress.meta.updatedAt).split('-').reverse().join('.')
  const dueToday = dueCards(world.deck, today).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1 className="brand-name" onClick={tapBrand}>
            Маршрут
          </h1>
          {world.cycles.length > 1 ? (
            <select value={cycle.id} onChange={(e) => setCycleId(e.target.value)} aria-label="Цикл">
              {world.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  Цикл {c.n} · {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="brand-cycle">
              Цикл {cycle.n} · {cycle.name}
            </span>
          )}
        </div>
        <a className="wallet" href="#/town/shop" aria-label={`Монет: ${world.wallet.coins}, камней: ${world.wallet.gems}. Открыть лавку`}>
          <span>
            <CoinIcon /> {world.wallet.coins}
          </span>
          <span>
            <GemIcon /> {world.wallet.gems}
          </span>
        </a>
        <div className="level" title={`До уровня ${world.level.n + 1} осталось ${world.level.next - world.totalXp} XP`}>
          <span className="level-n">Ур. {world.level.n}</span>
          <Meter value={world.level.into} max={world.level.span} label={`Уровень ${world.level.n}: ${world.totalXp} из ${world.level.next} XP`} />
          <span className="level-xp">
            {world.totalXp} / {world.level.next} XP
          </span>
        </div>
      </header>

      {devActive(dev) && tab !== 'dev' && (
        <p className="dev-bar" role="status">
          <span>
            <b>Предпросмотр:</b> {devSummary(dev)}. Это только картинка.
          </span>
          <span className="dev-bar-actions">
            <button className="btn btn-quiet" onClick={() => setDev(DEV_OFF)}>
              Выключить
            </button>
            <a className="btn btn-quiet" href="#/dev">
              Меню
            </a>
          </span>
        </p>
      )}

      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => {
          // «Ещё» на телефоне подсвечен и на страницах, у которых своего пункта в панели нет.
          const under = t.id === 'more' && UNDER_MORE.includes(tab)
          const cls = [tab === t.id ? 'is-on' : '', under ? 'is-on-narrow' : '', t.wide ? 'tab-wide' : ''].filter(Boolean).join(' ')
          return (
            <a key={t.id} href={`#/${t.id}`} className={cls || undefined} aria-current={tab === t.id ? 'page' : undefined}>
              <TabIcon id={t.id} />
              <span>{t.label}</span>
              {t.id === 'review' && dueToday > 0 && (
                <span className="tab-count" aria-label={`к повтору сегодня: ${dueToday}`}>
                  {dueToday}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <main>
        {tab === 'today' && <Today world={world} cycle={cycle} sync={sync} turn={turn} />}
        {tab === 'chronicle' && <ChroniclePage inputs={inputs} today={today} now={now} onShowTown={showTownAt} />}
        {tab === 'review' && <ReviewTab world={world} deck={deckApi} sync={sync} />}
        {tab === 'path' && (
          <PathTab
            world={world}
            cycle={cycle}
            level={level}
            gear={gear}
            skyApi={skyApi}
            signs={signApi}
          />
        )}
        {tab === 'town' && (
          <Suspense fallback={<p className="muted">Загружаю город…</p>}>
            <TownTab
              world={world}
              cycle={cycle}
              level={level}
              section={townSection}
              stagePreview={dev.stage}
              onStagePreview={(stage) => setDev({ ...dev, stage })}
              past={past}
              onPast={setTownDate}
              turns={turns}
              shop={shop}
              skyApi={skyApi}
              town={townApi}
              sync={sync}
              now={now}
            />
          </Suspense>
        )}
        {tab === 'problems' && <Problems cycle={cycle} />}
        {tab === 'growth' && <Growth world={world} cycle={cycle} />}
        {tab === 'skills' && <Skills world={world} />}
        {tab === 'trophies' && <Trophies world={world} />}
        {tab === 'more' && <More world={world} cycle={cycle} theme={{ choice: theme, set: chooseTheme }} skyApi={skyApi} sync={sync} updatedAt={updatedAt} />}
        {/* Неизвестный id и адрес без id ведут на активный цикл. */}
        {tab === 'cycle' && <CycleSummary world={world} cycle={world.cycles.find((c) => c.id === summaryId) ?? world.active} />}
        {tab === 'dev' && (
          <DevMenu
            dev={dev}
            onChange={setDev}
            real={{
              condition: world.condition.level,
              sky: computeSky(now, place, weather, {}),
              stage: world.town.tier,
              missed: world.missedWorkdays,
            }}
            updatedAt={updatedAt}
          />
        )}
        {tab === 'lab' && (
          <Suspense fallback={<p className="muted">Загружаю каталог…</p>}>
            <TownLab />
          </Suspense>
        )}
      </main>
    </div>
  )
}
