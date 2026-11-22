import type { ReactNode } from 'react'

/** Значки нижней панели: тонкая линия, без заливки. На широком экране панель текстовая, значки скрыты стилями. */
const PATHS: Record<string, ReactNode> = {
  // Сегодня: лист календаря с отмеченным днём.
  today: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Путь: склон с тропой к вершине.
  path: (
    <>
      <path d="M3 19.5 9.5 7l3.6 6.2 2.2-3.2L21 19.5Z" />
      <path d="M9.5 7V4M9.5 4l3 1.2-3 1.2" />
    </>
  ),
  // Город: дом с дверью.
  town: (
    <>
      <path d="M4 11 12 4.5 20 11" />
      <path d="M6 9.800V19.500h12V9.800M10 19.500v-5.500h4v5.500" />
    </>
  ),
  // Повтор: две карточки стопкой.
  review: (
    <>
      <rect x="4" y="8.500" width="13.5" height="11" rx="2" />
      <path d="M7.500 5h11A1.500 1.500 0 0 1 20 6.500v9" />
    </>
  ),
  // Ещё: три точки.
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
}

export function TabIcon({ id }: { id: string }) {
  const shape = PATHS[id]
  if (!shape) return null
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shape}
    </svg>
  )
}
