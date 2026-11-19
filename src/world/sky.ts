// Небо над миром: сезон, время суток и реальная погода.
// Без выбранного места сезон и время суток берутся из часов устройства, погоды нет.
// С местом погода, восход и закат приходят из Open-Meteo (без ключа, запросы прямо из браузера).

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'
export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type WeatherKind = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn']
export const PHASES: Phase[] = ['dawn', 'day', 'dusk', 'night']
export const KINDS: WeatherKind[] = ['clear', 'cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm']

export const SEASON_NAME: Record<Season, string> = { winter: 'зима', spring: 'весна', summer: 'лето', autumn: 'осень' }
export const PHASE_NAME: Record<Phase, string> = { dawn: 'рассвет', day: 'день', dusk: 'закат', night: 'ночь' }
export const KIND_NAME: Record<WeatherKind, string> = {
  clear: 'ясно',
  cloudy: 'облачно',
  overcast: 'пасмурно',
  fog: 'туман',
  drizzle: 'морось',
  rain: 'дождь',
  snow: 'снег',
  storm: 'гроза',
}

export interface Place {
  name: string
  lat: number
  lon: number
}

export interface Weather {
  kind: WeatherKind
  temperature: number
  /** Облачность, 0–100. */
  clouds: number
  /** Минуты от полуночи по местному времени места. */
  sunrise: number
  sunset: number
  /** Сдвиг места от UTC в минутах. */
  utcOffset: number
  fetchedAt: number
}

export interface Sky {
  season: Season
  phase: Phase
  kind: WeatherKind
  clouds: number
  temperature: number | null
  /** true — погода пришла из сети, false — её нет или это предпросмотр. */
  live: boolean
}

/** Сколько снега лежит, от 0 до 1: идёт снег — всё бело; зимой и в мороз он остаётся. Одно правило для города и карты маршрута. */
export function snowCover(sky: Sky): number {
  if (sky.kind === 'snow') return 1
  if (sky.temperature !== null) return sky.temperature <= -1 ? 0.85 : sky.season === 'winter' && sky.temperature <= 2 ? 0.5 : 0
  return sky.season === 'winter' ? 0.85 : 0
}

export interface SkyOverride {
  season?: Season
  phase?: Phase
  kind?: WeatherKind
}

/** Метеорологические сезоны; в южном полушарии сдвинуты на полгода. */
export function seasonFor(date: Date, lat = 50): Season {
  const month = (date.getMonth() + (lat < 0 ? 6 : 0)) % 12
  if (month === 11 || month <= 1) return 'winter'
  if (month <= 4) return 'spring'
  if (month <= 7) return 'summer'
  return 'autumn'
}

/** Восход и закат для средних широт, когда места нет: минуты от полуночи. */
const DEFAULT_SUN: Record<Season, [number, number]> = {
  winter: [8 * 60, 16 * 60 + 30],
  spring: [6 * 60 + 30, 19 * 60 + 30],
  summer: [5 * 60, 21 * 60 + 30],
  autumn: [7 * 60 + 15, 17 * 60 + 30],
}

/** Сумерки длятся по 45 минут до и после восхода и заката. */
const TWILIGHT = 45

export function phaseFor(minutes: number, sunrise: number, sunset: number): Phase {
  if (minutes >= sunrise - TWILIGHT && minutes < sunrise + TWILIGHT) return 'dawn'
  if (minutes >= sunset - TWILIGHT && minutes < sunset + TWILIGHT) return 'dusk'
  return minutes >= sunrise && minutes < sunset ? 'day' : 'night'
}

/** Коды погоды WMO, которые отдаёт Open-Meteo. */
export function kindFromWmo(code: number): WeatherKind {
  if (code === 0) return 'clear'
  if (code <= 2) return 'cloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

const DEFAULT_CLOUDS: Record<WeatherKind, number> = {
  clear: 8,
  cloudy: 45,
  overcast: 95,
  fog: 80,
  drizzle: 90,
  rain: 100,
  snow: 95,
  storm: 100,
}

export function computeSky(now: Date, place: Place | null, weather: Weather | null, override: SkyOverride = {}): Sky {
  const season = override.season ?? seasonFor(now, place?.lat)
  // Часы места, если оно выбрано; иначе часы устройства.
  const minutes = weather
    ? (((now.getUTCHours() * 60 + now.getUTCMinutes() + weather.utcOffset) % 1440) + 1440) % 1440
    : now.getHours() * 60 + now.getMinutes()
  const [sunrise, sunset] = weather ? [weather.sunrise, weather.sunset] : DEFAULT_SUN[seasonFor(now, place?.lat)]
  const kind = override.kind ?? weather?.kind ?? 'clear'
  return {
    season,
    phase: override.phase ?? phaseFor(minutes, sunrise, sunset),
    kind,
    clouds: override.kind || !weather ? DEFAULT_CLOUDS[kind] : weather.clouds,
    temperature: weather && !override.kind ? weather.temperature : null,
    live: !!weather && !override.kind,
  }
}

const clockMinutes = (iso: string) => {
  const [h, m] = iso.split('T')[1].split(':').map(Number)
  return h * 60 + m
}

export async function fetchWeather(place: Place): Promise<Weather> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,weather_code,cloud_cover&daily=sunrise,sunset&timezone=auto&forecast_days=1'
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`)
  const data = await response.json()
  return {
    kind: kindFromWmo(data.current.weather_code),
    temperature: Math.round(data.current.temperature_2m),
    clouds: data.current.cloud_cover,
    sunrise: clockMinutes(data.daily.sunrise[0]),
    sunset: clockMinutes(data.daily.sunset[0]),
    utcOffset: Math.round(data.utc_offset_seconds / 60),
    fetchedAt: Date.now(),
  }
}

/** Поиск города по названию. Координаты города публичны, округляем до сотых. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(query)}&count=5&language=ru&format=json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`)
  const data = await response.json()
  return (data.results ?? []).map((r: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
    name: [r.name, r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(', '),
    lat: Math.round(r.latitude * 100) / 100,
    lon: Math.round(r.longitude * 100) / 100,
  }))
}

/**
 * Место по геолокации браузера. Координаты округляются до 0,1° (около 11 км):
 * для погоды этого хватает, а точный адрес никуда не уходит.
 */
export function locate(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Геолокация недоступна в этом браузере'))
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: 'Моё место',
          lat: Math.round(pos.coords.latitude * 10) / 10,
          lon: Math.round(pos.coords.longitude * 10) / 10,
        }),
      () => reject(new Error('Браузер не дал доступ к геолокации')),
      { maximumAge: 3600_000, timeout: 10_000 },
    )
  })
}
