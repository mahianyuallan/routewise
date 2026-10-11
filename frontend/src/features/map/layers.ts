import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'

import type { Checkpoint, HeatmapResponse, PlanResponse, Route } from '@/api/client'
import { formatClock, formatMiles, formatNumber } from '@/lib/format'
import { heatmapEncoding, type HeatmapMetric } from '@/lib/heatmap-metrics'
import { levelLabel, levelRgb, type Rgb } from '@/lib/risk'

import { gridSpacingM, metersPerPixel, midpointAlong, type LonLat } from './geometry'
import { METERS_PER_MILE, stormCentreAt } from './storm'
import { truckAt, type Truck } from './trucks'

export interface CheckpointDatum {
  checkpoint: Checkpoint
  route: string
  selected: boolean
}

interface LayerInputs {
  plan: PlanResponse | undefined
  heatmap: HeatmapResponse | undefined
  heatmapOn: boolean
  heatmapMetric: HeatmapMetric
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
const STORM_RGB: Rgb = [180, 83, 9]
const WAITING_OR_ARRIVED_RGB: Rgb = [60, 60, 60]

// Lucide's "truck" icon (ISC licence), drawn as a mask so deck.gl can tint it.
const TRUCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" ' +
  'stroke="black" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/>' +
  '<path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>' +
  '<circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>'
const TRUCK_ICON = {
  id: 'truck',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TRUCK_SVG)}`,
  width: 48,
  height: 48,
  anchorX: 24,
  anchorY: 24,
  mask: true,
}

/**
 * In interleaved mode deck.gl draws a layer under the MapLibre layer named by `beforeId`,
 * which keeps everything under the basemap's labels. The prop isn't in deck's typings.
 */
function under(beforeId: string | undefined): { beforeId?: string } {
  return beforeId ? { beforeId } : {}
}

export function buildLayers(inputs: LayerInputs): Layer[] {
  const { plan, heatmap, heatmapOn, heatmapMetric, hour, selectedRoute, zoom, beforeId, onSelectRoute } =
    inputs
  const layers: Layer[] = []
  if (!plan) return layers

  // The simulated storm's wind extent, where it is at the slider's hour. It goes under the
  // heatmap so its tint never shifts a risk colour; the legend names it.
  const storm = plan.trip.weather_source === 'simulated' ? plan.trip.storm : null
  if (storm) {
    layers.push(
      new ScatterplotLayer<LonLat>({
        id: 'storm-extent',
        ...under(beforeId),
        data: [stormCentreAt(storm, heatmap?.hours[hour] ?? plan.trip.departure_utc)],
        getPosition: (d) => d,
        getRadius: storm.wind_radius_miles * METERS_PER_MILE,
        radiusUnits: 'meters',
        getFillColor: withAlpha(STORM_RGB, 22),
        getLineColor: withAlpha(STORM_RGB, 210),
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        stroked: true,
      }),
    )
  }

  if (heatmap && heatmapOn && heatmap.points.length > 0) {
    const n = heatmap.points.length
    const meanLat = heatmap.points.reduce((sum, p) => sum + p[1], 0) / n
    const radius = (HEATMAP_GRID_SPACINGS * gridSpacingM(heatmap.points)) / metersPerPixel(zoom, meanLat)
    const encoding = heatmapEncoding(heatmap, heatmapMetric)
    layers.push(
      new HeatmapLayer<number>({
        id: 'risk-heatmap',
        ...under(beforeId),
        data: Array.from({ length: n }, (_, i) => i),
        getPosition: (i) => heatmap.points[i] as LonLat,
        getWeight: (i) => encoding.weight(hour * n + i),
        // MEAN, not SUM: a place with more grid points must not look riskier than it is.
        aggregation: 'MEAN',
        // With a colour domain set, deck.gl ignores `threshold`; the domain does the fading.
        colorDomain: encoding.colorDomain,
        colorRange: encoding.colorRange,
        radiusPixels: Math.min(160, Math.max(14, radius)),
        weightsTextureSize: 1024,
        opacity: 0.55,
        updateTriggers: { getWeight: [hour, heatmap, heatmapMetric] },
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

  // Where each route's truck is at the slider's hour, ringed in the level of the stretch it
  // is on. The selected route's truck is drawn last and larger.
  const at = heatmap?.hours[hour] ?? plan.trip.departure_utc
  const trucks = ordered.map((route) => truckAt(route, at)).filter((t): t is Truck => t !== null)
  const ringColor = (t: Truck) =>
    withAlpha(t.status === 'driving' ? levelRgb(t.level) : WAITING_OR_ARRIVED_RGB, 255)
  layers.push(
    new ScatterplotLayer<Truck>({
      id: 'truck-discs',
      ...under(beforeId),
      data: trucks,
      getPosition: (t) => t.position,
      getFillColor: [255, 255, 255, 255],
      getLineColor: ringColor,
      getRadius: (t) => (t.route === selectedRoute ? 13 : 10),
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getLineWidth: 3,
      stroked: true,
      pickable: true,
      onClick: (info) => {
        if (info.object) onSelectRoute(info.object.route)
      },
      updateTriggers: { getRadius: [selectedRoute] },
    }),
    new IconLayer<Truck>({
      id: 'trucks',
      ...under(beforeId),
      data: trucks,
      getPosition: (t) => t.position,
      getIcon: () => TRUCK_ICON,
      getSize: (t) => (t.route === selectedRoute ? 16 : 12),
      sizeUnits: 'pixels',
      getColor: [25, 25, 25, 255],
      pickable: true,
      onClick: (info) => {
        if (info.object) onSelectRoute(info.object.route)
      },
      updateTriggers: { getSize: [selectedRoute] },
    }),
  )

  return layers
}

const TOOLTIP_STYLE = {
  background: 'white',
  color: '#111',
  fontSize: '12px',
  padding: '8px 10px',
  borderRadius: '8px',
  boxShadow: '0 4px 14px rgba(0,0,0,.18)',
  maxWidth: '280px',
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

/**
 * Map tooltips. A checkpoint shows its ETA in the origin's zone, the four readings, the level
 * and its reason; a truck shows where it is at the slider's hour and the level of that stretch.
 */
export function mapTooltip(info: PickingInfo, timeZone: string, simulated = false) {
  const layerId = info.layer?.id
  if (!info.object) return null
  const source = simulated
    ? `<div style="color:rgb(${STORM_RGB.join(',')});font-weight:600;margin-bottom:4px">Simulated weather, not a forecast</div>`
    : ''
  if (layerId === 'checkpoints') {
    return { html: source + checkpointHtml(info.object as CheckpointDatum, timeZone), style: TOOLTIP_STYLE }
  }
  if (layerId === 'trucks' || layerId === 'truck-discs') {
    return { html: source + truckHtml(info.object as Truck, timeZone), style: TOOLTIP_STYLE }
  }
  return null
}

function checkpointHtml(datum: CheckpointDatum, timeZone: string): string {
  const c = datum.checkpoint
  const w = c.weather
  const reading = (value: number | null | undefined, unit: string, digits: number) =>
    value === null || value === undefined ? '—' : `${formatNumber(value, digits)} ${unit}`
  return `
      <div style="font-weight:600;margin-bottom:4px">Route ${datum.route} · mile ${formatMiles(c.mile).replace(' mi', '')} · ETA ${esc(formatClock(c.eta_utc, timeZone))}</div>
      <div style="color:${levelRgbCss(c.level)};font-weight:600">${esc(levelLabel(c.level))}</div>
      <div style="margin:2px 0 6px">${esc(c.reason)}</div>
      <table style="border-collapse:collapse;font-variant-numeric:tabular-nums">
        <tr><td style="padding-right:10px;opacity:.7">Wind</td><td>${reading(w.wind_mph, 'mph', 1)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Gusts</td><td>${reading(w.gust_mph, 'mph', 1)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Rain</td><td>${reading(w.rain_in_hr, 'in/hr', 2)}</td></tr>
        <tr><td style="padding-right:10px;opacity:.7">Snow</td><td>${reading(w.snow_in_hr, 'in/hr', 2)}</td></tr>
      </table>`
}

function truckHtml(truck: Truck, timeZone: string): string {
  const where = {
    waiting: 'Waiting at the origin',
    arrived: 'Arrived at the destination',
    driving: `Mile ${formatNumber(truck.mile)} of ${formatNumber(truck.lengthMiles)}`,
  }[truck.status]
  const stretch =
    truck.status === 'driving'
      ? `<div style="color:${levelRgbCss(truck.level)};font-weight:600;margin-top:2px">${esc(levelLabel(truck.level))} stretch</div>`
      : ''
  return `
      <div style="font-weight:600;margin-bottom:4px">Route ${truck.route} truck · ${esc(formatClock(truck.at, timeZone))}</div>
      <div>${where}</div>
      ${stretch}`
}

function levelRgbCss(level: Checkpoint['level']): string {
  const [r, g, b] = levelRgb(level)
  return `rgb(${r},${g},${b})`
}
