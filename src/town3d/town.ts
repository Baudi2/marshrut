// Город на сцене: земля, лес, центр, постройки на участках, слобода особых построек.
// Состояние приходит готовым (TownView): здесь только расстановка.
import * as THREE from 'three'
import { TIERS, buildingType } from '../game/town'
import type { Season } from '../world/sky'
import type { Scenery } from './fx'
import { makeGround, type Ground } from './ground'
import { buildLook, type LookContext, type LookFn } from './look'
import { CENTER, DECOR, constructionLook, lantern, levelLook, levelName, specialLook, tent, upgradeLook } from './looks'
import { KIND } from './kit'
import { worldMaterial } from './material'
import { People, type PeopleInput } from './people'
import {
  BRIDGE_X,
  CAMP_FIRE_AT,
  CAMP_TENT_AT,
  CENTER_AT,
  FIRE_AT,
  animalSpots,
  PLAZA,
  RIVER,
  fireSpot,
  forest,
  openPlots,
  plotOf,
  quarterOpen,
  quarterSlot,
  riverCenter,
} from './plan'

export const TRACK_ACCENT: Record<string, string> = { A: '#2f6db5', B: '#b65a2c', C1: '#2b7d5c', C2: '#9a7012', E: '#b0507a' }
export const NEUTRAL_ACCENT = '#8c8672'

export interface TownBuildingView {
  id: string
  type: string
  level: number
  pending: { level: number; readyAt: number } | null
}

export interface TownSpecialView {
  id: string
  kind: string
  track: string | null
  /** 0 — участок, 1 — стройка, 2 — построена, 3 — с пристройкой. */
  stage: number
  title: string
}

export interface TownView {
  tier: number
  tierPending: { n: number; readyAt: number } | null
  buildings: TownBuildingView[]
  specials: TownSpecialView[]
  population: number
  season: Season
  neglect: number
  /** Купленные украшения: котелок, скамьи, указатель, фонари, флагшток. */
  decor: string[]
  /** Какие из них сломаны после долгого перерыва. */
  brokenDecor: string[]
  /** Надетая экипировка путника. */
  gear: string[]
}

export interface Mark {
  id: string
  kind: 'center' | 'building' | 'special'
  title: string
  /** Куда ставить метку: над крышей. */
  at: THREE.Vector3
  /** Где стоит постройка: туда наводится камера. */
  x: number
  z: number
  readyAt?: number
}

const TREE_MODELS = ['r/resource_tree_1', 'r/resource_tree_2', 'r/resource_tree_1', 'r/resource_pine_tree']
const TREE_SCALE = [1.7, 1.8, 1.5, 2.6]
const TILE = 48

const bridgeLook: LookFn = (b) => {
  const span = RIVER.half * 2 + 5
  const wood = '#876a44'
  const light = '#a38658'
  b.box(0, 0.08, 0, 3.2, 0.22, span, light)
  for (let z = -span / 2 + 0.4; z < span / 2; z += 0.7) b.box(0, 0.3, z, 3.3, 0.05, 0.5, wood)
  for (const side of [-1.6, 1.6]) {
    for (let z = -span / 2 + 0.5; z <= span / 2 - 0.4; z += 2.4) b.beam([side, -1.6, z], [side, 1.15, z], 0.2, wood)
    b.beam([side, 1.15, -span / 2 + 0.5], [side, 1.15, span / 2 - 0.5], 0.12, light)
    b.beam([side, 0.7, -span / 2 + 0.5], [side, 0.7, span / 2 - 0.5], 0.08, light)
  }
  lantern(b, -2.1, -span / 2 - 0.6, 2.6)
  lantern(b, 2.1, span / 2 + 0.6, 2.6)
}

/** Стоянка путника: палатка, скатка и ящик. */
const campLook: LookFn = (b) => {
  b.group([0, 0, 0], 24, () => tent(b, 3.6, 4.2, 2.5))
  b.model('r/crate', { at: [3, 0, 1.4], s: 1.3, rot: 15 })
  b.model('v/bag', { at: [2.6, 0, 2.6], s: 2.4, rot: 60 })
  b.model('r/logs', { at: [-3.4, 0, 2.6], s: 0.26, rot: 80 })
}

/** Костровище на площади, когда центр уже стал домом. */
const firepitLook: LookFn = (b) => {
  b.model('v/bonfire_lit', { center: true, s: 2.3 })
  b.fireAt(0, 0.5, 0)
}

