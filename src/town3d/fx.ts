// Живые мелочи сцены: дым из труб, тёплые пятна света ночью, стяги, вращение лопастей.
// И общая постановка готового облика на сцену.
import * as THREE from 'three'
import { Builder, KIND, paint, sheet, tri } from './kit'
import type { BuiltLook } from './look'
import { worldMaterial } from './material'
import type { Stage } from './stage'

const PUFFS = 4
const MAX_SMOKE = 64
const MAX_GLOWS = 96

/** Дым: по четыре клуба на трубу, клуб поднимается, растёт и тает. */
class Smoke {
  readonly mesh: THREE.InstancedMesh
  private sources: THREE.Vector3[] = []
  private readonly dummy = new THREE.Object3D()
  /** Запустение второго уровня и выше: печи не топят. */
  on = true

  constructor() {
    const geometry = new THREE.IcosahedronGeometry(0.55, 1)
    const material = new THREE.MeshLambertMaterial({ color: '#d9d6cf', transparent: true, opacity: 0.72, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_SMOKE * PUFFS)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
  }

  setSources(sources: THREE.Vector3[]) {
    this.sources = sources.slice(0, MAX_SMOKE)
    this.mesh.count = this.sources.length * PUFFS
    this.tick(0)
  }

  tick(time: number) {
    const { dummy, mesh } = this
    this.sources.forEach((source, s) => {
      for (let i = 0; i < PUFFS; i++) {
        const phase = (time / 6 + i / PUFFS + s * 0.37) % 1
        const size = this.on ? Math.sin(phase * Math.PI) * (0.5 + phase * 0.9) : 0
        dummy.position.set(source.x + Math.sin(phase * 3 + s) * 0.35 + phase * 0.9, source.y + phase * 3.4, source.z + Math.cos(phase * 2 + s) * 0.2)
        dummy.scale.setScalar(Math.max(0.0001, size))
        dummy.updateMatrix()
        mesh.setMatrixAt(s * PUFFS + i, dummy.matrix)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  }
}

/** Тёплые пятна на земле под фонарями и у дверей: дешёвая замена десяткам источников света. */
class Glows {
  readonly mesh: THREE.InstancedMesh
  private readonly material: THREE.MeshBasicMaterial

  constructor() {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const g = canvas.getContext('2d')!
    const fill = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    fill.addColorStop(0, 'rgba(255,190,110,0.85)')
    fill.addColorStop(0.35, 'rgba(255,170,90,0.4)')
    fill.addColorStop(1, 'rgba(255,150,70,0)')
    g.fillStyle = fill
    g.fillRect(0, 0, size, size)
    this.material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    this.mesh = new THREE.InstancedMesh(geometry, this.material, MAX_GLOWS)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
  }

  setPoints(points: { at: THREE.Vector3; radius: number }[]) {
    const dummy = new THREE.Object3D()
    const list = points.slice(0, MAX_GLOWS)
    list.forEach((point, i) => {
      dummy.position.set(point.at.x, 0.09 + i * 0.0015, point.at.z)
      dummy.scale.set(point.radius * 2, 1, point.radius * 2)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    })
    this.mesh.count = list.length
    this.mesh.instanceMatrix.needsUpdate = true
  }

  setStrength(value: number) {
    this.material.opacity = value * 0.75
    this.mesh.visible = value > 0.01
  }
}

/** Фигура трека на стяге: круг, треугольник, квадрат, ромб, две полосы. Крестов в игре нет. */
function emblemShape(into: Builder, emblem: string, cx: number, cy: number, r: number) {
  const white = paint('#f4f1e6')
  const m = new THREE.Matrix4()
  const z = 0.012
  const both = (points: number[][]) => {
    for (const side of [z, -z]) {
      for (let i = 1; i < points.length - 1; i++) {
        const a = [...points[0], side]
        const b = [...points[i], side]
        const c = [...points[i + 1], side]
        tri(into, m, a, b, c, white)
        tri(into, m, a, c, b, white)
      }
    }
  }
  if (emblem === 'A') both(Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r, cy + Math.sin((i / 10) * Math.PI * 2) * r]))
  else if (emblem === 'B') both([[cx - r, cy - r * 0.8], [cx + r, cy - r * 0.8], [cx, cy + r]])
  else if (emblem === 'C1') both([[cx - r * 0.85, cy - r * 0.85], [cx + r * 0.85, cy - r * 0.85], [cx + r * 0.85, cy + r * 0.85], [cx - r * 0.85, cy + r * 0.85]])
  else if (emblem === 'C2') both([[cx - r, cy], [cx, cy - r], [cx + r, cy], [cx, cy + r]])
  else if (emblem === 'E') {
    const t = r * 0.3
    for (const y of [cy + r * 0.55, cy - r * 0.55]) both([[cx - r, y - t], [cx + r, y - t], [cx + r, y + t], [cx - r, y + t]])
  }
}

export interface Placed {
  group: THREE.Group
  box: THREE.Box3
  /** Высота верха над землёй: туда встаёт метка. */
  top: number
}

/** Всё общее для сцен города и каталога: материалы, дым, свет, расстановка обликов. */
export class Scenery {
  readonly material: THREE.MeshLambertMaterial
  readonly brokenMaterial: THREE.MeshLambertMaterial
  readonly doubleSided: THREE.MeshLambertMaterial
  readonly root = new THREE.Group()
  private readonly smoke = new Smoke()
  private readonly glows = new Glows()
  private smokeSources: THREE.Vector3[] = []
  private glowPoints: { at: THREE.Vector3; radius: number }[] = []
  private firePoints: THREE.Vector3[] = []
  private rotors: { mesh: THREE.Mesh; axis: THREE.Vector3; speed: number }[] = []
  private flags: { mesh: THREE.Mesh; seed: number }[] = []
  /** Мельницы стоят, дым не идёт: запустение второго уровня и выше. */
  idle = false

  constructor(readonly stage: Stage) {
    this.material = worldMaterial(stage.uniforms)
    this.brokenMaterial = worldMaterial(stage.uniforms, { broken: true })
    this.doubleSided = worldMaterial(stage.uniforms, { side: THREE.DoubleSide })
    this.root.add(this.smoke.mesh, this.glows.mesh)
    stage.scene.add(this.root)
    stage.tickers.push((dt, time) => this.tick(dt, time))
  }

  /** Ставит собранный облик на сцену. */
  place(built: BuiltLook, x: number, z: number, rot = 0, options: { broken?: boolean; emblem?: string; parent?: THREE.Object3D } = {}): Placed {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.rotation.y = THREE.MathUtils.degToRad(rot)
    if (options.broken) group.rotation.z = THREE.MathUtils.degToRad(3.5)
    const material = options.broken ? this.brokenMaterial : this.material
    const body = new THREE.Mesh(built.geometry, material)
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    for (const rotor of built.rotors) {
      const mesh = new THREE.Mesh(rotor.geometry, material)
      mesh.position.copy(rotor.pivot)
      mesh.castShadow = true
      group.add(mesh)
      if (!options.broken) this.rotors.push({ mesh, axis: rotor.axis.clone().normalize(), speed: rotor.speed })
    }

    for (const flag of built.flags) {
      const cloth = new Builder()
      const m = new THREE.Matrix4()
      sheet(cloth, m, [0, 0, 0], [flag.width, 0, 0], [flag.width, flag.height, 0], [0, flag.height, 0], paint(flag.color))
      if (options.emblem) emblemShape(cloth, options.emblem, flag.width * 0.5, flag.height * 0.5, flag.height * 0.28)
      const mesh = new THREE.Mesh(cloth.geometry(), this.doubleSided)
      mesh.position.copy(flag.at)
      mesh.castShadow = true
      group.add(mesh)
      this.flags.push({ mesh, seed: (x * 13.7 + z * 7.3 + flag.at.y) % 6.28 })
    }

    ;(options.parent ?? this.root).add(group)
    group.updateMatrixWorld(true)
    if (!options.broken) {
      for (const point of built.smoke) this.smokeSources.push(point.clone().applyMatrix4(group.matrixWorld))
      for (const point of built.lamps) this.glowPoints.push({ at: point.clone().applyMatrix4(group.matrixWorld), radius: 3.4 })
      for (const point of built.fires) {
        const at = point.clone().applyMatrix4(group.matrixWorld)
        this.firePoints.push(at)
        this.glowPoints.push({ at, radius: 6.5 })
      }
    }
    const box = built.box.clone().applyMatrix4(group.matrixWorld)
    return { group, box, top: box.max.y }
  }

  /** Вызывается после расстановки: раздаёт дым и свет. */
  commit() {
    this.smoke.setSources(this.smokeSources)
    this.glows.setPoints(this.glowPoints)
    this.refreshLight()
    this.stage.invalidate()
  }

  /** Пересчитать свет после смены времени суток или погоды. */
  refreshLight() {
    const glow = this.stage.uniforms.uGlow.value
    this.glows.setStrength(glow)
    this.smoke.on = !this.idle
    // Настоящих огней три: их получают костры, ближайшие к центру окна.
    const target = this.stage.target
    const nearest = [...this.firePoints].sort((a, b) => a.distanceToSquared(target) - b.distanceToSquared(target))
    this.stage.fires.forEach((light, i) => {
      const at = nearest[i]
      light.visible = !!at && !this.idle
      if (at) light.position.set(at.x, at.y + 1.2, at.z)
      light.userData.base = 6 + glow * 34
    })
  }

  private tick(_dt: number, time: number) {
    this.smoke.tick(time)
    if (!this.idle) {
      for (const rotor of this.rotors) rotor.mesh.setRotationFromAxisAngle(rotor.axis, (time * Math.PI * 2 * rotor.speed) / 18)
    }
    for (const flag of this.flags) flag.mesh.rotation.y = Math.sin(time * 0.8 + flag.seed) * 0.3 + Math.sin(time * 2.1 + flag.seed * 2) * 0.06
    for (const light of this.stage.fires) {
      if (light.visible) light.intensity = (light.userData.base ?? 10) * (0.86 + 0.14 * Math.sin(time * 8 + light.position.x))
    }
  }

  /** Убирает всё расставленное: сцена пересобирается при смене сезона или состояния города. */
  clear() {
    for (const child of [...this.root.children]) {
      if (child === this.smoke.mesh || child === this.glows.mesh) continue
      this.root.remove(child)
      child.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry && mesh.userData.own) mesh.geometry.dispose()
      })
    }
    this.smokeSources = []
    this.glowPoints = []
    this.firePoints = []
    this.rotors = []
    this.flags = []
    this.smoke.setSources([])
    this.glows.setPoints([])
  }
}

export { KIND }
