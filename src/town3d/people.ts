// Жители, путник и животные на сцене: модели со скелетом, движение по готовым маршрутам, грузы на фигуре.
// Кто чем занят, куда идёт, что несёт и где пасётся, решает jobs.ts; здесь только отрисовка и движение.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { Phase, WeatherKind } from '../world/sky'
import { gearParts, hasCat, jacketColors, type GearPart } from './gear'
import {
  CARGO_PACE,
  FIGURE,
  YARD_CELL,
  YARD_HALF,
  animalsRoam,
  beside,
  blockYard,
  cargoParts,
  crew,
  emptyYard,
  grazing,
  hurry,
  markYard,
  outdoors,
  roomBehind,
  stroll,
  walkersFor,
  type Cargo,
  type Point,
  type Site,
  type Yard,
} from './jobs'
import { loadModel } from './kit'
import { CAMP_FIRE_AT, PLAZA, centerSite, fireSpot, type AnimalSpot, type Plot } from './plan'

const RESIDENTS = ['c/male_casual', 'c/female_casual', 'c/male_long_sleeve', 'c/female_dress', 'c/male_shirt', 'c/female_tank_top', 'c/female_alternative']
const TRAVELER = 'c/male_adventurer'
/** Цвета одежды жителей: приглушённые, чтобы красная куртка путника оставалась единственной. */
const CLOTH = ['#6f7f8f', '#8a6d4b', '#5f7a5a', '#9a7b6a', '#76698a', '#a58a4a', '#5d6f78']
const TROUSERS = ['#4a4f4a', '#5a4d3c', '#3f4a52', '#55504a']
const HEIGHT = FIGURE.height
const TRAVELER_HEIGHT = 2.3
const SPEED = 1.15
/** Шаг животного на пастбище, метров в секунду, и скорость разворота на месте, радиан в секунду. */
const AMBLE = 0.42
const PIVOT = 0.7
/** Сколько метров в секунду проходит животное при родном темпе клипа ходьбы на единицу масштаба модели. */
const GAIT = 1.95
/** Груз остаётся в руках ещё столько секунд после остановки: донёс и поставил. */
const PUT_DOWN = 1.2
/** Домой на ночь и от дождя идут быстрее обычного. */
const HOME_PACE = 1.3

/** Переходы жителя вне круга: домой, из дома к началу круга, от ворот к двери и от двери к воротам. */
const HOMEWARD = -1
const OUTWARD = -2
const INDOOR = -3
const OUTDOOR = -4
/** Что делает животное: стоит, разворачивается на месте, идёт. */
const REST = 0
const TURN = 1
const WALK = 2

/** Ломаная на земле: x и z подряд. */
type Path = Float32Array

const toPath = (points: Point[]): Path => {
  const path = new Float32Array(points.length * 2)
  points.forEach(([x, z], i) => {
    path[i * 2] = x
    path[i * 2 + 1] = z
  })
  return path
}

interface Figure {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  walk: THREE.AnimationAction | null
  idle: THREE.AnimationAction | null
  /** Клип, который играет сейчас. */
  now: THREE.AnimationAction | null
  walking: boolean
}

/** Путник и кот: ходят по кругу и иногда останавливаются. */
interface Rover extends Figure {
  path: Path
  leg: number
  pause: number
  /** Своя походка вместо скелетной анимации: у кота. */
  pose?: (time: number, walking: boolean) => void
}

/** Один переход жителя. */
interface Stretch {
  path: Path
  /** Что несёт: деталь на фигуре, которая показывается на время перехода. */
  cargo: THREE.Mesh | null
  /** Доля обычной скорости: с ношей идут медленнее. */
  pace: number
  /** Куда смотрит, когда дошёл. */
  face: number
}

/** Житель: ходит по кругу своего занятия, на ночь и в непогоду уходит домой. */
interface Walker extends Figure {
  /** Номер среди жителей: когда на улице остаются не все, остаются первые. */
  index: number
  plan: Stretch[]
  /** Номер перехода, который кончается у дома; −1 — дом в стороне от круга или его нет. */
  homeLeg: number
  /** Дорога домой с каждой остановки круга: toHome[i] — оттуда, где кончается переход i. Пусто — дом на круге или его нет. */
  toHome: Path[]
  fromHome: Path | null
  homeFace: number
  /** От ворот дома к двери и обратно: у двери житель скрывается в доме. null — заходить некуда, скрывается у ворот. */
  toDoor: Path | null
  fromDoor: Path | null
  /** Скрылся у двери: оттуда же и выйдет. */
  atDoor: boolean
  path: Path
  /** Номер точки пути, к которой идёт. */
  at: number
  /** Переход, который идёт сейчас, тот, что начнётся после остановки, и последний законченный переход круга. */
  stage: number
  next: number
  last: number
  wait: number
  face: number
  /** Через сколько секунд опустит груз. */
  drop: number
  carry: THREE.Mesh | null
  pace: number
  /** В доме: на сцене его не видно. */
  inside: boolean
  atHome: boolean
  /** Встал и ждёт, пока освободится дорога. */
  held: boolean
}

/** Животное на пастбище: стоит, щиплет траву и переходит от точки к точке. */
interface Beast extends Figure {
  graze: THREE.AnimationAction | null
  look: THREE.AnimationAction | null
  nodes: Path
  links: number[][]
  at: number
  to: number
  mode: number
  timer: number
  /** Поворот, с которым пойдёт к следующей точке. */
  aim: number
  /** Чаще щиплет траву, чем озирается. */
  grazer: boolean
}

