import { useState } from 'react'

import { formatNumber } from '@/lib/format'
import {
  SEQUENTIAL_BLUE,
  WEATHER_SCALES,
  legendGradient,
  type HeatmapMetric,
  type WeatherScale,
} from '@/lib/heatmap-metrics'
import { LEVELS, LEVEL_COLOR, LEVEL_LABEL, NO_DATA_COLOR, NO_DATA_LABEL } from '@/lib/risk'
import { cn } from '@/lib/utils'

import { STORM_RGB } from './storm'

interface Props {
  heatmapOn: boolean
  heatmapMetric?: HeatmapMetric
  /** Set when the plan uses simulated weather: the storm ring's radius on the map. */
  stormRadiusMiles?: number | null
}

/**
 * The one palette, named in text as well as colour, so risk is never shown by colour alone.
 * On a phone it folds into a button, so it doesn't cover a third of the map.
 */
export function Legend({ heatmapOn, heatmapMetric = 'risk', stormRadiusMiles = null }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="map-legend"
        className="pointer-events-auto rounded-md border bg-background/95 px-2.5 py-1 text-xs font-medium shadow-sm select-none active:bg-muted md:hidden"
      >
        {open ? 'Hide legend' : 'Legend'}
      </button>
      <div
        id="map-legend"
        className={cn(
          'rounded-lg border bg-background/95 p-3 text-xs shadow-sm backdrop-blur',
          !open && 'max-md:hidden',
        )}
      >
        <LegendBody heatmapOn={heatmapOn} heatmapMetric={heatmapMetric} stormRadiusMiles={stormRadiusMiles} />
      </div>
    </div>
  )
}

function LegendBody({ heatmapOn, heatmapMetric, stormRadiusMiles }: Required<Props>) {
  return (
    <>
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
      {heatmapOn &&
        (heatmapMetric === 'risk' ? (
          <div className="mt-2 border-t pt-1.5 text-muted-foreground">Heatmap: risk, smoothed</div>
        ) : (
          <WeatherScaleLegend scale={WEATHER_SCALES[heatmapMetric]} />
        ))}
      {stormRadiusMiles !== null && (
        <div className="mt-2 space-y-1 border-t pt-1.5">
          <div className="flex items-center gap-2">
            <span
              className="size-3 rounded-full border-[1.5px]"
              style={{
                borderColor: `rgb(${STORM_RGB.join(' ')})`,
                background: `rgb(${STORM_RGB.join(' ')} / 0.12)`,
              }}
              aria-hidden
            />
            Simulated storm, {formatNumber(stormRadiusMiles)} mi radius
          </div>
          <div className="font-medium text-amber-700 dark:text-amber-400">
            Simulated weather, not a forecast
          </div>
        </div>
      )}
    </>
  )
}

/** A weather reading's scale: the blue bar as the map draws it, with the rule thresholds marked. */
function WeatherScaleLegend({ scale }: { scale: WeatherScale }) {
  const format = (value: number) => formatNumber(value, scale.digits)
  const at = (value: number) => `${(value / scale.max) * 100}%`
  // Rain's first threshold sits a tenth of the way along; a "0" there would run into it.
  const showZero = scale.ticks[0] / scale.max >= 0.15
  return (
    <div className="mt-2 w-44 border-t pt-1.5">
      <div className="mb-1 text-muted-foreground">
        Heatmap: {scale.label.toLowerCase()} in {scale.unit}, smoothed
      </div>
      <div
        className="relative h-2.5 rounded-sm"
        style={{ background: legendGradient(SEQUENTIAL_BLUE) }}
        aria-hidden
      >
        {scale.ticks.map((tick) => (
          <span key={tick} className="absolute inset-y-0 w-px bg-white/80" style={{ left: at(tick) }} />
        ))}
      </div>
      <div className="relative mt-0.5 h-3.5 text-[10px] text-muted-foreground tabular-nums">
        {showZero && <span className="absolute left-0">0</span>}
        {scale.ticks.map((tick) => (
          <span key={tick} className="absolute -translate-x-1/2" style={{ left: at(tick) }}>
            {format(tick)}
          </span>
        ))}
        <span className="absolute right-0">{format(scale.max)}+</span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        Marks: Moderate, High and Severe thresholds. Darkest: No Travel.
      </div>
    </div>
  )
}
