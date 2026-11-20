// Летопись: тихая страница, на каждый день с занятием — одна запись. Не вкладка: открывается по ссылке из города.
// Это дневник поселения, а не лента уведомлений: ничего не всплывает, не считается и не мигает.
import { useMemo } from 'react'
import { chronicle, dateText, earnedText, monthText, type ChronicleEntry, type ChronicleLine } from '../game/chronicle'
import type { WorldInputs } from '../game/history'
import { plural } from '../game/text'
import { levelNameOf } from '../town3d/names'
import { TrackBadge } from '../ui/bits'

function Lines({ title, lines }: { title: string; lines: ChronicleLine[] }) {
  if (!lines.length) return null
  return (
    <div className="chron-block">
      <h4>{title}</h4>
      <ul className="plain">
        {lines.map((line, i) => (
          <li key={i}>{line.text}</li>
        ))}
      </ul>
    </div>
  )
}

function Entry({ entry, onShowTown }: { entry: ChronicleEntry; onShowTown: (date: string) => void }) {
  const earned = earnedText(entry.earned)
  const tracks = [...new Set(entry.days.map((d) => d.trackCode))]
  return (
    <article className="card chron-entry" aria-label={`Ход ${entry.turn}, ${dateText(entry.date)}`}>
      <header className="chron-head">
        <div>
          <div className="eyebrow">
            Ход {entry.turn} · {dateText(entry.date)}
          </div>
          <h3>{entry.title}</h3>
        </div>
        {tracks.length > 0 && (
          <div className="chips">
            {tracks.map((code) => (
              <TrackBadge key={code} code={code} />
            ))}
          </div>
        )}
      </header>

      {/* Своя строка после занятия — слова ученика, поэтому выделена как цитата. */}
      {entry.insights.map((text) => (
        <blockquote className="chron-quote" key={text}>
          {text}
        </blockquote>
      ))}

      {entry.topics.length > 0 && <p className="muted small">Темы: {entry.topics.join(' · ')}</p>}

      {entry.side.map((side, i) => (
        <div className="chron-block" key={i}>
          <p>
            {side.label}
            {side.source && <span className="muted"> · {side.source}</span>}
          </p>
          {side.takeaways.length > 0 && (
            <ul className="plain chron-takeaways">
              {side.takeaways.map((text, n) => (
                <li key={n}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <Lines title="Учёба и маршрут" lines={entry.study} />
      <Lines title="Город" lines={entry.town} />

      <footer className="chron-foot">
        <span className="muted small">{earned && `За день: ${earned}`}</span>
        <button className="btn btn-quiet chron-show" onClick={() => onShowTown(entry.date)}>
          Город в этот день
        </button>
      </footer>
    </article>
  )
}

/**
 * Лента записей, новые сверху, по месяцам. entries — результат chronicle() из src/game/chronicle.ts.
 * onShowTown — показать город, каким он был к концу этого учебного дня.
 */
export function Chronicle({ entries, onShowTown }: { entries: ChronicleEntry[]; onShowTown: (date: string) => void }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const months: { title: string; entries: ChronicleEntry[] }[] = []
  for (const entry of sorted) {
    const title = monthText(entry.date)
    const last = months[months.length - 1]
    if (last?.title === title) last.entries.push(entry)
    else months.push({ title, entries: [entry] })
  }

  return (
    <div className="stack chron">
      <a className="chron-back" href="#/town">
        ← Город
      </a>

      <div className="section-head">
        <div className="eyebrow">Город</div>
        <h2>Летопись</h2>
        <p>
          Каждый день с занятием — один ход города и одна запись здесь: что это был за день, что ты понял своими словами и что
          изменилось в поселении и на маршруте.
        </p>
        {sorted.length > 0 && (
          <p className="muted small">
            {sorted.length} {plural(sorted.length, ['запись', 'записи', 'записей'])}, новые сверху. Ничего не хранится отдельно: летопись
            считается из журнала занятий и журнала города.
          </p>
        )}
      </div>

      {sorted.length === 0 && (
        <div className="card">
          <p>Летопись пока пуста. Первая запись появится после первого занятия: день с занятием — один ход города.</p>
        </div>
      )}

      {months.map((month) => (
        <section className="chron-month" key={month.title} aria-label={month.title}>
          <h3 className="chron-month-title">{month.title}</h3>
          {month.entries.map((entry) => (
            <div className="chron-item" key={entry.date}>
              <Entry entry={entry} onShowTown={onShowTown} />
              {/* Перерыв был перед этим днём — в ленте он лежит между этой записью и более ранней. */}
              {entry.gap && <p className="chron-gap">{entry.gap}</p>}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/**
 * Страница целиком: сама считает летопись и запоминает её, пока не изменились данные.
 * Названия обликов построек («шалаш», «хижина») берутся из лёгкого списка src/town3d/names.ts:
 * сама сцена города тянет three.js, и ради названий её подгружать незачем.
 */
export function ChroniclePage({
  inputs,
  today,
  now,
  onShowTown,
}: {
  inputs: WorldInputs
  today: string
  /** Настоящий момент: без него сегодняшний день считается на свой конец. */
  now?: Date
  onShowTown: (date: string) => void
}) {
  const entries = useMemo(() => chronicle(inputs, today, { now, levelName: levelNameOf }), [inputs, today, now])
  return <Chronicle entries={entries} onShowTown={onShowTown} />
}