/** Всё, что создано за одну сборку города: освобождается разом. */
interface Cast {
  group: THREE.Group
  figures: Figure[]
  rovers: Rover[]
  walkers: Walker[]
  beasts: Beast[]
  /** Грузы: одна геометрия на вид груза и один материал на все. */
  cargo: Map<Cargo, THREE.BufferGeometry>
  material: THREE.MeshLambertMaterial | null
}

function dress(root: THREE.Object3D, index: number, traveler: boolean, gear: string[] = []) {
  const [jacket, sleeves] = jacketColors(gear)
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.frustumCulled = false
    const source = mesh.material as THREE.MeshStandardMaterial
    const name = source.name
    let color = source.color.clone()
    if (traveler) {
      if (name === 'Green') color = new THREE.Color(jacket)
      else if (name === 'LightGreen') color = new THREE.Color(sleeves)
      else if (name === 'Gold') color = new THREE.Color('#d9b24a')
    } else if (/^(Shirt|Dress|Jacket|LightJacket|Shirt2)$/.test(name)) color = new THREE.Color(CLOTH[index % CLOTH.length])
    else if (name === 'Pants') color = new THREE.Color(TROUSERS[index % TROUSERS.length])
    mesh.material = new THREE.MeshLambertMaterial({ color })
  })
}

/** Рост по скелету: у модели со скелетом габариты сетки ненадёжны. */
function skeletonHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true)
  let low = Infinity
  let high = -Infinity
  const at = new THREE.Vector3()
  root.traverse((object) => {
    if (!(object as THREE.Bone).isBone) return
    at.setFromMatrixPosition(object.matrixWorld)
    low = Math.min(low, at.y)
    high = Math.max(high, at.y)
  })
  return high > low ? (high - low) * 1.1 : 1.8
}

const clip = (clips: THREE.AnimationClip[], pattern: RegExp) => clips.find((c) => pattern.test(c.name))

export interface PeopleInput {
  tier: number
  population: number
  /** Постройки города: по ним раздаются занятия и считаются стройки. */
  sites: Site[]
  /** Город переходит на новую ступень: на площади стоят леса. */
  tierPending: boolean
  /** Открытые участки: вдоль них идут улицы. */
  open: Plot[]
  /** Запустение второго уровня и выше: жители сидят по домам, животных увели. */
  quiet: boolean
  /** Надетая экипировка путника из лавки. */
  gear: string[]
  /** Животные: какие есть в городе. */
  animals: AnimalSpot[]
}

/** Препятствие — то, что стоит на высоте человека: от щиколотки до макушки. Ниже — земля и бордюры, выше — свесы крыш и кроны. */
const OBSTACLE_LOW = 0.2
const OBSTACLE_HIGH = 1.9

/**
 * Карта препятствий площади, снятая с уже собранной сцены: стены, ступени, скамьи, фонари, фонтан —
 * всё, что там на самом деле стоит, со всеми купленными украшениями. По ней прокладывается круг путника.
 * skip — фигуры людей и животных: они не препятствия. Считается один раз за сборку города.
 */
function surveyYard(parent: THREE.Object3D, skip: THREE.Object3D): Yard {
  const yard = emptyYard()
  parent.updateMatrixWorld(true)
  const box = new THREE.Box3()
  const matrix = new THREE.Matrix4()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const [minX, maxX, minZ, maxZ] = [PLAZA.x - YARD_HALF, PLAZA.x + YARD_HALF, PLAZA.z - YARD_HALF, PLAZA.z + YARD_HALF]
  const scan = (geometry: THREE.BufferGeometry, world: THREE.Matrix4) => {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    box.copy(geometry.boundingBox!).applyMatrix4(world)
    if (box.max.y < OBSTACLE_LOW || box.min.y > OBSTACLE_HIGH || box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ) return
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const count = index ? index.count : position.count
    for (let t = 0; t + 2 < count; t += 3) {
      a.fromBufferAttribute(position, index ? index.getX(t) : t).applyMatrix4(world)
      b.fromBufferAttribute(position, index ? index.getX(t + 1) : t + 1).applyMatrix4(world)
      c.fromBufferAttribute(position, index ? index.getX(t + 2) : t + 2).applyMatrix4(world)
      if (Math.max(a.y, b.y, c.y) < OBSTACLE_LOW || Math.min(a.y, b.y, c.y) > OBSTACLE_HIGH) continue
      if (Math.max(a.x, b.x, c.x) < minX || Math.min(a.x, b.x, c.x) > maxX || Math.max(a.z, b.z, c.z) < minZ || Math.min(a.z, b.z, c.z) > maxZ) continue
      // Треугольник отмечается точками чаще клетки: большая стена не остаётся дырявой.
      const steps = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), a.distanceTo(c)) / (YARD_CELL * 0.8)))
      for (let u = 0; u <= steps; u++) {
        for (let w = 0; w <= steps - u; w++) {
          const y = a.y + ((b.y - a.y) * u + (c.y - a.y) * w) / steps
          if (y < OBSTACLE_LOW || y > OBSTACLE_HIGH) continue
          markYard(yard, a.x + ((b.x - a.x) * u + (c.x - a.x) * w) / steps, a.z + ((b.z - a.z) * u + (c.z - a.z) * w) / steps)
        }
      }
    }
  }
  const visit = (object: THREE.Object3D) => {
    if (object === skip || !object.visible) return
    const mesh = object as THREE.Mesh
    if (mesh.isMesh && !(object as THREE.SkinnedMesh).isSkinnedMesh && mesh.geometry?.getAttribute('position')) {
      const many = object as THREE.InstancedMesh
      if (many.isInstancedMesh) {
        for (let k = 0; k < many.count; k++) {
          many.getMatrixAt(k, matrix)
          scan(mesh.geometry, matrix.premultiply(many.matrixWorld))
        }
      } else scan(mesh.geometry, mesh.matrixWorld)
    }
    for (const child of object.children) visit(child)
  }
  visit(parent)
  return yard
}

