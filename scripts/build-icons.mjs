// Значок сайта: рисует public/icon.svg и растровые версии для домашнего экрана телефона.
// Запуск из корня проекта: node scripts/build-icons.mjs
// Нужен sharp — он уже стоит вместе с инструментами подготовки моделей. Готовые файлы лежат в репозитории,
// поэтому сборке сайта и CI этот скрипт не нужен: его запускают, только когда меняется рисунок.
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const GREEN = '#2f6b4f'
const PAPER = '#f4f1ea'
const SOFT = '#cfe1d6'
const AMBER = '#e9b23c'

/**
 * Гора с тропой и флагом на вершине — тот же маршрут, что на вкладке «Путь».
 * scale — насколько рисунок отступает от краёв: у значка под маску системы рисунок меньше,
 * чтобы круглая или каплевидная маска его не обрезала. round — скругление фона, 0 — квадрат.
 */
function icon({ scale, round }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${round}" fill="${GREEN}"/>
  <g transform="translate(256 278) scale(${scale}) translate(-256 -256)">
    <path d="M236 392 348 226l104 166Z" fill="${SOFT}"/>
    <path d="M76 392 250 128l174 264Z" fill="${PAPER}"/>
    <path d="M168 392c56-34 132-40 96-88-28-38-44-70-14-112" fill="none" stroke="${GREEN}" stroke-width="15" stroke-linecap="round" stroke-dasharray="1 30"/>
    <path d="M250 132V58" stroke="${PAPER}" stroke-width="13" stroke-linecap="round"/>
    <path d="M256 62 322 86 256 110Z" fill="${AMBER}"/>
  </g>
</svg>
`
}

const out = 'public'
await mkdir(out, { recursive: true })

const plain = icon({ scale: 1, round: 104 })
const square = icon({ scale: 0.94, round: 0 })
const maskable = icon({ scale: 0.74, round: 0 })

await writeFile(`${out}/icon.svg`, plain)
const png = (svg, size, name) => sharp(Buffer.from(svg), { density: 144 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${out}/${name}`)
await png(plain, 192, 'icon-192.png')
await png(plain, 512, 'icon-512.png')
await png(maskable, 512, 'icon-maskable-512.png')
// iOS скругляет значок сам и не понимает прозрачность: фон — во весь квадрат.
await png(square, 180, 'apple-touch-icon.png')

console.log('Значки записаны в public/: icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png')
