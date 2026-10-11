import { CloudLightningIcon, CloudOffIcon, LoaderCircleIcon } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'

import { errorMessage, type PlanRequest, type PlanResponse } from '@/api/client'
import { useHeatmap, usePlan, useServerStatus } from '@/api/queries'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ForecastSlider } from '@/features/heatmap/ForecastSlider'
import { planSummary } from '@/features/layout/plan-summary'
import { TripPanel } from '@/features/layout/TripPanel'
import { Legend } from '@/features/map/Legend'
import { MapErrorBoundary } from '@/features/map/MapErrorBoundary'
import { PlanError } from '@/features/results/PlanError'
import { Recommendation } from '@/features/results/Recommendation'
import { RouteCards } from '@/features/results/RouteCards'
import { TripForm } from '@/features/trip-form/TripForm'
import { formatDateTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui-store'

// The form paints before the map libraries download.
const TripMap = lazy(() => import('@/features/map/TripMap'))

export default function App() {
  const [trip, setTrip] = useState<PlanRequest | null>(null)
  // Phone only: the sheet starts raised on the form and lowers itself when a plan arrives.
  const [sheetOpen, setSheetOpen] = useState(true)
  const plan = usePlan(trip)
  const heatmap = useHeatmap(plan.data)
  const server = useServerStatus()
  const selectRoute = useUiStore((s) => s.selectRoute)
  const setHour = useUiStore((s) => s.setHour)
  const setPlaying = useUiStore((s) => s.setPlaying)
  const heatmapOn = useUiStore((s) => s.heatmapOn)
  const heatmapMetric = useUiStore((s) => s.heatmapMetric)
  const simulated = plan.data?.trip.weather_source === 'simulated'

  // A new plan focuses the recommended route (or the top-ranked one), stops playback,
  // rewinds the slider and, on a phone, lowers the sheet so the map shows the routes.
  useEffect(() => {
    if (plan.data && !plan.isPlaceholderData) {
      selectRoute(plan.data.recommendation.route ?? plan.data.ranking[0] ?? null)
      setPlaying(false)
      setHour(0)
      setSheetOpen(false)
    }
  }, [plan.data, plan.isPlaceholderData, selectRoute, setPlaying, setHour])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">RouteWise</h1>
          <p className="text-xs text-muted-foreground max-md:hidden">
            Three truck routes, scored by the weather each one meets at the hour the truck gets there.
          </p>
        </div>
        <ServerStatus waking={server.waking} unreachable={server.unreachable} />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <TripPanel
          open={sheetOpen}
          onToggle={() => setSheetOpen((open) => !open)}
          summary={planSummary(plan.data, plan.isFetching, plan.isError)}
        >
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
          <Attributions className="border-t pt-3 md:hidden" />
        </TripPanel>

        {/* On a phone the map fills the screen; the bottom padding keeps the slider above the lowered sheet. */}
        <main className="flex min-h-0 flex-1 flex-col max-md:pb-[calc(3.5rem_+_env(safe-area-inset-bottom,0px))]">
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

      <footer className="border-t px-4 py-1.5 max-md:hidden">
        <Attributions />
      </footer>
    </div>
  )
}

/** The data and tile providers' attribution lines; in the footer on a desktop, in the sheet on a phone. */
function Attributions({ className }: { className?: string }) {
  const link = 'underline underline-offset-2'
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)}>
      Routing by TomTom ·{' '}
      <a className={link} href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
        Powered by Geoapify
      </a>{' '}
      ·{' '}
      <a className={link} href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Weather data by Open-Meteo.com
      </a>{' '}
      (CC BY 4.0) · Map tiles by{' '}
      <a className={link} href="https://openfreemap.org/" target="_blank" rel="noreferrer">
        OpenFreeMap
      </a>
      , © OpenMapTiles, © OpenStreetMap contributors
    </p>
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

function MapPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
      <LoaderCircleIcon className="mr-2 size-4 animate-spin" /> Loading the map…
    </div>
  )
}
