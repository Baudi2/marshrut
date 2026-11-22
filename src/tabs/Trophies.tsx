import type { World } from '../game/engine'
import { fmtDate } from '../ui/bits'
import { GemIcon } from '../world/extras'

/**
 * Трофеи: достижения за мастерство. Страница без пункта в панели — вход с «Прироста» и из «Ещё».
 * Полученные стоят первыми: список длинный, а смотреть в нём чаще всего на своё.
 */
export function Trophies({ world }: { world: World }) {
  const earned = world.trophies.filter((t) => t.earned)
  const ahead = world.trophies.filter((t) => !t.earned)
  const gems = earned.reduce((sum, t) => sum + t.gems, 0)
  return (
    <div className="stack">
      <a className="sum-back" href="#/growth">
        ← Прирост
      </a>
      <div className="section-head">
        <h2>Трофеи</h2>
        <p className="muted">
          Получено {earned.length} из {world.trophies.length}
          {gems > 0 ? `, камней за них — ${gems}` : ''}. Их нельзя купить и нельзя получить за число занятий; каждый даётся один раз.
        </p>
      </div>

      {earned.length > 0 && (
        <div className="card">
          <h3>Получены</h3>
          <ul className="trophy-list">
            {earned.map((t) => (
              <li key={t.id} className="trophy is-earned">
                <div className="trophy-info">
                  <b>{t.name}</b>
                  <span className="muted small">{t.how}</span>
                </div>
                <div className="trophy-state">
                  <span className="pill pill-core">получен{t.date ? ' ' + fmtDate(t.date) : ''}</span>
                  <span className="price">
                    <GemIcon /> +{t.gems}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3>{earned.length > 0 ? 'Впереди' : 'Все трофеи'}</h3>
        {ahead.length === 0 ? (
          <p className="muted">Все трофеи получены.</p>
        ) : (
          <ul className="trophy-list">
            {ahead.map((t) => (
              <li key={t.id} className="trophy">
                <div className="trophy-info">
                  <b>{t.name}</b>
                  <span className="muted small">{t.how}</span>
                </div>
                <div className="trophy-state">
                  <span className="pill">{t.progress ?? 'ещё нет'}</span>
                  <span className="price">
                    <GemIcon /> {t.gems}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
