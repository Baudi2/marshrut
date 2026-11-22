import { useState, type FormEvent } from 'react'
import { KIND_NAME, PHASE_NAME, SEASON_NAME, locate, searchPlaces, type Place, type Sky } from '../world/sky'

export interface SkyApi {
  sky: Sky
  place: Place | null
  /** Сообщение, если погода не загрузилась. */
  error: string | null
  setPlace: (place: Place | null) => void
}

/** Откуда брать погоду и как выглядит небо: место и текущее состояние. Стоит в настройках, на странице «Ещё». */
export function SkyCard({ api }: { api: SkyApi }) {
  const { sky, place } = api
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const list = await searchPlaces(query.trim())
      setFound(list)
      if (!list.length) setNote('Ничего не нашлось. Попробуй другое написание.')
    } catch {
      setNote('Не удалось связаться с сервисом погоды.')
    } finally {
      setBusy(false)
    }
  }

  const auto = async () => {
    setBusy(true)
    setNote(null)
    try {
      api.setPlace(await locate())
      setFound(null)
    } catch (error) {
      setNote(error instanceof Error ? `${error.message}. Найди город по названию.` : 'Не удалось определить место.')
    } finally {
      setBusy(false)
    }
  }

  const status = !place
    ? 'Место не выбрано: сезон и время суток идут по часам устройства, погоды нет.'
    : sky.live
      ? `${place.name}: ${sky.temperature}°, ${KIND_NAME[sky.kind]}.`
      : api.error
        ? `${place.name}: ${api.error}`
        : `${place.name}: загружаю погоду.`

  return (
    <div className="card">
      <h3>Место для погоды</h3>
      <p>{status}</p>
      <div className="chips">
        <span className="chip">{SEASON_NAME[sky.season]}</span>
        <span className="chip">{PHASE_NAME[sky.phase]}</span>
        <span className="chip">{KIND_NAME[sky.kind]}</span>
      </div>

      <form className="sky-form" onSubmit={search}>
        <div className="row">
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Город"
            aria-label="Город для погоды"
          />
          <button className="btn" type="submit" disabled={busy}>
            Найти
          </button>
          <button className="btn" type="button" onClick={auto} disabled={busy}>
            Определить по геолокации
          </button>
          {place && (
            <button className="btn btn-quiet" type="button" onClick={() => api.setPlace(null)}>
              Убрать место
            </button>
          )}
        </div>
        {found && found.length > 0 && (
          <ul className="place-list">
            {found.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    api.setPlace(p)
                    setFound(null)
                    setQuery('')
                  }}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && <p className="muted small">{note}</p>}
      </form>

      <p className="muted small">
        Место хранится только в этом браузере. В сервис
        погоды уходят одни координаты; при геолокации они округляются до 0,1°, это около 11 км. Данные о погоде —{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        .
      </p>
    </div>
  )
}
