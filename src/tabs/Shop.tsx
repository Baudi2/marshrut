import type { Purchase } from '../data/types'
import type { Damage } from '../game/repair'
import { HEAL_SESSIONS } from '../game/repair'
import { SHOP, canAfford, shopItem, type ShopItem, type Wallet } from '../game/shop'
import { CopyButton, plural } from '../ui/bits'
import { CoinIcon, GemIcon, ItemArt } from '../world/extras'

export interface ShopApi {
  wallet: Wallet
  owned: string[]
  /** Надетая экипировка. */
  gear: string[]
  /** Что сломано на самом деле, без предпросмотра. */
  damage: Damage[]
  /** Покупки и ремонты, которые есть только в этом браузере. */
  unsynced: { purchases: Purchase[]; repairs: Purchase[] }
  buy: (id: string) => void
  toggle: (id: string) => void
  repair: (ids: string[]) => void
}

const GROUPS = [
  { id: 'gear', title: 'Экипировка путника', note: 'Видна на карте и у костра. Надетое можно снять.' },
  { id: 'camp', title: 'Обустройство лагеря', note: 'Появляется на поляне. После долгого перерыва может сломаться.' },
] as const

const SESSIONS: [string, string, string] = ['занятие', 'занятия', 'занятий']

export function Shop({ shop, groups }: { shop: ShopApi; groups?: ('gear' | 'camp')[] }) {
  const { wallet, damage, unsynced } = shop
  const repairTotal = damage.reduce((sum, d) => sum + d.cost, 0)
  const pending = unsynced.purchases.length + unsynced.repairs.length

  return (
    <div className="card" id="shop">
      <div className="shop-head">
        <h3>Лавка</h3>
        <span className="wallet">
          <span title="Монеты">
            <CoinIcon /> {wallet.coins}
          </span>
          <span title="Камни">
            <GemIcon /> {wallet.gems}
          </span>
        </span>
      </div>
      <p className="muted">
        Монеты даются за ежедневный прогресс: закрытый день, задачу, сохранённый файл. Камни — только за недельные тесты.
        Домики-файлы, дни и очки не продаются: они растут только от работы.
      </p>

      {damage.length > 0 && (
        <div className="repair">
          <h4>Ремонт</h4>
          <p>
            Долгий перерыв сломал {damage.length} {plural(damage.length, ['постройку', 'постройки', 'построек'])}. Платить
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

      {GROUPS.filter((group) => !groups || groups.includes(group.id)).map((group) => (
        <section key={group.id} className="shop-group">
          <h4>{group.title}</h4>
          <p className="muted small">{group.note}</p>
          <ul className="shop-list">
            {SHOP.filter((item) => item.group === group.id).map((item) => (
              <ItemRow key={item.id} item={item} shop={shop} />
            ))}
          </ul>
        </section>
      ))}

      {pending > 0 && (
        <div className="sync-note">
          <p>
            <b>Только в этом браузере:</b>{' '}
            {[...unsynced.purchases.map((p) => shopItem(p.item)?.name), ...unsynced.repairs.map((r) => `ремонт: ${shopItem(r.item)?.name}`)].join(', ')}
            . Чтобы это было видно на других устройствах, отдай запись Claude Code — он добавит её в{' '}
            <code>data/purchases.json</code>.
          </p>
          <CopyButton text={JSON.stringify(unsynced)} label="Скопировать запись" />
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, shop }: { item: ShopItem; shop: ShopApi }) {
  const owned = shop.owned.includes(item.id)
  const worn = shop.gear.includes(item.id)
  const broken = shop.damage.some((d) => d.item === item.id)
  const can = canAfford(item, shop.wallet)
  const missing = item.coins ? item.coins - shop.wallet.coins : (item.gems ?? 0) - shop.wallet.gems
  return (
    <li className={`shop-item${owned ? ' is-owned' : ''}`}>
      <ItemArt id={item.id} />
      <div className="shop-info">
        <b>{item.name}</b>
        <span className="muted small">{item.about}</span>
      </div>
      <div className="shop-act">
        {!owned && (
          <span className="price">
            {item.coins ? <CoinIcon /> : <GemIcon />} {item.coins ?? item.gems}
          </span>
        )}
        {!owned && (
          <button className="btn btn-primary" disabled={!can} onClick={() => shop.buy(item.id)} aria-label={`Купить: ${item.name}`}>
            Купить
          </button>
        )}
        {!owned && !can && <span className="muted small">не хватает {missing}</span>}
        {owned && item.group === 'gear' && (
          <button className="btn" aria-pressed={worn} onClick={() => shop.toggle(item.id)}>
            {worn ? 'Снять' : 'Надеть'}
          </button>
        )}
        {owned && item.group === 'camp' && (
          <span className={broken ? 'pill pill-current' : 'pill pill-core'}>{broken ? 'сломано' : 'в лагере'}</span>
        )}
      </div>
    </li>
  )
}
