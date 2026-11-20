// Каталог обликов: что показать на доске «Постройки по уровням».
import { BUILDINGS, RARE } from '../game/town'
import type { BoardCell } from './board'
import { CENTER, DECOR, LOOKS, constructionLook, monumentLook, specialLook } from './looks'

/** Цвета и фигуры треков — как в интерфейсе: design/DESIGN.md, раздел 3. */
export const TRACK_ACCENT: Record<string, string> = { A: '#2f6db5', B: '#b65a2c', C1: '#2b7d5c', C2: '#9a7012', E: '#b0507a' }
export const NEUTRAL_ACCENT = '#8c8672'

const STAGES = ['участок', 'стройка', 'построено', 'с пристройкой']

export function catalogRows(): BoardCell[][] {
  const rows: BoardCell[][] = []
  rows.push(CENTER.map((step, i) => ({ title: step.name, note: `центр · ступень ${i}`, look: step.look })))
  for (const type of BUILDINGS) {
    const looks = LOOKS[type.id]
    if (!looks) continue
    rows.push(looks.levels.map((level, i) => ({ title: level.name, note: `${type.name} · ур. ${i + 1}`, look: level.look(0) })))
  }
  // Второй и третий варианты жилищ: соседние дома не должны быть одинаковыми.
  for (const variant of [1, 2]) {
    rows.push(LOOKS.house.levels.map((level, i) => ({ title: level.name, note: `Жилище · вариант ${variant + 1} · ур. ${i + 1}`, look: level.look(variant) })))
  }
  const kinds: [string, string, string][] = [
    ['cabin', 'A', 'Читальня'],
    ['hall', 'B', 'Зал'],
    ['tower', 'C1', 'Башня'],
  ]
  for (const [kind, track, name] of kinds) {
    rows.push(
      STAGES.map((stage, i) => ({
        title: `${name}: ${stage}`,
        note: `файл · трек ${track}`,
        look: specialLook(kind, i),
        ctx: { accent: TRACK_ACCENT[track], emblem: track },
      })),
    )
  }
  rows.push([
    { title: 'Котелок', note: 'украшение · 80 монет', look: DECOR.pot(0) },
    { title: 'Скамьи', note: 'украшение · 120 монет', look: DECOR.bench(2) },
    { title: 'Указатель', note: 'украшение · 100 монет', look: DECOR.signpost(0) },
    { title: 'Флагшток', note: 'украшение · 2 камня', look: DECOR.flagpole(1) },
    { title: 'Фонари не горят', note: 'сломаны после перерыва', look: LOOKS.house.levels[3].look(0), ctx: { lamps: 'dark' } },
  ])
  rows.push([
    { title: 'Стройка', note: 'новая постройка', look: constructionLook },
    { title: 'Сломано', note: 'после долгого перерыва', look: LOOKS.house.levels[2].look(0), broken: true },
    { title: 'Файл без трека', note: 'нейтральный цвет', look: specialLook('hall', 2), ctx: { accent: NEUTRAL_ACCENT } },
    { title: 'Трек C2', note: 'ромб', look: specialLook('cabin', 2), ctx: { accent: TRACK_ACCENT.C2, emblem: 'C2' } },
    { title: 'Трек E', note: 'две полосы', look: specialLook('tower', 3), ctx: { accent: TRACK_ACCENT.E, emblem: 'E' } },
  ])
  // Редкие постройки: по чертежу, без уровней.
  rows.push(RARE.map((type) => ({ title: LOOKS[type.id].levels[0].name, note: `редкая · чертёж ${type.rare!.offer}`, look: LOOKS[type.id].levels[0].look(0) })))
  // Памятники закрытых циклов: поясков столько, каков номер цикла.
  rows.push([1, 2, 3, 5].map((n) => ({ title: `Памятник цикла ${n}`, note: 'закрытый цикл', look: monumentLook(n) })))
  return rows
}
