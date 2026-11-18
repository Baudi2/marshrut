import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { STAGE_LABEL, type BuildingView, type CycleView, type World } from '../game/engine'
import type { ConditionLevel } from '../game/rules'
import {
  BUILDINGS,
  COMFORT,
  GOODS,
  LEVEL_HOURS,
  NO_WELL_LIMIT,
  TIERS,
  TRADE_COINS,
  arrivalPace,
  blockers,
  buildCost,
  buildHours,
  buildingType,
  comfortRoom,
  maxLevel,
  moodOf,
  tierCost,
  tradeYield,
  type BuildingType,
  type Cost,
  type TownAction,
} from '../game/town'
import { TownCanvas, fmtLeft } from '../town3d/TownCanvas'
import { CENTER, LOOKS, levelName } from '../town3d/looks'
import { quarterOpen } from '../town3d/plan'
import { previewView, townView } from '../town3d/view'
import { ConditionPreview, CopyButton, TrackBadge, plural } from '../ui/bits'
import { CoinIcon, GemIcon } from '../world/extras'
import { artifactState } from './PathTab'
import { Shop, type ShopApi } from './Shop'
import { SkyCard, type SkyApi } from './SkyCard'

export interface TownApi {
  act: (action: Pick<TownAction, 'do' | 'type' | 'id'>) => void
  /** Действия, которые есть только в этом браузере. */
  unsynced: TownAction[]
  /** Отменить последнее действие, пока оно не перенесено в репозиторий. */
  undo: () => void
}

interface Props {
  world: World
  cycle: CycleView
  level: ConditionLevel
  preview: ConditionLevel | null
  onPreview: (level: ConditionLevel | null) => void
  shop: ShopApi
  skyApi: SkyApi
  town: TownApi
  now: Date
}

// ——— Значки ресурсов ———

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg className="res-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    {children}
  </svg>
)
const FoodIcon = () => (
  <Glyph>
    <path d="M10 17c-4 0-6-3-6-6 0-2.6 2-4.4 4.2-4.4.8 0 1.3.3 1.8.6.5-.3 1-.6 1.8-.6C14 6.6 16 8.400 16 11c0 3-2 6-6 6Z" fill="#c7663f" />
    <path d="M10 6.800c0-1.800 1-3 2.600-3.600" stroke="#5a7a3c" strokeWidth="1.600" fill="none" strokeLinecap="round" />
  </Glyph>
)
const WoodIcon = () => (
  <Glyph>
    <rect x="2.500" y="7" width="15" height="6.500" rx="3.200" fill="#a38658" />
    <ellipse cx="15" cy="10.250" rx="2.400" ry="3.200" fill="#d8c08f" />
    <ellipse cx="15" cy="10.250" rx="1" ry="1.400" fill="#a38658" />
  </Glyph>
)
const BrickIcon = () => (
  <Glyph>
    <rect x="2.500" y="6" width="15" height="8.500" rx="1.200" fill="#b0644a" />
    <path d="M2.500 10.250h15M8 6v4.250M12.500 10.250v4.250" stroke="#7d4534" strokeWidth="1" />
  </Glyph>
)
const PeopleIcon = () => (
  <Glyph>
    <circle cx="7" cy="6.500" r="2.600" fill="#6f7f8f" />
    <path d="M2.500 16c0-3 2-5 4.500-5s4.500 2 4.500 5Z" fill="#6f7f8f" />
    <circle cx="14" cy="7.500" r="2.100" fill="#9a7b6a" />
    <path d="M10.800 16c.2-2.400 1.400-4 3.200-4 2 0 3.400 1.700 3.500 4Z" fill="#9a7b6a" />
  </Glyph>
)
const MoodIcon = () => (
  <Glyph>
    <circle cx="10" cy="10" r="7" fill="#d9a441" />
    <circle cx="7.600" cy="8.400" r="1" fill="#5c4424" />
    <circle cx="12.400" cy="8.400" r="1" fill="#5c4424" />
    <path d="M6.800 11.600c.8 1.500 1.900 2.200 3.200 2.200s2.400-.7 3.200-2.200" stroke="#5c4424" strokeWidth="1.300" fill="none" strokeLinecap="round" />
  </Glyph>
)
const HammerIcon = () => (
  <Glyph>
    <path d="M11 3.500 16.500 9l-2 2-1.300-1.300-7.400 7.500c-.6.6-1.600.6-2.200 0-.6-.6-.6-1.600 0-2.200l7.500-7.400L9.800 6.200Z" fill="#7a6352" />
  </Glyph>
)

