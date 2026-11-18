// Облик постройки: функция, которая складывает модели и простые фигуры в одну деталь.
// Функция запускается дважды: сначала вхолостую, чтобы узнать, какие модели нужны,
// затем по-настоящему, когда модели загружены.
import * as THREE from 'three'
import type { Season } from '../world/sky'
import index from './models.gen.json'
import {
  Builder,
  KIND,
  addModel,
  box,
  cylinder,
  gable,
  loadModel,
  paint,
  quad,
  rawModel,
  sheet,
  tri,
  type ModelOptions,
  type Painter,
  packScale,
  type RawModel,
  type Rotor,
} from './kit'

const DIMS = index as unknown as Record<string, { min: number[]; max: number[] }>

/** Габариты модели в её собственных единицах. */
export const modelDims = (key: string) => DIMS[key]

export interface PlaceOptions extends ModelOptions {
  /** Поставить модель серединой её габаритов в точку at. Строка — взять середину другой модели: так поле и его посевы совпадают. */
  center?: boolean | string
}

export interface LookContext {
  season: Season
  /** Цвет трека: крыша и стяг особой постройки. */
  accent?: string
  /** Фигура трека на стяге: A — круг, B — треугольник, C1 — квадрат, C2 — ромб, E — две полосы. */
  emblem?: string
  /** false — фонарей ещё нет: они появляются со ступени «Хутор». */
  lamps?: boolean
}

/** Листва по сезонам: несколько оттенков, деревья берут их вперемешку. */
export const FOLIAGE: Record<Season, string[]> = {
  spring: ['#8fb56a', '#7ea860', '#9cbf72'],
  summer: ['#6e9a5a', '#5d8a4e', '#7aa363'],
  autumn: ['#c88d44', '#a8642f', '#b9a24a', '#8f8a4a'],
  winter: ['#8a7f70', '#7d7466', '#94897a'],
}
export const PINE: Record<Season, string> = { spring: '#517c55', summer: '#4c7650', autumn: '#4b6a50', winter: '#46634f' }
export const CROP: Record<Season, string> = { spring: '#79a85a', summer: '#5f8f4c', autumn: '#b39a4f', winter: '#b9b6a2' }

/** Общая перекраска: приводит наборы к одной палитре и размечает окна, огонь и воду. */
export function basePainter(ctx: LookContext, variant = 0): Painter {
  const leaves = FOLIAGE[ctx.season]
  return (material, _color, key) => {
    if (material === 'Windows') return { kind: KIND.window }
    if (material === 'Fire') return { color: '#ff8f2e', kind: KIND.fire }
    if (material === 'Water') return { color: '#6fa7b8', kind: KIND.water }
    if (material === 'Smoke') return { drop: true }
    if (key.startsWith('r/resource_pine')) return material === 'Green' ? { color: PINE[ctx.season] } : null
    if (key.startsWith('r/resource_tree')) return material === 'Green' ? { color: leaves[variant % leaves.length] } : null
    if (material === 'Green' || material === 'Lettuce' || material === 'Watermelon_DarkGreen') return { color: CROP[ctx.season] }
    if (material === 'Wheat') return { color: ctx.season === 'spring' ? '#9fb86a' : ctx.season === 'winter' ? '#b9b39a' : '#c9ad55' }
    if (key.startsWith('f/')) {
      // Ферма нарисована красной с белым: перекрашиваем в дерево и дранку.
      // Отделка красится в тон стен: на воротах амбаров она набита крест-накрест, а крестов в игре нет.
      if (material === 'DarkRed') return { color: '#87653f' }
      if (material === 'LightRed') return { color: '#8f6b44' }
      if (material === 'RoofBlack') return { color: '#6f6259' }
      if (material === 'White') return { color: key === 'f/well' || key === 'f/tower_windmill' ? '#d9d0b8' : '#8b6841' }
      if (material === 'Brown' || material === 'DarkBrown') return { color: '#876a44' }
      if (material === 'LightBrown') return { color: '#b39a6c' }
      if (material === 'Grey') return { color: '#a9aaa4' }
      if (material === 'DarkGrey') return { color: '#86877f' }
      if (material === 'Black') return { color: '#3d3a36' }
    }
    if (key.startsWith('s/') && material === 'Sail') return { color: '#e2d9c2' }
    if (key.startsWith('v/')) {
      // «Средневековая деревня» темнее и с бирюзовыми крышами: приводим к общей гамме.
      if (material === 'RoofTiles') return { color: '#5b6f78' }
      if (material === 'RoofTiles_Red') return { color: '#a5583f' }
      if (material === 'Plaster' || material === 'Beige') return { color: '#d9d0b8' }
      if (material === 'Wood') return { color: '#7d5a3c' }
      if (material === 'DarkWood') return { color: '#644630' }
      if (material === 'Stone_Dark') return { color: '#8a8d8c' }
      if (material === 'Stone_Light') return { color: '#a9aaa4' }
      if (material === 'Stone') return { color: '#77797a' }
    }
    return null
  }
}

