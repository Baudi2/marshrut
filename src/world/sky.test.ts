import { describe, expect, it } from 'vitest'
import { computeSky, kindFromWmo, phaseFor, seasonFor, type Weather } from './sky'

describe('сезон', () => {
  it('в северном полушарии — по месяцам', () => {
    const season = (month: number) => seasonFor(new Date(2026, month, 15))
    expect([11, 0, 1].map(season)).toEqual(['winter', 'winter', 'winter'])
    expect([2, 4].map(season)).toEqual(['spring', 'spring'])
    expect([5, 7].map(season)).toEqual(['summer', 'summer'])
    expect([8, 10].map(season)).toEqual(['autumn', 'autumn'])
  })

  it('в южном полушарии сдвинут на полгода', () => {
    expect(seasonFor(new Date(2026, 10, 18), -33)).toBe('spring')
    expect(seasonFor(new Date(2026, 0, 10), -33)).toBe('summer')
  })
})

describe('время суток', () => {
  const sunrise = 7 * 60 + 33
  const sunset = 16 * 60 + 9

  it('сумерки по 45 минут вокруг восхода и заката', () => {
    expect(phaseFor(6 * 60, sunrise, sunset)).toBe('night')
    expect(phaseFor(7 * 60, sunrise, sunset)).toBe('dawn')
    expect(phaseFor(8 * 60, sunrise, sunset)).toBe('dawn')
    expect(phaseFor(12 * 60, sunrise, sunset)).toBe('day')
    expect(phaseFor(16 * 60, sunrise, sunset)).toBe('dusk')
    expect(phaseFor(17 * 60 + 30, sunrise, sunset)).toBe('night')
  })
})

describe('погода', () => {
  it('коды WMO сводятся к восьми видам', () => {
    const kinds = [0, 2, 3, 45, 53, 61, 81, 73, 86, 95].map(kindFromWmo)
    expect(kinds).toEqual(['clear', 'cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'rain', 'snow', 'snow', 'storm'])
  })

  const weather: Weather = {
    kind: 'rain',
    temperature: 12,
    clouds: 100,
    sunrise: 7 * 60 + 33,
    sunset: 16 * 60 + 9,
    utcOffset: 60,
    fetchedAt: 0,
  }
  // 18.11.2026 13:45 UTC — в месте со сдвигом +1 час это 14:45
  const now = new Date(Date.UTC(2026, 10, 18, 13, 45))

  it('с погодой время суток считается по часам места', () => {
    expect(computeSky(now, { name: 'Берлин', lat: 52.5, lon: 13.4 }, weather)).toMatchObject({
      season: 'autumn',
      phase: 'day',
      kind: 'rain',
      clouds: 100,
      temperature: 12,
      live: true,
    })
    const evening = new Date(Date.UTC(2026, 10, 18, 15, 0))
    expect(computeSky(evening, { name: 'Берлин', lat: 52.5, lon: 13.4 }, weather).phase).toBe('dusk')
  })

  it('без места погоды нет, небо ясное', () => {
    expect(computeSky(now, null, null)).toMatchObject({ kind: 'clear', temperature: null, live: false })
  })

  it('предпросмотр подменяет сезон, время и погоду', () => {
    const sky = computeSky(now, null, weather, { season: 'winter', phase: 'night', kind: 'snow' })
    expect(sky).toMatchObject({ season: 'winter', phase: 'night', kind: 'snow', live: false, temperature: null })
  })
})
