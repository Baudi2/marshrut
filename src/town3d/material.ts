// Общий материал мира. Цвет лежит в вершинах, а погода и время суток — в нескольких числах,
// общих для всей сцены: снег ложится на всё, что смотрит вверх, дождь темнит поверхности,
// ночью окна и фонари светятся. Менять эти числа дёшево: сцена не пересобирается.
import * as THREE from 'three'

export interface WorldUniforms {
  /** Снег: 0 — нет, 1 — всё, что смотрит вверх, белое. */
  uSnow: { value: number }
  /** Сырость от дождя: 0–1. */
  uWet: { value: number }
  /** Свет в окнах и фонарях: 0 — день, 1 — ночь. */
  uGlow: { value: number }
  /** Запустение: краски блёкнут, 0–1. */
  uFade: { value: number }
  uTime: { value: number }
}

export const makeUniforms = (): WorldUniforms => ({
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uGlow: { value: 0 },
  uFade: { value: 0 },
  uTime: { value: 0 },
})

const VERTEX_HEAD = /* glsl */ `
attribute float kind;
varying float vKind;
varying vec3 vWorldNormal;
`

const VERTEX_NORMAL = /* glsl */ `
vec3 worldNormalRaw = objectNormal;
#ifdef USE_INSTANCING
  worldNormalRaw = mat3( instanceMatrix ) * worldNormalRaw;
#endif
vWorldNormal = normalize( mat3( modelMatrix ) * worldNormalRaw );
vKind = kind;
`

const FRAGMENT_HEAD = /* glsl */ `
uniform float uSnow;
uniform float uWet;
uniform float uGlow;
uniform float uFade;
uniform float uTime;
uniform float uBroken;
uniform float uSnowScale;
varying float vKind;
varying vec3 vWorldNormal;
`

// Виды поверхности — как в kit.ts: 0 обычная, 1 окно, 2 огонь, 3 вода, 4 фонарь.
const FRAGMENT_COLOR = /* glsl */ `
float isPlain = 1.0 - step( 0.5, vKind );
float isWindow = step( 0.5, vKind ) * ( 1.0 - step( 1.5, vKind ) );
float isFire = step( 1.5, vKind ) * ( 1.0 - step( 2.5, vKind ) );
float isLamp = step( 3.5, vKind );
float fade = max( uFade, uBroken );
float grey = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( grey ) * 0.9 + 0.04, fade * ( 1.0 - isFire ) );
diffuseColor.rgb *= 1.0 - 0.3 * uWet * isPlain;
float snowCover = smoothstep( 0.42, 0.78, vWorldNormal.y ) * uSnow * uSnowScale * isPlain;
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.94 ), snowCover );
float glow = uGlow * ( 1.0 - uBroken );
diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.045, 0.055, 0.07 ), vec3( 0.9, 0.55, 0.2 ), glow ), isWindow );
`

const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += vec3( 1.0, 0.6, 0.22 ) * glow * ( isWindow * 0.85 + isLamp * 1.1 );
totalEmissiveRadiance += diffuseColor.rgb * isFire * ( 0.95 + 0.25 * sin( uTime * 8.0 ) ) * ( 1.0 - uFade );
`

export interface WorldMaterialOptions {
  map?: THREE.Texture
  /** Сломанная постройка: краски серые, окна тёмные. */
  broken?: boolean
  side?: THREE.Side
}

/** Матовый материал с цветом в вершинах и общими числами погоды. */
export function worldMaterial(uniforms: WorldUniforms, options: WorldMaterialOptions = {}): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: !options.map, map: options.map ?? null, side: options.side ?? THREE.FrontSide })
  const broken = { value: options.broken ? 0.85 : 0 }
  material.onBeforeCompile = (shader) => {
    // На земле снег чуть прозрачнее: улицы и площадь остаются различимы.
    Object.assign(shader.uniforms, uniforms, { uBroken: broken, uSnowScale: { value: options.map ? 0.84 : 1 } })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERTEX_HEAD)
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n' + VERTEX_NORMAL)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAGMENT_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAGMENT_EMISSIVE)
  }
  material.customProgramCacheKey = () => 'world' + (options.map ? '-map' : '')
  return material
}
