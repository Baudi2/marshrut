// Жители и путник: модели со скелетом, ходят по улицам между постройками и останавливаются.
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { gearParts, hasCat, jacketColors } from './gear'
import { loadModel } from './kit'
import { CAMP_FIRE_AT, PITCH, PLAZA, seeded, type AnimalSpot, type Plot } from './plan'

const RESIDENTS = ['c/male_casual', 'c/female_casual', 'c/male_long_sleeve', 'c/female_dress', 'c/male_shirt', 'c/female_tank_top', 'c/female_alternative']
const TRAVELER = 'c/male_adventurer'
/** Цвета одежды жителей: приглушённые, чтобы красная куртка путника оставалась единственной. */
const CLOTH = ['#6f7f8f', '#8a6d4b', '#5f7a5a', '#9a7b6a', '#76698a', '#a58a4a', '#5d6f78']
const TROUSERS = ['#4a4f4a', '#5a4d3c', '#3f4a52', '#55504a']
const MAX_WALKERS = 12
const HEIGHT = 2.1
const TRAVELER_HEIGHT = 2.3
const SPEED = 1.15

interface Actor {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  walk: THREE.AnimationAction | null
  idle: THREE.AnimationAction | null
  path: THREE.Vector3[]
  leg: number
  pause: number
  walking: boolean
  /** Круг: дойдя до конца, идёт дальше по кругу, а не обратно. */
  loop: boolean
  /** Своя походка вместо скелетной анимации: у кота. */
  pose?: (time: number, walking: boolean) => void
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
  /** Участки с готовыми постройками: между ними ходят жители. */
  doors: Plot[]
  /** Запустение второго уровня и выше: жители сидят по домам. */
  quiet: boolean
  /** Надетая экипировка путника из лавки. */
  gear: string[]
  /** Животные: где стоят и что делают. */
  animals: AnimalSpot[]
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

export class People {
  group = new THREE.Group()
  private actors: Actor[] = []
  /** Пятно света от фонаря путника: яркость следует за временем суток. */
  private lanternSpot: THREE.Mesh | null = null
  private time = 0

  constructor(private readonly glow: () => number = () => 0) {}

  /** Модели, которые понадобятся: грузятся заранее вместе с постройками. */
  static async preload(input: PeopleInput) {
    const count = input.quiet ? 0 : Math.min(MAX_WALKERS, input.population)
    const animals = input.quiet ? [] : input.animals.map((spot) => spot.key)
    await Promise.all([...new Set([TRAVELER, ...animals, ...RESIDENTS.slice(0, Math.min(count, RESIDENTS.length))])].map(loadModel))
  }

  async populate(parent: THREE.Object3D, input: PeopleInput) {
    this.group = new THREE.Group()
    this.actors = []
    parent.add(this.group)
    const random = seeded(4242 + input.tier * 31 + input.population)

    const traveler = await this.spawn(TRAVELER, 0, true, TRAVELER_HEIGHT, input.gear)
    this.lanternSpot = equip(traveler.root, input.gear)
    const cat = hasCat(input.gear) ? this.spawnCat() : null
    if (input.tier === 0) {
      // На стоянке путник стоит у костра.
      // Он стоит за костром лицом к зрителю: огонь освещает его спереди.
      traveler.root.position.set(CAMP_FIRE_AT.x - 1.5, 0, CAMP_FIRE_AT.z - 1.7)
      traveler.root.rotation.y = Math.atan2(1.5, 1.7)
      traveler.path = []
      if (cat) {
        // Кот сидит по другую сторону костра и смотрит на огонь.
        cat.root.position.set(CAMP_FIRE_AT.x + 1.9, 0, CAMP_FIRE_AT.z - 0.6)
        cat.root.rotation.y = Math.atan2(-1.9, 0.6)
      }
    } else {
      // В поселении он обходит площадь.
      const w = PLAZA.w / 2 - 1
      const d = PLAZA.d / 2 - 1
      traveler.path = [new THREE.Vector3(-w, 0, d), new THREE.Vector3(w, 0, d), new THREE.Vector3(w, 0, -d * 0.2), new THREE.Vector3(-w, 0, -d * 0.2)]
      traveler.loop = true
      traveler.root.position.copy(traveler.path[0])
      if (cat) {
        // Кот обходит площадь тем же кругом, на шаг ближе к середине и чуть впереди.
        cat.path = traveler.path.map((p) => new THREE.Vector3(p.x * 0.86, 0, p.z * 0.86 + 0.6))
        cat.loop = true
        cat.leg = 1
        cat.root.position.copy(cat.path[1])
        cat.pause = 2.5
      }
    }

    // Животные стоят на месте: пасутся или просто смотрят. При запустении их уводят.
    if (!input.quiet) {
      for (const [i, spot] of input.animals.entries()) {
        const animal = await this.spawn(spot.key, i, false, spot.height, [], spot.grazing ? /(^|_)Eating$/ : /(^|_)Idle$/, 1.8)
        animal.root.position.set(spot.x, 0, spot.z)
        animal.root.rotation.y = THREE.MathUtils.degToRad(spot.turn)
      }
    }

    const count = input.quiet ? 0 : Math.min(MAX_WALKERS, input.population)
    const doors = input.doors.filter((plot) => !plot.water)
    if (doors.length < 2) return
    for (let i = 0; i < count; i++) {
      const actor = await this.spawn(RESIDENTS[i % RESIDENTS.length], i, false)
      const from = doors[Math.floor(random() * doors.length)]
      let to = doors[Math.floor(random() * doors.length)]
      if (to === from) to = doors[(doors.indexOf(from) + 1) % doors.length]
      actor.path = route(from, to)
      actor.leg = Math.floor(random() * (actor.path.length - 1))
      actor.root.position.copy(actor.path[actor.leg])
      actor.pause = random() * 5
    }
  }

