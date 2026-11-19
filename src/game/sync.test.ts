import { describe, expect, it } from 'vitest'
import { browserRecord, syncSummary, type Unsynced } from './sync'

const empty: Unsynced = { purchases: [], repairs: [], rewards: [], redeemed: [], signs: [], town: [], reviews: [], cards: [] }

describe('запись из браузера', () => {
  it('когда переносить нечего, запись пустая', () => {
    expect(browserRecord(empty)).toEqual({})
    expect(syncSummary(empty)).toEqual({ count: 0, parts: [], record: '{}' })
  })

  it('в запись идут только непустые разделы', () => {
    const record = browserRecord({
      ...empty,
      purchases: [{ item: 'pot', date: '2026-11-19' }],
      reviews: [{ card: '2026-11-18-abc', at: '2026-11-19T10:00:00.000Z', ok: true }],
    })
    expect(record).toEqual({
      ledger: { purchases: [{ item: 'pot', date: '2026-11-19' }] },
      deck: { reviews: [{ card: '2026-11-18-abc', at: '2026-11-19T10:00:00.000Z', ok: true }] },
    })
    expect(record.town).toBeUndefined()
  })

  it('считает записи и называет их по-русски', () => {
    const summary = syncSummary({
      ...empty,
      purchases: [
        { item: 'pot', date: '2026-11-19' },
        { item: 'bench', date: '2026-11-19' },
      ],
      redeemed: [{ at: '2026-11-19T10:00:00.000Z', name: 'Вечер с игрой', gems: 2 }],
      town: [{ at: '2026-11-19T10:00:00.000Z', do: 'build', type: 'house' }],
      reviews: Array.from({ length: 5 }, (_, i) => ({ card: `c${i}`, at: '2026-11-19T10:00:00.000Z', ok: true })),
      cards: [{ date: '2026-11-19', track: 'B', question: 'Что такое слой данных?', answer: 'Источник правды.', source: 'note' }],
    })
    expect(summary.count).toBe(10)
    expect(summary.parts).toEqual(['2 покупки', '1 выкуп награды', '1 действие в городе', '5 ответов по карточкам', '1 своя карточка'])
    expect(JSON.parse(summary.record)).toHaveProperty('ledger.purchases')
    expect(JSON.parse(summary.record)).toHaveProperty('town')
    expect(JSON.parse(summary.record)).toHaveProperty('deck.cards')
  })
})
