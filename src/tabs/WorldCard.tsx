import { useState } from 'react'
import type { World } from '../game/engine'
import { CONDITIONS } from '../game/rules'
import { fmtDate, plural } from '../ui/bits'
import { KIND_NAME, PHASE_NAME, SEASON_NAME } from '../world/sky'
import type { SkyApi } from './SkyCard'

const WORKDAYS: [string, string, string] = ['рабочий день', 'рабочих дня', 'рабочих дней']
const COVERS: [string, string, string] = ['рабочего дня', 'рабочих дней', 'рабочих дней']

/**
 * Мир одной строкой: состояние маршрута и небо. Пока пропусков нет, карточка свёрнута;
 * когда мир зарастает — раскрыта сама. Место для погоды выбирается в настройках («Ещё»).
 * Посмотреть другие стадии и небо можно в меню разработчика.
 */
export function WorldCard({ world, skyApi }: { world: World; skyApi: SkyApi }) {
  const real = world.condition.level
  const missed = world.missedWorkdays
  // Дровник, сломанный этим же перерывом, его всё равно прикрывает: показан запас, каким он был до перерыва.
  const firewood = Math.max(world.town.firewood, world.covered)
  const covered = world.covered
  const breaks = world.breaks
  const { sky, place, error } = skyApi
  const [open, setOpen] = useState(real > 0)

  const weather = !place
    ? 'Место для погоды не выбрано: сезон и время суток идут по часам устройства.'
    : sky.live
      ? `${place.name}: ${sky.temperature}°, ${KIND_NAME[sky.kind]}.`
      : error
        ? `${place.name}: ${error}`
        : `${place.name}: загружаю погоду.`

  return (
    <details className="card fold world-card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Мир: {CONDITIONS[real].name.toLowerCase()}{' '}
        <span className="muted">
          · {SEASON_NAME[sky.season]} · {PHASE_NAME[sky.phase]} · {KIND_NAME[sky.kind]}
        </span>
      </summary>
      <p>
        <b>{CONDITIONS[real].name}.</b> {CONDITIONS[real].look}{' '}
        {missed === 0 ? 'Пропущенных рабочих дней нет.' : `Без занятия ${missed} ${plural(missed, WORKDAYS)}.`}
      </p>
      <p className="muted small">
        Один пропуск ничего не меняет, со второго подряд мир начинает зарастать. Очки при этом не отнимаются, а первое занятие
        возвращает порядок.
        {firewood > 0 && ` Запас дров в дровнике прикрывает до ${firewood} ${plural(firewood, COVERS)} пропуска` + (covered > 0 ? `; сейчас прикрыто ${covered}.` : '.')}
        {breaks?.until && ` Объявлен плановый перерыв до ${fmtDate(breaks.until)}: эти дни пропуском не считаются.`}
        {breaks && breaks.used > 0 && ` Плановых перерывов в цикле: ${breaks.used} из ${breaks.limit} рабочих дней.`}
      </p>
      <p className="muted small">
        {weather} Настоящая погода на состояние мира не влияет. <a href="#/more">Место для погоды — в настройках</a>.
      </p>
    </details>
  )
}
