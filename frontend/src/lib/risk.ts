import type { components } from '@/api/schema'

export type RiskLevel = components['schemas']['RiskLevelEnum']

/** Levels in order of severity; the index is the risk score (Low 0 to No Travel 4). */
export const LEVELS = [
  'low',
  'moderate',
  'high',
  'severe',
  'no_travel',
] as const satisfies readonly RiskLevel[]

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
}

/**
 * One ordered palette shared by route segments, checkpoints, the heatmap and the legend.
 * Low is a clear green so calm stretches stay visible on the pale Positron basemap.
 */
export const LEVEL_COLOR: Record<RiskLevel, string> = {
  low: '#1f9d55',
  moderate: '#d9a400',
  high: '#ef7d14',
  severe: '#d12f3d',
  no_travel: '#5e1a8f',
}

export const NO_DATA_COLOR = '#8a8f98'
export const NO_DATA_LABEL = 'No data'

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function levelScore(level: RiskLevel): number {
  return LEVELS.indexOf(level)
}

export function levelLabel(level: RiskLevel | null | undefined): string {
  return level ? LEVEL_LABEL[level] : NO_DATA_LABEL
}

export function levelColor(level: RiskLevel | null | undefined): string {
  return level ? LEVEL_COLOR[level] : NO_DATA_COLOR
}

export function levelRgb(level: RiskLevel | null | undefined): Rgb {
  return hexToRgb(levelColor(level))
}

/** Heatmap colours, one per level, in order. */
export const HEATMAP_COLOR_RANGE: Rgb[] = LEVELS.map((level) => hexToRgb(LEVEL_COLOR[level]))

/**
 * deck.gl's HeatmapLayer reads a weight's colour at weight / colorDomain[1] along a texture
 * with one texel per colour, blending neighbouring texels, and fades weights below
 * colorDomain[0]. A level's score plus a half lands on the centre of its own texel, so a
 * uniformly Low area shows the Low colour rather than a blend of Low and Moderate.
 */
export const HEATMAP_DOMAIN: [number, number] = [0.5, LEVELS.length]

/** The API encodes a point-hour as its score, or -1 for No data, which must stay transparent. */
export function heatmapWeight(levelCode: number): number {
  return levelCode < 0 ? 0 : levelCode + 0.5
}
