import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'

import type { Checkpoint, HeatmapResponse, PlanResponse, Route } from '@/api/client'
import { formatClock, formatMiles, formatNumber } from '@/lib/format'
import {
  HEATMAP_COLOR_RANGE,
  HEATMAP_DOMAIN,
  heatmapWeight,
  levelLabel,
  levelRgb,
  type Rgb,
} from '@/lib/risk'

import { gridSpacingM, metersPerPixel, midpointAlong, type LonLat } from './geometry'

export interface CheckpointDatum {
  checkpoint: Checkpoint
  route: string
  selected: boolean
}

interface LayerInputs {
  plan: PlanResponse | undefined
  heatmap: HeatmapResponse | undefined
  heatmapOn: boolean
  hour: number
  selectedRoute: string | null
  zoom: number
  beforeId: string | undefined
  onSelectRoute: (label: string) => void
}

type Rgba = [number, number, number, number]

function withAlpha(rgb: Rgb, alpha: number): Rgba {
  return [rgb[0], rgb[1], rgb[2], alpha]
}

const HEATMAP_GRID_SPACINGS = 1.5

/**
 * In interleaved mode deck.gl draws a layer under the MapLibre layer named by `beforeId`,
 * which keeps everything under the basemap's labels. The prop isn't in deck's typings.
 */
function under(beforeId: string | undefined): { beforeId?: string } {
  return beforeId ? { beforeId } : {}
}

export function buildLayers(inputs: LayerInputs): Layer[] {
  const { plan, heatmap, heatmapOn, hour, selectedRoute, zoom, beforeId, onSelectRoute } = inputs
  const layers: Layer[] = []
  if (!plan) return layers

  if (heatmap && heatmapOn && heatmap.points.length > 0) {
    const n = heatmap.points.length
    const meanLat = heatmap.points.reduce((sum, p) => sum + p[1], 0) / n
    const radius = (HEATMAP_GRID_SPACINGS * gridSpacingM(heatmap.points)) / metersPerPixel(zoom, meanLat)
    layers.push(
      new HeatmapLayer<number>({
        id: 'risk-heatmap',
        ...under(beforeId),
        data: Array.from({ length: n }, (_, i) => i),
        getPosition: (i) => heatmap.points[i] as LonLat,
        getWeight: (i) => heatmapWeight(heatmap.levels[hour * n + i]),
        // MEAN, not SUM: a place with more grid points must not look riskier than it is.
        aggregation: 'MEAN',
        colorDomain: HEATMAP_DOMAIN,
        colorRange: HEATMAP_COLOR_RANGE,
        threshold: 0.02,
        radiusPixels: Math.min(160, Math.max(14, radius)),
        weightsTextureSize: 1024,
        opacity: 0.55,
        updateTriggers: { getWeight: [hour, heatmap] },
      }),
    )
  }

  // Draw the selected route last so it sits on top.
  const ordered = [...plan.routes].sort(
    (a, b) => Number(a.label === selectedRoute) - Number(b.label === selectedRoute),
  )
  for (const route of ordered) {
    const selected = route.label === selectedRoute
    if (selected) {
      layers.push(
        new PathLayer<Route['segments'][number]>({
          id: `route-${route.label}-casing`,
          ...under(beforeId),
          data: route.segments,
          getPath: (s) => s.path as LonLat[],
          getColor: [255, 255, 255, 230],
          getWidth: 11,
          widthUnits: 'pixels',
          capRounded: true,
          jointRounded: true,
        }),
      )
    }
    layers.push(
      new PathLayer<Route['segments'][number]>({
        id: `route-${route.label}`,
        ...under(beforeId),
        data: route.segments,
        getPath: (s) => s.path as LonLat[],
        getColor: (s) => withAlpha(levelRgb(s.level), selected ? 255 : 140),
        getWidth: selected ? 6 : 3,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onClick: () => onSelectRoute(route.label),
        updateTriggers: { getColor: [selected], getWidth: [selected] },
      }),
    )
  }

  const checkpoints: CheckpointDatum[] = ordered.flatMap((route) =>
    route.checkpoints.map((checkpoint) => ({
      checkpoint,
      route: route.label,
      selected: route.label === selectedRoute,
    })),
  )
  layers.push(
    new ScatterplotLayer<CheckpointDatum>({
      id: 'checkpoints',
      ...under(beforeId),
      data: checkpoints,
      getPosition: (d) => [d.checkpoint.lon, d.checkpoint.lat],
      getFillColor: (d) => withAlpha(levelRgb(d.checkpoint.level), d.selected ? 255 : 150),
      getLineColor: [255, 255, 255, 255],
      getRadius: (d) => (d.selected ? 6 : 3.5),
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      stroked: true,
      pickable: true,
      onClick: (info) => {
        if (info.object) onSelectRoute(info.object.route)
      },
      updateTriggers: { getFillColor: [selectedRoute], getRadius: [selectedRoute] },
    }),
  )

  const ends: { position: LonLat; name: string }[] = [
    { position: [plan.trip.origin.lon, plan.trip.origin.lat], name: 'Origin' },
    { position: [plan.trip.destination.lon, plan.trip.destination.lat], name: 'Destination' },
  ]
  layers.push(
    new ScatterplotLayer<(typeof ends)[number]>({
      id: 'trip-ends',
      ...under(beforeId),
      data: ends,
      getPosition: (d) => d.position,
      getFillColor: [20, 20, 20, 255],
      getLineColor: [255, 255, 255, 255],
      getRadius: 7,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
      stroked: true,
    }),
  )

  layers.push(
    new TextLayer<{ label: string; position: LonLat }>({
      id: 'route-labels',
      ...under(beforeId),
      data: plan.routes.map((route) => ({ label: route.label, position: midpointAlong(route.outline) })),
      getPosition: (d) => d.position,
      getText: (d) => d.label,
      getSize: 13,
      fontWeight: 'bold',
      getColor: [255, 255, 255, 255],
      background: true,
      getBackgroundColor: (d) => (d.label === selectedRoute ? [20, 20, 20, 235] : [90, 90, 90, 200]),
      backgroundPadding: [7, 4],
      getPixelOffset: [0, -16],
      updateTriggers: { getBackgroundColor: [selectedRoute] },
    }),
  )

  return layers
}

