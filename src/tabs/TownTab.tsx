import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { STAGE_LABEL, type BuildingView, type CycleView, type World } from '../game/engine'
import { HEAL_SESSIONS } from '../game/repair'
import type { ConditionLevel } from '../game/rules'
import {
  BLUEPRINT_SHARE,
  BLUEPRINT_TESTS,
  BUILDINGS,
  COMFORT,
  GOODS,
  LEVEL_HOURS,
  NO_WELL_LIMIT,
  RARE,
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
  type Breakage,
  type BuildingType,
  type Cost,
  type TownAction,
} from '../game/town'
import { TownCanvas, fmtLeft } from '../town3d/TownCanvas'
import { CENTER, LOOKS, levelName } from '../town3d/looks'
import { quarterOpen } from '../town3d/plan'
import { folded, previewView, townView } from '../town3d/view'
import { TrackBadge, plural } from '../ui/bits'
import { CoinIcon, GemIcon } from '../world/extras'
import { fullDate } from '../game/summary'
import { MonumentCard } from './MonumentCard'
import { artifactState } from './PathTab'
import type { SyncSummary } from '../game/sync'
import { Shop, type ShopApi } from './Shop'
import { SyncNote } from './SyncNote'
import type { SkyApi } from './SkyCard'
import { WorldCard } from './WorldCard'

/** Подразделы вкладки: карта со стройкой, лавка и постройки-файлы. Адреса — #/town, #/town/shop, #/town/files. */
export type TownSection = 'map' | 'shop' | 'files'

const SECTIONS: { id: TownSection; label: string; href: string }[] = [
  { id: 'map', label: 'Город', href: '#/town' },
  { id: 'shop', label: 'Лавка', href: '#/town/shop' },
  { id: 'files', label: 'Файлы', href: '#/town/files' },
]

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
  section: TownSection
  /** Предпросмотр ступени из меню разработчика: null — настоящий город. */
  stagePreview: number | null
  onStagePreview: (stage: number | null) => void
  /** Город из летописи: каким он был к концу учебного дня. null — сегодняшний. */
  past: { date: string; world: World } | null
  /** Перейти к другому учебному дню летописи; null — вернуться к сегодняшнему городу. */
  onPast: (date: string | null) => void
  /** Учебные дни по порядку: по ним листается летопись города. */
  turns: string[]
  shop: ShopApi
  skyApi: SkyApi
  town: TownApi
  /** Запись из браузера, одна на весь сайт. */
  sync: SyncSummary
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
  if (type.rare) {
    const parts = [
      type.flat?.food && `еда: +${type.flat.food} за ход`,
      type.flat?.wood && `дерево: +${type.flat.wood} за ход`,
      type.flat?.brick && `кирпич: +${type.flat.brick} за ход`,
      type.comfort && `уют +${type.comfort}`,
    ].filter(Boolean)
    return `${parts.join(', ')}; работники не нужны`
  }
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
  if (type.id === 'tower') return 'после долгого перерыва ломается не больше одной вещи — постройки или украшения'
  return ''
}

const SESSIONS: [string, string, string] = ['занятие', 'занятия', 'занятий']

/** Чего город лишился, пока постройка сломана. У жилья и складов поломка — только вид. */
function lost(type: BuildingType, level: number): string {
  const at = (values: number[] | undefined) => (values ? values[level - 1] : 0)
  if (type.housing) return 'Жильё остаётся, жители не уходят: сломан только вид'
  if (type.foodCap) return 'Запас еды остаётся: сломан только вид'
  if (type.materialCap) return 'Запас дерева и кирпича остаётся: сломан только вид'
  if (type.food) return `Не работает: еды не даёт, обычно +${at(type.food)} за ход`
  if (type.wood) return `Не работает: дерева не даёт, обычно +${at(type.wood)} за ход`
  if (type.brick) return `Не работает: кирпича не даёт, обычно +${at(type.brick)} за ход`
  if (type.firewood) return 'Не работает: запас дров пропуски не прикрывает'
  if (type.id === 'well') return `Не работает: уюта не даёт; пока сломаны все колодцы, жителей сверх ${NO_WELL_LIMIT} не прибавляется`
  if (type.id === 'workshop') return 'Не работает: стройку не ускоряет, второго строителя нет'
  if (type.id === 'mill') return 'Не работает: огороды остались без прибавки, пекарня стоит'
  if (type.id === 'tavern') return 'Не работает: уюта не даёт, жители приходят без прибавки'
  if (type.id === 'market') return 'Не работает: обмена нет'
  if (type.id === 'tower') return 'Не работает: за следующим долгим перерывом не присмотрит'
  if (type.rare) return `Не работает: ${type.comfort ? 'уюта не даёт' : type.flat?.brick ? 'кирпича не даёт' : type.flat?.wood ? 'дерева не даёт' : 'еды не даёт'}`
  return 'Не работает'
}

