// Набор для сборки построек: загрузка моделей Quaternius и «запекание» их в одну геометрию
// с цветом в вершинах. Постройка — это несколько моделей и простых фигур, сведённых в один меш:
// так город рисуется десятками вызовов, а не сотнями, и один общий материал красит снег, дождь и ночь.
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/** Вид поверхности для общего материала: что светится ночью и на что не ложится снег. */
export const KIND = { plain: 0, window: 1, fire: 2, water: 3, lamp: 4 } as const

/** Во сколько раз увеличить модель набора, чтобы единицей мира был метр. */
const PACK_SCALE: Record<string, number> = { r: 5, v: 2.2, f: 1, s: 6, a: 1, c: 1 }
export const packScale = (key: string) => PACK_SCALE[key.split('/')[0]] ?? 1

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const files = new Map<string, Promise<GLTF>>()

export const modelUrl = (key: string) => `${import.meta.env.BASE_URL}models/${key}.glb`

export function loadModel(key: string): Promise<GLTF> {
  let pending = files.get(key)
  if (!pending) {
    pending = loader.loadAsync(modelUrl(key))
    files.set(key, pending)
  }
  return pending
}

/** Кусок модели одного материала: треугольники подряд, по девять чисел на треугольник. */
export interface Chunk {
  material: string
  node: string
  color: THREE.Color
  positions: Float32Array
  normals: Float32Array
}

export interface RawModel {
  key: string
  chunks: Chunk[]
  /** Начала узлов в координатах модели: по ним находится ось лопастей. */
  origins: Map<string, THREE.Vector3>
}

const raws = new Map<string, RawModel>()

/** Разворачивает модель в треугольники в её собственных координатах. Нужна уже загруженная модель. */
export function rawModel(key: string, gltf: GLTF): RawModel {
  const ready = raws.get(key)
  if (ready) return ready
  const chunks: Chunk[] = []
  const origins = new Map<string, THREE.Vector3>()
  gltf.scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    // Имя узла вместе с именами родителей: у сетки из нескольких материалов загрузчик называет куски
    // по имени сетки, а имя узла («Mill_Blades») остаётся у группы над ними.
    const names: string[] = []
    for (let at: THREE.Object3D | null = mesh; at && at !== gltf.scene; at = at.parent) names.unshift(at.name)
    const node = names.join('/')
    origins.set(node, new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld))
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const index = geometry.getIndex()
    const count = index ? index.count : position.count
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const at = index ? index.getX(i) : i
      v.fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld)
      positions[i * 3] = v.x
      positions[i * 3 + 1] = v.y
      positions[i * 3 + 2] = v.z
      if (normal) n.fromBufferAttribute(normal, at).applyMatrix3(normalMatrix).normalize()
      else n.set(0, 1, 0)
      normals[i * 3] = n.x
      normals[i * 3 + 1] = n.y
      normals[i * 3 + 2] = n.z
    }
    const material = mesh.material as THREE.MeshStandardMaterial
    chunks.push({ material: material.name, node, color: material.color.clone(), positions, normals })
  })
  const raw = { key, chunks, origins }
  raws.set(key, raw)
  return raw
}

/** Как красить материал модели: цвет и вид поверхности. null — оставить цвет модели. */
export type Painter = (material: string, color: THREE.Color, key: string) => { color?: THREE.ColorRepresentation; kind?: number; drop?: boolean } | null

/** Копилка треугольников одной детали. */
export class Builder {
  private positions: number[] = []
  private normals: number[] = []
  private colors: number[] = []
  private kinds: number[] = []
  readonly box = new THREE.Box3()

  get empty() {
    return this.positions.length === 0
  }

  push(p: THREE.Vector3, n: THREE.Vector3, color: THREE.Color, kind: number) {
    this.positions.push(p.x, p.y, p.z)
    this.normals.push(n.x, n.y, n.z)
    this.colors.push(color.r, color.g, color.b)
    this.kinds.push(kind)
    this.box.expandByPoint(p)
  }

