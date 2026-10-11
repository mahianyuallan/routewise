import { describe, expect, it } from 'vitest'

import { boundsOf, gridSpacingM, haversineM, metersPerPixel, midpointAlong } from './geometry'

describe('map geometry', () => {
  it('measures great-circle distance', () => {
    // Dallas to Fort Worth, about 50 km.
    expect(haversineM([-96.797, 32.776], [-97.331, 32.756])).toBeCloseTo(50_100, -3)
  })

  it('uses MapLibre zoom levels, where zoom 0 fits the world in 512 pixels', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.5, 0)
    // At zoom 5.75 and 36°N a pixel is about 1.18 km, matching a fitted Dallas-Denver view.
    expect(metersPerPixel(5.75, 36)).toBeCloseTo(1_177, -1)
  })

  it('bounds every line and finds a midpoint by distance', () => {
    const lines = [
      [
        [-100, 35],
        [-98, 36],
      ],
      [
        [-99, 34],
        [-101, 37],
      ],
    ]
    expect(boundsOf(lines)).toEqual([
      [-101, 34],
      [-98, 37],
    ])
    expect(boundsOf([])).toBeNull()
    const [lon, lat] = midpointAlong([
      [-100, 35],
      [-99, 35],
      [-98, 35],
    ])
    expect(lon).toBeCloseTo(-99, 5)
    expect(lat).toBeCloseTo(35, 5)
  })

  it('estimates the grid spacing from the nearest neighbours', () => {
    const points: number[][] = []
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) points.push([-100 + i * 0.3, 35 + j * 0.3])
    // 0.3° of latitude is about 33 km; the east-west gap at 35°N is shorter, so the median is in between.
    expect(gridSpacingM(points)).toBeGreaterThan(25_000)
    expect(gridSpacingM(points)).toBeLessThan(34_000)
  })
})
