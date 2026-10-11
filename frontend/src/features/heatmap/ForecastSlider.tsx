import type { HeatmapResponse, PlanResponse } from '@/api/client'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { formatDateTime, hoursBetween, offsetLabel } from '@/lib/format'
import { MAX_HOUR, useUiStore } from '@/store/ui-store'

interface Props {
  plan: PlanResponse
  heatmap: HeatmapResponse | undefined
  loading: boolean
}

/**
 * Scrubs the corridor heatmap from the departure hour to +48 h. Moving the thumb changes one
 * index in the store; the frames are already in memory, so no request is made.
 */
export function ForecastSlider({ plan, heatmap, loading }: Props) {
  const hour = useUiStore((s) => s.hour)
  const setHour = useUiStore((s) => s.setHour)
  const heatmapOn = useUiStore((s) => s.heatmapOn)
  const setHeatmapOn = useUiStore((s) => s.setHeatmapOn)

  const start = heatmap?.hours[0] ?? plan.trip.departure_utc
  const lastArrival = plan.routes.reduce(
    (latest, route) => (route.summary.arrival_utc > latest ? route.summary.arrival_utc : latest),
    plan.trip.departure_utc,
  )
  const departureOffset = hoursBetween(start, plan.trip.departure_utc)
  const arrivalOffset = Math.min(MAX_HOUR, hoursBetween(start, lastArrival))
  const label = heatmap ? formatDateTime(heatmap.hours[hour], plan.trip.timezone) : '…'

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-2">
          <Switch id="heatmap-toggle" checked={heatmapOn} onCheckedChange={setHeatmapOn} />
          <Label htmlFor="heatmap-toggle">Weather risk heatmap</Label>
          {loading && <span className="text-xs text-muted-foreground">loading…</span>}
        </div>
        <div className="font-medium tabular-nums" aria-live="polite">
          {label} <span className="text-muted-foreground">({offsetLabel(hour)})</span>
        </div>
      </div>
      <div className="relative py-1">
        {/* The trip's window, departure to the last arrival, shaded behind the track. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-primary/15"
          style={{
            left: `${(departureOffset / MAX_HOUR) * 100}%`,
            width: `${((arrivalOffset - departureOffset) / MAX_HOUR) * 100}%`,
          }}
        />
        <Slider
          aria-label="Forecast hour"
          min={0}
          max={MAX_HOUR}
          step={1}
          value={[hour]}
          onValueChange={([value]) => setHour(value)}
          disabled={!heatmap}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Departure</span>
        <span>Arrival {offsetLabel(Math.round(arrivalOffset))}</span>
        <span>+48 h</span>
      </div>
    </div>
  )
}