/** Когда сломанное починится само. */
function heals(broken: Breakage): string {
  if (broken.healsIn === null) return `Починится само за ${HEAL_SESSIONS} ${plural(HEAL_SESSIONS, SESSIONS)}, когда вернёшься к занятиям`
  return `Починится само через ${broken.healsIn} ${plural(broken.healsIn, SESSIONS)}`
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

/** Довольство: из чего сложился уют и как он влияет на приход жителей. Само число стоит рядом, в панели ресурсов. */
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
  return `Уют ${c.total} (${parts.join(', ')}) на ${town.population} ${plural(town.population, RESIDENTS)}; его хватает на ${comfortRoom(town)}. ${effect} Уют дают колодцы, таверна, украшения из лавки и новая ступень.`
}

export default function TownTab({ world, cycle, level, section, stagePreview, onStagePreview, past, onPast, turns, shop, skyApi, town: api, sync, now }: Props) {
  const town = world.town
  const [selected, setSelected] = useState<string | null>(null)
  const [hudOpen, setHudOpen] = useState(false)
  // Таймеры на странице обновляются раз в полминуты.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const time = Math.max(clock, now.getTime())

  const season = skyApi.sky.season
  const gear = shop.gear
  // Город из летописи рисуется по миру того дня; кошелёк, лавка и карточки остаются сегодняшними.
  const real = useMemo(() => townView(past?.world ?? world, season, level, gear), [past, world, season, level, gear])
  const view = useMemo(
    () => (stagePreview === null ? real : previewView(stagePreview, world, season, level, gear)),
    [stagePreview, real, world, season, level, gear],
  )
  const previewing = stagePreview !== null || past !== null

  const next = TIERS[town.tier + 1]
  const building = !previewing ? town.buildings.find((b) => b.id === selected) : undefined
  const file = selected?.startsWith('file:') ? world.cycles.flatMap((c) => c.buildings.map((b) => ({ b, c }))).find(({ b, c }) => `file:${c.id}:${b.item.id}` === selected) : undefined

  const freeBuilders = town.builders.total - town.builders.busy
  // Панель ресурсов: в строке — значок и число, в раскрытом списке — название, сколько есть и что будет за ход.
  const hud: { key: string; icon: ReactNode; name: string; value: string; full: string; note?: string }[] = [
    { key: 'coins', icon: <CoinIcon />, name: 'Монеты', value: String(world.means.coins), full: String(world.means.coins), note: 'Идут на стройку, улучшения, починку и в лавку.' },
    { key: 'gems', icon: <GemIcon />, name: 'Камни', value: String(world.means.gems), full: String(world.means.gems), note: 'Нужны для новой ступени, редких вещей лавки и своих наград.' },
    {
      key: 'food',
      icon: <FoodIcon />,
      name: 'Еда',
      value: `${Math.floor(town.food)}`,
      full: `${Math.floor(town.food)} из ${town.foodCap}`,
      note: `За ход: +${town.perTurn.food}, жители съедают ${town.perTurn.eaten}.`,
    },
    { key: 'wood', icon: <WoodIcon />, name: 'Дерево', value: `${Math.floor(town.wood)}`, full: `${Math.floor(town.wood)} из ${town.materialCap}`, note: `За ход: +${town.perTurn.wood}.` },
    { key: 'brick', icon: <BrickIcon />, name: 'Кирпич', value: `${Math.floor(town.brick)}`, full: `${Math.floor(town.brick)} из ${town.materialCap}`, note: `За ход: +${town.perTurn.brick}.` },
    {
      key: 'people',
      icon: <PeopleIcon />,
      name: 'Жители',
      value: `${town.population}/${town.housing}`,
      full: `${town.population} из ${town.housing} мест`,
      note: 'Новый житель приходит за ход, если есть место, еды хватает с запасом и уюта достаточно.',
    },
    { key: 'mood', icon: <MoodIcon />, name: 'Довольство', value: `${moodOf(town)}%`, full: `${moodOf(town)}%`, note: moodText(town) },
    { key: 'builders', icon: <HammerIcon />, name: 'Строители', value: `${freeBuilders}/${town.builders.total}`, full: `свободно ${freeBuilders} из ${town.builders.total}` },
  ]

  const upgradeWhy = building ? blockers(town, { do: 'upgrade', id: building.id }, world.means) : []
  // Памятник закрытого цикла: по нажатию — что это был за цикл и какие файлы он оставил.
  const monument = !previewing && selected?.startsWith('cycle:') ? world.cycles.find((c) => `cycle:${c.id}` === selected && c.done) : undefined
  const repairWhy = building?.broken ? blockers(town, { do: 'repair', id: building.id }, world.means) : []
  const tierWhy = next ? blockers(town, { do: 'tier' }, world.means) : []
  // Сломанное после перерыва: видно под картой, чинится в карточке постройки.
  const wrecked = previewing ? [] : town.buildings.filter((b) => b.broken)

  // Карточка выбранного на карте: центр, постройка, постройка-файл или памятник. Открывается листом поверх карты.
  const hasPicked = !previewing && (selected === 'center' || !!building || !!file || !!monument)
  const picked = (
    <>
        {!previewing && selected === 'center' && (
          <div className="card">
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
          <div className="card">
            <div className="eyebrow">
              {buildingType(building.type)?.name}
              {building.broken && <span className="pill pill-current breakage-mark">сломано</span>}
            </div>
            <h3>{building.level > 0 ? levelName(building.type, building.level) : 'Строится'}</h3>
            {buildingType(building.type)?.rare ? (
              <p className="muted small">Редкая постройка: стоит одна на город, уровней у неё нет.</p>
            ) : (
              <Levels level={building.level} pending={building.pending?.level} />
            )}
            {building.level > 0 && (
              <p>
                {building.broken ? 'Когда цела, даёт' : 'Даёт'}: {gives(buildingType(building.type)!, building.level)}.
              </p>
            )}
            {building.broken && (
              <div className="breakage">
                <p>
                  <b>Сломано после перерыва.</b> {lost(buildingType(building.type)!, building.level)}. {heals(building.broken)}.
                </p>
                <div className="act-row">
                  <button
                    className="btn btn-primary"
                    disabled={repairWhy.length > 0}
                    onClick={() => api.act({ do: 'repair', id: building.id })}
                    aria-label={`Починить за ${building.broken.cost} ${plural(building.broken.cost, ['монету', 'монеты', 'монет'])}`}
                  >
                    Починить · <CoinIcon /> {building.broken.cost}
                  </button>
                  <span className="small">Починка мгновенная, строители для неё не нужны.</span>
                </div>
                <Reasons list={repairWhy} />
              </div>
            )}
            {building.pending ? (
              <Building
                label={building.level > 0 ? `Улучшается до уровня ${building.pending.level}: ${levelName(building.type, building.pending.level).toLowerCase()}` : `Строится: ${levelName(building.type, 1).toLowerCase()}`}
                readyAt={building.pending.readyAt}
                time={time}
                hours={LEVEL_HOURS[building.pending.level - 1]}
              />
            ) : buildingType(building.type)?.rare ? null : building.level < 5 ? (
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
          <div className="card">
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

        {monument && <MonumentCard cycle={monument} folded={folded(monument, world.cycles)} />}
    </>
  )

  const stages = [3, 2, 1, 0].map((stage) => ({ stage, list: cycle.buildings.filter((b) => b.stage === stage) })).filter((group) => group.list.length > 0)

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Город</h2>
        <p className="muted">
          Ступень «{TIERS[town.tier].name}» · ходов сделано: {town.turns}. День с занятием — один ход.
        </p>
      </div>

      <nav className="subnav" aria-label="Подразделы города">
        {SECTIONS.map((item) => (
          <a key={item.id} href={item.href} className={section === item.id ? 'is-on' : undefined} aria-current={section === item.id ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
      </nav>

      <button
        className="hud"
        aria-expanded={hudOpen}
        aria-controls="hud-list"
        aria-label={`Ресурсы: ${hud.map((item) => `${item.name.toLowerCase()} ${item.full}`).join('; ')}. ${hudOpen ? 'Свернуть подписи' : 'Показать подписи'}`}
        onClick={() => setHudOpen(!hudOpen)}
      >
        {hud.map((item) => (
          <span key={item.key} className="hud-cell" aria-hidden="true">
            {item.icon}
            <span>{item.value}</span>
          </span>
        ))}
      </button>
      {hudOpen && (
        <dl className="hud-list" id="hud-list">
          {hud.map((item) => (
            <div key={item.key}>
              <dt>
                {item.icon}
                <span>{item.name}</span>
              </dt>
              <dd>{item.full}</dd>
              {item.note && <dd className="hud-note muted small">{item.note}</dd>}
            </div>
          ))}
        </dl>
      )}

      {section === 'shop' && <Shop shop={shop} sync={sync} />}

      {section === 'files' && (
        <div className="card">
          <h3>Постройки-файлы</h3>
          <p className="muted">
            Каждая постройка — файл из твоих репозиториев: построено {cycle.buildings.filter((b) => b.stage >= 2).length}, строится{' '}
            {cycle.buildings.filter((b) => b.stage === 1).length}, участков {cycle.buildings.filter((b) => b.stage === 0).length}.{' '}
            {quarterOpen(town.tier) ? 'Стоят в слободе за мостом.' : 'На карте их пока не видно: мост и слобода появятся, когда стоянка станет лагерем.'}
          </p>
          {stages.map(({ stage, list }) => (
            // Участки под будущие файлы свёрнуты: их много, а смотреть в них пока нечего.
            <details key={stage} className="build-group" open={stage > 0 || stages.length === 1}>
              <summary>
                {STAGE_LABEL[stage]} <span className="muted">· {list.length}</span>
              </summary>
              <ul className="build-list">
                {list.map((b) => {
                  const id = `file:${cycle.id}:${b.item.id}`
                  const on = selected === id
                  return (
                    <li key={b.item.id}>
                      <button className={on ? 'is-on' : ''} aria-expanded={on} onClick={() => setSelected(on ? null : id)}>
                        <span>{b.item.title}</span>
                        <span className="muted small">день {b.item.day}</span>
                      </button>
                      {on && (
                        <div className="build-file">
                          <div className="chips">
                            <span className={`pill pill-stage-${b.stage}`}>{STAGE_LABEL[b.stage]}</span>
                            {b.item.track && <TrackBadge code={b.item.track} />}
                            <span className="chip">{b.item.repo}</span>
                          </div>
                          <p>
                            <code>{b.item.path}</code>
                            {b.recorded && <span className="muted"> — в журнале: {artifactState(b.recorded)}</span>}
                          </p>
                          <p>{fileAdvice(b, cycle)}</p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          ))}
          <p className="muted small">Купить такую постройку нельзя: она растёт только от работы.</p>
        </div>
      )}

      {section === 'map' && (
        <>
      <TownCanvas view={view} sky={skyApi.sky} selected={previewing ? null : selected} onSelect={setSelected} now={time} sheet={hasPicked ? picked : null} />

      {past && <PastBar past={past} turns={turns} onPast={onPast} />}

      {stagePreview !== null && (
        <p className="note">
          Это предпросмотр ступени «{TIERS[stagePreview].name}»: так город может выглядеть, когда дорастёт. Настоящий город не меняется.{' '}
          <button className="btn btn-quiet" onClick={() => onStagePreview(null)}>
            Вернуться к своему
          </button>
        </p>
      )}

      {wrecked.length > 0 && (
        <div className="breakage-note" role="status">
          <p>
            <b>
              Долгий перерыв сломал {wrecked.length} {plural(wrecked.length, ['постройку', 'постройки', 'построек'])}.
            </b>{' '}
            Сломанная постройка не работает. Платить не обязательно: всё чинится само на третьем занятии после возвращения, монеты
            только ускоряют.
          </p>
          <ul className="breakage-list">
            {wrecked.map((b) => (
              <li key={b.id}>
                <button
                  className={`breakage-chip${selected === b.id ? ' is-on' : ''}`}
                  aria-pressed={selected === b.id}
                  onClick={(e) => {
                    setSelected(b.id)
                    // Карточка открывается на карте, а карта выше этой заметки.
                    e.currentTarget.closest('.stack')?.querySelector('.town3d')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  }}
                >
                  {buildingType(b.type)?.name ?? levelName(b.type, b.level)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}


      {!previewing && !hasPicked && <p className="muted">Нажми на постройку на карте, чтобы увидеть, что она даёт и сколько стоит следующий уровень.</p>}

      <BuildList town={town} world={world} locked={previewing} onBuild={(type) => api.act({ do: 'build', type })} />

      {!previewing && <Blueprints town={town} world={world} onBuild={(type) => api.act({ do: 'build', type })} />}

      {api.unsynced.length > 0 && (
        <SyncNote sync={sync}>
          <button className="btn btn-quiet" onClick={api.undo}>
            Отменить последнее действие
          </button>
        </SyncNote>
      )}

      {!previewing && (
        <a className="card deck-link" href="#/chronicle">
          <span>
            <b>Летопись города.</b> Что происходило в каждый учебный день — и каким город был тогда
          </span>
          <span aria-hidden="true">→</span>
        </a>
      )}

      <WorldCard world={world} skyApi={skyApi} />
        </>
      )}
    </div>
  )
}

/**
 * Что можно построить. В списке — постройки открытых ступеней; то, что откроет следующая ступень,
 * свёрнуто в одну строку: там нечего нажимать, а место оно занимало наравне с доступным.
 */
function BuildList({ town, world, locked, onBuild }: { town: World['town']; world: World; locked: boolean; onBuild: (type: string) => void }) {
  const count = (type: BuildingType) => town.buildings.filter((b) => b.type === type.id).length
  const open = BUILDINGS.filter((type) => type.tier <= town.tier)
  // Лимит ступени выбран: строить такую постройку сейчас нельзя, строка с ценой и кнопкой ей не нужна.
  const full = open.filter((type) => count(type) >= type.count[town.tier])
  const free = open.filter((type) => !full.includes(type))
  const later = BUILDINGS.filter((type) => type.tier === town.tier + 1)
  const nextTier = TIERS[town.tier + 1]
  return (
    <div className="card">
      <h3>Что можно построить</h3>
      {free.length === 0 && <p className="muted">На этой ступени построено всё, что можно. Дальше — улучшения построек и следующая ступень.</p>}
      <ul className="build-menu">
        {free.map((type) => {
          const have = count(type)
          const down = town.buildings.filter((b) => b.type === type.id && b.broken).length
          const limit = type.count[town.tier]
          const why = blockers(town, { do: 'build', type: type.id }, world.means)
          return (
            <li key={type.id}>
              <div>
                <b>{type.name}</b> <span className="muted small">· {LOOKS[type.id]?.levels[0].name.toLowerCase()}</span>
                {down > 0 && <span className="pill pill-current breakage-mark">{down === have ? 'сломано' : `сломано ${down}`}</span>}
                <div className="muted small">
                  {gives(type, 1)} · построено {have} из {limit}
                </div>
                {why.length > 0 && <div className="why small">{why.join('; ')}</div>}
              </div>
              <div className="act-row">
                <Price cost={buildCost(type, 1)} town={town} world={world} />
                <button className="btn" disabled={why.length > 0 || locked} onClick={() => onBuild(type.id)} aria-label={`Построить: ${type.name}`}>
                  Построить
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {full.length > 0 && (
        <p className="muted small">
          Построено всё, что можно на этой ступени: {full.map((type) => `${type.name.toLowerCase()} — ${count(type)}`).join(', ')}.
        </p>
      )}
      {later.length > 0 && nextTier && (
        <details className="fold inner build-later">
          <summary>
            Откроется на ступени «{nextTier.name}» <span className="muted">· {later.length}</span>
          </summary>
          <ul className="plain">
            {later.map((type) => (
              <li key={type.id}>
                <b>{type.name}</b> <span className="muted">— {gives(type, 1)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">
        Первый уровень строится {fmtHours(LEVEL_HOURS[0])}, дальше — до суток. Ускорить стройку нельзя: таймер просто идёт. Место для
        постройки выбирает город: у каждой свой участок на плане.
      </p>
    </div>
  )
}

/**
 * Чертежи: редкие постройки, которых нет в обычном списке. Чертёж дают за сданный недельный тест;
 * в чертеже две постройки, выбрать можно одну — вторая в этом городе уже не появится.
 */
function Blueprints({ town, world, onBuild }: { town: World['town']; world: World; onBuild: (type: string) => void }) {
  const have = world.means.blueprints ?? 0
  const offers = [...new Set(RARE.map((type) => type.rare!.offer))].sort((a, b) => a - b)
  const share = Math.round(BLUEPRINT_SHARE * 100)
  return (
    <div className="card">
      <h3>Чертежи</h3>
      <p className="muted">
        Редкие постройки. Чертёж дают за недельный тест, сданный от {share}%. В чертеже две постройки — выбрать можно одну, вторая в этом
        городе уже не появится.
      </p>
      {offers.map((offer) => {
        const pair = RARE.filter((type) => type.rare!.offer === offer)
        const built = town.buildings.find((b) => pair.some((type) => type.id === b.type))
        const open = have >= offer
        const need = BLUEPRINT_TESTS[offer - 1]
        // Чертежа ещё нет: что в нём, одной строкой, без цен и кнопок.
        if (!open && !built) {
          return (
            <div className="blueprint" key={offer}>
              <div className="blueprint-head">
                <h4>Чертёж {offer}</h4>
                <span className="pill">{need === 1 ? 'за первый тест' : `за ${need}-й тест`}</span>
              </div>
              <p className="small">
                {pair.map((type, i) => (
                  <span key={type.id}>
                    {i > 0 && <span className="muted"> или </span>}
                    <b>{type.name}</b> <span className="muted">— {gives(type, 1).split(';')[0]}</span>
                  </span>
                ))}
              </p>
            </div>
          )
        }
        return (
          <div className="blueprint" key={offer}>
            <div className="blueprint-head">
              <h4>Чертёж {offer}</h4>
              <span className={`pill${open ? ' pill-core' : ''}`}>{built ? 'использован' : open ? 'открыт' : need === 1 ? 'за первый тест' : `за ${need}-й тест`}</span>
            </div>
            <ul className="build-menu">
              {pair.map((type) => {
                const mine = built?.type === type.id
                const why = built ? [] : blockers(town, { do: 'build', type: type.id }, world.means)
                return (
                  <li key={type.id} className={built && !mine ? 'is-locked' : ''}>
                    <div>
                      <b>{type.name}</b>
                      <div className="muted small">{gives(type, 1)}</div>
                      {mine && <div className="small">Стоит в городе.</div>}
                      {built && !mine && <div className="muted small">Не выбрана.</div>}
                      {why.length > 0 && <div className="why small">{why.join('; ')}</div>}
                    </div>
                    {!built && (
                      <div className="act-row">
                        <span className="cost-chip">
                          <CoinIcon /> {buildCost(type, 1).coins}
                        </span>
                        <button className="btn" disabled={why.length > 0} onClick={() => onBuild(type.id)} aria-label={`Построить по чертежу: ${type.name}`}>
                          Построить
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Полоса под картой, когда показан город из летописи: какой это день и как листать дальше. */
function PastBar({ past, turns, onPast }: { past: { date: string; world: World }; turns: string[]; onPast: (date: string | null) => void }) {
  const at = Math.max(0, turns.indexOf(past.date))
  // Ползунок двигается свободно, а город пересобирается, когда его отпустили: сборка сцены не мгновенная.
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? at
  const commit = () => {
    if (drag !== null && drag !== at) onPast(turns[drag])
    setDrag(null)
  }
  const then = past.world.town
  return (
    <div className="past-bar" role="status">
      <p>
        <b>
          Город {fullDate(past.date)} — ход {at + 1} из {turns.length}.
        </b>{' '}
        Тогда: {TIERS[then.tier].name.toLowerCase()}, построек {then.buildings.filter((b) => b.level > 0).length}, жителей {then.population}. Это летопись:
        строить и чинить здесь нельзя.
      </p>
      {turns.length > 1 && (
        <input
          className="past-range"
          type="range"
          min={0}
          max={turns.length - 1}
          value={shown}
          aria-label="Учебный день летописи"
          aria-valuetext={fullDate(turns[shown])}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      )}
      <div className="act-row">
        <button className="btn btn-quiet" disabled={at <= 0} onClick={() => onPast(turns[at - 1])}>
          ← Раньше
        </button>
        <button className="btn btn-quiet" disabled={at >= turns.length - 1} onClick={() => onPast(turns[at + 1])}>
          Позже →
        </button>
        <button className="btn" onClick={() => onPast(null)}>
          К сегодняшнему
        </button>
        <a className="small" href="#/chronicle">
          Летопись
        </a>
        {drag !== null && drag !== at && <span className="muted small">{fullDate(turns[drag])}</span>}
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
