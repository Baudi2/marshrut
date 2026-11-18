// Готовит модели для сайта: берёт исходные .glb из vendor/quaternius (в репозиторий не входит),
// выбрасывает лишние анимации и атрибуты, сжимает геометрию и кладёт результат в public/models/.
// Рядом пишет src/town3d/models.gen.json с габаритами: по ним считаются раскладка и тесты.
//
// Запуск: node scripts/build-models.mjs
// Исходники — наборы Quaternius, лицензия CC0. Как их получить — docs/DECISIONS.md.
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const SRC = 'vendor/quaternius'
const OUT = 'public/models'
const GEN = 'src/town3d/models.gen.json'

/** Какие файлы брать из набора: префикс ключа, папка, отбор по имени, анимации, которые остаются. */
const PACKS = [
  {
    prefix: 'r',
    dir: '3d_fantasy_rts',
    // Без мистики и войны: храмы, «чудеса», стрельбища, замковые казармы и стены не берём.
    // И без крестов: у «центра города» из набора бассейн фонтана крестом.
    skip: /^(Archery|Temple|Wonder|Resource_Gold|Wall|Barracks_Second_Age_Level_[23]|Mine|Town_Center)/,
  },
  { prefix: 'v', dir: '3d_medieval_village', skip: /^(Door|Window|Stairs)/ },
  { prefix: 'f', dir: '3d_farm_buildings', only: /^(Chicken_Coop|Well|Tower_Windmill|Fence|Barn|Big_Barn|Small_Barn|Open_Barn|Silo)./ },
  { prefix: 's', dir: '3d_ships', only: /^(Boat|Boat_W_Sail)\./ },
  { prefix: 'a', dir: '3d_animated_animals', only: /^(Cow|Horse|Donkey|ShibaInu|Husky|Deer|Fox)\./, keep: /^(Idle|Idle_2|Walk|Eating)$/ },
  {
    prefix: 'c',
    dir: '3d_animated_characters',
    only: /^(Male_Adventurer|Male_Casual|Male_Long_Sleeve|Male_Shirt|Female_Casual|Female_Dress|Female_Tank_Top|Female_Alternative)\./,
    keep: /^(Idle|Walk|Interact|Wave|(Man|Female)_(Idle|Walk|Sitting|Standing|Clapping))$/,
  },
]

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

const keyOf = (prefix, file) => `${prefix}/${file.replace(/\.glb$/, '').toLowerCase()}`

await rm(OUT, { recursive: true, force: true })
const index = {}
let before = 0
let after = 0

for (const pack of PACKS) {
  const dir = path.join(SRC, pack.dir)
  const files = (await readdir(dir)).filter((f) => f.endsWith('.glb') && (!pack.only || pack.only.test(f)) && !(pack.skip && pack.skip.test(f)))
  await mkdir(path.join(OUT, pack.prefix), { recursive: true })
  for (const file of files.sort()) {
    const source = path.join(dir, file)
    const doc = await io.read(source)
    const root = doc.getRoot()

    for (const animation of root.listAnimations()) {
      if (!pack.keep || !pack.keep.test(animation.getName())) animation.dispose()
    }

    // Габариты до сжатия: по узлам с их сдвигами, без учёта скелета.
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const materials = new Set()
    const nodes = []
    for (const node of root.listNodes()) {
      const mesh = node.getMesh()
      if (!mesh) continue
      const t = node.getWorldTranslation()
      const s = node.getWorldScale()
      nodes.push({ name: node.getName(), at: t.map((v) => +v.toFixed(3)) })
      for (const prim of mesh.listPrimitives()) {
        materials.add(prim.getMaterial()?.getName() ?? '')
        const position = prim.getAttribute('POSITION')
        const lo = position.getMin([0, 0, 0])
        const hi = position.getMax([0, 0, 0])
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], lo[i] * s[i] + t[i], hi[i] * s[i] + t[i])
          max[i] = Math.max(max[i], lo[i] * s[i] + t[i], hi[i] * s[i] + t[i])
        }
      }
    }

    const skinned = root.listSkins().length > 0
    await doc.transform(
      dedup(),
      // Текстур нет, цвет задан материалами: текстурные координаты не нужны.
      prune({ keepAttributes: false, keepLeaves: false }),
      ...(root.listAnimations().length ? [resample()] : []),
      weld(),
      // У моделей со скелетом основной вес — анимация: ей нужен уровень сжатия выше.
      meshopt({ encoder: MeshoptEncoder, level: skinned ? 'high' : 'medium' }),
    )

    const key = keyOf(pack.prefix, file)
    const target = path.join(OUT, key + '.glb')
    await io.write(target, doc)
    before += (await stat(source)).size
    after += (await stat(target)).size
    index[key] = {
      min: min.map((v) => +v.toFixed(3)),
      max: max.map((v) => +v.toFixed(3)),
      materials: [...materials].sort(),
      ...(nodes.length > 1 ? { nodes } : {}),
      ...(skinned ? { skinned: true, animations: root.listAnimations().map((a) => a.getName()) } : {}),
    }
  }
  console.log(pack.dir, files.length)
}

// Одна строка на модель: так файл удобно читать и сравнивать.
const lines = Object.entries(index).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
await writeFile(GEN, '{\n' + lines.join(',\n') + '\n}\n')
await writeFile(
  path.join(OUT, 'LICENSE.txt'),
  'Модели в этой папке — работы Quaternius (https://quaternius.com), лицензия CC0 1.0 (общественное достояние).\n' +
    'Наборы: Ultimate Fantasy RTS, Medieval Village, Farm Buildings, Ships, Animated Animals, Animated Characters.\n' +
    'Файлы сжаты и очищены от неиспользуемых анимаций скриптом scripts/build-models.mjs.\n',
)
console.log(`моделей: ${Object.keys(index).length}, было ${(before / 1048576).toFixed(1)} МБ, стало ${(after / 1048576).toFixed(1)} МБ`)
