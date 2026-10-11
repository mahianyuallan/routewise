import { CloudLightningIcon, CloudOffIcon, LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'

import { errorMessage, isApiError, type PlanRequest, type PlanResponse } from '@/api/client'
import { useHeatmap, usePlan, useServerStatus } from '@/api/queries'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ForecastSlider } from '@/features/heatmap/ForecastSlider'
import { Legend } from '@/features/map/Legend'
import { MapErrorBoundary } from '@/features/map/MapErrorBoundary'
import { Recommendation } from '@/features/results/Recommendation'
import { RouteCards } from '@/features/results/RouteCards'
import { TripForm } from '@/features/trip-form/TripForm'
import { formatDateTime, formatNumber } from '@/lib/format'
import { useUiStore } from '@/store/ui-store'

// The form paints before the map libraries download.
const TripMap = lazy(() => import('@/features/map/TripMap'))

export default function App() {
  const [trip, setTrip] = useState<PlanRequest | null>(null)
  const plan = usePlan(trip)
  const heatmap = useHeatmap(plan.data)
  const server = useServerStatus()
  const selectRoute = useUiStore((s) => s.selectRoute)
  const setHour = useUiStore((s) => s.setHour)
  const setPlaying = useUiStore((s) => s.setPlaying)
  const heatmapOn = useUiStore((s) => s.heatmapOn)
  const heatmapMetric = useUiStore((s) => s.heatmapMetric)
  const simulated = plan.data?.trip.weather_source === 'simulated'

  // A new plan focuses the recommended route (or the top-ranked one), stops playback and
  // rewinds the slider.
  useEffect(() => {
    if (plan.data && !plan.isPlaceholderData) {
      selectRoute(plan.data.recommendation.route ?? plan.data.ranking[0] ?? null)
      setPlaying(false)
      setHour(0)
    }
  }, [plan.data, plan.isPlaceholderData, selectRoute, setPlaying, setHour])

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">RouteWise</h1>
          <p className="text-xs text-muted-foreground">
            Three truck routes, scored by the weather each one meets at the hour the truck gets there.
          </p>
        </div>
        <ServerStatus waking={server.waking} unreachable={server.unreachable} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 w-full space-y-4 overflow-y-auto border-t p-4 md:order-1 md:w-[400px] md:shrink-0 md:border-t-0 md:border-r">
          <TripForm onPlan={setTrip} planning={plan.isFetching} />
          {plan.isError && <PlanError error={plan.error} />}
          {plan.data && (
            <>
              <SimulatedWeatherBanner plan={plan.data} />
              <Recommendation plan={plan.data} />
              <RouteCards plan={plan.data} dimmed={plan.isPlaceholderData} />
            </>
          )}
          {!plan.data && !plan.isError && !plan.isFetching && (
            <p className="text-sm text-muted-foreground">
              Pick an origin, a destination, a departure and the load. The map shows all three routes, every
              checkpoint's risk at its ETA, and a 48-hour risk heatmap of the corridor.
            </p>
          )}
        </aside>

        <main className="order-1 flex min-h-[45dvh] flex-1 flex-col md:order-2 md:min-h-0">
          <div className="relative min-h-0 flex-1">
            <MapErrorBoundary>
              <Suspense fallback={<MapPlaceholder />}>
                <TripMap plan={plan.data} heatmap={heatmap.data} />
              </Suspense>
            </MapErrorBoundary>
            <Legend
              heatmapOn={heatmapOn && !!plan.data}
              heatmapMetric={heatmapMetric}
              stormRadiusMiles={simulated ? (plan.data?.trip.storm?.wind_radius_miles ?? null) : null}
            />
            {simulated && (
              <div className="pointer-events-none absolute top-3 left-12 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
                Simulated weather
              </div>
            )}
            {heatmap.isError && plan.data && (
              <div className="absolute bottom-3 left-3 rounded-md bg-background/95 px-3 py-2 text-xs text-destructive shadow">
                Heatmap unavailable: {errorMessage(heatmap.error)}
              </div>
            )}
          </div>
          {plan.data && (
            <ForecastSlider plan={plan.data} heatmap={heatmap.data} loading={heatmap.isFetching} />
          )}
        </main>
      </div>

      <footer className="border-t px-4 py-1.5 text-[11px] text-muted-foreground">
        Routing by TomTom ·{' '}
        <a
          className="underline underline-offset-2"
          href="https://www.geoapify.com/"
          target="_blank"
          rel="noreferrer"
        >
          Powered by Geoapify
        </a>{' '}
        ·{' '}
        <a
          className="underline underline-offset-2"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
        >
          Weather data by Open-Meteo.com
        </a>{' '}
        (CC BY 4.0) · Map tiles by{' '}
        <a
          className="underline underline-offset-2"
          href="https://openfreemap.org/"
          target="_blank"
          rel="noreferrer"
        >
          OpenFreeMap
        </a>
        , © OpenMapTiles, © OpenStreetMap contributors
      </footer>
    </div>
  )
}

function ServerStatus({ waking, unreachable }: { waking: boolean; unreachable: boolean }) {
  if (unreachable) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CloudOffIcon className="size-4" /> Can't reach the server
      </span>
    )
  }
  if (waking) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Waking the server on free hosting, this takes about a minute
      </span>
    )
  }
  return null
}

/** Says, in words a screenshot can't lose, that the plan was scored against a made-up storm. */
function SimulatedWeatherBanner({ plan }: { plan: PlanResponse }) {
  const storm = plan.trip.storm
  if (plan.trip.weather_source !== 'simulated' || !storm) return null
  return (
    <Alert className="border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <CloudLightningIcon />
      <AlertTitle>Simulated weather, not a forecast</AlertTitle>
      <AlertDescription className="text-amber-900/85 dark:text-amber-100/85">
        A storm with {formatNumber(storm.peak_wind_mph)} mph wind and {formatNumber(storm.peak_rain_in_hr, 1)}{' '}
        in/hr rain at its centre, fading to calm {formatNumber(storm.wind_radius_miles)} miles out. It sits on
        Route A at {formatDateTime(storm.at_utc, plan.trip.timezone)} and drifts east at{' '}
        {formatNumber(storm.drift_east_mph)} mph. The risk and load rules run exactly as they do on a
        forecast.
      </AlertDescription>
    </Alert>
  )
}

function PlanError({ error }: { error: unknown }) {
  const api = isApiError(error) ? error : null
  const title = api
    ? ({
        no_route: 'No truck route found',
        invalid_trip: 'Check the trip',
        validation: 'Check the trip',
        provider_quota: `${api.provider ?? 'A service'} is out of free quota`,
        provider_unavailable: `${api.provider ?? 'A service'} isn't responding`,
        provider_rejected: `${api.provider ?? 'A service'} rejected the request`,
        weather_units: 'Weather came back in the wrong units',
        network: "Can't reach the server",
      }[api.code] ?? 'Planning failed')
    : 'Planning failed'
  const message = api ? api.message : errorMessage(error)
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function MapPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
      <LoaderCircleIcon className="mr-2 size-4 animate-spin" /> Loading the map…
    </div>
  )
}
