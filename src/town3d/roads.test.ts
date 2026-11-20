import { describe, expect, it } from 'vitest'
import { route, stopOf, streetNet, type Site } from './jobs'
import { PITCH, STREET_X, STREET_Z, connectors, forest, openPlots, type Road } from './plan'

const site = (id: string, level = 1): Site => ({ id, type: id.split('-')[0], level, pending: false })
const length = (road: Road) => Math.abs(road.x1 - road.x0) + Math.abs(road.z1 - road.z0)
const distance = (x: number, z: number, road: Road) => {
  const dx = Math.max(Math.min(road.x0, road.x1) - x, 0, x - Math.max(road.x0, road.x1))
  const dz = Math.max(Math.min(road.z0, road.z1) - z, 0, z - Math.max(road.z0, road.z1))
  return Math.hypot(dx, dz)
}

describe('соединительные дороги', () => {
  it('пока все участки стоят у площади или друг у друга, лишних дорог нет', () => {
    for (const tier of [0, 1]) expect(connectors(openPlots(tier)), String(tier)).toEqual([])
  })

  it('на «Хуторе» склад и мастерская стоят за лесом: к ним ведут дороги по линиям сетки', () => {
    const roads = connectors(openPlots(2))
    expect(roads.length).toBeGreaterThan(0)
    expect(roads.length).toBeLessThanOrEqual(4)
    for (const road of roads) {
      expect(length(road)).toBeCloseTo(PITCH)
      expect(STREET_X.includes(road.x0) && STREET_X.includes(road.x1)).toBe(true)
      expect(STREET_Z.includes(road.z0) && STREET_Z.includes(road.z1)).toBe(true)
      // Через середину площади дорог нет.
      expect(Math.abs((road.x0 + road.x1) / 2) < 1 && (road.z0 + road.z1) / 2 > -PITCH).toBe(false)
    }
  })

  it('дорог немного на любой ступени, и раскладка не меняется от вызова к вызову', () => {
    for (let tier = 0; tier <= 5; tier++) {
      const roads = connectors(openPlots(tier))
      expect(roads.length, String(tier)).toBeLessThanOrEqual(4)
      expect(connectors(openPlots(tier))).toEqual(roads)
    }
  })

  it('лес с дороги убран на ту же ширину, что и с улицы у открытого участка', () => {
    for (let tier = 2; tier <= 5; tier++) {
      const roads = connectors(openPlots(tier))
      const trees = forest(tier, 0)
      for (const road of roads) {
        for (const tree of trees) expect(distance(tree.x, tree.z, road), `${tier}: дерево ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`).toBeGreaterThan(4)
      }
    }
  })

  it('жители идут к складу по дороге: путь не длиннее обхода и лежит на улицах сети', () => {
    const net = streetNet(openPlots(2), [], forest(2, 0))
    expect(net.roads.size).toBe(connectors(openPlots(2)).length)
    const path = route(stopOf(site('house-1'), 0)!, stopOf(site('store-1'), 0)!, net)
    const inner = path.slice(1, -1)
    for (const [x, z] of inner) {
      const onStreet = Math.min(...STREET_X.map((s) => Math.abs(s - x))) < 0.5 || Math.min(...STREET_Z.map((s) => Math.abs(s - z))) < 0.5
      expect(onStreet, `${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true)
    }
  })
})
