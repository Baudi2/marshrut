import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

/**
 * Шкалы оформления. Стили однажды расползлись на 25 размеров шрифта и 17 разных отступов;
 * этот тест не даёт им расползтись снова. Новое значение вне шкалы — либо ошибка, либо осознанное
 * исключение: тогда оно добавляется в список ниже вместе с причиной.
 */
const SPACE = new Set([0, 2, 4, 8, 12, 16, 24, 32, 48])
const RADIUS = new Set(['0', '4px', '8px', '10px', '12px', '14px', '999px', '50%'])
const WEIGHT = new Set(['400', '600', '700', 'inherit', 'normal'])

/** Текст вне шкалы: подписи внутри рисунков меряются в единицах рисунка, крупные числа — отдельная величина. */
const TEXT_FREE = new Set([
  '.map-week',
  '.map-note',
  '.map-summit',
  '.node-num',
  '.scene svg.is-narrow .node-num',
  '.dumbbell .tick-label',
  '.timer-face',
  '.hero-figure',
])

/** Отступы вне шкалы и зачем они такие. */
const SPACE_FREE = new Set([
  // место под нижнюю панель телефона
  '.app|padding',
  // отметка плана стоит ровно на границе полосы
  '.time-bar-plan|margin-left',
])

/** @returns {{ line: number, selector: string, prop: string, value: string }[]} объявления со своим селектором */
function declarations() {
  const out = []
  let selector = ''
  css.split('\n').forEach((text, i) => {
    const open = /^\s*([^{}@][^{}]*)\{\s*$/.exec(text)
    if (open) selector = open[1].trim()
    const decl = /^\s*([a-z-]+)\s*:\s*([^;]+);/.exec(text)
    if (decl) out.push({ line: i + 1, selector, prop: decl[1], value: decl[2].trim() })
  })
  return out
}

const where = (d) => `${d.line}: ${d.selector} { ${d.prop}: ${d.value} }`

describe('шкалы оформления в styles.css', () => {
  const all = declarations()

  it('размер текста берётся из шкалы --text-*', () => {
    const off = all
      .filter((d) => d.prop === 'font-size')
      .filter((d) => !TEXT_FREE.has(d.selector))
      // «em» — размер относительно соседнего текста (код внутри строки), а не свой шаг шкалы.
      .filter((d) => !/^var\(--text-(xs|s|m|base|l|xl)\)$/.test(d.value) && d.value !== 'inherit' && !/^\d*\.?\d+em$/.test(d.value))
      .map(where)
    expect(off).toEqual([])
  })

  it('отступы — 2, 4, 8, 12, 16, 24, 32 или 48', () => {
    const off = all
      .filter((d) => /^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|block|inline))?$/.test(d.prop))
      .filter((d) => !SPACE_FREE.has(`${d.selector}|${d.prop}`))
      .filter((d) => (d.value.match(/-?\d*\.?\d+px/g) ?? []).some((v) => !SPACE.has(Math.abs(parseFloat(v)))))
      .map(where)
    expect(off).toEqual([])
  })

  it('скругления — 4, 8, 10, 12, 14 или полное', () => {
    const off = all
      .filter((d) => d.prop === 'border-radius')
      .filter((d) => d.value.split(/\s+/).some((v) => !RADIUS.has(v)))
      .map(where)
    expect(off).toEqual([])
  })

  it('насыщенность — 400, 600 или 700', () => {
    const off = all
      .filter((d) => d.prop === 'font-weight')
      .filter((d) => !WEIGHT.has(d.value))
      .map(where)
    expect(off).toEqual([])
  })

  it('токены шкалы текста объявлены', () => {
    for (const name of ['xs', 's', 'm', 'base', 'l', 'xl']) expect(css).toContain(`--text-${name}:`)
  })
})
