import { describe, expect, it } from 'vitest'

import type { HeatmapResponse } from '@/api/client'

import { SEQUENTIAL_BLUE, WEATHER_SCALES, heatmapEncoding, legendGradient } from './heatmap-metrics'
import { HEATMAP_COLOR_RANGE } from './risk'

const heatmap: HeatmapResponse = {
  hours: ['2026-10-12T14:00:00Z'],
  points: [
    [-100, 35],
    [-99, 35],
    [-98, 35],
  ],
  levels: [0, 3, -1],
  wind_mph: [12.5, 48, null],
  rain_in_hr: [0, 0.6, null],
  snow_in_hr: [0, 0, null],
  corridor_miles: 25,
}

/** Where deck.gl samples the colour texture for a weight, in texels. */
const texel = (weight: number, domain: [number, number], colours: number) =>
  (weight / domain[1]) * colours - 0.5

describe('heatmap metrics', () => {
  it('shows risk with the level palette, each level on its own colour', () => {
    const risk = heatmapEncoding(heatmap, 'risk')
    expect(risk.colorRange).toBe(HEATMAP_COLOR_RANGE)
    expect(texel(risk.weight(1), risk.colorDomain, risk.colorRange.length)).toBe(3) // Severe
    expect(risk.weight(2)).toBe(0) // No data stays transparent
  })

  it('shows raw readings in one blue, darkest at the No Travel threshold', () => {
    const wind = heatmapEncoding(heatmap, 'wind')
    expect(wind.colorRange).toHaveLength(SEQUENTIAL_BLUE.length)
    expect([0, 1, 2].map(wind.weight)).toEqual([12.5, 48, 0])
    const darkest = texel(WEATHER_SCALES.wind.max, wind.colorDomain, wind.colorRange.length)
    expect(darkest).toBeGreaterThanOrEqual(SEQUENTIAL_BLUE.length - 1)
    expect(heatmapEncoding(heatmap, 'rain').weight(1)).toBe(0.6)
    expect(heatmapEncoding(heatmap, 'snow').weight(0)).toBe(0)
  })

  it('keeps the thresholds inside each scale, in order', () => {
    for (const scale of Object.values(WEATHER_SCALES)) {
      expect(scale.ticks).toEqual([...scale.ticks].sort((a, b) => a - b))
      expect(scale.ticks.every((t) => t > scale.domain[0] && t < scale.max)).toBe(true)
      expect(scale.domain[1]).toBe(scale.max)
    }
  })

  it('draws the legend with stops where deck.gl centres each colour', () => {
    expect(legendGradient(['#000000', '#ffffff'])).toBe(
      'linear-gradient(to right, #000000 0%, #000000 25.00%, #ffffff 75.00%, #ffffff 100%)',
    )
  })
})