/**
 * Фонтан на площади: круглая чаша. Со ступенью растёт — выше столб, вторая чаша, зелень вокруг.
 * Модель из набора не подходит: у неё бассейн крестом, а крестов в игре нет.
 */
const fountainLook = (tier: number): LookFn => (b) => {
  const stone = '#b2b3a8'
  const dark = '#86877f'
  const water = '#6fa7b8'
  b.cylinder(0, 0, 0, 4.2, 4.2, 0.18, 16, dark)
  b.cylinder(0, 0.18, 0, 3.6, 3.5, 0.62, 16, stone)
  b.cylinder(0, 0.72, 0, 3.15, 3.15, 0.1, 16, water, KIND.water)
  b.cylinder(0, 0.18, 0, 0.62, 0.5, tier >= 4 ? 2.3 : 1.5, 8, stone)
  if (tier >= 4) {
    b.cylinder(0, 2.4, 0, 0.6, 1.5, 0.3, 12, stone)
    b.cylinder(0, 2.64, 0, 1.3, 1.3, 0.08, 12, water, KIND.water)
    b.cylinder(0, 2.7, 0, 0.3, 0.22, 0.9, 8, stone)
    b.cylinder(0, 3.6, 0, 0.42, 0.05, 0.4, 8, dark)
  } else {
    b.cylinder(0, 1.68, 0, 0.5, 0.9, 0.22, 10, stone)
    b.cylinder(0, 1.9, 0, 0.3, 0.05, 0.4, 8, dark)
  }
  if (tier >= 5) {
    // Зелень в каменных вазонах по кругу.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.52
      b.cylinder(Math.sin(a) * 5.4, 0, Math.cos(a) * 5.4, 0.55, 0.65, 0.6, 8, stone)
      b.cylinder(Math.sin(a) * 5.4, 0.6, Math.cos(a) * 5.4, 0.62, 0.2, 0.75, 7, '#5f8f4c')
    }
  }
  lantern(b, -5.6, 5.2, 3)
  lantern(b, 5.2, 5.2, 3)
}

/** Сквер: беседка, скамьи, клумба. */
const parkLook: LookFn = (b) => {
  b.model('v/gazebo', { center: true, s: 1.5 })
  b.model('v/bench_1', { at: [-3.4, 0, 2.6], rot: 135 })
  b.model('v/bench_1', { at: [3.4, 0, 2.6], rot: -135 })
  b.model('r/resource_tree_1', { center: true, at: [-3.2, 0, -3], s: 1.2 })
  b.model('r/resource_tree_2', { center: true, at: [3.4, 0, -2.6], s: 1.1 })
  lantern(b, 0, 3.8, 2.6)
}

export class TownScene {
  marks: Mark[] = []
  private ground: Ground | null = null
  private readonly waterMaterial: THREE.MeshLambertMaterial
  private readonly ring: THREE.Mesh
  private version = 0
  private readonly people: People

