// Сцена: рисовальщик, камера сверху под наклоном, прокрутка и масштаб, свет по времени суток,
// осадки. Что именно стоит на сцене, решают town.ts (город) и board.ts (каталог построек).
import * as THREE from 'three'
import type { Phase, Sky, WeatherKind } from '../world/sky'
import { makeUniforms, type WorldUniforms } from './material'

/** Наклон камеры от горизонта и поворот вправо от оси «юг — север», градусы. */
const PITCH = 55
const YAW = 20
const CAMERA_DISTANCE = 420

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface StageOptions {
  bounds: Bounds
  center: [number, number]
  /** Ширина окна в метрах: начальная и пределы масштаба. */
  span: number
  minSpan: number
  maxSpan: number
  onTap?: (id: string | null) => void
  onFrame?: () => void
}

interface LightSet {
  azimuth: number
  height: number
  sun: string
  power: number
  sky: string
  ground: string
  ambient: number
  glow: number
  back: string
}

// Числа — из design/DESIGN.md, раздел 8; сила света пересчитана под нынешний three.js.
const LIGHT: Record<Phase, LightSet> = {
  dawn: { azimuth: 110, height: 14, sun: '#ffc79a', power: 2.3, sky: '#e7c7bd', ground: '#6a6050', ambient: 1.55, glow: 0.55, back: '#8b8f78' },
  day: { azimuth: 205, height: 52, sun: '#fff3e0', power: 2.6, sky: '#dde8ee', ground: '#8b8a6f', ambient: 1.6, glow: 0, back: '#8f9c74' },
  dusk: { azimuth: 250, height: 12, sun: '#ff9b66', power: 2.0, sky: '#d6a28c', ground: '#4f463e', ambient: 1.35, glow: 0.8, back: '#7d7460' },
  night: { azimuth: 160, height: 46, sun: '#9fb4dc', power: 0.75, sky: '#4a5c8c', ground: '#1c2233', ambient: 1.25, glow: 1, back: '#232a3a' },
}

const WEATHER: Record<WeatherKind, { sun: number; ambient: number; grey: number; fog: number; wet: number }> = {
  clear: { sun: 1, ambient: 1, grey: 0, fog: 0, wet: 0 },
  cloudy: { sun: 0.72, ambient: 1.06, grey: 0.2, fog: 0, wet: 0 },
  overcast: { sun: 0.3, ambient: 1.15, grey: 0.6, fog: 0, wet: 0 },
  fog: { sun: 0.5, ambient: 1.1, grey: 0.5, fog: 1, wet: 0.2 },
  drizzle: { sun: 0.45, ambient: 1.08, grey: 0.6, fog: 0.25, wet: 0.6 },
  rain: { sun: 0.35, ambient: 1, grey: 0.7, fog: 0.15, wet: 1 },
  snow: { sun: 0.45, ambient: 1.1, grey: 0.6, fog: 0.3, wet: 0 },
  storm: { sun: 0.15, ambient: 0.85, grey: 0.9, fog: 0.2, wet: 1 },
}

/** Сколько снега лежит: идёт снег — всё бело; зимой и в мороз он остаётся. */
export function snowCover(sky: Sky): number {
  if (sky.kind === 'snow') return 1
  if (sky.temperature !== null) return sky.temperature <= -1 ? 0.85 : sky.season === 'winter' && sky.temperature <= 2 ? 0.5 : 0
  return sky.season === 'winter' ? 0.85 : 0
}

const DROPS = 800
const FLAKES = 700

