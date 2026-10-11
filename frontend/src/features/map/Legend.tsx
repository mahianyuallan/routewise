import { formatNumber } from '@/lib/format'
import { LEVELS, LEVEL_COLOR, LEVEL_LABEL, NO_DATA_COLOR, NO_DATA_LABEL } from '@/lib/risk'

interface Props {
  heatmapOn: boolean
  /** Set when the plan uses simulated weather: the storm ring's radius on the map. */
  stormRadiusMiles?: number | null
}

/** The one palette, named in text as well as colour, so risk is never shown by colour alone. */
export function Legend({ heatmapOn, stormRadiusMiles = null }: Props) {
  return (
    <div className="pointer-events-none absolute top-3 right-3 rounded-lg border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
      <div className="mb-1.5 font-medium">Risk level</div>
      <ul className="space-y-1">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: LEVEL_COLOR[level] }} aria-hidden />
            {LEVEL_LABEL[level]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: NO_DATA_COLOR }} aria-hidden />
          {NO_DATA_LABEL}
        </li>
      </ul>
      {heatmapOn && <div className="mt-2 border-t pt-1.5 text-muted-foreground">Heatmap: risk, smoothed</div>}
      {stormRadiusMiles !== null && (
        <div className="mt-2 space-y-1 border-t pt-1.5">
          <div className="flex items-center gap-2">
            {/* Same colour as the ring drawn on the map. */}
            <span
              className="size-3 rounded-full border-[1.5px]"
              style={{ borderColor: 'rgb(180 83 9)', background: 'rgb(180 83 9 / 0.12)' }}
              aria-hidden
            />
            Simulated storm, {formatNumber(stormRadiusMiles)} mi radius
          </div>
          <div className="font-medium text-amber-700 dark:text-amber-400">
            Simulated weather, not a forecast
          </div>
        </div>
      )}
    </div>
  )
}
