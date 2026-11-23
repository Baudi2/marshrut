// Проверка интерфейса на локальном сайте: мелкий текст, тесные области нажатия, вылезание за ширину.
// Запуск в консоли страницы (npm run dev или npm run dev:copy), на нужной вкладке:
//   const { probe } = await import('/scripts/dev/ui-probe.js'); probe()
// Все страницы подряд (город на сцене ждёт дольше):
//   const { probeAll } = await import('/scripts/dev/ui-probe.js'); await probeAll()
// Ничего не меняет на странице и ничего не нажимает.

const MIN_TEXT = 12
const MIN_TAP = 44

const visible = (el) => {
  const box = el.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return false
  const style = getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none') return false
  // Внутри свёрнутого <details> элемент есть, но его не видно.
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS' && !node.open && !(el.tagName === 'SUMMARY' && el.parentElement === node) && !node.querySelector(':scope > summary')?.contains(el)) return false
  }
  return true
}

const name = (el) => {
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
  const parent = el.parentElement
  const pcls = parent && typeof parent.className === 'string' ? parent.className.trim().split(/\s+/).filter(Boolean)[0] : ''
  return `${pcls ? '.' + pcls + ' > ' : ''}${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
}

const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28)

/** Область нажатия: сам элемент и невидимое расширение через ::before / ::after. */
function hitBox(el) {
  const box = el.getBoundingClientRect()
  let { top, bottom, left, right } = box
  for (const pseudo of ['::before', '::after']) {
    const style = getComputedStyle(el, pseudo)
    if (style.content === 'none' || style.position !== 'absolute') continue
    const edge = (v) => (v === 'auto' ? 0 : parseFloat(v))
    top = Math.min(top, box.top + edge(style.top))
    left = Math.min(left, box.left + edge(style.left))
    bottom = Math.max(bottom, box.bottom - edge(style.bottom))
    right = Math.max(right, box.right - edge(style.right))
  }
  return { width: right - left, height: bottom - top }
}

export function probe() {
  const app = document.querySelector('.app') ?? document.body
  const frame = app.getBoundingClientRect()

  // Мелкий текст: элементы со своим текстом. Текст внутри SVG меряется по высоте на экране.
  const small = new Map()
  for (const el of app.querySelectorAll('*')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own || !visible(el)) continue
    let size = parseFloat(getComputedStyle(el).fontSize)
    const svg = el.closest('svg')
    if (svg && el.tagName !== 'svg' && svg.viewBox?.baseVal?.width) size *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
    if (size >= MIN_TEXT - 0.05) continue
    const key = `${name(el)} ${size.toFixed(1)}px`
    if (!small.has(key)) small.set(key, text(el))
  }

  // Области нажатия: ссылки внутри строки текста не считаются — у них высота строки.
  const taps = new Map()
  for (const el of app.querySelectorAll('a, button, summary, select, input, textarea, [role="button"], [tabindex="0"]')) {
    if (!visible(el) || el.disabled) continue
    // Ссылка или текстовая кнопка внутри фразы: рядом с ней в том же блоке есть другой текст. Накладка ::after у неё считается.
    const inline = getComputedStyle(el).display === 'inline' && el.parentElement && text(el.parentElement) !== text(el)
    const hit = hitBox(el)
    if (inline && hit.height < MIN_TAP - 0.5 && getComputedStyle(el, '::after').content === 'none') continue
    if (hit.height >= MIN_TAP - 0.5 && hit.width >= MIN_TAP - 0.5) continue
    const key = `${name(el)} ${Math.round(hit.width)}×${Math.round(hit.height)}`
    if (!taps.has(key)) taps.set(key, { text: text(el), count: 0 })
    taps.get(key).count++
  }

  // Что вылезает за ширину страницы или обрезано по ширине.
  const wide = new Map()
  const scrollsX = (node) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowX)
  for (const el of app.querySelectorAll('*')) {
    if (!visible(el) || el.closest('svg') || el.closest('.town3d') || el.closest('.sr-only')) continue
    // Нижняя панель прибита к окну, а не к странице; то, что лежит в прокручиваемой полосе, вылезать вправе.
    let skip = false
    for (let node = el; node && node !== app; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.position === 'fixed' || (node !== el && scrollsX(node))) skip = true
    }
    const own = getComputedStyle(el)
    // Многоточие в конце — обрезка по замыслу.
    if (skip || own.textOverflow === 'ellipsis') continue
    const box = el.getBoundingClientRect()
    const scrolls = scrollsX(el)
    if (box.right > frame.right + 1 || box.left < frame.left - 1) wide.set(`${name(el)} за край на ${Math.round(Math.max(box.right - frame.right, frame.left - box.left))}`, text(el))
    else if (!scrolls && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') wide.set(`${name(el)} обрезан на ${el.scrollWidth - el.clientWidth}`, text(el))
  }

  return {
    page: location.hash || '#/',
    height: document.documentElement.scrollHeight,
    sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    small: [...small].map(([key, sample]) => `${key} «${sample}»`),
    taps: [...taps].map(([key, v]) => `${key}${v.count > 1 ? ' ×' + v.count : ''} «${v.text}»`),
    wide: [...wide].map(([key, sample]) => `${key} «${sample}»`),
  }
}

const PAGES = ['today', 'path', 'town', 'town/shop', 'town/files', 'review', 'more', 'problems', 'growth', 'skills', 'trophies', 'cycle', 'chronicle']

/** Все страницы подряд. Возвращает массив отчётов probe(). */
export async function probeAll(pages = PAGES) {
  const out = []
  for (const page of pages) {
    location.hash = '#/' + page
    await new Promise((done) => setTimeout(done, page === 'town' ? 3500 : 500))
    out.push(probe())
  }
  return out
}
