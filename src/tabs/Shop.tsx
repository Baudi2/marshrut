import { useState, type FormEvent } from 'react'
import type { MemorialSign, Purchase, Redeemed, Reward } from '../data/types'
import { REWARD_NAME_MAX, REWARD_SIZES, rewardSize } from '../game/rewards'
import { toISO } from '../game/rules'
import type { Damage } from '../game/repair'
import { HEAL_SESSIONS } from '../game/repair'
import { SHOP, canAfford, shopItem, type ShopItem, type Wallet } from '../game/shop'
import type { SyncSummary } from '../game/sync'
import { SyncNote } from './SyncNote'
import { TIERS } from '../game/town'
import { fmtDate, plural } from '../ui/bits'
import { CoinIcon, GemIcon, ItemArt } from '../world/extras'

export interface ShopApi {
  wallet: Wallet
  owned: string[]
  /** Надетая экипировка. */
  gear: string[]
  /** Что сломано на самом деле, без предпросмотра. */
  damage: Damage[]
  /** Ступень города: часть украшений открывается не сразу. */
  tier: number
  /** Свои награды: список и журнал выкупов. */
  rewards: Reward[]
  redeemed: Redeemed[]
  /** Всё, что есть только в этом браузере: покупки, ремонты, награды, выкупы, памятные знаки. */
  unsynced: { purchases: Purchase[]; repairs: Purchase[]; rewards: Reward[]; redeemed: Redeemed[]; signs: MemorialSign[] }
  /** Завести награду. Возвращает причину отказа или null. */
  addReward: (name: string, gems: number) => string | null
  removeReward: (id: string) => void
  redeem: (id: string) => void
  /** Отменить последний выкуп, пока он не перенесён в репозиторий. */
  undoRedeem: (() => void) | null
  buy: (id: string) => void
  toggle: (id: string) => void
  repair: (ids: string[]) => void
}

const GROUPS = [
  { id: 'gear', title: 'Экипировка путника', note: 'Видна на карте и у костра. Надетое можно снять.' },
  { id: 'camp', title: 'Украшения города', note: 'Появляются на карте города. После долгого перерыва могут сломаться; чинятся сами за три занятия.' },
] as const

const SESSIONS: [string, string, string] = ['занятие', 'занятия', 'занятий']

/**
 * Лавка — подраздел вкладки «Город»: ремонт, экипировка, украшения и свои награды отдельными карточками.
 * Кошелёк показан в панели ресурсов над подразделами.
 */
export function Shop({ shop, sync }: { shop: ShopApi; sync: SyncSummary }) {
  const { wallet, damage, unsynced } = shop
  const repairTotal = damage.reduce((sum, d) => sum + d.cost, 0)
  const pending = Object.values(unsynced).reduce((sum, list) => sum + list.length, 0)

  return (
    <>
      {damage.length > 0 && (
        <div className="card repair">
          <h3>Ремонт</h3>
          <p>
            Долгий перерыв сломал {damage.length} {plural(damage.length, ['украшение', 'украшения', 'украшений'])}. Платить
            не обязательно: всё чинится само за {HEAL_SESSIONS} занятия после возвращения. Монеты только ускоряют.
          </p>
          <ul>
            {damage.map((d) => (
              <li key={d.item}>
                <span>
                  <b>{shopItem(d.item)?.name}</b>{' '}
                  {d.healsIn === null
                    ? '— перерыв ещё идёт'
                    : `— само через ${d.healsIn} ${plural(d.healsIn, SESSIONS)}`}
                </span>
                <button className="btn" disabled={wallet.coins < d.cost} onClick={() => shop.repair([d.item])}>
                  Починить · <CoinIcon /> {d.cost}
                </button>
              </li>
            ))}
          </ul>
          {damage.length > 1 && (
            <button
              className="btn btn-primary"
              disabled={wallet.coins < repairTotal}
              onClick={() => shop.repair(damage.map((d) => d.item))}
            >
              Починить всё · <CoinIcon /> {repairTotal}
            </button>
          )}
        </div>
      )}

      {GROUPS.map((group) => (
        <section key={group.id} className="card shop-group">
          <h3>{group.title}</h3>
          <p className="muted small">{group.note}</p>
          <ul className="shop-list">
            {SHOP.filter((item) => item.group === group.id).map((item) => (
              <ItemRow key={item.id} item={item} shop={shop} />
            ))}
          </ul>
        </section>
      ))}

      <Rewards shop={shop} />

      {pending > 0 && <SyncNote sync={sync} />}

      <p className="muted small">
        Монеты даются за закрытый день, задачу и сохранённый файл; камни — за недельные тесты, перевалы и трофеи. Постройки-файлы, дни и
        очки не продаются: они растут только от работы.
      </p>
    </>
  )
}

const GEMS: [string, string, string] = ['камень', 'камня', 'камней']

