// Земля города: рельеф с руслом реки и нарисованная кодом карта — трава, улицы, площадь, берега.
import * as THREE from 'three'
import type { Season } from '../world/sky'
import { KIND } from './kit'
import { worldMaterial, type WorldUniforms } from './material'
import { BRIDGE_X, LAND, PITCH, PLAZA, PLOT, QUARTER, RIVER, groundHeight, quarterSlot, riverCenter, seeded, type Plot } from './plan'

const EARTH: Record<Season, { grass: string; light: string; dark: string; dirt: string; pad: string; sand: string; water: string; stone: string }> = {
  spring: { grass: '#a7bd7a', light: '#b6c98a', dark: '#93ab6b', dirt: '#c9b88c', pad: '#bcb184', sand: '#d6c79c', water: '#77afbf', stone: '#c5bfae' },
  summer: { grass: '#9db074', light: '#abbd80', dark: '#8a9f66', dirt: '#c7b587', pad: '#b6aa7c', sand: '#d3c296', water: '#6fa7b8', stone: '#c2bba9' },
  autumn: { grass: '#b0a670', light: '#bdb27b', dark: '#9c9361', dirt: '#c4b083', pad: '#b5a577', sand: '#cfbd90', water: '#6f9aa6', stone: '#bfb7a5' },
  winter: { grass: '#b9bea6', light: '#c5c9b3', dark: '#a8ad97', dirt: '#bfb49c', pad: '#b3aa94', sand: '#c9c0aa', water: '#8eaab3', stone: '#c3beb2' },
}

const SIZE = 2048

export interface GroundInput {
  season: Season
  tier: number
  open: Plot[]
  /** Под какими участками рисовать площадки. На стоянке — только под уже поставленным жилищем. */
  pads: Plot[]
  /** Сколько мест слободы занято. Ноль, пока слобода не открыта. */
  specials: number
  /** Мост и слобода уже есть: тогда к ним ведёт тропа. */
  quarter: boolean
  /** Запустение 0–3: улицы зарастают. */
  neglect: number
}

