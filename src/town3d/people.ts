// Жители и путник: модели со скелетом, ходят по улицам между постройками и останавливаются.
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { loadModel } from './kit'
import { CAMP_FIRE_AT, PITCH, PLAZA, seeded, type Plot } from './plan'

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
}

function dress(root: THREE.Object3D, index: number, traveler: boolean) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.frustumCulled = false
    const source = mesh.material as THREE.MeshStandardMaterial
    const name = source.name
    let color = source.color.clone()
    if (traveler) {
      if (name === 'Green') color = new THREE.Color('#b5432f')
      else if (name === 'LightGreen') color = new THREE.Color('#c85a3f')
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

export class People {
  group = new THREE.Group()
  private actors: Actor[] = []

  /** Модели, которые понадобятся: грузятся заранее вместе с постройками. */
  static async preload(input: PeopleInput) {
    const count = input.quiet ? 0 : Math.min(MAX_WALKERS, input.population)
    await Promise.all([TRAVELER, ...RESIDENTS.slice(0, Math.min(count, RESIDENTS.length))].map(loadModel))
  }

  async populate(parent: THREE.Object3D, input: PeopleInput) {
    this.group = new THREE.Group()
    this.actors = []
    parent.add(this.group)
    const random = seeded(4242 + input.tier * 31 + input.population)

    const traveler = await this.spawn(TRAVELER, 0, true)
    if (input.tier === 0) {
      // На стоянке путник стоит у костра.
      // Он стоит за костром лицом к зрителю: огонь освещает его спереди.
      traveler.root.position.set(CAMP_FIRE_AT.x - 1.5, 0, CAMP_FIRE_AT.z - 1.7)
      traveler.root.rotation.y = Math.atan2(1.5, 1.7)
      traveler.path = []
    } else {
      // В поселении он обходит площадь.
      const w = PLAZA.w / 2 - 1
      const d = PLAZA.d / 2 - 1
      traveler.path = [new THREE.Vector3(-w, 0, d), new THREE.Vector3(w, 0, d), new THREE.Vector3(w, 0, -d * 0.2), new THREE.Vector3(-w, 0, -d * 0.2)]
      traveler.loop = true
      traveler.root.position.copy(traveler.path[0])
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

  private async spawn(key: string, index: number, traveler: boolean): Promise<Actor> {
    const gltf = await loadModel(key)
    const root = cloneSkinned(gltf.scene)
    dress(root, index, traveler)
    root.scale.setScalar((traveler ? TRAVELER_HEIGHT : HEIGHT) / skeletonHeight(root))
    const mixer = new THREE.AnimationMixer(root)
    const walkClip = clip(gltf.animations, /(^|_)Walk$/)
    const idleClip = clip(gltf.animations, /(^|_)Idle$/)
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    const idle = idleClip ? mixer.clipAction(idleClip) : null
    idle?.play()
    // Пятно тени не должно растягиваться вместе с моделью: возвращаем ему настоящий размер.
    const shade = blob()
    shade.scale.setScalar(1 / root.scale.x)
    root.add(shade)
    this.group.add(root)
    const actor: Actor = { root, mixer, walk, idle, path: [], leg: 0, pause: 1 + index * 0.7, walking: false, loop: false }
    this.actors.push(actor)
    return actor
  }

  tick(dt: number) {
    for (const actor of this.actors) {
      actor.mixer.update(dt)
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
        }
      })
    }
    this.actors = []
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