  /** Сдвигает всё накопленное: нужно, чтобы деталь вращалась вокруг своей оси. */
  geometry(shift?: THREE.Vector3): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.positions)
    if (shift) {
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] -= shift.x
        positions[i + 1] -= shift.y
        positions[i + 2] -= shift.z
      }
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3))
    geometry.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(this.kinds), 1))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  }
}

const tmpColor = new THREE.Color()
const A = new THREE.Vector3()
const B = new THREE.Vector3()
const C = new THREE.Vector3()
const N = new THREE.Vector3()

/** Грань из трёх точек с плоской нормалью. Обход против часовой стрелки, если смотреть снаружи. */
export function tri(into: Builder, matrix: THREE.Matrix4, a: number[], b: number[], c: number[], color: THREE.Color, kind = 0) {
  A.fromArray(a).applyMatrix4(matrix)
  B.fromArray(b).applyMatrix4(matrix)
  C.fromArray(c).applyMatrix4(matrix)
  N.subVectors(B, A).cross(tmpV.subVectors(C, A)).normalize()
  into.push(A, N, color, kind)
  into.push(B, N, color, kind)
  into.push(C, N, color, kind)
}
const tmpV = new THREE.Vector3()

export function quad(into: Builder, matrix: THREE.Matrix4, a: number[], b: number[], c: number[], d: number[], color: THREE.Color, kind = 0) {
  tri(into, matrix, a, b, c, color, kind)
  tri(into, matrix, a, c, d, color, kind)
}

export const paint = (value: THREE.ColorRepresentation) => tmpColor.set(value).clone()

/** Ящик: центр основания в (x, y, z), размеры w × h × d. */
export function box(into: Builder, matrix: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.Color, kind = 0) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const y1 = y + h
  const z0 = z - d / 2
  const z1 = z + d / 2
  quad(into, matrix, [x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], color, kind)
  quad(into, matrix, [x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0], color, kind)
  quad(into, matrix, [x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1], color, kind)
  quad(into, matrix, [x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], color, kind)
  quad(into, matrix, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, kind)
  quad(into, matrix, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, kind)
}

/** Усечённый конус на оси Y: радиусы низа и верха, граней sides. rTop = 0 даёт конус. */
export function cylinder(
  into: Builder,
  matrix: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  rBottom: number,
  rTop: number,
  h: number,
  sides: number,
  color: THREE.Color,
  kind = 0,
  turn = 0,
) {
  for (let i = 0; i < sides; i++) {
    const a0 = turn + (i / sides) * Math.PI * 2
    const a1 = turn + ((i + 1) / sides) * Math.PI * 2
    const b0 = [x + Math.sin(a0) * rBottom, y, z + Math.cos(a0) * rBottom]
    const b1 = [x + Math.sin(a1) * rBottom, y, z + Math.cos(a1) * rBottom]
    const t0 = [x + Math.sin(a0) * rTop, y + h, z + Math.cos(a0) * rTop]
    const t1 = [x + Math.sin(a1) * rTop, y + h, z + Math.cos(a1) * rTop]
    if (rTop > 0) quad(into, matrix, b0, b1, t1, t0, color, kind)
    else tri(into, matrix, b0, b1, [x, y + h, z], color, kind)
    if (rTop > 0) tri(into, matrix, [x, y + h, z], t0, t1, color, kind)
    tri(into, matrix, [x, y, z], b1, b0, color, kind)
  }
}

/** Двускатная крыша: конёк вдоль оси X, основание w × d, высота h. */
export function gable(into: Builder, matrix: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.Color, kind = 0) {
  const x0 = x - w / 2
  const x1 = x + w / 2
  const z0 = z - d / 2
  const z1 = z + d / 2
  const top = y + h
  quad(into, matrix, [x0, y, z1], [x1, y, z1], [x1, top, z], [x0, top, z], color, kind)
  quad(into, matrix, [x1, y, z0], [x0, y, z0], [x0, top, z], [x1, top, z], color, kind)
  tri(into, matrix, [x1, y, z1], [x1, y, z0], [x1, top, z], color, kind)
  tri(into, matrix, [x0, y, z0], [x0, y, z1], [x0, top, z], color, kind)
}

