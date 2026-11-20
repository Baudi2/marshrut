// Карточка памятника: закрытый цикл одной строкой и файлы, которые он оставил.
import { STAGE_LABEL, type CycleView } from '../game/engine'
import { fmtDate, plural, type Forms } from '../game/text'
import { TrackBadge } from '../ui/bits'

const FILES: Forms = ['файл', 'файла', 'файлов']

export function MonumentCard({ cycle, folded }: { cycle: CycleView; folded: boolean }) {
  const dates = cycle.raw.progress.sessions.map((s) => s.date).sort()
  const built = cycle.buildings.filter((b) => b.stage >= 2)
  return (
    <div className="card" aria-live="polite">
      <div className="day-head">
        <div>
          <div className="eyebrow">Памятник цикла {cycle.n}</div>
          <h3>{cycle.name}</h3>
        </div>
        <div className="chips">
          <span className="pill">{cycle.rankOnComplete}</span>
        </div>
      </div>
      <p>
        Цикл пройден
        {dates.length > 0 && (
          <>
            : {fmtDate(dates[0])} — {fmtDate(dates[dates.length - 1])}
          </>
        )}
        . За него построено {built.length} {plural(built.length, FILES)} из {cycle.buildings.length}.
      </p>
      <p className="muted">
        {folded
          ? 'Постройки этого цикла свёрнуты в памятник: слобода освободилась под файлы следующего.'
          : 'Постройки цикла стоят в слободе, пока не начат следующий: тогда их место займут новые файлы, а этот список останется здесь.'}
      </p>
      {built.length > 0 && (
        <ul className="monument-files">
          {built.map((b) => (
            <li key={b.item.id}>
              <span className="monument-file">
                {b.item.track && <TrackBadge code={b.item.track} />}
                <span>{b.item.title}</span>
              </span>
              <code>{b.item.path}</code>
              {b.stage === 3 && <span className="muted">{STAGE_LABEL[3]}</span>}
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href={`#/cycle/${cycle.id}`}>Итог цикла →</a>
      </p>
    </div>
  )
}
