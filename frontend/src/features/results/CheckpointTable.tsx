import type { Route } from '@/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber, formatWeekdayClock, zoneAbbreviation } from '@/lib/format'
import { levelColor, levelLabel } from '@/lib/risk'

interface Props {
  route: Route
  /** The trip's zone (the origin's); every ETA is shown in it. */
  timeZone: string
  originLabel: string
  simulated: boolean
}

function reading(value: number | null | undefined, digits: number): string {
  return value === null || value === undefined ? '—' : formatNumber(value, digits)
}

/** Every checkpoint of the selected route: where and when the truck is there, the weather, the level. */
export function CheckpointTable({ route, timeZone, originLabel, simulated }: Props) {
  if (route.checkpoints.length === 0) return null
  const zone = zoneAbbreviation(route.checkpoints[0].eta_utc, timeZone)
  const place = originLabel.split(',')[0]

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Route {route.label} checkpoints</CardTitle>
        <CardDescription className="text-xs">
          ETAs in {place} time ({zone}). Wind in mph, rain and snow in in/hr. Hover a row for the reason.
          {simulated && (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {' '}
              Simulated weather, not a forecast.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {/* `relative` makes this box the sr-only caption's containing block, so the caption is
            clipped here instead of stretching the page below the viewport. */}
        <div className="relative max-h-80 overflow-y-auto border-y">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">
              Checkpoints on Route {route.label}: mile, ETA, sustained wind, rain, snow and risk level
            </caption>
            <thead className="sticky top-0 z-10 bg-card text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                <th scope="col" className="py-1.5 pr-1.5 pl-4 text-right font-medium">
                  Mile
                </th>
                <th scope="col" className="px-1.5 py-1.5 text-left font-medium">
                  ETA
                </th>
                <th scope="col" className="px-1.5 py-1.5 text-right font-medium">
                  Wind
                </th>
                <th scope="col" className="px-1.5 py-1.5 text-right font-medium">
                  Rain
                </th>
                <th scope="col" className="px-1.5 py-1.5 text-right font-medium">
                  Snow
                </th>
                <th scope="col" className="py-1.5 pr-4 pl-1.5 text-left font-medium">
                  Risk
                </th>
              </tr>
            </thead>
            <tbody>
              {route.checkpoints.map((c) => (
                <tr key={c.index} title={c.reason} className="border-t first:border-t-0">
                  <td className="py-1 pr-1.5 pl-4 text-right">{formatNumber(c.mile)}</td>
                  <td className="px-1.5 py-1 whitespace-nowrap">{formatWeekdayClock(c.eta_utc, timeZone)}</td>
                  <td className="px-1.5 py-1 text-right">{reading(c.weather.wind_mph, 1)}</td>
                  <td className="px-1.5 py-1 text-right">{reading(c.weather.rain_in_hr, 2)}</td>
                  <td className="px-1.5 py-1 text-right">{reading(c.weather.snow_in_hr, 2)}</td>
                  <td className="py-1 pr-4 pl-1.5">
                    <span className="inline-flex items-baseline gap-1.5">
                      <span
                        className="size-2 shrink-0 -translate-y-px rounded-full"
                        style={{ background: levelColor(c.level) }}
                        aria-hidden
                      />
                      <span>
                        {levelLabel(c.level)}
                        {c.load_rule !== null && (
                          <span className="text-muted-foreground"> · rule {c.load_rule}</span>
                        )}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
