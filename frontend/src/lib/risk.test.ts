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

  it('maps API level codes onto the heatmap domain and hides No data', () => {
    expect([0, 1, 2, 3, 4].map(heatmapWeight)).toEqual([1, 2, 3, 4, 5])
    expect(heatmapWeight(-1)).toBe(0)
    expect(heatmapWeight(0)).toBe(HEATMAP_DOMAIN[0])
    expect(heatmapWeight(4)).toBe(HEATMAP_DOMAIN[1])
  })
})
