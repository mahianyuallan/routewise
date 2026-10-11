import { describe, expect, it } from 'vitest'

import {
  HEATMAP_COLOR_RANGE,
  HEATMAP_DOMAIN,
  LEVELS,
  LEVEL_COLOR,
  heatmapWeight,
  hexToRgb,
  levelColor,
  levelLabel,
  levelScore,
} from './risk'

describe('risk levels', () => {
  it('scores Low 0 through No Travel 4', () => {
    expect(LEVELS.map(levelScore)).toEqual([0, 1, 2, 3, 4])
  })

  it('labels every level and the missing case', () => {
    expect(LEVELS.map(levelLabel)).toEqual(['Low', 'Moderate', 'High', 'Severe', 'No Travel'])
    expect(levelLabel(null)).toBe('No data')
  })

  it('uses five distinct colours plus a grey for No data', () => {
    const colours = new Set(Object.values(LEVEL_COLOR))
    expect(colours.size).toBe(5)
    expect(colours.has(levelColor(null))).toBe(false)
  })

  it('converts hex colours to RGB triples', () => {
    expect(hexToRgb('#1f9d55')).toEqual([31, 157, 85])
    expect(HEATMAP_COLOR_RANGE).toHaveLength(5)
  })

  it('puts every level on the centre of its own heatmap colour and hides No data', () => {
    // deck.gl samples the colour texture at weight / domain max, one texel per colour,
    // texel i centred at (i + 0.5) / count.
    const texel = (weight: number) => (weight / HEATMAP_DOMAIN[1]) * HEATMAP_COLOR_RANGE.length - 0.5
    expect([0, 1, 2, 3, 4].map((code) => texel(heatmapWeight(code)))).toEqual([0, 1, 2, 3, 4])
    // Weights at or above the domain minimum are fully opaque, so Low never fades out.
    expect(heatmapWeight(0)).toBeGreaterThanOrEqual(HEATMAP_DOMAIN[0])
    expect(heatmapWeight(-1)).toBe(0)
  })
})
