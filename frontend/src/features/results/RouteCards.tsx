import { Fragment } from 'react'

import type { PlanResponse, Route } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { simulatedStorm } from '@/features/map/storm'
import { formatDateTime, formatDuration, formatMiles, formatNumber } from '@/lib/format'
import { LEVELS, LEVEL_COLOR, LEVEL_LABEL, NO_DATA_COLOR, levelLabel } from '@/lib/risk'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui-store'

import { CheckpointTable } from './CheckpointTable'

const SOURCE_LABEL: Record<Route['source'], string> = {
  fastest: 'fastest',
  alternative: 'alternative',
  eco: 'eco',
  short: 'short',
  via: 'via a different corridor',
}

interface Props {
  plan: PlanResponse
  dimmed: boolean
}

/**
 * One card per route, best first. Selecting a card focuses that route on the map and opens
 * its checkpoint table under the card.
 */
export function RouteCards({ plan, dimmed }: Props) {
  const selectedRoute = useUiStore((s) => s.selectedRoute)
  const selectRoute = useUiStore((s) => s.selectRoute)
  const routes = [...plan.routes].sort((a, b) => a.rank - b.rank)
  const simulated = simulatedStorm(plan) !== null

  return (
    <div className={cn('space-y-3 transition-opacity', dimmed && 'opacity-50')} aria-busy={dimmed}>
      {routes.map((route) => (
        <Fragment key={route.label}>
          <RouteCard
            route={route}
            timeZone={plan.trip.timezone}
            selected={route.label === selectedRoute}
            simulated={simulated}
            onSelect={() => selectRoute(route.label)}
          />
          {route.label === selectedRoute && (
            <CheckpointTable
              route={route}
              timeZone={plan.trip.timezone}
              originLabel={plan.trip.origin.label}
              simulated={simulated}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

interface CardProps {
  route: Route
  timeZone: string
  selected: boolean
  simulated: boolean
  onSelect: () => void
}

function RouteCard({ route, timeZone, selected, simulated, onSelect }: CardProps) {
  const miles = route.score.miles_by_level
  const total = LEVELS.reduce((sum, level) => sum + miles[level], 0) + route.score.no_data_miles

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={cn('cursor-pointer gap-3 py-4 transition-shadow', selected && 'ring-2 ring-primary')}
    >
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>Route {route.label}</span>
          <span className="text-xs font-normal text-muted-foreground">
            #{route.rank} · {SOURCE_LABEL[route.source]}
          </span>
          {route.recommended && <Badge>Recommended</Badge>}
          {simulated && (
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
              Simulated weather
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>{formatMiles(route.summary.length_miles)}</span>
          <span>{formatDuration(route.summary.travel_time_s)}</span>
          <span className="text-muted-foreground">
            arrives {formatDateTime(route.summary.arrival_utc, timeZone)}
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {LEVELS.map((level) =>
            miles[level] > 0 ? (
              <div
                key={level}
                style={{ width: `${(miles[level] / total) * 100}%`, background: LEVEL_COLOR[level] }}
              />
            ) : null,
          )}
          {route.score.no_data_miles > 0 && (
            <div
              style={{ width: `${(route.score.no_data_miles / total) * 100}%`, background: NO_DATA_COLOR }}
            />
          )}
        </div>

        <dl className="grid grid-cols-5 gap-1 text-xs">
          {LEVELS.map((level) => (
            <div key={level}>
              <dt className="text-muted-foreground">{LEVEL_LABEL[level]}</dt>
              <dd className="font-medium tabular-nums">{formatNumber(miles[level])} mi</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Worst: <span className="font-medium text-foreground">{levelLabel(route.score.worst_level)}</span>
          </span>
          <span>
            Average risk:{' '}
            <span className="font-medium text-foreground">
              {route.score.average_risk === null ? '—' : formatNumber(route.score.average_risk, 2)}
            </span>
          </span>
          {!route.score.complete && (
            <span className="text-destructive">
              No weather data for {formatMiles(route.score.no_data_miles)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
