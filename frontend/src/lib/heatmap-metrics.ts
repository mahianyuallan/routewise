import type { HeatmapResponse } from '@/api/client'

import { HEATMAP_COLOR_RANGE, HEATMAP_DOMAIN, heatmapWeight, hexToRgb, type Rgb } from './risk'

/** What the corridor heatmap shows: the risk level, or one raw weather reading. */
export type HeatmapMetric = 'risk' | 'wind' | 'rain' | 'snow'
export type WeatherMetric = Exclude<HeatmapMetric, 'risk'>

export const HEATMAP_METRICS: { value: HeatmapMetric; label: string }[] = [
  { value: 'risk', label: 'Risk' },
  { value: 'wind', label: 'Wind' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
]

/**
 * One blue, light to dark, for magnitude: the lightest step means "near zero" and recedes
 * into the basemap. Blue appears nowhere in the risk palette, so a weather view can't be
 * mistaken for risk levels on the routes drawn over it.
 */
export const SEQUENTIAL_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']

export interface WeatherScale {
  label: string
  unit: string
  /** Reaches the darkest blue: the reading at which the brief's rules give No Travel. */
  max: number
  /** The Moderate, High and Severe thresholds, marked on the legend. */
  ticks: number[]
  digits: number
  /** [fade below, darkest at]: readings below the first fade out, so a trace doesn't paint the map. */
  domain: [number, number]
}

// Thresholds mirror backend/trips/services/risk.py (WIND_MPH, RAIN_IN_HR, SNOW_IN_HR).
export const WEATHER_SCALES: Record<WeatherMetric, WeatherScale> = {
  wind: { label: 'Sustained wind', unit: 'mph', max: 55, ticks: [25, 35, 45], digits: 0, domain: [1, 55] },
  rain: { label: 'Rain', unit: 'in/hr', max: 1, ticks: [0.1, 0.25, 0.5], digits: 2, domain: [0.02, 1] },
  snow: { label: 'Snow', unit: 'in/hr', max: 3, ticks: [0.5, 1, 2], digits: 1, domain: [0.05, 3] },
}

const BLUE_RANGE: Rgb[] = SEQUENTIAL_BLUE.map(hexToRgb)
const READINGS = { wind: 'wind_mph', rain: 'rain_in_hr', snow: 'snow_in_hr' } as const

export interface HeatmapEncoding {
  /** Weight of an entry in the hour-major arrays (index = hour * points + point). */
  weight: (index: number) => number
  /** False where the forecast has no reading (No data); those points are left out. */
  present: (index: number) => boolean
  colorRange: Rgb[]
  colorDomain: [number, number]
}

/**
 * The heatmap layer's weights, colours and domain for one metric. Colours and domains are
 * module constants, so deck.gl rebuilds its colour texture only when the metric changes.
 */
export function heatmapEncoding(heatmap: HeatmapResponse, metric: HeatmapMetric): HeatmapEncoding {
  if (metric === 'risk') {
    return {
      weight: (i) => heatmapWeight(heatmap.levels[i]),
      present: (i) => heatmap.levels[i] >= 0,
      colorRange: HEATMAP_COLOR_RANGE,
      colorDomain: HEATMAP_DOMAIN,
    }
  }
  const readings = heatmap[READINGS[metric]]
  return {
    weight: (i) => Math.max(0, readings[i] ?? 0),
    // Zero is a real reading (calm, dry) and still counts; only a missing one is left out.
    present: (i) => readings[i] !== null && readings[i] !== undefined,
    colorRange: BLUE_RANGE,
    colorDomain: WEATHER_SCALES[metric].domain,
  }
}

/**
 * A CSS gradient that matches how deck.gl draws `colours` over [0, max]: one texel per
 * colour, centred at (i + 0.5) / count, blended in between and flat at both ends.
 */
export function legendGradient(colours: string[]): string {
  const stops = colours.map((colour, i) => `${colour} ${(((i + 0.5) / colours.length) * 100).toFixed(2)}%`)
  return `linear-gradient(to right, ${colours[0]} 0%, ${stops.join(', ')}, ${colours.at(-1)} 100%)`
}