function paintMap(input: GroundInput): HTMLCanvasElement {
  const colors = EARTH[input.season]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const g = canvas.getContext('2d')!
  const sx = SIZE / (LAND.maxX - LAND.minX)
  const sz = SIZE / (LAND.maxZ - LAND.minZ)
  const px = (x: number) => (x - LAND.minX) * sx
  const pz = (z: number) => (z - LAND.minZ) * sz
  const random = seeded(77)

  g.fillStyle = colors.grass
  g.fillRect(0, 0, SIZE, SIZE)
  // Пятна травы: без них земля выглядит залитой одним цветом.
  g.filter = 'blur(6px)'
  for (let i = 0; i < 2600; i++) {
    g.globalAlpha = 0.05 + random() * 0.08
    g.fillStyle = random() < 0.5 ? colors.light : colors.dark
    g.beginPath()
    g.ellipse(random() * SIZE, random() * SIZE, 14 + random() * 46, 10 + random() * 30, random() * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.filter = 'none'
  g.globalAlpha = 1

  const soft = (color: string, blur: number) => {
    g.fillStyle = color
    g.strokeStyle = color
    g.shadowColor = color
    g.shadowBlur = blur
  }
  const rect = (x: number, z: number, w: number, d: number, radius = 1.2) => {
    g.beginPath()
    g.roundRect(px(x - w / 2), pz(z - d / 2), w * sx, d * sz, radius * sx)
    g.fill()
  }
  const line = (points: [number, number][], width: number) => {
    g.lineWidth = width * sx
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    points.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))))
    g.stroke()
  }

  // Берега и дно реки.
  const course: [number, number][] = []
  for (let x = LAND.minX; x <= LAND.maxX; x += 4) course.push([x, riverCenter(x)])
  soft(colors.sand, 10)
  line(course, (RIVER.half + 2.4) * 2)
  soft('#8f8468', 6)
  line(course, (RIVER.half + 0.3) * 2)

  // Улицы: вокруг каждого открытого участка, значит сеть растёт вместе с городом.
  const paved = input.tier >= 3
  const street = paved ? colors.stone : colors.dirt
  soft(street, 8)
  g.globalAlpha = input.tier === 0 ? 0 : 0.92
  for (const plot of input.open) {
    if (plot.water) {
      line([[plot.x, plot.z + 2], [plot.x, plot.z - PITCH / 2 - 1.5], [plot.x > 0 ? PLAZA.w / 2 + 6 : -PLAZA.w / 2 - 6, PLAZA.d / 2 + 1.5]], 2.4)
      continue
    }
    const h = PITCH / 2
    line([[plot.x - h, plot.z + h], [plot.x + h, plot.z + h]], 2.6)
    line([[plot.x - h, plot.z - h], [plot.x + h, plot.z - h]], 2.2)
    line([[plot.x - h, plot.z - h], [plot.x - h, plot.z + h]], 2.2)
    line([[plot.x + h, plot.z - h], [plot.x + h, plot.z + h]], 2.2)
  }
  g.globalAlpha = 1

  // Площадь: вытоптанная поляна, потом утоптанная земля, с «Деревни» — камень.
  soft(input.tier >= 3 ? colors.stone : colors.dirt, 14)
  if (input.tier === 0) {
    g.globalAlpha = 0.75
    g.beginPath()
    g.ellipse(px(0.5), pz(0.5), 9 * sx, 7.5 * sz, 0, 0, Math.PI * 2)
    g.fill()
  } else {
    g.globalAlpha = 0.95
    rect(PLAZA.x, PLAZA.z, PLAZA.w + 3, PLAZA.d + 3, 3)
  }
  g.globalAlpha = 1
  if (input.tier >= 3) {
    // Швы мощения.
    g.shadowBlur = 0
    g.strokeStyle = 'rgba(90, 84, 70, 0.22)'
    g.lineWidth = 1
    for (let x = -PLAZA.w / 2; x <= PLAZA.w / 2; x += 1.6) {
      g.beginPath()
      g.moveTo(px(x), pz(-PLAZA.d / 2))
      g.lineTo(px(x), pz(PLAZA.d / 2))
      g.stroke()
    }
    for (let z = -PLAZA.d / 2; z <= PLAZA.d / 2; z += 1.6) {
      g.beginPath()
      g.moveTo(px(-PLAZA.w / 2), pz(z))
      g.lineTo(px(PLAZA.w / 2), pz(z))
      g.stroke()
    }
  }

  // Тропа к мосту и аллея слободы.
  soft(colors.dirt, 8)
  g.globalAlpha = input.quarter ? 0.9 : 0
  const rows = Math.max(1, Math.ceil(input.specials / QUARTER.columns))
  line([[BRIDGE_X, PLAZA.d / 2], [BRIDGE_X, QUARTER.z + (rows - 1) * QUARTER.pitch + 5]], 2.8)
  for (let i = 0; i < input.specials; i++) {
    const slot = quarterSlot(i)
    line([[BRIDGE_X, slot.z + QUARTER.plot / 2 + 0.6], [slot.x, slot.z + QUARTER.plot / 2 + 0.6]], 1.8)
  }
  g.globalAlpha = 1

  // Участки: земля под постройками чуть светлее травы.
  soft(colors.pad, 6)
  g.globalAlpha = 0.55
  for (const plot of input.pads) if (!plot.water) rect(plot.x, plot.z, PLOT, PLOT, 1.4)
  for (let i = 0; i < input.specials; i++) {
    const slot = quarterSlot(i)
    rect(slot.x, slot.z, QUARTER.plot, QUARTER.plot, 1.2)
  }
  g.globalAlpha = 1

  // Запустение: трава выходит на улицы.
  if (input.neglect > 0) {
    g.shadowBlur = 0
    const tufts = [0, 500, 1400, 2600][input.neglect]
    for (let i = 0; i < tufts; i++) {
      const x = (random() - 0.5) * 120
      const z = (random() - 0.5) * 100 - 6
      g.globalAlpha = 0.5
      g.fillStyle = random() < 0.5 ? colors.dark : colors.grass
      g.beginPath()
      g.ellipse(px(x), pz(z), 1 + random() * 3.2, 1 + random() * 2.4, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
  return canvas
}

export interface Ground {
  land: THREE.Mesh
  water: THREE.Mesh
  dispose: () => void
}

export function makeGround(uniforms: WorldUniforms, waterMaterial: THREE.Material, input: GroundInput): Ground {
  const texture = new THREE.CanvasTexture(paintMap(input))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const width = LAND.maxX - LAND.minX
  const depth = LAND.maxZ - LAND.minZ
  const geometry = new THREE.PlaneGeometry(width, depth, 120, 120).rotateX(-Math.PI / 2)
  geometry.translate((LAND.minX + LAND.maxX) / 2, 0, (LAND.minZ + LAND.maxZ) / 2)
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) position.setY(i, groundHeight(position.getX(i), position.getZ(i)))
  geometry.computeVertexNormals()
  const land = new THREE.Mesh(geometry, worldMaterial(uniforms, { map: texture }))
  land.receiveShadow = true

  // Вода: лента вдоль русла чуть ниже берега.
  const colors = EARTH[input.season]
  const tint = new THREE.Color(colors.water)
  const positions: number[] = []
  const normals: number[] = []
  const color: number[] = []
  const kinds: number[] = []
  const half = RIVER.half + 1.2
  const level = -0.72
  for (let x = LAND.minX; x < LAND.maxX; x += 4) {
    const z0 = riverCenter(x)
    const z1 = riverCenter(x + 4)
    const quad = [
      [x, level, z0 + half],
      [x + 4, level, z1 + half],
      [x + 4, level, z1 - half],
      [x, level, z0 + half],
      [x + 4, level, z1 - half],
      [x, level, z0 - half],
    ]
    for (const [vx, vy, vz] of quad) {
      positions.push(vx, vy, vz)
      normals.push(0, 1, 0)
      color.push(tint.r, tint.g, tint.b)
      kinds.push(KIND.water)
    }
  }
  const waterGeometry = new THREE.BufferGeometry()
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
  waterGeometry.setAttribute('kind', new THREE.Float32BufferAttribute(kinds, 1))
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.receiveShadow = true

  return {
    land,
    water,
    dispose: () => {
      texture.dispose()
      geometry.dispose()
      waterGeometry.dispose()
      ;(land.material as THREE.Material).dispose()
    },
  }
}
