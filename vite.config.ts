import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Сайт на копии данных — чтобы посмотреть его в состоянии, которого в живых данных ещё нет
 * (конец цикла, развитый город), ничего в них не меняя.
 *   DATA_ROOT  — папка, в которой лежит своя data/ (то же устройство, что у проекта);
 *   DATA_TODAY — «сегодня» для сайта, ГГГГ-ММ-ДД: страница считает, что на дворе этот день.
 * Задаются в окружении или в файлах .env.copy и .env.copy.local для запуска `npm run dev:copy`.
 * В репозитории лежит пробный набор fixtures/closed-cycle: цикл пройден, город — хутор.
 * Без DATA_ROOT ничего не подменяется: сборка и обычный запуск идут на живых данных.
 */
function dataFromCopy(root: string, today: string | undefined): Plugin {
  const live = path.resolve('data').replace(/\\/g, '/') + '/'
  const copy = path.resolve(root, 'data').replace(/\\/g, '/') + '/'
  return {
    name: 'data-from-copy',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.includes('data/') || !source.endsWith('.json')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      const id = resolved?.id.replace(/\\/g, '/')
      if (!id || !id.toLowerCase().startsWith(live.toLowerCase())) return null
      // Чего в копии нет (план цикла общий), берётся из живых данных.
      const swapped = copy + id.slice(live.length)
      return fs.existsSync(swapped) ? swapped : null
    },
    transformIndexHtml() {
      if (!today) return []
      // Часы страницы сдвигаются так, чтобы сейчас был полдень названного дня; дальше время идёт как обычно.
      const shim = `(() => { const Real = Date; const shift = new Real('${today}T12:00:00').getTime() - Real.now(); window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + shift) } static now() { return Real.now() + shift } } })()`
      return [{ tag: 'script', children: shim, injectTo: 'head-prepend' }]
    },
  }
}

// base './' — сайт работает из любой подпапки GitHub Pages без настройки.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DATA_')
  const dataRoot = process.env.DATA_ROOT ?? env.DATA_ROOT
  const today = process.env.DATA_TODAY ?? env.DATA_TODAY
  return {
    base: './',
    plugins: [react(), ...(dataRoot ? [dataFromCopy(dataRoot, today)] : [])],
    server: { port: 5173, strictPort: true, ...(dataRoot ? { fs: { allow: ['.', dataRoot] } } : {}) },
    build: {
      rolldownOptions: {
        output: {
          // three.js лежит отдельным файлом: он не меняется от правок сцены,
          // и после публикации браузер берёт его из кэша, а не качает 700 КБ заново.
          codeSplitting: {
            groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
          },
        },
      },
    },
  }
})