/** Checkpoint tooltip: ETA in the origin's zone, the four readings, the level and its reason. */
export function checkpointTooltip(info: PickingInfo, timeZone: string) {
  const datum = info.object as CheckpointDatum | undefined
  if (!datum || info.layer?.id !== 'checkpoints') return null
  const c = datum.checkpoint
  const w = c.weather
  const reading = (value: number | null | undefined, unit: string, digits: number) =>
    value === null || value === undefined ? '—' : `${formatNumber(value, digits)} ${unit}`
  const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return {
    html: `
      <div style="font-weight:600;margin-bottom:4px">Route ${datum.route} · mile ${formatMiles(c.mile).replace(' mi', '')} · ETA ${esc(formatClock(c.eta_utc, timeZone))}</div>
      <div style="color:${levelRgbCss(c.level)};font-weight:600">${esc(levelLabel(c.level))}</div>
      <div style="margin:2px 0 6px">${esc(c.reason)}</div>
      <table style="border-collapse:collapse;font-variant-numeric:tabular-nums">
        <tr><td style="padding-right:10px;opacity:.7">Wind</td><td>${reading(w.wind_mph, 'mph', 1)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Gusts</td><td>${reading(w.gust_mph, 'mph', 1)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Rain</td><td>${reading(w.rain_in_hr, 'in/hr', 2)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Snow</td><td>${reading(w.snow_in_hr, 'in/hr', 2)}</td></tr>
      </table>`,
    style: {
      background: 'white',
      color: '#111',
      fontSize: '12px',
      padding: '8px 10px',
      borderRadius: '8px',
      boxShadow: '0 4px 14px rgba(0,0,0,.18)',
      maxWidth: '280px',
    },
  }
}

function levelRgbCss(level: Checkpoint['level']): string {
  const [r, g, b] = levelRgb(level)
  return `rgb(${r},${g},${b})`
}