// ——— Тексты ———

const RESIDENTS: [string, string, string] = ['житель', 'жителя', 'жителей']

/** Что даёт уровень постройки, одной строкой. */
function gives(type: BuildingType, level: number): string {
  const at = (values: number[] | undefined) => (values ? values[level - 1] : 0)
  if (type.housing) return `мест для жителей: ${at(type.housing)}`
  if (type.food) return `еда: +${at(type.food)} за ход${type.id === 'bakery' ? ' (нужна мельница)' : ''}`
  if (type.wood) return `дерево: +${at(type.wood)} за ход`
  if (type.brick) return `кирпич: +${at(type.brick)} за ход`
  if (type.foodCap) return `запас еды: +${at(type.foodCap)}`
  if (type.materialCap) return `запас дерева и кирпича: +${at(type.materialCap)}`
  if (type.firewood) return `запас дров: прикрывает ${at(type.firewood)} ${plural(at(type.firewood), ['рабочий день', 'рабочих дня', 'рабочих дней'])} пропуска — город не зарастает и ничего не ломается`
  if (type.id === 'well') return `уют +${COMFORT.well * level}; без колодца жителей не больше ${NO_WELL_LIMIT}`
  if (type.id === 'workshop') return `стройка быстрее на ${6 * level}%, второй строитель`
  if (type.id === 'mill') return `еда огородов +${10 * level}%`
  if (type.id === 'tavern') return `уют +${COMFORT.tavern * level}; за ход приходит на одного жителя больше`
  if (type.id === 'market') return `обмен: за ${TRADE_COINS} монет — еды ${tradeYield(level, 'food')}, дерева ${tradeYield(level, 'wood')} или кирпича ${tradeYield(level, 'brick')}`
  if (type.id === 'tower') return 'после долгого перерыва ломается не больше одного украшения'
  return ''
}

const fmtHours = (hours: number) => fmtLeft(hours * 3600_000)

function Price({ cost, town, world }: { cost: Cost; town: World['town']; world: World }) {
  const parts: { key: string; icon: ReactNode; need: number; have: number }[] = [
    { key: 'coins', icon: <CoinIcon />, need: cost.coins, have: world.means.coins },
    { key: 'gems', icon: <GemIcon />, need: cost.gems, have: world.means.gems },
    { key: 'food', icon: <FoodIcon />, need: cost.food, have: town.food },
    { key: 'wood', icon: <WoodIcon />, need: cost.wood, have: town.wood },
    { key: 'brick', icon: <BrickIcon />, need: cost.brick, have: town.brick },
  ]
  return (
    <span className="cost">
      {parts
        .filter((part) => part.need > 0)
        .map((part) => (
          <span key={part.key} className={`cost-chip${part.have < part.need ? ' is-short' : ''}`}>
            {part.icon} {part.need}
            {part.have < part.need && <small> есть {Math.floor(part.have)}</small>}
          </span>
        ))}
    </span>
  )
}

