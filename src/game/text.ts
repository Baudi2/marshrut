// Слова и даты для текста на русском. Без React: этим пользуются и правила игры, и интерфейс.

export type Forms = [string, string, string]

/** «2026-11-19» → «19.11». */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/** plural(2, ['день', 'дня', 'дней']) → «дня». */
export function plural(n: number, forms: Forms): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b === 1) return forms[0]
  if (b >= 2 && b <= 4) return forms[1]
  return forms[2]
}

export const DAYS: Forms = ['день', 'дня', 'дней']
