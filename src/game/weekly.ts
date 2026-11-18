import type { CycleView, WeekView } from './engine'

/**
 * Задание для репетитора: тест по материалу недели.
 * Слабые места берутся из проверок понимания и журнала ошибок этой недели.
 */
export function testPrompt(cycle: CycleView, w: WeekView): string {
  const days = w.days.map((d) => `- день ${d.n}: ${d.plan.track}${d.progress?.summary ? ` — ${d.progress.summary}` : ''}`)
  const weak = w.test.checks.filter((k) => k.verdict !== 'correct').map((k) => `- ${k.question}`)
  const slips = w.test.mistakes.map((m) => `- ${m.text}`)
  return [
    `Проведи недельный тест по неделе ${w.week.n} цикла «${cycle.name}».`,
    '',
    'Что проходили:',
    ...days,
    '',
    `Что должно было получиться: ${w.week.checkpoint}.`,
    ...(weak.length ? ['', 'Вопросы, на которые я ответил неверно или частично:', ...weak] : []),
    ...(slips.length ? ['', 'Мои ошибки за неделю:', ...slips] : []),
    '',
    'Правила:',
    '1. Задай 10 вопросов по этому материалу, по одному. Жди ответа перед следующим.',
    '2. До конца теста не подсказывай и не объясняй.',
    '3. Не меньше трёх вопросов — по моим слабым местам из списков выше, другими словами.',
    '4. Каждый ответ оцени: 2 — верно и полно, 1 — частично, 0 — неверно или «не знаю».',
    `5. У каждого вопроса укажи трек: ${cycle.raw.plan.tracks.map((t) => `${t.code} — ${t.name}`).join('; ')}. По вопросам трека считается зачёт на ранг.`,
    '6. В конце разбери ошибки и выдай итог одной JSON-записью для progress.json → weeklyTests:',
    `{"week": ${w.week.n}, "date": "ГГГГ-ММ-ДД", "score": 0, "max": 20, "questions": [{"q": "вопрос", "track": "код трека", "points": 0, "note": "что упустил"}]}`,
  ].join('\n')
}