  private async spawn(
    key: string,
    index: number,
    traveler: boolean,
    height = HEIGHT,
    gear: string[] = [],
    idlePattern = /(^|_)Idle$/,
    shadeSize = 1,
  ): Promise<Actor> {
    const gltf = await loadModel(key)
    const root = cloneSkinned(gltf.scene)
    dress(root, index, traveler, gear)
    root.scale.setScalar(height / skeletonHeight(root))
    const mixer = new THREE.AnimationMixer(root)
    const walkClip = clip(gltf.animations, /(^|_)Walk$/)
    const idleClip = clip(gltf.animations, idlePattern) ?? clip(gltf.animations, /(^|_)Idle$/)
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    idle?.play()
    // Пятно тени не должно растягиваться вместе с моделью: возвращаем ему настоящий размер.
    const shade = blob()
    shade.scale.setScalar(shadeSize / root.scale.x)
    root.add(shade)
    this.group.add(root)
    const actor: Actor = { root, mixer, walk, idle, path: [], leg: 0, pause: 1 + index * 0.7, walking: false, loop: false }
    this.actors.push(actor)
    return actor
  }

  private spawnCat(): Actor {
    const { root, pose } = makeCat()
    this.group.add(root)
    const actor: Actor = { root, mixer: new THREE.AnimationMixer(root), walk: null, idle: null, path: [], leg: 0, pause: 1, walking: false, loop: false, pose }
    this.actors.push(actor)
    return actor
  }

  tick(dt: number) {
    this.time += dt
    if (this.lanternSpot) (this.lanternSpot.material as THREE.MeshBasicMaterial).opacity = this.glow() * 0.75
    for (const actor of this.actors) {
      actor.mixer.update(dt)
      actor.pose?.(this.time, actor.walking)
      if (actor.path.length < 2) continue
      if (actor.pause > 0) {
        actor.pause -= dt
        if (actor.pause <= 0) this.setWalking(actor, true)
        continue
      }
      const next = actor.path[(actor.leg + 1) % actor.path.length]
      const position = actor.root.position
      const dx = next.x - position.x
      const dz = next.z - position.z
      const distance = Math.hypot(dx, dz)
      const step = SPEED * dt
      if (distance <= step) {
        position.copy(next)
        actor.leg++
        const end = !actor.loop && actor.leg >= actor.path.length - 1
        if (end) {
          // Дошёл: постоял у двери и пошёл обратно тем же путём.
          actor.path = [...actor.path].reverse()
          actor.leg = 0
          actor.pause = 3 + Math.random() * 5
          this.setWalking(actor, false)
        } else if (actor.loop) {
          actor.leg %= actor.path.length
          if (Math.random() < 0.35) {
            actor.pause = 2 + Math.random() * 4
            this.setWalking(actor, false)
          }
        }
      } else {
        position.x += (dx / distance) * step
        position.z += (dz / distance) * step
        // Поворот плавный, без рывков на углах улиц.
        const target = Math.atan2(dx, dz)
        let turn = target - actor.root.rotation.y
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        actor.root.rotation.y += turn * Math.min(1, dt * 7)
      }
    }
  }

  private setWalking(actor: Actor, walking: boolean) {
    if (actor.walking === walking) return
    actor.walking = walking
    const on = walking ? actor.walk : actor.idle
    const off = walking ? actor.idle : actor.walk
    if (on) on.reset().fadeIn(0.3).play()
    if (off) off.fadeOut(0.3)
  }

  dispose() {
    for (const actor of this.actors) {
      actor.mixer.stopAllAction()
      // У каждой копии свой скелет со своей текстурой костей и свои материалы: их нужно отдать.
      actor.root.traverse((object) => {
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
    this.actors = []
    this.lanternSpot = null
    this.group.removeFromParent()
  }
}

/** Путь по улицам от двери до двери: вдоль улицы перед домом, по поперечной улице и снова вдоль. */
function route(from: Plot, to: Plot): THREE.Vector3[] {
  const half = PITCH / 2
  const frontA = from.z + half
  const frontB = to.z + half
  // Поперечная улица — та сторона участка, что ближе к цели.
  const side = from.x + (to.x >= from.x ? half : -half)
  const points = [
    new THREE.Vector3(from.x + 1.2, 0, from.z + half - 1.6),
    new THREE.Vector3(from.x + 1.2, 0, frontA),
    new THREE.Vector3(side, 0, frontA),
    new THREE.Vector3(side, 0, frontB),
    new THREE.Vector3(to.x + 1.2, 0, frontB),
    new THREE.Vector3(to.x + 1.2, 0, to.z + half - 1.6),
  ]
  // Убираем повторы, когда двери на одной улице.
  return points.filter((point, i) => i === 0 || point.distanceTo(points[i - 1]) > 0.2)
}