  constructor(private readonly scenery: Scenery) {
    this.waterMaterial = worldMaterial(scenery.stage.uniforms)
    this.waterMaterial.transparent = true
    this.waterMaterial.opacity = 0.86
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fbfaf6', transparent: true, opacity: 0.85, depthWrite: false }),
    )
    this.ring.visible = false
    this.ring.renderOrder = 3
    scenery.stage.scene.add(this.ring)
    this.people = new People(() => scenery.stage.uniforms.uGlow.value)
    scenery.stage.tickers.push((dt) => this.people.tick(dt))
  }

  /** Светлое кольцо на земле под выбранной постройкой. */
  select(id: string | null) {
    const mark = id ? this.marks.find((m) => m.id === id) : null
    this.ring.visible = !!mark
    if (mark) {
      const radius = mark.kind === 'center' ? 9 : 6.6
      this.ring.position.set(mark.x, 0.12, mark.z)
      this.ring.scale.setScalar(radius)
    }
    this.scenery.stage.invalidate()
  }

  async build(view: TownView): Promise<void> {
    const version = ++this.version
    const { scenery } = this
    // Фонари покупаются в лавке; сломанные стоят, но не горят.
    const lamps = !view.decor.includes('lamps') ? false : view.brokenDecor.includes('lamps') ? 'dark' : true
    const ctx: LookContext = { season: view.season, lamps }
    // На стоянке нет ни моста, ни слободы: постройки-файлы появятся на карте вместе с лагерем.
    const quarter = quarterOpen(view.tier)
    const specials = quarter ? view.specials : []
    const open = openPlots(view.tier)
    const marks: Mark[] = []
    const pickables: { id: string; box: THREE.Box3 }[] = []
    const jobs: Promise<unknown>[] = []
    const queue: (() => void)[] = []
    /** Собрать облик сейчас, поставить потом: сцена меняется разом, без мигания. */
    const put = (
      look: LookFn,
      x: number,
      z: number,
      rot: number,
      after?: (top: number, box: THREE.Box3) => void,
      context: LookContext = ctx,
      variant = 0,
      emblem?: string,
      broken = false,
    ) => {
      jobs.push(
        buildLook(look, context, variant).then((built) => {
          queue.push(() => {
            const placed = scenery.place(built, x, z, rot, { emblem, broken })
            after?.(placed.top, placed.box)
          })
        }),
      )
    }

    // Центр.
    const centerName = `${TIERS[view.tier].name}: ${CENTER[view.tier].name.toLowerCase()}`
    const centerSpot = view.tier === 0 ? CAMP_FIRE_AT : view.tier === 1 ? { x: PLAZA.x, z: PLAZA.z } : CENTER_AT
    put(CENTER[view.tier].look, centerSpot.x, centerSpot.z, 0, (top, box) => {
      marks.push({ id: 'center', kind: 'center', title: centerName, at: new THREE.Vector3(centerSpot.x, top + 1, centerSpot.z), x: centerSpot.x, z: centerSpot.z, readyAt: view.tierPending?.readyAt })
      pickables.push({ id: 'center', box: box.clone().expandByScalar(0.6) })
    })
    if (view.tier === 0) put(campLook, CAMP_TENT_AT.x, CAMP_TENT_AT.z, 0)
    // С «Хутора» общий костёр — отдельное костровище: сначала перед домом собраний, потом в углу площади.
    const fire = fireSpot(view.tier)
    if (view.tier >= 2) put(firepitLook, fire.x, fire.z, 0)

    // Купленные украшения. Сломанное стоит покосившимся и серым, пока не починят.
    const decor = (id: string, x: number, z: number) => {
      if (view.decor.includes(id)) put(DECOR[id](view.tier), x, z, 0, undefined, ctx, 0, undefined, view.brokenDecor.includes(id))
    }
    decor('pot', fire.x, fire.z)
    decor('bench', fire.x, fire.z)
    if (view.tier === 0) decor('signpost', fire.x + 6.5, fire.z + 3.5)
    else decor('signpost', BRIDGE_X + 2.8, PLAZA.d / 2 + 2.6)
    if (view.tier >= 1) decor('flagpole', PLAZA.w / 2 - 1.4, PLAZA.d / 2 - 1.4)
    if (view.tier >= 3) put(fountainLook(view.tier), FIRE_AT.x, FIRE_AT.z + 1, 0)
    if (view.tierPending) put(constructionLook, view.tier <= 1 ? CENTER_AT.x + 0.5 : CENTER_AT.x + 9.5, view.tier <= 1 ? CENTER_AT.z - 3.4 : CENTER_AT.z - 1, 0)

    // Стандартные постройки.
    for (const building of view.buildings) {
      const plot = plotOf(building.id)
      if (!plot) continue
      const type = buildingType(building.type)
      const z = plot.z
      const title = building.level > 0 ? `${levelName(building.type, building.level)} · ур. ${building.level}` : `${type?.name ?? ''}: строится`
      const look = building.level > 0 ? levelLook(building.type, building.level, plot.n - 1) : constructionLook
      put(
        look,
        plot.x,
        z,
        plot.rot,
        (top, box) => {
          marks.push({ id: building.id, kind: 'building', title, at: new THREE.Vector3(plot.x, top + 0.8, z), x: plot.x, z, readyAt: building.pending?.readyAt })
          pickables.push({ id: building.id, box: box.clone().expandByScalar(0.4) })
          if (building.pending && building.level > 0) {
            const size = box.getSize(new THREE.Vector3())
            const middle = box.getCenter(new THREE.Vector3())
            put(upgradeLook(Math.min(size.x, 10), Math.min(size.z, 10), size.y), middle.x, middle.z, 0)
          }
        },
        ctx,
        plot.n - 1,
      )
    }

    // Скверы на свободных участках дальнего ряда.
    for (const plot of open) if (plot.type === 'park') put(parkLook, plot.x, plot.z, 0)

    // Слобода особых построек.
    specials.forEach((special, i) => {
      const slot = quarterSlot(i)
      const accent = special.track ? (TRACK_ACCENT[special.track] ?? NEUTRAL_ACCENT) : NEUTRAL_ACCENT
      put(
        specialLook(special.kind, special.stage),
        slot.x,
        slot.z,
        0,
        (top, box) => {
          marks.push({ id: special.id, kind: 'special', title: special.title, at: new THREE.Vector3(slot.x, top + 0.8, slot.z), x: slot.x, z: slot.z })
          pickables.push({ id: special.id, box: box.clone().expandByScalar(0.5) })
        },
        { ...ctx, accent, emblem: special.track ?? undefined },
        i,
        special.track ?? undefined,
      )
    })

    if (quarter) put(bridgeLook, BRIDGE_X, riverCenter(BRIDGE_X), 0)

    // Горы на севере: край карты.
    const peaks: [string, number, number, number, number][] = [
      ['r/mountain_group_1', -92, -138, 3.1, 20],
      ['r/mountain_group_2', -20, -146, 3.4, -30],
      ['r/mountain_large_single', 42, -138, 4.2, 10],
      ['r/mountain_group_1', 104, -144, 2.8, 160],
      ['r/mountain_single', 8, -122, 2.6, 60],
    ]
    for (const [key, x, z, s, rot] of peaks) put((b) => b.model(key, { center: true, s, rot }), x, z, 0)

    // Жители ходят между готовыми постройками.
    const crowd: PeopleInput = {
      tier: view.tier,
      population: view.population,
      doors: view.buildings.filter((b) => b.level > 0).flatMap((b) => plotOf(b.id) ?? []),
      quiet: view.neglect >= 2,
      gear: view.gear,
      animals: animalSpots(view.buildings),
    }
    jobs.push(People.preload(crowd))

    // Лес: по куску карты на каждую породу, чтобы невидимые куски не рисовались.
    const trees = forest(view.tier, specials.length)
    const treeLooks = TREE_MODELS.map((key, kind) => buildLook((b) => b.model(key, { center: true }), ctx, kind))
    jobs.push(...treeLooks)

    await Promise.all(jobs)
    // Пока модели грузились, могли попросить другую сборку: эта уже не нужна.
    if (version !== this.version) return

    this.people.dispose()
    scenery.clear()
    this.ground?.dispose()
    this.ground = makeGround(scenery.stage.uniforms, this.waterMaterial, {
      season: view.season,
      tier: view.tier,
      open,
      pads: view.tier === 0 ? view.buildings.flatMap((b) => plotOf(b.id) ?? []) : open,
      specials: specials.length,
      quarter,
      neglect: view.neglect,
    })
    scenery.root.add(this.ground.land, this.ground.water)

    let done = 0
    const drain = () => {
      while (done < queue.length) queue[done++]()
    }
    drain()
    // Леса вокруг улучшаемых построек встают в очередь уже после первой расстановки.
    await Promise.all(jobs)
    if (version !== this.version) return
    drain()
    const built = await Promise.all(treeLooks)
    const dummy = new THREE.Object3D()
    const groups = new Map<string, typeof trees>()
    for (const tree of trees) {
      const key = `${tree.kind}:${Math.floor(tree.x / TILE)}:${Math.floor(tree.z / TILE)}`
      const list = groups.get(key) ?? []
      list.push(tree)
      groups.set(key, list)
    }
    for (const [key, list] of groups) {
      const kind = Number(key.split(':')[0])
      const mesh = new THREE.InstancedMesh(built[kind].geometry, scenery.material, list.length)
      list.forEach((tree, i) => {
        dummy.position.set(tree.x, 0, tree.z)
        dummy.rotation.y = THREE.MathUtils.degToRad(tree.turn)
        dummy.scale.setScalar(tree.scale * TREE_SCALE[kind])
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      scenery.root.add(mesh)
    }

    await this.people.populate(scenery.root, crowd)
    if (version !== this.version) return

    scenery.idle = view.neglect >= 2
    scenery.commit()
    this.marks = marks
    scenery.stage.pickables = pickables
    scenery.stage.invalidate()
  }

  dispose() {
    this.version++
    this.people.dispose()
    this.ground?.dispose()
    this.scenery.stage.scene.remove(this.ring)
  }
}
