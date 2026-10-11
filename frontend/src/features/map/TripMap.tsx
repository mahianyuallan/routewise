import { MapLibreOverlay } from '@deck.gl/maplibre'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapGL, NavigationControl, useControl, type MapRef } from 'react-map-gl/maplibre'

import 'maplibre-gl/dist/maplibre-gl.css'

import type { HeatmapResponse, PlanResponse } from '@/api/client'
import { useUiStore } from '@/store/ui-store'

import { boundsOf } from './geometry'
import { buildLayers, checkpointTooltip } from './layers'

// MapLibre 6 needs the bundler to point it at its worker, once, before the first map renders.
// This module is lazy-loaded, so the map libraries stay out of the first paint.
setWorkerUrl(workerUrl)

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron'
const US_VIEW = { longitude: -97.5, latitude: 38.5, zoom: 3.6 }

type OverlayProps = ConstructorParameters<typeof MapLibreOverlay>[0]

function DeckGLOverlay(props: OverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props))
  overlay.setProps(props)
  return null
}

interface Props {
  plan: PlanResponse | undefined
  heatmap: HeatmapResponse | undefined
}

export default function TripMap({ plan, heatmap }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [zoom, setZoom] = useState(US_VIEW.zoom)
  const [beforeId, setBeforeId] = useState<string | undefined>()
  const selectedRoute = useUiStore((s) => s.selectedRoute)
  const selectRoute = useUiStore((s) => s.selectRoute)
  const hour = useUiStore((s) => s.hour)
  const heatmapOn = useUiStore((s) => s.heatmapOn)

  const fitToPlan = useCallback(() => {
    const map = mapRef.current
    if (!map || !plan) return
    const bounds = boundsOf(plan.routes.map((r) => r.outline))
    if (bounds) map.fitBounds(bounds, { padding: 64, duration: 900, maxZoom: 11 })
  }, [plan])

  useEffect(fitToPlan, [fitToPlan])

  const layers = useMemo(
    () =>
      buildLayers({
        plan,
        heatmap,
        heatmapOn,
        hour,
        selectedRoute,
        zoom,
        beforeId,
        onSelectRoute: selectRoute,
      }),
    [plan, heatmap, heatmapOn, hour, selectedRoute, zoom, beforeId, selectRoute],
  )
  const timeZone = plan?.trip.timezone ?? 'UTC'

  return (
    <MapGL
      ref={mapRef}
      initialViewState={US_VIEW}
      mapStyle={BASEMAP}
      style={{ width: '100%', height: '100%' }}
      onLoad={(event) => {
        // The first symbol layer is where the labels start; deck layers go underneath it.
        const symbol = event.target.getStyle().layers?.find((layer) => layer.type === 'symbol')
        setBeforeId(symbol?.id)
        fitToPlan()
      }}
      onZoom={(event) => setZoom(Math.round(event.viewState.zoom * 4) / 4)}
    >
      <NavigationControl position="top-left" showCompass={false} />
      <DeckGLOverlay interleaved layers={layers} getTooltip={(info) => checkpointTooltip(info, timeZone)} />
    </MapGL>
  )
}
