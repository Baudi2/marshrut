import type { CycleView } from '../game/engine'
import {
  MIN_PAIRS,
  MIN_TREND_PAIRS,
  TREND_SHARE,
  attemptKind,
  forecastReport,
  gapText,
  pairTitle,
  type ForecastPair,
  type ForecastScale,
} from '../game/forecast'
import { fmtDate } from '../game/text'

/** Столько последних пар шкалы видно сразу; остальные лежат под «Раньше». */
const SHOWN = 3

/** «ждал → вышло» одной строкой. У пары без числа вместо него — что случилось. */
function Nums({ pair }: { pair: ForecastPair }) {
  if (pair.unit === 'points') {
    return (
      <>
        ждал {pair.forecast} → <b>{pair.fact}</b> из {pair.max}
      </>
    )
  }
  if (pair.fact === null) {
    return (
      <>
        ждал {pair.forecast} мин → <b>{pair.solved ? 'решена' : 'не решена'}</b>
      </>
    )
  }
  return (
    <>
      ждал {pair.forecast} → <b>{pair.fact}</b> мин
    </>
  )
}

function Pairs({ pairs, cycleNames }: { pairs: ForecastPair[]; cycleNames: boolean }) {
  return (
    <ul className="forecast-list">
      {pairs.map((pair) => {
        const sub = [
          fmtDate(pair.date),
          cycleNames ? `цикл «${pair.cycleName}»` : '',
          pair.unit === 'minutes' ? attemptKind(pair.kind) : '',
          gapText(pair),
        ]
        return (
          <li key={pair.key} className="forecast-pair">
            <span className="forecast-what">{pairTitle(pair)}</span>
            <span className="forecast-nums">
              <Nums pair={pair} />
            </span>
            <span className="forecast-sub">{sub.filter(Boolean).join(' · ')}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Одна шкала: сводка и её пары, свежие сверху. */
function Scale({ title, scale, cycleNames }: { title: string; scale: ForecastScale; cycleNames: boolean }) {
  if (scale.pairs.length === 0) return null
  const rows = [...scale.pairs].reverse()
  // Под «Раньше» уходит хвост длиннее двух строк: ради одной-двух сворачивать незачем.
  const cut = rows.length > SHOWN + 2 ? SHOWN : rows.length
  const older = rows.slice(cut)
  return (
    <section className="forecast-scale">
      <h4>{title}</h4>
      {scale.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {scale.note && <p className="muted small">{scale.note}</p>}
      <Pairs pairs={rows.slice(0, cut)} cycleNames={cycleNames} />
      {older.length > 0 && (
        <details className="fold inner">
          <summary>
            Раньше <span className="muted">· {older.length}</span>
          </summary>
          <Pairs pairs={older} cycleNames={cycleNames} />
        </details>
      )}
    </section>
  )
}

/** «Прогноз и факт»: чего ждал перед тестом или задачей на таймере и что вышло. Зеркало, а не оценка. */
export function ForecastCard({ cycles }: { cycles: CycleView[] }) {
  const report = forecastReport(cycles)
  const empty = report.pairs.length === 0
  const cycleNames = new Set(report.pairs.map((pair) => pair.cycle)).size > 1

  return (
    <div className="card forecast-card">
      <h3>Прогноз и факт</h3>
      <p className="muted">Чего ты ждал перед проверкой и что вышло. Это зеркало, а не оценка: очков за точность нет.</p>

      {empty && (
        <p>
          Прогнозов пока нет. Перед недельным тестом или задачей на таймере назови репетитору, сколько баллов или минут
          ждёшь, — он запишет.
        </p>
      )}

      <Scale title="Недельные тесты" scale={report.tests} cycleNames={cycleNames} />
      <Scale title="Задачи на таймере" scale={report.timed} cycleNames={cycleNames} />

      {!empty && (
        <details className="how">
          <summary>Как это считается</summary>
          <ul className="plain small">
            <li>Пара — прогноз и результат одной попытки. У пересдачи теста прогноз свой.</li>
            <li>Баллы и минуты — разные шкалы: сводка у каждой своя.</li>
            <li>Средняя разница — на сколько в среднем расходятся прогноз и факт, в любую сторону.</li>
            <li>Куда ты чаще ошибаешься, видно с {MIN_PAIRS} пар: когда в одну сторону их больше половины.</li>
            <li>
              Нерешённая задача — тоже факт, но без числа. В среднюю она не входит, а в счёт «ждёшь меньше, чем уходит»
              идёт, если на неё ушло не меньше минут, чем ты ждал.
            </li>
            <li>
              Точнее ли прогноз — средняя разница первой половины пар против второй, с {MIN_TREND_PAIRS} пар. Переменой
              считается сдвиг не меньше одной единицы и не меньше {Math.round(TREND_SHARE * 100)}% прежней разницы.
            </li>
            <li>Очков, монет, камней и трофеев за точность нет: иначе выгодно занижать прогноз.</li>
          </ul>
        </details>
      )}
    </div>
  )
}
