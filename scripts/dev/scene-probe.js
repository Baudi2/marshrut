// Проверка сцены города: не ходит ли кто сквозь постройки, ограды и деревья.
// Только для локального сайта (npm run dev), на опубликованный сайт не попадает.
// В консоли браузера на вкладке «Город»:
//   const { probe } = await import('/scripts/dev/scene-probe.js')
//   await probe(30)   // полчаса жизни города за несколько секунд
// Перед проверкой страницу перезагрузить: горячая замена оставляет на сцене прежние объекты.

const CELL = 0.25
const LOW = 0.22
const HIGH = 1.7

/** Общий предок всех фигур со скелетом: группа жителей и животных. Всё под ней — не препятствия. */
function castOf(scene) {
  const skinned = []
  scene.traverse((o) => o.isSkinnedMesh && skinned.push(o))
  if (!skinned.length) return { cast: null, skinned }
  const chain = (o) => {
    const list = []
    for (let at = o; at; at = at.parent) list.unshift(at)
    return list
  }
  let common = chain(skinned[0])
  for (const mesh of skinned.slice(1)) {
    const other = chain(mesh)
    let i = 0
    while (i < common.length && i < other.length && common[i] === other[i]) i++
    common = common.slice(0, i)
  }
  return { cast: common[common.length - 1], skinned }
}

/** Карта препятствий: клетки, где на высоте человека есть хоть один треугольник статичной сцены. */
function solidMap(scene, cast) {
  const solid = new Set()
  const key = (x, z) => `${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`
  const inCast = (o) => {
    for (let at = o; at; at = at.parent) if (at === cast) return true
    return false
  }
  const a = { x: 0, y: 0, z: 0 }
  const b = { x: 0, y: 0, z: 0 }
  const c = { x: 0, y: 0, z: 0 }
  const apply = (m, src, i, out) => {
    const x = src.getX(i)
    const y = src.getY(i)
    const z = src.getZ(i)
    const e = m.elements
    out.x = e[0] * x + e[4] * y + e[8] * z + e[12]
    out.y = e[1] * x + e[5] * y + e[9] * z + e[13]
    out.z = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
  let triangles = 0
  scene.updateMatrixWorld(true)
  scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.visible || (cast && inCast(mesh))) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return
    const index = mesh.geometry.getIndex()
    const count = index ? index.count : position.count
    const matrices = []
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        const m = mesh.matrixWorld.clone()
        const local = m.clone()
        mesh.getMatrixAt(i, local)
        matrices.push(m.multiply(local))
      }
    } else matrices.push(mesh.matrixWorld)
    for (const m of matrices) {
      for (let i = 0; i + 2 < count; i += 3) {
        apply(m, position, index ? index.getX(i) : i, a)
        apply(m, position, index ? index.getX(i + 1) : i + 1, b)
        apply(m, position, index ? index.getX(i + 2) : i + 2, c)
        const low = Math.min(a.y, b.y, c.y)
        const high = Math.max(a.y, b.y, c.y)
        if (high < LOW || low > HIGH) continue
        triangles++
        const size = Math.max(Math.hypot(b.x - a.x, b.z - a.z), Math.hypot(c.x - a.x, c.z - a.z), Math.hypot(c.x - b.x, c.z - b.z))
        const steps = Math.max(1, Math.ceil(size / (CELL * 0.5)))
        for (let u = 0; u <= steps; u++) {
          for (let v = 0; u + v <= steps; v++) {
            const s = u / steps
            const t = v / steps
            const y = a.y + (b.y - a.y) * s + (c.y - a.y) * t
            if (y < LOW || y > HIGH) continue
            solid.add(key(a.x + (b.x - a.x) * s + (c.x - a.x) * t, a.z + (b.z - a.z) * s + (c.z - a.z) * t))
          }
        }
      }
    }
  })
  return { solid, key, triangles }
}

/**
 * minutes — сколько минут жизни города прогнать. Возвращает, кто и где оказался внутри препятствия,
 * и сколько секунд фигуры провели вплотную друг к другу (ближе 20 см).
 */
export async function probe(minutes = 30, stage = window.town3d) {
  if (!stage) throw new Error('сцены нет: открой вкладку «Город» на локальном сайте')
  const { cast, skinned } = castOf(stage.scene)
  const { solid, key, triangles } = solidMap(stage.scene, cast)
  // У одной фигуры несколько сеток на одном скелете: считаем её один раз.
  const bones = new Map()
  for (const mesh of skinned) if (!bones.has(mesh.skeleton.bones[0])) bones.set(mesh.skeleton.bones[0], mesh)
  const figures = [...bones].map(([bone, mesh], i) => ({ i, mesh, bone, hits: 0, walked: 0, last: null }))
  const shown = (o) => {
    for (let at = o; at; at = at.parent) if (!at.visible) return false
    return true
  }
  const dt = 0.1
  const steps = Math.round((minutes * 60) / dt)
  let close = 0
  const point = { x: 0, y: 0, z: 0 }
  const places = new Map()
  for (let step = 0; step < steps; step++) {
    for (const tick of stage.tickers) tick(dt, step * dt)
    if (step % 2) continue
    stage.scene.updateMatrixWorld(true)
    const spots = []
    for (const figure of figures) {
      if (!shown(figure.mesh)) {
        figure.last = null
        continue
      }
      const e = figure.bone.matrixWorld.elements
      point.x = e[12]
      point.z = e[14]
      if (figure.last) figure.walked += Math.hypot(point.x - figure.last.x, point.z - figure.last.z)
      figure.last = { x: point.x, z: point.z }
      spots.push(figure.last)
      if (solid.has(key(point.x, point.z))) {
        figure.hits++
        const where = `${point.x.toFixed(1)}, ${point.z.toFixed(1)}`
        places.set(where, (places.get(where) ?? 0) + 1)
      }
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) if (Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) < 0.2) close += dt * 2
    }
  }
  stage.invalidate?.()
  const worst = [...places].sort((p, q) => q[1] - p[1]).slice(0, 12)
  return {
    minutes,
    figures: figures.length,
    cells: solid.size,
    triangles,
    hits: figures.reduce((sum, f) => sum + f.hits, 0),
    whoHit: figures.filter((f) => f.hits).map((f) => ({ figure: f.i, hits: f.hits })),
    where: worst,
    closeSeconds: Math.round(close * 10) / 10,
    // Сколько метров прошли: самый ленивый, средний и самый резвый. Нули — те, кто стоит (животные ночью) или сидит дома.
    walked: (() => {
      const all = figures.map((f) => Math.round(f.walked)).sort((p, q) => p - q)
      return { min: all[0], median: all[Math.floor(all.length / 2)], max: all[all.length - 1], still: all.filter((m) => m < 5).length }
    })(),
  }
}