/** Плоская плита из четырёх точек по часовой стрелке сверху: полотнище, вывеска, настил. */
export function sheet(into: Builder, matrix: THREE.Matrix4, a: number[], b: number[], c: number[], d: number[], color: THREE.Color, kind = 0) {
  quad(into, matrix, a, b, c, d, color, kind)
  quad(into, matrix, d, c, b, a, color, kind)
}

export interface ModelOptions {
  at?: [number, number, number]
  /** Поворот вокруг вертикали, градусы. */
  rot?: number
  /** Множитель поверх масштаба набора. */
  s?: number | [number, number, number]
  /** Перекраска материалов этой модели. */
  painter?: Painter
  /** Часть, которая вращается: узел по имени или отбор треугольников в координатах модели. */
  rotor?: {
    node?: RegExp
    where?: (x: number, y: number, z: number) => boolean
    pivot?: [number, number, number]
    speed?: number
  }
}

export interface Rotor {
  geometry: THREE.BufferGeometry
  pivot: THREE.Vector3
  /** Ось вращения в координатах постройки. */
  axis: THREE.Vector3
  speed: number
}

export function placement(options: ModelOptions, scale: number): THREE.Matrix4 {
  const s = options.s ?? 1
  const [sx, sy, sz] = typeof s === 'number' ? [s, s, s] : s
  const [x, y, z] = options.at ?? [0, 0, 0]
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(options.rot ?? 0)),
    new THREE.Vector3(sx * scale, sy * scale, sz * scale),
  )
}

/** Добавляет модель в копилку. Возвращает вращающуюся часть, если она запрошена. */
export function addModel(into: Builder, raw: RawModel, options: ModelOptions, base: Painter | null): Rotor | null {
  const matrix = placement(options, packScale(raw.key))
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
  const rotorInto = options.rotor ? new Builder() : null
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  let pivot: THREE.Vector3 | null = options.rotor?.pivot ? new THREE.Vector3().fromArray(options.rotor.pivot) : null

  for (const chunk of raw.chunks) {
    const custom = options.painter?.(chunk.material, chunk.color, raw.key) ?? base?.(chunk.material, chunk.color, raw.key) ?? null
    if (custom?.drop) continue
    const color = custom?.color !== undefined ? paint(custom.color) : chunk.color
    const kind = custom?.kind ?? 0
    const wholeNodeTurns = !!(options.rotor?.node && options.rotor.node.test(chunk.node))
    if (wholeNodeTurns && !pivot) pivot = raw.origins.get(chunk.node)?.clone() ?? null
    const { positions, normals } = chunk
    for (let i = 0; i < positions.length; i += 9) {
      let target = into
      if (rotorInto) {
        const cx = (positions[i] + positions[i + 3] + positions[i + 6]) / 3
        const cy = (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3
        const cz = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3
        if (wholeNodeTurns || options.rotor!.where?.(cx, cy, cz)) target = rotorInto
      }
      for (let j = 0; j < 9; j += 3) {
        p.set(positions[i + j], positions[i + j + 1], positions[i + j + 2]).applyMatrix4(matrix)
        n.set(normals[i + j], normals[i + j + 1], normals[i + j + 2]).applyMatrix3(normalMatrix).normalize()
        target.push(p, n, color, kind)
      }
    }
  }

  if (!rotorInto || rotorInto.empty || !pivot) return null
  const worldPivot = pivot.clone().applyMatrix4(matrix)
  const axis = new THREE.Vector3(0, 0, 1).transformDirection(matrix)
  return { geometry: rotorInto.geometry(worldPivot), pivot: worldPivot, axis, speed: options.rotor?.speed ?? 1 }
}