export class Stage {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200)
  readonly renderer: THREE.WebGLRenderer
  readonly uniforms: WorldUniforms = makeUniforms()
  readonly sun = new THREE.DirectionalLight('#ffffff', 2.5)
  readonly hemi = new THREE.HemisphereLight('#dde8ee', '#8b8a6f', 1.6)
  readonly target = new THREE.Vector3()
  /** Огни костров и очагов: настоящих источников немного, их делят между собой ближайшие к центру экрана. */
  readonly fires: THREE.PointLight[] = []
  span: number
  /** Что можно выбрать нажатием: габариты построек. */
  pickables: { id: string; box: THREE.Box3 }[] = []
  /** Что двигается каждый кадр: dt и время в секундах. */
  tickers: ((dt: number, time: number) => void)[] = []
  motion = true

  private readonly canvas: HTMLCanvasElement
  private readonly options: StageOptions
  private readonly direction = new THREE.Vector3()
  private width = 1
  private height = 1
  private dirty = true
  private frame = 0
  private last = 0
  private time = 0
  private visible = true
  private onScreen = true
  private disposed = false
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private press: { x: number; y: number; at: number; moved: boolean } | null = null
  private pinch = 0
  private readonly rain: THREE.LineSegments
  private readonly snow: THREE.Points
  private precipitation: 'none' | 'rain' | 'snow' = 'none'
  private heavy = 1
  private flash = 0
  private storm = false
  private readonly observers: (() => void)[] = []
  private sunDirection = new THREE.Vector3(0, 1, 0)
  private phase: Phase = 'day'

  constructor(container: HTMLElement, options: StageOptions) {
    this.options = options
    this.span = options.span
    this.target.set(options.center[0], 0, options.center[1])

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.canvas = this.renderer.domElement
    this.canvas.className = 'town3d-canvas'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('role', 'img')
    container.appendChild(this.canvas)

    const pitch = THREE.MathUtils.degToRad(PITCH)
    const yaw = THREE.MathUtils.degToRad(YAW)
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.05
    this.scene.add(this.sun, this.sun.target, this.hemi)
    for (let i = 0; i < 3; i++) {
      const fire = new THREE.PointLight('#ffa64d', 0, 26, 1.6)
      fire.visible = false
      this.fires.push(fire)
      this.scene.add(fire)
    }

    this.rain = this.makeRain()
    this.snow = this.makeSnow()
    this.scene.add(this.rain, this.snow)

    this.bind(container)
    this.resize()
    this.loop = this.loop.bind(this)
    this.frame = requestAnimationFrame(this.loop)
  }

  // ——— Камера ———

  get viewDepth() {
    return (this.span * this.height) / this.width / Math.sin(THREE.MathUtils.degToRad(PITCH))
  }

  private place() {
    const { bounds, minSpan, maxSpan } = this.options
    this.span = THREE.MathUtils.clamp(this.span, minSpan, maxSpan)
    this.target.x = THREE.MathUtils.clamp(this.target.x, bounds.minX, bounds.maxX)
    this.target.z = THREE.MathUtils.clamp(this.target.z, bounds.minZ, bounds.maxZ)
    const halfW = this.span / 2
    const halfH = (this.span * this.height) / this.width / 2
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.position.copy(this.target).addScaledVector(this.direction, CAMERA_DISTANCE)
    this.camera.lookAt(this.target)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()

    // Тень следует за окном: её область чуть больше видимого участка земли.
    const reach = Math.max(this.span, this.viewDepth) * 0.62 + 14
    const shadow = this.sun.shadow.camera
    shadow.left = -reach
    shadow.right = reach
    shadow.top = reach
    shadow.bottom = -reach
    shadow.near = 1
    shadow.far = 700
    shadow.updateProjectionMatrix()
    this.sun.target.position.copy(this.target)
    this.sun.position.copy(this.target).addScaledVector(this.sunDirection, 320)
    this.sun.target.updateMatrixWorld()
    this.rain.position.set(this.target.x, 0, this.target.z)
    this.snow.position.set(this.target.x, 0, this.target.z)
    this.dirty = true
  }

  /** Сдвиг карты на пиксели экрана. */
  panBy(dx: number, dy: number) {
    const perPixel = this.span / this.width
    const yaw = THREE.MathUtils.degToRad(YAW)
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    this.target.addScaledVector(right, -dx * perPixel)
    this.target.addScaledVector(forward, (dy * perPixel) / Math.sin(THREE.MathUtils.degToRad(PITCH)))
    this.place()
  }

  zoomBy(factor: number) {
    this.span *= factor
    this.place()
  }

  lookAt(x: number, z: number, span?: number) {
    this.target.set(x, 0, z)
    if (span) this.span = span
    this.place()
  }

  /** Точка мира в пикселях окна сцены. */
  project(point: THREE.Vector3, out: { x: number; y: number }) {
    const v = point.clone().project(this.camera)
    out.x = ((v.x + 1) / 2) * this.width
    out.y = ((1 - v.y) / 2) * this.height
    return out
  }

  get size() {
    return { width: this.width, height: this.height }
  }

  resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    this.width = Math.max(1, parent.clientWidth)
    this.height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    this.place()
  }

  // ——— Свет, время суток, погода ———

  setSky(sky: Sky, neglect: number) {
    const light = LIGHT[sky.phase]
    const weather = WEATHER[sky.kind]
    this.phase = sky.phase
    const azimuth = THREE.MathUtils.degToRad(light.azimuth)
    const height = THREE.MathUtils.degToRad(light.height)
    this.sunDirection.set(Math.sin(azimuth) * Math.cos(height), Math.sin(height), -Math.cos(azimuth) * Math.cos(height))
    this.sun.color.set(light.sun)
    this.sun.intensity = light.power * weather.sun
    const grey = new THREE.Color(sky.phase === 'night' ? '#39415a' : '#b9bfc4')
    this.hemi.color.set(light.sky).lerp(grey, weather.grey * 0.7)
    this.hemi.groundColor.set(light.ground)
    this.hemi.intensity = light.ambient * weather.ambient

    const back = new THREE.Color(light.back).lerp(grey, weather.grey * 0.35)
    this.renderer.setClearColor(back)
    this.scene.fog = weather.fog > 0 ? new THREE.Fog(new THREE.Color(light.sky).lerp(grey, 0.6), CAMERA_DISTANCE - 60, CAMERA_DISTANCE + 420 - 300 * weather.fog) : null

    this.uniforms.uSnow.value = snowCover(sky)
    this.uniforms.uWet.value = weather.wet
    // Третий уровень запустения гасит окна и фонари.
    this.uniforms.uGlow.value = neglect >= 3 ? 0 : light.glow
    this.uniforms.uFade.value = [0, 0.22, 0.48, 0.7][neglect] ?? 0

    this.precipitation = sky.kind === 'snow' ? 'snow' : sky.kind === 'rain' || sky.kind === 'storm' || sky.kind === 'drizzle' ? 'rain' : 'none'
    this.heavy = sky.kind === 'drizzle' ? 0.35 : sky.kind === 'storm' ? 1.3 : 1
    this.storm = sky.kind === 'storm'
    this.rain.visible = this.precipitation === 'rain'
    this.snow.visible = this.precipitation === 'snow'
    ;(this.rain.material as THREE.LineBasicMaterial).opacity = (sky.phase === 'night' ? 0.28 : 0.42) * Math.min(1, this.heavy + 0.2)
    this.rain.geometry.setDrawRange(0, Math.round(DROPS * Math.min(1, this.heavy)) * 2)
    this.place()
  }

  get night() {
    return this.phase === 'night' || this.phase === 'dusk'
  }

  private makeRain() {
    const positions = new Float32Array(DROPS * 6)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const seeds = new Float32Array(DROPS * 3)
    for (let i = 0; i < DROPS * 3; i++) seeds[i] = Math.random()
    geometry.userData.seeds = seeds
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#dfe7f0', transparent: true, opacity: 0.4, depthWrite: false }))
    lines.frustumCulled = false
    lines.visible = false
    return lines
  }

  private makeSnow() {
    const positions = new Float32Array(FLAKES * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const seeds = new Float32Array(FLAKES * 4)
    for (let i = 0; i < FLAKES * 4; i++) seeds[i] = Math.random()
    geometry.userData.seeds = seeds
    // Круглая мягкая снежинка: без неё точки рисуются квадратами.
    const dot = document.createElement('canvas')
    dot.width = dot.height = 32
    const g = dot.getContext('2d')!
    const fill = g.createRadialGradient(16, 16, 0, 16, 16, 15)
    fill.addColorStop(0, 'rgba(255,255,255,1)')
    fill.addColorStop(0.55, 'rgba(255,255,255,0.9)')
    fill.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = fill
    g.fillRect(0, 0, 32, 32)
    const material = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(dot),
      size: 5 * Math.min(window.devicePixelRatio || 1, 2),
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    points.visible = false
    return points
  }

  private fall(time: number) {
    const reach = Math.max(this.span, this.viewDepth) * 0.75 + 6
    const top = 46
    if (this.precipitation === 'rain') {
      const attribute = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute
      const seeds = this.rain.geometry.userData.seeds as Float32Array
      const positions = attribute.array as Float32Array
      for (let i = 0; i < DROPS; i++) {
        const x = (seeds[i * 3] * 2 - 1) * reach
        const z = (seeds[i * 3 + 1] * 2 - 1) * reach
        const y = top - ((time * 24 + seeds[i * 3 + 2] * top) % top)
        positions[i * 6] = x
        positions[i * 6 + 1] = y
        positions[i * 6 + 2] = z
        positions[i * 6 + 3] = x + 0.22
        positions[i * 6 + 4] = y + 1.5
        positions[i * 6 + 5] = z
      }
      attribute.needsUpdate = true
    } else if (this.precipitation === 'snow') {
      const attribute = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute
      const seeds = this.snow.geometry.userData.seeds as Float32Array
      const positions = attribute.array as Float32Array
      for (let i = 0; i < FLAKES; i++) {
        const drift = Math.sin(time * 0.6 + seeds[i * 4 + 3] * 30) * 1.2
        positions[i * 3] = (seeds[i * 4] * 2 - 1) * reach + drift
        positions[i * 3 + 1] = top - ((time * (1.6 + seeds[i * 4 + 3]) + seeds[i * 4 + 2] * top) % top)
        positions[i * 3 + 2] = (seeds[i * 4 + 1] * 2 - 1) * reach
      }
      attribute.needsUpdate = true
    }
  }

  // ——— Цикл рисования ———

  invalidate() {
    this.dirty = true
  }

  private loop(now: number) {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    if (!this.visible || !this.onScreen) {
      this.last = now
      return
    }
    const elapsed = now - this.last
    // С движением — не чаще 30 кадров в секунду; без движения — только после изменений.
    if (this.motion) {
      if (elapsed < 32) return
    } else if (!this.dirty) return
    const dt = Math.min(0.1, elapsed / 1000)
    this.last = now
    if (this.motion) {
      this.time += dt
      this.uniforms.uTime.value = this.time
      for (const tick of this.tickers) tick(dt, this.time)
      this.fall(this.time)
      if (this.storm) {
        // Редкая вспышка грозы: коротко добавляет рассеянного света.
        if (this.flash <= 0 && Math.random() < dt / 11) this.flash = 0.22
        if (this.flash > 0) this.flash -= dt
      }
    }
    const base = this.hemi.intensity
    if (this.flash > 0) this.hemi.intensity = base + 3
    this.renderer.render(this.scene, this.camera)
    this.hemi.intensity = base
    this.dirty = false
    this.options.onFrame?.()
  }

  // ——— Управление ———

  private bind(container: HTMLElement) {
    const canvas = this.canvas
    const local = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const down = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId)
      const at = local(event)
      this.pointers.set(event.pointerId, at)
      if (this.pointers.size === 1) this.press = { ...at, at: performance.now(), moved: false }
      else {
        this.press = null
        this.pinch = this.pinchDistance()
      }
    }
    const move = (event: PointerEvent) => {
      const before = this.pointers.get(event.pointerId)
      if (!before) return
      const at = local(event)
      this.pointers.set(event.pointerId, at)
      if (this.pointers.size === 1) {
        if (this.press && Math.hypot(at.x - this.press.x, at.y - this.press.y) > 6) this.press.moved = true
        if (!this.press || this.press.moved) this.panBy(at.x - before.x, at.y - before.y)
      } else if (this.pointers.size === 2) {
        const distance = this.pinchDistance()
        if (this.pinch > 0 && distance > 0) this.zoomBy(this.pinch / distance)
        this.pinch = distance
        this.panBy((at.x - before.x) / 2, (at.y - before.y) / 2)
      }
    }
    const up = (event: PointerEvent) => {
      const press = this.press
      this.pointers.delete(event.pointerId)
      if (this.pointers.size < 2) this.pinch = 0
      if (press && !press.moved && performance.now() - press.at < 500 && this.pointers.size === 0) {
        this.options.onTap?.(this.pick(press.x, press.y))
      }
      if (this.pointers.size === 0) this.press = null
    }
    const wheel = (event: WheelEvent) => {
      // Простое колесо листает страницу; масштаб — с Ctrl, как в картах.
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      this.zoomBy(Math.exp(event.deltaY * 0.0022))
    }
    const key = (event: KeyboardEvent) => {
      const step = 60
      if (event.key === 'ArrowLeft') this.panBy(step, 0)
      else if (event.key === 'ArrowRight') this.panBy(-step, 0)
      else if (event.key === 'ArrowUp') this.panBy(0, step)
      else if (event.key === 'ArrowDown') this.panBy(0, -step)
      else if (event.key === '+' || event.key === '=') this.zoomBy(0.85)
      else if (event.key === '-') this.zoomBy(1 / 0.85)
      else return
      event.preventDefault()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('keydown', key)

    const onVisibility = () => {
      this.visible = document.visibilityState !== 'hidden'
    }
    document.addEventListener('visibilitychange', onVisibility)
    const resizer = new ResizeObserver(() => this.resize())
    resizer.observe(container)
    const watcher = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((entry) => entry.isIntersecting)
    })
    watcher.observe(container)
    this.observers.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => resizer.disconnect(),
      () => watcher.disconnect(),
    )
  }

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  /** Постройка под точкой экрана: луч по габаритам, ближайшая к камере. */
  pick(x: number, y: number): string | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2), this.camera)
    const hit = new THREE.Vector3()
    let best: string | null = null
    let nearest = Infinity
    for (const item of this.pickables) {
      if (!ray.ray.intersectBox(item.box, hit)) continue
      const distance = hit.distanceTo(ray.ray.origin)
      if (distance < nearest) {
        nearest = distance
        best = item.id
      }
    }
    return best
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    for (const stop of this.observers) stop()
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
    this.renderer.dispose()
    this.canvas.remove()
  }
}