/** Свои награды: награды из настоящей жизни за камни. */
function Rewards({ shop }: { shop: ShopApi }) {
  const [name, setName] = useState('')
  const [gems, setGems] = useState(REWARD_SIZES[0].gems)
  const [error, setError] = useState<string | null>(null)
  const add = (event: FormEvent) => {
    event.preventDefault()
    const problem = shop.addReward(name, gems)
    setError(problem)
    if (!problem) setName('')
  }
  const log = [...shop.redeemed].reverse().slice(0, 5)
  return (
    <section className="card shop-group" id="rewards">
      <h3>Свои награды</h3>
      <p className="muted small">
        Награды из настоящей жизни, которые ты назначаешь себе сам: вечер с игрой, новая книга, поездка. Платишь камнями, а их дают
        только перевалы, недельные тесты и трофеи, — так награда всегда стоит за знаниями. На игру выкуп не влияет.
      </p>
      {shop.rewards.length > 0 && (
        <ul className="shop-list">
          {shop.rewards.map((reward) => {
            const short = reward.gems - shop.wallet.gems
            return (
              <li key={reward.id} className="shop-item reward-item">
                <div className="shop-info">
                  <b>{reward.name}</b>
                  <span className="muted small">
                    {rewardSize(reward.gems)?.name ?? 'своя'} награда ·{' '}
                    <button className="link-btn" onClick={() => shop.removeReward(reward.id)} aria-label={`Убрать из списка: ${reward.name}`}>
                      убрать из списка
                    </button>
                  </span>
                </div>
                <div className="shop-act">
                  <span className="price">
                    <GemIcon /> {reward.gems}
                  </span>
                  <button className={short > 0 ? 'btn' : 'btn btn-primary'} disabled={short > 0} onClick={() => shop.redeem(reward.id)} aria-label={`Выкупить: ${reward.name}`}>
                    Выкупить
                  </button>
                  {short > 0 && <span className="muted small">не хватает {short}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <form className="reward-form" onSubmit={add}>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={REWARD_NAME_MAX}
          placeholder="Например: вечер с новой игрой"
          aria-label="Название награды"
        />
        <select className="field" value={gems} onChange={(e) => setGems(Number(e.target.value))} aria-label="Размер награды">
          {REWARD_SIZES.map((size) => (
            <option key={size.id} value={size.gems}>
              {size.name} · {size.gems} {plural(size.gems, GEMS)}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Добавить в список
        </button>
        <p className="muted small">
          {REWARD_SIZES.map((size) => `${size.name} (${size.gems}) — ${size.hint}`).join('; ')}.
        </p>
      </form>
      {error && (
        <p className="form-error" role="alert">
          Не добавлено: {error}.
        </p>
      )}
      {log.length > 0 && (
        <>
          <ul className="reward-log" aria-label="Выкупленные награды">
            {log.map((item) => (
              <li key={item.at + item.name}>
                {fmtDate(toISO(new Date(item.at)))} · {item.name} · <GemIcon /> {item.gems}
              </li>
            ))}
          </ul>
          {shop.undoRedeem && (
            <button className="btn btn-quiet" onClick={shop.undoRedeem}>
              Отменить последний выкуп
            </button>
          )}
        </>
      )}
    </section>
  )
}

function ItemRow({ item, shop }: { item: ShopItem; shop: ShopApi }) {
  const owned = shop.owned.includes(item.id)
  const worn = shop.gear.includes(item.id)
  const broken = shop.damage.some((d) => d.item === item.id)
  const locked = (item.tier ?? 0) > shop.tier
  const can = canAfford(item, shop.wallet) && !locked
  const missing = item.coins ? item.coins - shop.wallet.coins : (item.gems ?? 0) - shop.wallet.gems
  // Недоступное — короткой строкой без кнопки: нажимать в ней нечего.
  if (!owned && !can) {
    return (
      <li className="shop-item is-far">
        <ItemArt id={item.id} />
        <div className="shop-info">
          <b>{item.name}</b>
          <span className="muted small">{locked ? `со ступени «${TIERS[item.tier ?? 0].name}»` : `не хватает ${missing}`}</span>
        </div>
        <span className="price">
          {item.coins ? <CoinIcon /> : <GemIcon />} {item.coins ?? item.gems}
        </span>
      </li>
    )
  }
  return (
    <li className={`shop-item${owned ? ' is-owned' : ''}`}>
      <ItemArt id={item.id} />
      <div className="shop-info">
        <b>{item.name}</b>
        <span className="muted small">
          {item.about}
          {item.comfort ? ` Уют +${item.comfort}.` : ''}
        </span>
      </div>
      <div className="shop-act">
        {!owned && (
          <span className="price">
            {item.coins ? <CoinIcon /> : <GemIcon />} {item.coins ?? item.gems}
          </span>
        )}
        {!owned && (
          <button className="btn btn-primary" onClick={() => shop.buy(item.id)} aria-label={`Купить: ${item.name}`}>
            Купить
          </button>
        )}
        {owned && item.group === 'gear' && (
          <button className="btn" aria-pressed={worn} onClick={() => shop.toggle(item.id)}>
            {worn ? 'Снять' : 'Надеть'}
          </button>
        )}
        {owned && item.group === 'camp' && (
          <span className={broken ? 'pill pill-current' : 'pill pill-core'}>{broken ? 'сломано' : 'в городе'}</span>
        )}
      </div>
    </li>
  )
}