/** Пятно тени под ногами: одно на всех, дешёвая замена настоящей тени. */
const blob = (() => {
  let material: THREE.MeshBasicMaterial | null = null
  let geometry: THREE.BufferGeometry | null = null
  return () => {
    if (!material || !geometry) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 64
      const g = canvas.getContext('2d')!
      const fill = g.createRadialGradient(32, 32, 0, 32, 32, 30)
      fill.addColorStop(0, 'rgba(20,24,20,0.5)')
      fill.addColorStop(1, 'rgba(20,24,20,0)')
      g.fillStyle = fill
      g.fillRect(0, 0, 64, 64)
      material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false })
      geometry = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2)
    }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = 0.07
    mesh.renderOrder = 1
    return mesh
  }
})()

/**
 * Кот-спутник. Готовой модели кота в наборах нет, поэтому он собран из простых фигур:
 * тёмно-серый с белой грудкой и лапами, чтобы читаться и на земле, и на снегу.
 * Он чуть крупнее настоящего, как и жители. Возвращает фигуру и её походку.
 */
function makeCat(): { root: THREE.Group; pose: (time: number, walking: boolean) => void } {
  const fur = new THREE.MeshLambertMaterial({ color: '#4f4b47' })
  const white = new THREE.MeshLambertMaterial({ color: '#e9e4da' })
  const own = <T extends THREE.Mesh>(mesh: T) => {
    mesh.userData.own = true
    return mesh
  }
  const piece = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = own(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material))
    mesh.position.set(x, y, z)
    return mesh
  }
  const root = new THREE.Group()
  const torso = new THREE.Group()
  torso.add(piece(0.26, 0.24, 0.62, fur, 0, 0, 0), piece(0.2, 0.17, 0.1, white, 0, -0.03, 0.29))
  torso.position.set(0, 0.4, 0)
  const head = new THREE.Group()
  head.add(piece(0.26, 0.22, 0.22, fur, 0, 0, 0), piece(0.14, 0.09, 0.06, white, 0, -0.05, 0.13))
  for (const side of [-1, 1]) {
    const ear = own(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), fur))
    ear.position.set(side * 0.09, 0.17, 0)
    head.add(ear)
  }
  head.position.set(0, 0.6, 0.36)
  // Хвост качается вокруг своего основания.
  const tail = new THREE.Group()
  tail.add(piece(0.07, 0.07, 0.46, fur, 0, 0, -0.23), piece(0.075, 0.075, 0.1, white, 0, 0, -0.48))
  tail.position.set(0, 0.46, -0.3)
  const legs = [
    [-0.09, 0.2],
    [0.09, 0.2],
    [-0.09, -0.22],
    [0.09, -0.22],
  ].map(([x, z]) => {
    const leg = new THREE.Group()
    leg.add(piece(0.075, 0.2, 0.075, fur, 0, -0.1, 0), piece(0.085, 0.08, 0.095, white, 0, -0.24, 0.01))
    leg.position.set(x, 0.28, z)
    root.add(leg)
    return leg
  })
  root.add(torso, head, tail)
  const shade = blob()
  shade.scale.setScalar(0.55)
  root.add(shade)

  const pose = (time: number, walking: boolean) => {
    if (walking) {
      // Походка: лапы по диагонали, спина ровная, хвост трубой.
      const swing = Math.sin(time * 11) * 0.55
      legs[0].rotation.x = swing
      legs[3].rotation.x = swing
      legs[1].rotation.x = -swing
      legs[2].rotation.x = -swing
      legs[2].position.set(-0.09, 0.28, -0.22)
      legs[3].position.set(0.09, 0.28, -0.22)
      torso.rotation.x = 0
      torso.position.y = 0.4 + Math.abs(Math.sin(time * 11)) * 0.015
      head.position.set(0, 0.6, 0.36)
      tail.rotation.x = 0.95 + Math.sin(time * 5) * 0.12
    } else {
      // Сидит: спина наклонена, задние лапы подобраны, хвост лежит и изредка подёргивается.
      for (const leg of legs) leg.rotation.x = 0
      legs[2].position.set(-0.11, 0.2, -0.1)
      legs[3].position.set(0.11, 0.2, -0.1)
      torso.rotation.x = -0.62
      torso.position.y = 0.42
      head.position.set(0, 0.72, 0.24)
      tail.rotation.x = -0.25 + Math.max(0, Math.sin(time * 1.3)) * 0.18
    }
    tail.rotation.y = Math.sin(time * (walking ? 4 : 0.9)) * (walking ? 0.25 : 0.5)
  }
  pose(0, false)
  return { root, pose }
}

/** Тёплое пятно света от фонаря путника: видно в сумерках и ночью. */
function warmSpot(): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  const fill = g.createRadialGradient(32, 32, 0, 32, 32, 30)
  fill.addColorStop(0, 'rgba(255,190,110,0.8)')
  fill.addColorStop(1, 'rgba(255,160,80,0)')
  g.fillStyle = fill
  g.fillRect(0, 0, 64, 64)
  const material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), material)
  mesh.position.y = 0.1
  mesh.renderOrder = 2
  mesh.userData.own = true
  return mesh
}