function Reasons({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <ul className="reasons">
      {list.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  )
}

function fileAdvice(b: BuildingView, cycle: CycleView | undefined): string {
  const nextGrow = cycle ? b.item.growsOn.find((n) => !cycle.days.find((d) => d.n === n)?.done) : undefined
  switch (b.stage) {
    case 0:
      return `Участок размечен. Файл появится в день ${b.item.day}.`
    case 1:
      return 'Стройка: файл ещё не сохранён в репозитории. Сохрани и закоммить его — постройка достроится, это +10 XP.'
    case 2:
      return nextGrow ? `Построено. Пристройка появится, когда файл будет дописан в день ${nextGrow}.` : 'Построено.'
    default:
      return 'С пристройкой: файл дописывался после создания.'
  }
}

/** Довольство одной подсказкой: из чего сложился уют и как он влияет на приход жителей. */
function moodText(town: World['town']): string {
  const c = town.comfort
  const parts = [`ступень ${c.center}`, c.wells ? `колодцы ${c.wells}` : '', c.tavern ? `таверна ${c.tavern}` : '', c.decor ? `украшения ${c.decor}` : ''].filter(Boolean)
  const pace = arrivalPace(town)
  const effect =
    pace === 'fast'
      ? 'Уюта хватает всем с запасом: за ход приходит на одного жителя больше.'
      : pace === 'normal'
        ? 'Жители приходят как обычно; при довольстве 100% с запасом приходили бы быстрее.'
        : 'Уюта не больше половины от числа жителей: новые не приходят.'
  return `Довольство: ${moodOf(town)}%. Уют ${c.total} (${parts.join(', ')}) на ${town.population} ${plural(town.population, RESIDENTS)}; его хватает на ${comfortRoom(town)}. ${effect} Уют дают колодцы, таверна, украшения из лавки и новая ступень.`
}

const TIER_PREVIEW = ['Стоянка', 'Лагерь', 'Хутор', 'Деревня', 'Городок', 'Город']

export default function TownTab({ world, cycle, level, preview, onPreview, shop, skyApi, town: api, now }: Props) {
  const town = world.town
  const [selected, setSelected] = useState<string | null>(null)
  const [stagePreview, setStagePreview] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  // Таймеры на странице обновляются раз в полминуты.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const time = Math.max(clock, now.getTime())

  const season = skyApi.sky.season
  const gear = shop.gear
  const real = useMemo(() => townView(world, season, level, gear), [world, season, level, gear])
  const view = useMemo(
    () => (stagePreview === null ? real : previewView(stagePreview, world, season, level, gear)),
    [stagePreview, real, world, season, level, gear],
  )
  const previewing = stagePreview !== null

  const next = TIERS[town.tier + 1]
  const building = !previewing ? town.buildings.find((b) => b.id === selected) : undefined
  const file = selected?.startsWith('file:') ? world.cycles.flatMap((c) => c.buildings.map((b) => ({ b, c }))).find(({ b, c }) => `file:${c.id}:${b.item.id}` === selected) : undefined

  const hud: { key: string; icon: ReactNode; value: string; text: string }[] = [
    { key: 'coins', icon: <CoinIcon />, value: String(world.means.coins), text: `Монеты: ${world.means.coins}. Дают закрытый день, задача, сохранённый файл.` },
    { key: 'gems', icon: <GemIcon />, value: String(world.means.gems), text: `Камни: ${world.means.gems}. Дают недельные тесты и перевалы.` },
    { key: 'food', icon: <FoodIcon />, value: `${Math.floor(town.food)}`, text: `Запас еды: ${Math.floor(town.food)} из ${town.foodCap}. За ход: +${town.perTurn.food}, жители съедают ${town.perTurn.eaten}.` },
    { key: 'wood', icon: <WoodIcon />, value: `${Math.floor(town.wood)}`, text: `Дерево: ${Math.floor(town.wood)} из ${town.materialCap}. За ход: +${town.perTurn.wood}.` },
    { key: 'brick', icon: <BrickIcon />, value: `${Math.floor(town.brick)}`, text: `Кирпич: ${Math.floor(town.brick)} из ${town.materialCap}. За ход: +${town.perTurn.brick}.` },
    { key: 'people', icon: <PeopleIcon />, value: `${town.population}/${town.housing}`, text: `Жители: ${town.population}, мест ${town.housing}. Новый житель приходит за ход, если есть место, еды хватает с запасом и уюта достаточно.` },
    { key: 'mood', icon: <MoodIcon />, value: `${moodOf(town)}%`, text: moodText(town) },
    { key: 'builders', icon: <HammerIcon />, value: `${town.builders.total - town.builders.busy}/${town.builders.total}`, text: `Свободных строителей: ${town.builders.total - town.builders.busy} из ${town.builders.total}.` },
  ]

  const upgradeWhy = building ? blockers(town, { do: 'upgrade', id: building.id }, world.means) : []
  const tierWhy = next ? blockers(town, { do: 'tier' }, world.means) : []

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Город</h2>
        <p className="muted">
          Ступень «{TIERS[town.tier].name}». Город живёт в темпе учёбы: день с занятием — один ход, без занятий ничего не приходит и
          не отнимается. Ходов сделано: {town.turns}.
        </p>
      </div>

      <div className="hud" role="group" aria-label="Ресурсы">
        {hud.map((item) => (
          <button key={item.key} className={hint === item.text ? 'is-on' : ''} onClick={() => setHint(hint === item.text ? null : item.text)} aria-label={item.text} title={item.text}>
            {item.icon}
            <span>{item.value}</span>
          </button>
        ))}
      </div>
      {hint && (
        <p className="hud-hint" aria-live="polite">
          {hint}
        </p>
      )}

      <TownCanvas view={view} sky={skyApi.sky} selected={previewing ? null : selected} onSelect={setSelected} now={time} />

      {previewing && (
        <p className="note">
          Это предпросмотр ступени «{TIER_PREVIEW[stagePreview]}»: так город может выглядеть, когда дорастёт. Настоящий город не меняется.{' '}
          <button className="btn btn-quiet" onClick={() => setStagePreview(null)}>
            Вернуться к своему
          </button>
        </p>
      )}

      {!previewing && selected === 'center' && (
        <div className="card" aria-live="polite">
          <div className="eyebrow">Центр поселения</div>
          <h3>
            {TIERS[town.tier].name}: {CENTER[town.tier].name.toLowerCase()}
          </h3>
          {town.tierPending ? (
            <Building label={`Строится: ${TIERS[town.tierPending.n].center.toLowerCase()}`} readyAt={town.tierPending.readyAt} time={time} hours={TIERS[town.tierPending.n].hours} />
          ) : next ? (
            <>
              <p>
                Следующая ступень — «{next.name}»: {next.center.toLowerCase()}. Она открывает новые постройки, участки и {maxLevel(next.n)}-й уровень
                улучшений.
              </p>
              <ul className="needs">
                <Need ok={town.population >= next.residents} text={`жителей: ${town.population} из ${next.residents}`} />
                <Need ok={world.means.specials >= next.specials} text={`построек-файлов: ${world.means.specials} из ${next.specials}`} />
                <Need ok={town.food >= next.food} text={`запас еды: ${Math.floor(town.food)} из ${next.food}`} />
              </ul>
              <div className="act-row">
                <Price cost={tierCost(next.n)} town={town} world={world} />
                <span className="muted small">стройка {fmtHours(next.hours)}</span>
                <button className="btn btn-primary" disabled={tierWhy.length > 0} onClick={() => api.act({ do: 'tier' })}>
                  Перейти на ступень «{next.name}»
                </button>
              </div>
              <Reasons list={tierWhy} />
            </>
          ) : (
            <p>Это последняя ступень. Дальше город растёт уровнями построек.</p>
          )}
        </div>
      )}

      {building && (
        <div className="card" aria-live="polite">
          <div className="eyebrow">{buildingType(building.type)?.name}</div>
          <h3>{building.level > 0 ? levelName(building.type, building.level) : 'Строится'}</h3>
          <Levels level={building.level} pending={building.pending?.level} />
          {building.level > 0 && <p>Даёт: {gives(buildingType(building.type)!, building.level)}.</p>}
          {building.pending ? (
            <Building
              label={building.level > 0 ? `Улучшается до уровня ${building.pending.level}: ${levelName(building.type, building.pending.level).toLowerCase()}` : `Строится: ${levelName(building.type, 1).toLowerCase()}`}
              readyAt={building.pending.readyAt}
              time={time}
              hours={LEVEL_HOURS[building.pending.level - 1]}
            />
          ) : building.level < 5 ? (
            <>
              <p className="muted">
                Уровень {building.level + 1} — «{levelName(building.type, building.level + 1)}»: {gives(buildingType(building.type)!, building.level + 1)}.
              </p>
              <div className="act-row">
                <Price cost={buildCost(buildingType(building.type)!, building.level + 1)} town={town} world={world} />
                <span className="muted small">стройка {fmtHours(buildHours(town, building.level + 1))}</span>
                <button className="btn btn-primary" disabled={upgradeWhy.length > 0} onClick={() => api.act({ do: 'upgrade', id: building.id })}>
                  Улучшить
                </button>
              </div>
              <Reasons list={upgradeWhy} />
            </>
          ) : (
            <p className="muted">Это высший уровень.</p>
          )}
          {building.type === 'market' && building.level > 0 && (
            <div className="trade">
              <h4>Обмен на рынке</h4>
              <p className="muted small">Партия стоит {TRADE_COINS} монет. Чем выше уровень рынка, тем больше товара в партии.</p>
              <ul className="build-menu">
                {GOODS.map((goods) => {
                  const why = blockers(town, { do: 'trade', type: goods.id }, world.means)
                  return (
                    <li key={goods.id}>
                      <div>
                        <b>
                          {goods.name}: +{tradeYield(building.level, goods.id)}
                        </b>
                        {why.length > 0 && <div className="why small">{why.join('; ')}</div>}
                      </div>
                      <div className="act-row">
                        <span className="cost-chip">
                          <CoinIcon /> {TRADE_COINS}
                        </span>
                        <button className="btn" disabled={why.length > 0} onClick={() => api.act({ do: 'trade', type: goods.id })} aria-label={`Купить: ${goods.name}`}>
                          Купить
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {!previewing && file && (
        <div className="card" aria-live="polite">
          <div className="day-head">
            <div>
              <div className="eyebrow">Постройка-файл · {file.b.item.repo}</div>
              <h3>{file.b.item.title}</h3>
            </div>
            <div className="chips">
              <span className={`pill pill-stage-${file.b.stage}`}>{STAGE_LABEL[file.b.stage]}</span>
              {file.b.item.track && <TrackBadge code={file.b.item.track} />}
            </div>
          </div>
          <p>
            <code>{file.b.item.path}</code>
            {file.b.recorded && <span className="muted"> — в журнале: {artifactState(file.b.recorded)}</span>}
          </p>
          <p>{fileAdvice(file.b, file.c)}</p>
          <p className="muted">Купить такую постройку нельзя: она растёт только от работы.</p>
        </div>
      )}

      {!previewing && !selected && <p className="muted">Нажми на постройку на карте, чтобы увидеть, что она даёт и сколько стоит следующий уровень.</p>}

      <div className="card">
        <h3>Что можно построить</h3>
        <ul className="build-menu">
          {BUILDINGS.filter((type) => type.tier <= town.tier + 1).map((type) => {
            const have = town.buildings.filter((b) => b.type === type.id).length
            const limit = type.count[town.tier]
            const why = blockers(town, { do: 'build', type: type.id }, world.means)
            const locked = town.tier < type.tier
            return (
              <li key={type.id} className={locked ? 'is-locked' : ''}>
                <div>
                  <b>{type.name}</b> <span className="muted small">· {LOOKS[type.id]?.levels[0].name.toLowerCase()}</span>
                  <div className="muted small">
                    {gives(type, 1)}
                    {!locked && ` · построено ${have} из ${limit}`}
                  </div>
                  {why.length > 0 && <div className="why small">{locked ? why[0] : why.join('; ')}</div>}
                </div>
                <div className="act-row">
                  <Price cost={buildCost(type, 1)} town={town} world={world} />
                  <button className="btn" disabled={why.length > 0 || previewing} onClick={() => api.act({ do: 'build', type: type.id })} aria-label={`Построить: ${type.name}`}>
                    Построить
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="muted small">
          Первый уровень строится {fmtHours(LEVEL_HOURS[0])}, дальше — до суток. Ускорить стройку нельзя: таймер просто идёт. Место для
          постройки выбирает город: у каждой свой участок на плане.
        </p>
      </div>

      <div className="card">
        <h3>Каким город станет</h3>
        <p className="muted">Посмотри любую ступень заранее. Это только картинка: постройки и ресурсы не меняются.</p>
        <div className="seg" role="group" aria-label="Предпросмотр ступени города">
          <button className={stagePreview === null ? 'is-on' : ''} onClick={() => setStagePreview(null)}>
            Сейчас
          </button>
          {TIER_PREVIEW.map((name, i) => (
            <button key={name} className={stagePreview === i ? 'is-on' : ''} onClick={() => setStagePreview(i)}>
              {name}
            </button>
          ))}
        </div>
        <p className="small">
          <a href="#/lab">Каталог построек</a> — все уровни каждой постройки рядом.
        </p>
      </div>

      {api.unsynced.length > 0 && (
        <div className="card sync-note">
          <p>
            <b>Только в этом браузере:</b> {api.unsynced.length} {plural(api.unsynced.length, ['действие', 'действия', 'действий'])} в городе. Чтобы город был
            тем же на других устройствах, отдай журнал Claude Code — он добавит его в <code>data/town.json</code>.
          </p>
          <div className="act-row">
            <CopyButton text={JSON.stringify(api.unsynced)} label="Скопировать журнал" />
            <button className="btn btn-quiet" onClick={api.undo}>
              Отменить последнее действие
            </button>
          </div>
        </div>
      )}

      <SkyCard api={skyApi} />
      <ConditionPreview
        real={world.condition.level}
        missed={world.missedWorkdays}
        firewood={world.town.firewood}
        covered={world.covered}
        breaks={world.breaks}
        value={preview}
        onChange={onPreview}
      />
      <Shop shop={shop} />

      <div className="card">
        <h3>Постройки-файлы</h3>
        <p className="muted">
          {quarterOpen(town.tier)
            ? 'Слобода за мостом.'
            : 'На стоянке их ещё не видно: мост и слобода появятся на карте, когда стоянка станет лагерем.'}{' '}
          Каждая постройка — файл из твоих репозиториев: построено {cycle.buildings.filter((b) => b.stage >= 2).length}, строится{' '}
          {cycle.buildings.filter((b) => b.stage === 1).length}, участков {cycle.buildings.filter((b) => b.stage === 0).length}. Сейчас в городе{' '}
          {town.population} {plural(town.population, RESIDENTS)}.
        </p>
        {[3, 2, 1, 0].map((stage) => {
          const list = cycle.buildings.filter((b) => b.stage === stage)
          if (!list.length) return null
          return (
            <div key={stage} className="build-group">
              <h4>
                {STAGE_LABEL[stage]} <span className="muted">· {list.length}</span>
              </h4>
              <ul className="build-list">
                {list.map((b) => {
                  const id = `file:${cycle.id}:${b.item.id}`
                  return (
                    <li key={b.item.id}>
                      <button className={selected === id ? 'is-on' : ''} onClick={() => setSelected(id)}>
                        <span>{b.item.title}</span>
                        <code>{b.item.path}</code>
                        <span className="muted">день {b.item.day}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Need({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={ok ? 'is-done' : ''}>
      <span aria-hidden="true">{ok ? '✓' : '·'}</span> {text}
    </li>
  )
}

function Levels({ level, pending }: { level: number; pending?: number }) {
  return (
    <div className="levels" role="img" aria-label={`Уровень ${level} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= level ? 'is-on' : n === pending ? 'is-next' : ''} />
      ))}
      <small>уровень {level} из 5</small>
    </div>
  )
}

/** Плашка идущей стройки: подпись, остаток времени и полоса. */
function Building({ label, readyAt, time, hours }: { label: string; readyAt: number; time: number; hours: number }) {
  const total = hours * 3600_000
  const left = Math.max(0, readyAt - time)
  return (
    <div className="building-bar">
      <div>
        <span>{label}</span>
        <b>{left > 0 ? `осталось ${fmtLeft(left)}` : 'готово'}</b>
      </div>
      <div className="building-track">
        <span style={{ width: `${Math.round(Math.min(1, 1 - left / total) * 100)}%` }} />
      </div>
    </div>
  )
}
