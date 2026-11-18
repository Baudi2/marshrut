import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { offplan, rawCycles, repoPurchases, repoRepairs, repoTownActions } from './data/load'
import type { Purchase } from './data/types'
import { blockers, type TownAction } from './game/town'
import type { TownApi } from './tabs/TownTab'
import { buildWorld } from './game/engine'
import { toISO, type ConditionLevel } from './game/rules'
import { SHOP, canAfford, shopItem } from './game/shop'
import type { ShopApi } from './tabs/Shop'
import type { SkyApi } from './tabs/SkyCard'
import { CoinIcon, GemIcon } from './world/extras'
import { computeSky, fetchWeather, type Place, type SkyOverride, type Weather } from './world/sky'
import { Growth } from './tabs/Growth'
import { PathTab } from './tabs/PathTab'
import { Problems } from './tabs/Problems'
import { Skills } from './tabs/Skills'
import { Today } from './tabs/Today'
import { Meter } from './ui/bits'

// Каталог построек тянет за собой three.js, поэтому грузится отдельно и только по запросу.
const TownLab = lazy(() => import('./tabs/TownLab'))
const TownTab = lazy(() => import('./tabs/TownTab'))

const TABS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'path', label: 'Путь' },
  { id: 'town', label: 'Город' },
  { id: 'problems', label: 'Задачи' },
  { id: 'growth', label: 'Прирост' },
  { id: 'skills', label: 'Навыки' },
] as const

type TabId = (typeof TABS)[number]['id'] | 'lab'

function readTab(): TabId {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'lab') return 'lab'
  // Прежний адрес лагеря ведёт в город.
  if (hash === 'camp') return 'town'
  return TABS.find((t) => t.id === hash)?.id ?? 'today'
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

function currentTheme(): 'light' | 'dark' {
  const stamped = document.documentElement.dataset.theme
  if (stamped === 'light' || stamped === 'dark') return stamped
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function App() {
  const [tab, setTab] = useState<TabId>(readTab)
  const [theme, setTheme] = useState(currentTheme)
  const [preview, setPreview] = useState<ConditionLevel | null>(null)

  // Покупки и ремонты: сразу в браузер, позже Claude Code переносит их в data/purchases.json.
  const [localBuys, setLocalBuys] = useState<Purchase[]>(() => readJSON('purchases', []))
  const [localRepairs, setLocalRepairs] = useState<Purchase[]>(() => readJSON('repairs', []))
  const [unequipped, setUnequipped] = useState<string[]>(() => readJSON('unequipped', []))
  // Действия в городе: сразу в браузер, позже Claude Code переносит их в data/town.json.
  const [localTown, setLocalTown] = useState<TownAction[]>(() => readJSON('town-actions', []))

  // Небо: место для погоды хранится в браузере, погода обновляется раз в полчаса.
  const [place, setPlaceState] = useState<Place | null>(() => readJSON('place', null))
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [skyOverride, setSkyOverride] = useState<SkyOverride>({})
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
    override: skyOverride,
    setOverride: setSkyOverride,
  }

  const today = toISO(now)
  const ledger = useMemo(
    () => ({
      purchases: [...repoPurchases, ...localBuys.filter((p) => !repoPurchases.some((r) => r.item === p.item))],
      repairs: [...repoRepairs, ...localRepairs.filter((p) => !repoRepairs.some((r) => sameRecord(r, p)))],
      town: [...repoTownActions, ...localTown.filter((action) => !repoTownActions.some((r) => sameAction(r, action)))],
    }),
    [localBuys, localRepairs, localTown],
  )
  const world = useMemo(() => buildWorld(rawCycles, offplan, today, ledger, now), [today, ledger, now])
  const [cycleId, setCycleId] = useState(world.active.id)
  const cycle = world.cycles.find((c) => c.id === cycleId) ?? world.active
  const level = preview ?? world.condition.level

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
    unsynced: {
      purchases: localBuys.filter((p) => !repoPurchases.some((r) => r.item === p.item)),
      repairs: localRepairs.filter((p) => !repoRepairs.some((r) => sameRecord(r, p))),
    },
    buy: (id) => {
      const item = shopItem(id)
      if (!item || world.owned.includes(id) || !canAfford(item, world.wallet)) return
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
      window.scrollTo(0, 0)
    }
    // Системная тема может смениться, пока сайт открыт.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => setTheme(currentTheme())
    window.addEventListener('hashchange', onHash)
    media.addEventListener('change', onScheme)
    return () => {
      window.removeEventListener('hashchange', onHash)
      media.removeEventListener('change', onScheme)
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      // тема просто не запомнится
    }
    setTheme(next)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Маршрут</span>
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
        <div className="level" title={`До уровня ${world.level.n + 1} осталось ${world.level.next - world.totalXp} XP`}>
          <span className="level-n">Ур. {world.level.n}</span>
          <Meter value={world.level.into} max={world.level.span} label={`Уровень ${world.level.n}: ${world.totalXp} из ${world.level.next} XP`} />
          <span className="level-xp">
            {world.totalXp} / {world.level.next} XP
          </span>
        </div>
        <a className="wallet" href="#/town" aria-label={`Монет: ${world.wallet.coins}, камней: ${world.wallet.gems}. Открыть город`}>
          <span>
            <CoinIcon /> {world.wallet.coins}
          </span>
          <span>
            <GemIcon /> {world.wallet.gems}
          </span>
        </a>
        <button className="btn btn-quiet theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>
          {theme === 'dark' ? 'День' : 'Ночь'}
        </button>
      </header>

      {world.ranksEarned.length > 0 && <p className="ranks">Звания: {world.ranksEarned.join(' · ')}</p>}

      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'is-on' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>

      <main>
        {tab === 'today' && <Today world={world} cycle={cycle} />}
        {tab === 'path' && (
          <PathTab
            world={world}
            cycle={cycle}
            level={level}
            preview={preview}
            onPreview={setPreview}
            gear={gear}
            skyApi={skyApi}
          />
        )}
        {tab === 'town' && (
          <Suspense fallback={<p className="muted">Загружаю город…</p>}>
            <TownTab
              world={world}
              cycle={cycle}
              level={level}
              preview={preview}
              onPreview={setPreview}
              shop={shop}
              skyApi={skyApi}
              town={townApi}
              now={now}
            />
          </Suspense>
        )}
        {tab === 'problems' && <Problems cycle={cycle} />}
        {tab === 'growth' && <Growth world={world} cycle={cycle} />}
        {tab === 'skills' && <Skills world={world} />}
        {tab === 'lab' && (
          <Suspense fallback={<p className="muted">Загружаю каталог…</p>}>
            <TownLab />
          </Suspense>
        )}
      </main>

      <footer className="foot">
        Данные обновлены {String(cycle.raw.progress.meta.updatedAt).split('-').reverse().join('.')}. Очки, уровни и состояние
        мира считаются на сайте из журнала занятий.
      </footer>
    </div>
  )
}
