// Стороннее развитие: всё полезное вне плана — видео, статьи, встречи с коллегами, тестовые собеседования.
// Правило то же, что и в плане: считается результат, а не потраченное время.
// Просмотр или встреча засчитываются, только если записаны выводы.
import type { OffplanEntry } from '../data/types'
import { XP, parseISO } from './rules'

export type SideKind = OffplanEntry['kind']

export interface SideRule {
  name: string
  xp: number
  /** Сколько выводов нужно записать, чтобы запись засчиталась. 0 — выводы не нужны. */
  takeaways: number
  /** Даёт камень: это проверка знаний, а не их получение. */
  gem?: boolean
}

export const SIDE: Record<SideKind, SideRule> = {
  session: { name: 'Занятие вне плана', xp: XP.offplanSession, takeaways: 0 },
  artifact: { name: 'Сохранённый файл', xp: XP.artifact, takeaways: 0 },
  'problem-self': { name: 'Задача решена сама', xp: XP.problemSelf, takeaways: 0 },
  'problem-walkthrough': { name: 'Задача решена с разбором', xp: XP.problemWalkthrough, takeaways: 0 },
  video: { name: 'Видео или доклад', xp: 10, takeaways: 2 },
  article: { name: 'Статья или глава книги', xp: 10, takeaways: 2 },
  meetup: { name: 'Встреча с коллегами', xp: 15, takeaways: 2 },
  'mock-interview': { name: 'Тестовое собеседование', xp: 40, takeaways: 3, gem: true },
}

/** Камень за тестовое собеседование — не чаще раза в столько дней. */
export const MOCK_GEM_EVERY_DAYS = 7

export interface RatedSide {
  entry: OffplanEntry
  rule: SideRule
  xp: number
  gems: number
  /** Засчитана: даёт опыт, монеты и считается днём занятий. */
  counted: boolean
  /** Почему не засчитана. */
  why: string | null
}

/**
 * Оценивает записи по порядку дат.
 * Видео, статья, встреча и собеседование засчитываются по одной каждого вида в день:
 * десять роликов подряд — это не десять занятий.
 */
export function rateSide(entries: OffplanEntry[]): RatedSide[] {
  const seen = new Set<string>()
  let lastGem: number | null = null
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const rule = SIDE[entry.kind]
      const notes = (entry.takeaways ?? []).filter((t) => t.trim()).length
      const key = `${entry.date}:${entry.kind}`
      let why: string | null = null
      if (notes < rule.takeaways) why = `нужно выводов: ${rule.takeaways}, записано ${notes}`
      else if (rule.takeaways > 0 && seen.has(key)) why = 'за этот день такая запись уже засчитана'
      if (why) return { entry, rule, xp: 0, gems: 0, counted: false, why }
      seen.add(key)
      const day = parseISO(entry.date).getTime()
      const gem = !!rule.gem && (lastGem === null || day - lastGem >= MOCK_GEM_EVERY_DAYS * 86_400_000)
      if (gem) lastGem = day
      return { entry, rule, xp: rule.xp, gems: gem ? 1 : 0, counted: true, why: null }
    })
}