/** Надевает на путника купленное: детали стоят на фигуре в метрах, независимо от масштаба модели. */
function equip(root: THREE.Object3D, gear: string[]): THREE.Mesh | null {
  const parts = gearParts(gear, TRAVELER_HEIGHT)
  if (!parts.length) return null
  const kit = new THREE.Group()
  kit.scale.setScalar(1 / root.scale.x)
  root.add(kit)
  let spot: THREE.Mesh | null = null
  for (const part of parts) {
    const [a, b, c] = part.size
    const geometry = part.shape === 'box' ? new THREE.BoxGeometry(a, b, c) : new THREE.CylinderGeometry(b, a, c, 10)
    const height = part.shape === 'box' ? b : c
    geometry.translate(0, height / 2, 0)
    const material = part.glow ? new THREE.MeshBasicMaterial({ color: part.color }) : new THREE.MeshLambertMaterial({ color: part.color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...part.at)
    if (part.tilt) mesh.rotation.set(part.tilt[0], 0, part.tilt[1])
    mesh.userData.own = true
    kit.add(mesh)
    if (part.glow && !spot) {
      spot = warmSpot()
      kit.add(spot)
    }
  }
  return spot
}

/**
 * Груз одной геометрией с цветом в вершинах: детали те же, что у экипировки путника,
 * и стоят на фигуре так же — основанием в точке at, с наклоном вокруг осей X и Z.
 */
function cargoGeometry(parts: GearPart[]): THREE.BufferGeometry {
  const turn = new THREE.Matrix4()
  const euler = new THREE.Euler()
  const tint = new THREE.Color()
  const pieces = parts.map((part) => {
    const [a, b, c] = part.size
    const geometry = part.shape === 'box' ? new THREE.BoxGeometry(a, b, c) : new THREE.CylinderGeometry(b, a, c, 8)
    geometry.translate(0, (part.shape === 'box' ? b : c) / 2, 0)
    if (part.tilt) geometry.applyMatrix4(turn.makeRotationFromEuler(euler.set(part.tilt[0], 0, part.tilt[1])))
    geometry.translate(...part.at)
    geometry.deleteAttribute('uv')
    const count = geometry.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    tint.set(part.color)
    for (let i = 0; i < count; i++) tint.toArray(colors, i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  })
  const merged = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  return merged
}

/** Плавная смена клипа. */
function play(figure: Figure, action: THREE.AnimationAction | null, fade = 0.3) {
  if (!action || figure.now === action) return
  if (fade > 0) {
    action.reset().fadeIn(fade).play()
    figure.now?.fadeOut(fade)
  } else {
    figure.now?.stop()
    action.reset().play()
  }
  figure.now = action
}

/** Поворот к нужному углу кратчайшей дорогой: share — какую долю остатка пройти за кадр. */
function turnTo(root: THREE.Object3D, target: number, share: number) {
  const turn = target - root.rotation.y
  root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * share
}

/** Шаг к точке (x, z): фигура поворачивается лицом по ходу. true — дошёл. */
function stepTo(root: THREE.Object3D, x: number, z: number, step: number, dt: number): boolean {
  const position = root.position
  const dx = x - position.x
  const dz = z - position.z
  const distance = Math.hypot(dx, dz)
  if (distance <= step) {
    position.x = x
    position.z = z
    return true
  }
  position.x += (dx / distance) * step
  position.z += (dz / distance) * step
  // Модели смотрят вдоль +Z: поворот — это угол хода от оси Z. Плавно, без рывков на углах улиц.
  turnTo(root, Math.atan2(dx, dz), Math.min(1, dt * 7))
  return false
}

export class People {
  private cast: Cast | null = null
  /** Пятно света от фонаря путника: яркость следует за временем суток. */
  private lanternSpot: THREE.Mesh | null = null
  private time = 0
  /** Номер сборки: если пока грузились модели, город попросили собрать заново, прежняя сборка бросается. */
  private run = 0
  private phase: Phase = 'day'
  private kind: WeatherKind = 'clear'
  /** Сколько жителей сейчас может быть на улице: остальные уходят домой. */
  private outLimit = 0
  /** Животные бродят; ночью и в грозу стоят. */
  private roam = true
  /** В дождь шаг быстрее. */
  private haste = 1

  constructor(private readonly glow: () => number = () => 0) {}

  /** Модели, которые понадобятся: грузятся заранее вместе с постройками. */
  static async preload(input: PeopleInput) {
    const count = walkersFor(input.population, input.quiet)
    const animals = input.quiet ? [] : input.animals.map((spot) => spot.key)
    await Promise.all([...new Set([TRAVELER, ...animals, ...RESIDENTS.slice(0, Math.min(count, RESIDENTS.length))])].map(loadModel))
  }

  /** Время суток и погода: от них зависит, сколько жителей на улице и бродят ли животные. Сцена не пересобирается. */
  setSky(phase: Phase, kind: WeatherKind) {
    this.phase = phase
    this.kind = kind
    this.roam = animalsRoam(phase, kind)
    this.haste = hurry(kind)
    const walkers = this.cast?.walkers ?? []
    this.outLimit = outdoors(walkers.length, phase, kind)
    // Шаг клипа — под новую скорость: ноги не скользят.
    for (const walker of walkers) if (walker.walk) walker.walk.timeScale = walker.pace * this.haste
  }

  async populate(parent: THREE.Object3D, input: PeopleInput) {
    this.dispose()
    const run = ++this.run
    const cast: Cast = { group: new THREE.Group(), figures: [], rovers: [], walkers: [], beasts: [], cargo: new Map(), material: null }
    this.cast = cast
    parent.add(cast.group)
    /** Пока грузилась модель, эту сборку могли отменить: всё созданное ею отдаётся. */
    const stale = () => {
      if (run === this.run) return false
      this.scrap(cast)
      return true
    }

    // Путник и кот.
    const traveler = await this.spawnRover(cast, TRAVELER, input.gear)
    if (stale()) return
    this.lanternSpot = equip(traveler.root, input.gear)
    const cat = hasCat(input.gear) ? this.spawnCat(cast) : null
    if (input.tier === 0) {
      // На стоянке путник стоит у костра.
      // Он стоит за костром лицом к зрителю: огонь освещает его спереди.
      traveler.root.position.set(CAMP_FIRE_AT.x - 1.5, 0, CAMP_FIRE_AT.z - 1.7)
      traveler.root.rotation.y = Math.atan2(1.5, 1.7)
      if (cat) {
        // Кот сидит по другую сторону костра и смотрит на огонь.
        cat.root.position.set(CAMP_FIRE_AT.x + 1.9, 0, CAMP_FIRE_AT.z - 0.6)
        cat.root.rotation.y = Math.atan2(-1.9, 0.6)
      }
    } else {
      // В поселении он обходит площадь — по карте того, что на ней стоит: сквозь ратушу, фонтан и скамьи не идёт.
      const yard = surveyYard(parent, cast.group)
      if (input.tierPending) {
        // К лесам на площади жители носят материалы: путник им не мешает.
        const site = centerSite(input.tier)
        blockYard(yard, site.x - 3.6, site.x + 3.6, site.z - 3.6, site.z + 6.6)
      }
      const loop = stroll(yard)
      if (loop.length) {
        traveler.path = toPath(loop)
        traveler.root.position.set(loop[0][0], 0, loop[0][1])
        if (cat) {
          // Кот идёт той же дорогой, на полшага левее и чуть впереди.
          cat.path = toPath(beside(loop, 0.45))
          cat.leg = 1 % loop.length
          cat.root.position.set(cat.path[cat.leg * 2], 0, cat.path[cat.leg * 2 + 1])
          cat.pause = 2.5
        }
      } else {
        // Гулять негде: стоит у общего костра, как на стоянке.
        const fire = fireSpot(input.tier)
        traveler.root.position.set(fire.x - 1.6, 0, fire.z + 1.9)
        traveler.root.rotation.y = Math.atan2(1.6, -1.9)
        if (cat) {
          cat.root.position.set(fire.x + 1.9, 0, fire.z + 1.6)
          cat.root.rotation.y = Math.atan2(-1.9, -1.6)
        }
      }
    }

    // Животные на пастбищах. При запустении их уводят.
    if (!input.quiet) {
      for (const [i, grazer] of grazing(input.animals).entries()) {
        const figure = await this.spawn(cast, grazer.key, i, false, grazer.height, [], 1.8)
        if (stale()) return
        const clips = figure.clips
        const graze = clip(clips, /(^|_)Eating$/)
        const look = clip(clips, /(^|_)Idle_2$/)
        const beast: Beast = {
          ...figure.figure,
          graze: graze ? figure.figure.mixer.clipAction(graze) : null,
          look: look ? figure.figure.mixer.clipAction(look) : null,
          nodes: toPath(grazer.nodes),
          links: grazer.links,
          at: 0,
          to: 0,
          mode: REST,
          timer: 2 + Math.random() * 9,
          aim: grazer.turn,
          grazer: grazer.grazing,
        }
        // Шаг клипа подогнан под скорость: ноги не скользят по траве.
        if (beast.walk) beast.walk.timeScale = AMBLE / (GAIT * beast.root.scale.x)
        beast.root.position.set(grazer.nodes[0][0], 0, grazer.nodes[0][1])
        beast.root.rotation.y = grazer.turn
        if (this.roam && beast.grazer) play(beast, beast.graze, 0)
        cast.beasts.push(beast)
      }
    }

    // Жители: каждому своё занятие и свой круг.
    const plans = crew({ tier: input.tier, population: input.population, quiet: input.quiet, sites: input.sites, tierPending: input.tierPending, open: input.open }).filter(
      (plan) => plan.legs.every((leg) => leg.points.length >= 2),
    )
    this.outLimit = outdoors(plans.length, this.phase, this.kind)
    for (const [i, plan] of plans.entries()) {
      const figure = await this.spawn(cast, RESIDENTS[i % RESIDENTS.length], i, false, HEIGHT, [], 1)
      if (stale()) return
      const root = figure.figure.root
      // Грузы стоят на фигуре в метрах: как экипировка путника, не на костях скелета.
      const kit = new THREE.Group()
      kit.scale.setScalar(1 / root.scale.x)
      root.add(kit)
      const loads = new Map<Cargo, THREE.Mesh>()
      const load = (kind: Cargo | null) => {
        if (!kind) return null
        let mesh = loads.get(kind)
        if (!mesh) {
          mesh = this.cargoMesh(cast, kind)
          loads.set(kind, mesh)
          kit.add(mesh)
        }
        return mesh
      }
      const stretches = plan.legs.map((leg): Stretch => ({ path: toPath(leg.points), cargo: load(leg.cargo), pace: leg.cargo ? CARGO_PACE[leg.cargo] : 1, face: leg.to.face }))
      const walker: Walker = {
        ...figure.figure,
        index: i,
        plan: stretches,
        homeLeg: plan.homeLeg,
        toHome: plan.toHome.every((points) => points.length > 1) ? plan.toHome.map(toPath) : [],
        fromHome: plan.fromHome.length > 1 ? toPath(plan.fromHome) : null,
        homeFace: plan.home?.face ?? 0,
        toDoor: plan.door.length > 1 ? toPath(plan.door) : null,
        fromDoor: plan.door.length > 1 ? toPath([...plan.door].reverse()) : null,
        atDoor: false,
        path: stretches[0].path,
        at: 1,
        stage: 0,
        next: 0,
        last: stretches.length - 1,
        wait: 0,
        face: 0,
        drop: 0,
        carry: null,
        pace: 1,
        inside: false,
        atHome: false,
        held: false,
      }
      cast.walkers.push(walker)
      if (i < this.outLimit) {
        // На улице: застаём его посреди случайного перехода.
        const stage = Math.floor(Math.random() * stretches.length)
        const path = stretches[stage].path
        const at = 1 + Math.floor(Math.random() * (path.length / 2 - 1))
        root.position.set(path[at * 2 - 2], 0, path[at * 2 - 1])
        root.rotation.y = Math.atan2(path[at * 2] - path[at * 2 - 2], path[at * 2 + 1] - path[at * 2 - 1])
        this.begin(walker, stage)
        walker.at = at
      } else {
        // Дома: выйдет, когда кончится ночь или дождь, — от двери, если она есть, иначе от ворот.
        const gate = walker.fromHome ?? stretches[Math.max(0, walker.homeLeg)].path
        const end = walker.fromHome ? 0 : walker.homeLeg >= 0 ? gate.length - 2 : 0
        root.position.set(gate[end], 0, gate[end + 1])
        walker.next = walker.fromHome ? OUTWARD : walker.homeLeg >= 0 ? (walker.homeLeg + 1) % stretches.length : 0
        walker.atHome = !!walker.fromHome || walker.homeLeg >= 0
        if (walker.atHome && walker.fromDoor) {
          root.position.set(walker.fromDoor[0], 0, walker.fromDoor[1])
          walker.atDoor = true
        }
        walker.inside = true
        root.visible = false
      }
    }
    // Позы клипов встают сразу: при выключенной анимации кадры не идут, и фигуры остались бы с разведёнными руками.
    this.tick(0)
  }

  private async spawn(cast: Cast, key: string, index: number, traveler: boolean, height: number, gear: string[], shadeSize: number) {
    const gltf = await loadModel(key)
    const root = cloneSkinned(gltf.scene)
    dress(root, index, traveler, gear)
    root.scale.setScalar(height / skeletonHeight(root))
    const mixer = new THREE.AnimationMixer(root)
    const walkClip = clip(gltf.animations, /(^|_)Walk$/)
    const idleClip = clip(gltf.animations, /(^|_)Idle$/)
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    idle?.play()
    // Поза покоя встаёт сразу: фигура, которую пока не двигают, не остаётся с разведёнными руками.
    mixer.update(0)
    // Пятно тени не должно растягиваться вместе с моделью: возвращаем ему настоящий размер.
    const shade = blob()
    shade.scale.setScalar(shadeSize / root.scale.x)
    root.add(shade)
    cast.group.add(root)
    const figure: Figure = { root, mixer, walk, idle, now: idle, walking: false }
    // В общий список — сразу: по нему сборка освобождается, даже если её отменят на полпути.
    cast.figures.push(figure)
    return { figure, clips: gltf.animations }
  }

  private async spawnRover(cast: Cast, key: string, gear: string[]): Promise<Rover> {
    const { figure } = await this.spawn(cast, key, 0, true, TRAVELER_HEIGHT, gear, 1)
    const rover: Rover = { ...figure, path: new Float32Array(0), leg: 0, pause: 1 }
    cast.rovers.push(rover)
    return rover
  }

  private spawnCat(cast: Cast): Rover {
    const { root, pose } = makeCat()
    cast.group.add(root)
    const rover: Rover = { root, mixer: new THREE.AnimationMixer(root), walk: null, idle: null, now: null, walking: false, path: new Float32Array(0), leg: 0, pause: 1, pose }
    cast.figures.push(rover)
    cast.rovers.push(rover)
    return rover
  }

  /** Деталь груза для одного жителя: геометрия и материал общие на всех. Тени у груза нет, как и у жителей. */
  private cargoMesh(cast: Cast, kind: Cargo): THREE.Mesh {
    let geometry = cast.cargo.get(kind)
    if (!geometry) {
      geometry = cargoGeometry(cargoParts(kind))
      cast.cargo.set(kind, geometry)
    }
    cast.material ??= new THREE.MeshLambertMaterial({ vertexColors: true })
    const mesh = new THREE.Mesh(geometry, cast.material)
    mesh.visible = false
    return mesh
  }

  tick(dt: number) {
    const cast = this.cast
    if (!cast) return
    this.time += dt
    if (this.lanternSpot) (this.lanternSpot.material as THREE.MeshBasicMaterial).opacity = this.glow() * 0.75
    for (const rover of cast.rovers) this.moveRover(rover, dt)
    for (const walker of cast.walkers) this.moveWalker(walker, dt)
    for (const beast of cast.beasts) this.moveBeast(beast, dt)
  }

  private moveRover(rover: Rover, dt: number) {
    rover.mixer.update(dt)
    rover.pose?.(this.time, rover.walking)
    const count = rover.path.length / 2
    if (count < 2) return
    if (rover.pause > 0) {
      rover.pause -= dt
      if (rover.pause <= 0) this.setWalking(rover, true)
      return
    }
    const next = (rover.leg + 1) % count
    if (!stepTo(rover.root, rover.path[next * 2], rover.path[next * 2 + 1], SPEED * dt, dt)) return
    rover.leg = next
    // Остановки — примерно раз в три поворота, сколько бы точек ни было в круге.
    if (Math.random() < Math.min(0.35, 2.4 / count)) {
      rover.pause = 2 + Math.random() * 4
      this.setWalking(rover, false)
    }
  }

  private moveWalker(walker: Walker, dt: number) {
    if (walker.inside) {
      if (walker.index >= this.outLimit) return
      // Выходит из дома. Дверь смотрит на улицу, на юг: туда же лицом выходит житель.
      walker.inside = false
      walker.root.visible = true
      walker.root.rotation.y = 0
      walker.face = 0
      if (walker.atDoor) {
        // От двери идёт к воротам и уже оттуда — по своим делам.
        walker.atDoor = false
        this.begin(walker, OUTDOOR)
      } else walker.wait = 0.6 + Math.random() * 2.4
    }
    walker.mixer.update(dt)
    if (walker.wait > 0) {
      // Стоит у постройки лицом к ней; груз опускает не сразу.
      walker.wait -= dt
      turnTo(walker.root, walker.face, Math.min(1, dt * 4))
      if (walker.drop > 0) {
        walker.drop -= dt
        if (walker.drop <= 0) this.carry(walker, null)
      }
      if (walker.wait <= 0) this.depart(walker)
      return
    }
    // Не входит в того, кто впереди: сбавляет шаг, а вплотную — встаёт и ждёт. Трогается, когда станет свободнее.
    const room = this.roomAhead(walker)
    if (walker.held ? room < 0.45 : room < 0.08) {
      if (!walker.held) {
        walker.held = true
        this.setWalking(walker, false)
      }
      return
    }
    if (walker.held) {
      walker.held = false
      this.setWalking(walker, true)
    }
    const step = SPEED * walker.pace * this.haste * dt * room
    if (!stepTo(walker.root, walker.path[walker.at * 2], walker.path[walker.at * 2 + 1], step, dt)) return
    walker.at++
    if (walker.at >= walker.path.length / 2) this.arrive(walker)
  }

  /**
   * Сколько от шага можно сделать, чтобы не войти в жителя впереди: 1 — дорога свободна, 0 — вплотную.
   * Считаются те, кто стоит на пути или идёт в ту же сторону; встречные и идущие поперёк расходятся сами.
   */
  private roomAhead(walker: Walker): number {
    const cast = this.cast
    if (!cast) return 1
    const position = walker.root.position
    const tx = walker.path[walker.at * 2] - position.x
    const tz = walker.path[walker.at * 2 + 1] - position.z
    const length = Math.hypot(tx, tz)
    if (length < 1e-4) return 1
    const dx = tx / length
    const dz = tz / length
    let room = 1
    for (const other of cast.walkers) {
      if (other === walker || other.inside) continue
      const there = other.root.position
      // Стоит у постройки — мешает, если на пути; идёт или сам ждёт дороги — только если ему туда же.
      const moving = other.wait <= 0
      room = Math.min(
        room,
        roomBehind(dx, dz, there.x - position.x, there.z - position.z, moving ? other.path[other.at * 2] - there.x : null, moving ? other.path[other.at * 2 + 1] - there.z : null),
      )
    }
    return room
  }

  /** Начинает переход: круг занятия, дорогу домой (с остановки, где кончился переход last) или из дома. */
  private begin(walker: Walker, stage: number) {
    const stretch = stage >= 0 ? walker.plan[stage] : null
    const path = stretch ? stretch.path : stage === HOMEWARD ? walker.toHome[walker.last] : stage === OUTWARD ? walker.fromHome : stage === INDOOR ? walker.toDoor : walker.fromDoor
    if (!path || path.length < 4) {
      walker.wait = 2
      return
    }
    walker.stage = stage
    walker.path = path
    walker.held = false
    walker.at = 1
    walker.atHome = false
    walker.wait = 0
    walker.drop = 0
    this.carry(walker, stretch ? stretch.cargo : null)
    // С ношей шаг медленнее, домой — быстрее.
    walker.pace = stretch ? stretch.pace : stage === HOMEWARD ? HOME_PACE : 1
    if (walker.walk) walker.walk.timeScale = walker.pace * this.haste
    this.setWalking(walker, true)
  }

  /** Дошёл до остановки: стоит несколько секунд лицом к постройке. Кому пора домой, не задерживается. */
  private arrive(walker: Walker) {
    const count = walker.plan.length
    if (walker.stage === INDOOR) {
      // У двери: скрывается в доме.
      walker.atDoor = true
      walker.atHome = true
      walker.inside = true
      walker.root.visible = false
      this.setWalking(walker, false)
      return
    }
    if (walker.stage === OUTDOOR) {
      // Вышел к воротам: дальше — как после обычной остановки у дома. Что делать дальше, он помнит.
      walker.atHome = true
      walker.face = 0
      walker.wait = 0.5 + Math.random() * 1.5
      this.setWalking(walker, false)
      return
    }
    if (walker.stage === HOMEWARD) {
      walker.atHome = true
      walker.next = OUTWARD
      walker.face = walker.homeFace
    } else if (walker.stage === OUTWARD) {
      walker.last = count - 1
      walker.next = 0
      walker.face = walker.plan[count - 1].face
    } else {
      walker.last = walker.stage
      walker.atHome = walker.stage === walker.homeLeg
      walker.next = (walker.stage + 1) % count
      walker.face = walker.plan[walker.stage].face
      walker.drop = walker.carry ? PUT_DOWN : 0
    }
    walker.wait = walker.index >= this.outLimit ? 1.4 + Math.random() * 1.2 : 3 + Math.random() * 4
    this.setWalking(walker, false)
  }

  /** Постоял — идёт дальше. Если на улице пора остаться не всем, заходит в дом или сворачивает к нему. */
  private depart(walker: Walker) {
    if (walker.index >= this.outLimit) {
      // Дома нет вовсе: уходит с улицы в начале своего круга.
      const noHome = walker.toHome.length === 0 && walker.homeLeg < 0
      if (walker.atHome && walker.toDoor) {
        // У своих ворот: проходит во двор к двери.
        this.begin(walker, INDOOR)
        return
      }
      if (walker.atHome || (noHome && walker.next === 0)) {
        this.carry(walker, null)
        walker.inside = true
        walker.root.visible = false
        return
      }
      if (walker.toHome[walker.last]) {
        this.begin(walker, HOMEWARD)
        return
      }
    }
    this.begin(walker, walker.next)
  }

  private carry(walker: Walker, cargo: THREE.Mesh | null) {
    if (walker.carry === cargo) return
    if (walker.carry) walker.carry.visible = false
    walker.carry = cargo
    if (cargo) cargo.visible = true
  }

  private moveBeast(beast: Beast, dt: number) {
    beast.mixer.update(dt)
    if (beast.mode === REST) {
      beast.timer -= dt
      if (beast.timer > 0) return
      const ways = beast.links[beast.at]
      if (this.roam && ways.length && Math.random() < 0.7) {
        // Переходит на новое место: сперва разворачивается к нему, потом идёт прямо.
        beast.to = ways[Math.floor(Math.random() * ways.length)]
        beast.aim = Math.atan2(beast.nodes[beast.to * 2] - beast.root.position.x, beast.nodes[beast.to * 2 + 1] - beast.root.position.z)
        beast.mode = TURN
        play(beast, beast.walk, 0.5)
        return
      }
      // Стоит дальше: ночью и в грозу просто стоит, днём то щиплет траву, то озирается.
      beast.timer = 7 + Math.random() * 12
      const roll = Math.random()
      const eats = roll < (beast.grazer ? 0.65 : 0.35)
      play(beast, !this.roam ? beast.idle : eats ? beast.graze : roll > 0.85 ? beast.look : beast.idle, 0.6)
      return
    }
    if (beast.mode === TURN) {
      const turn = beast.aim - beast.root.rotation.y
      const left = Math.atan2(Math.sin(turn), Math.cos(turn))
      const step = PIVOT * dt
      if (Math.abs(left) > step) {
        beast.root.rotation.y += Math.sign(left) * step
        return
      }
      beast.root.rotation.y = beast.aim
      beast.mode = WALK
      return
    }
    // Идёт прямо, головой вперёд: поворот уже совпадает с направлением хода, боком животное не скользит.
    const position = beast.root.position
    const dx = beast.nodes[beast.to * 2] - position.x
    const dz = beast.nodes[beast.to * 2 + 1] - position.z
    const distance = Math.hypot(dx, dz)
    const step = AMBLE * dt
    if (distance > step) {
      position.x += (dx / distance) * step
      position.z += (dz / distance) * step
      return
    }
    position.x = beast.nodes[beast.to * 2]
    position.z = beast.nodes[beast.to * 2 + 1]
    beast.at = beast.to
    beast.mode = REST
    beast.timer = 10 + Math.random() * 18
    play(beast, this.roam && Math.random() < (beast.grazer ? 0.8 : 0.4) ? beast.graze : beast.idle, 0.6)
  }

  private setWalking(figure: Figure, walking: boolean) {
    if (figure.walking === walking) return
    figure.walking = walking
    play(figure, walking ? figure.walk : figure.idle)
  }

  /** Отдаёт всё, что создала сборка: скелеты, материалы, детали экипировки, геометрию грузов. */
  private scrap(cast: Cast) {
    for (const figure of cast.figures) {
      figure.mixer.stopAllAction()
      // У каждой копии свой скелет со своей текстурой костей и свои материалы: их нужно отдать.
      figure.root.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh
        if (mesh.isSkinnedMesh) {
          mesh.skeleton.dispose()
          ;(mesh.material as THREE.Material).dispose()
        } else if ((object as THREE.Mesh).isMesh && object.userData.own) {
          // Детали экипировки создаются заново при каждой сборке.
          const part = object as THREE.Mesh
          part.geometry.dispose()
          ;(part.material as THREE.MeshBasicMaterial).map?.dispose()
          ;(part.material as THREE.Material).dispose()
        }
      })
    }
    // Грузы делят одну геометрию на вид и один материал: отдаются по разу.
    for (const geometry of cast.cargo.values()) geometry.dispose()
    cast.cargo.clear()
    cast.material?.dispose()
    cast.material = null
    cast.figures = []
    cast.rovers = []
    cast.walkers = []
    cast.beasts = []
    cast.group.removeFromParent()
  }

  dispose() {
    this.run++
    if (this.cast) this.scrap(this.cast)
    this.cast = null
    this.lanternSpot = null
  }
}