export class LookBuilder {
  readonly body = new Builder()
  readonly rotors: Rotor[] = []
  /** Откуда идёт дым. */
  readonly smoke: THREE.Vector3[] = []
  /** Где горит огонь: туда встают настоящие источники света. */
  readonly fires: THREE.Vector3[] = []
  /** Где ночью лежит тёплое пятно света. */
  readonly lamps: THREE.Vector3[] = []
  /** Стяги и флаги: колышутся отдельно от постройки. */
  readonly flags: { at: THREE.Vector3; color: string; width: number; height: number }[] = []
  readonly needs = new Set<string>()
  private matrix = new THREE.Matrix4()
  private readonly painter: Painter

  constructor(
    private readonly models: Map<string, RawModel> | null,
    readonly ctx: LookContext,
    readonly variant = 0,
  ) {
    this.painter = basePainter(ctx, variant)
  }

  get collecting() {
    return this.models === null
  }

  /** Всё, что добавлено внутри fn, сдвинуто и повёрнуто как единое целое. */
  group(at: [number, number, number], rot: number, fn: () => void, scale = 1) {
    const before = this.matrix
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...at),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rot)),
      new THREE.Vector3(scale, scale, scale),
    )
    this.matrix = before.clone().multiply(local)
    fn()
    this.matrix = before
  }

  model(key: string, placing: PlaceOptions = {}) {
    this.needs.add(key)
    if (!this.models) return
    const raw = this.models.get(key)
    if (!raw) return
    let options: ModelOptions = placing
    if (placing.center) {
      const dims = DIMS[typeof placing.center === 'string' ? placing.center : key]
      const s = placing.s ?? 1
      const [sx, , sz] = typeof s === 'number' ? [s, s, s] : s
      const scale = packScale(key)
      const turn = THREE.MathUtils.degToRad(placing.rot ?? 0)
      const cx = ((dims.min[0] + dims.max[0]) / 2) * scale * sx
      const cz = ((dims.min[2] + dims.max[2]) / 2) * scale * sz
      const [x, y, z] = placing.at ?? [0, 0, 0]
      options = { ...placing, at: [x - (cx * Math.cos(turn) + cz * Math.sin(turn)), y, z - (-cx * Math.sin(turn) + cz * Math.cos(turn))] }
    }
    // Модель кладётся в общую систему координат постройки через промежуточную копилку.
    const local = new Builder()
    const rotor = addModel(local, raw, options, this.painter)
    this.absorb(local)
    if (rotor) {
      const pivot = rotor.pivot.clone().applyMatrix4(this.matrix)
      const geometry = rotor.geometry.clone().applyMatrix4(this.matrix.clone().setPosition(0, 0, 0))
      this.rotors.push({ geometry, pivot, axis: rotor.axis.clone().transformDirection(this.matrix), speed: rotor.speed })
    }
  }

  private absorb(local: Builder) {
    const geometry = local.geometry()
    geometry.applyMatrix4(this.matrix)
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const color = geometry.getAttribute('color')
    const kind = geometry.getAttribute('kind')
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      this.body.push(p.fromBufferAttribute(position, i), n.fromBufferAttribute(normal, i), c.fromBufferAttribute(color, i), kind.getX(i))
    }
    geometry.dispose()
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, kind = 0) {
    if (this.models) box(this.body, this.matrix, x, y, z, w, h, d, paint(color), kind)
  }

  cylinder(x: number, y: number, z: number, rBottom: number, rTop: number, h: number, sides: number, color: THREE.ColorRepresentation, kind = 0, turn = 0) {
    if (this.models) cylinder(this.body, this.matrix, x, y, z, rBottom, rTop, h, sides, paint(color), kind, turn)
  }

  gable(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, kind = 0) {
    if (this.models) gable(this.body, this.matrix, x, y, z, w, h, d, paint(color), kind)
  }

  sheet(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, kind = 0) {
    if (this.models) sheet(this.body, this.matrix, a, b, c, d, paint(color), kind)
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, kind = 0) {
    if (this.models) quad(this.body, this.matrix, a, b, c, d, paint(color), kind)
  }

  tri(a: number[], b: number[], c: number[], color: THREE.ColorRepresentation, kind = 0) {
    if (this.models) tri(this.body, this.matrix, a, b, c, paint(color), kind)
  }

  /** Плоская фигура из точек по кругу, видна с обеих сторон. */
  poly(points: number[][], color: THREE.ColorRepresentation, kind = 0) {
    if (!this.models) return
    const tint = paint(color)
    for (let i = 1; i < points.length - 1; i++) {
      tri(this.body, this.matrix, points[0], points[i], points[i + 1], tint, kind)
      tri(this.body, this.matrix, points[0], points[i + 1], points[i], tint, kind)
    }
  }

  /** Жердь или балка от точки до точки. */
  beam(from: [number, number, number], to: [number, number, number], thickness: number, color: THREE.ColorRepresentation) {
    if (!this.models) return
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const length = a.distanceTo(b)
    const local = new THREE.Matrix4().compose(
      a,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
      new THREE.Vector3(1, 1, 1),
    )
    box(this.body, this.matrix.clone().multiply(local), 0, 0, 0, thickness, length, thickness, paint(color))
  }

  private point(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.matrix)
  }

  smokeAt(x: number, y: number, z: number) {
    this.smoke.push(this.point(x, y, z))
  }

  fireAt(x: number, y: number, z: number) {
    this.fires.push(this.point(x, y, z))
  }

  lampAt(x: number, y: number, z: number) {
    this.lamps.push(this.point(x, y, z))
  }

  flagAt(x: number, y: number, z: number, color: string, width = 1.1, height = 0.7) {
    this.flags.push({ at: this.point(x, y, z), color, width, height })
  }
}

export type LookFn = (b: LookBuilder) => void

export interface BuiltLook {
  geometry: THREE.BufferGeometry
  rotors: Rotor[]
  smoke: THREE.Vector3[]
  fires: THREE.Vector3[]
  lamps: THREE.Vector3[]
  flags: LookBuilder['flags']
  box: THREE.Box3
}

/** Собирает облик: догружает нужные модели и возвращает готовую геометрию. */
export async function buildLook(fn: LookFn, ctx: LookContext, variant = 0): Promise<BuiltLook> {
  const probe = new LookBuilder(null, ctx, variant)
  fn(probe)
  const models = new Map<string, RawModel>()
  await Promise.all(
    [...probe.needs].map(async (key) => {
      models.set(key, rawModel(key, await loadModel(key)))
    }),
  )
  const real = new LookBuilder(models, ctx, variant)
  fn(real)
  const geometry = real.body.geometry()
  return {
    geometry,
    rotors: real.rotors,
    smoke: real.smoke,
    fires: real.fires,
    lamps: real.lamps,
    flags: real.flags,
    box: geometry.boundingBox ? geometry.boundingBox.clone() : new THREE.Box3(),
  }
}
