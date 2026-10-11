import type { Route } from '@/api/client'
import type { RiskLevel } from '@/lib/risk'

import { pointAlong, type LonLat } from './geometry'

export type TruckStatus = 'waiting' | 'driving' | 'arrived'

export interface Truck {
  route: string
  position: LonLat
  /** Miles from the origin, on the route's own distance scale. */
  mile: number
  lengthMiles: number
  status: TruckStatus
  /** Level of the checkpoint whose stretch of road the truck is on; null is No data. */
  level: RiskLevel | null
  /** The instant shown, as a UTC ISO string. */
  at: string
}

/**
 * Where a route's truck is at `at`. The mile comes from the checkpoints' ETAs (the same
 * truck- and traffic-aware times the risk uses), and the point is placed on that stretch's
 * own road geometry, so the marker stays on the road between checkpoints.
 */
export function truckAt(route: Route, at: string): Truck | null {
  const checkpoints = route.checkpoints
  if (checkpoints.length === 0) return null
  const t = new Date(at).getTime()
  const etas = checkpoints.map((c) => new Date(c.eta_utc).getTime())
  const last = checkpoints.length - 1

  let mile: number
  let status: TruckStatus = 'driving'
  if (t <= etas[0]) {
    mile = checkpoints[0].mile
    if (t < etas[0]) status = 'waiting'
  } else if (t >= etas[last]) {
    mile = checkpoints[last].mile
    status = 'arrived'
  } else {
    let i = 0
    while (etas[i + 1] < t) i++
    const span = etas[i + 1] - etas[i]
    const progress = span === 0 ? 0 : (t - etas[i]) / span
    mile = checkpoints[i].mile + progress * (checkpoints[i + 1].mile - checkpoints[i].mile)
  }

  // Each checkpoint's segment runs from the midpoint with its previous neighbour to the
  // midpoint with its next one, exactly as the API split the road.
  const midpoint = (k: number) => (checkpoints[k].mile + checkpoints[k + 1].mile) / 2
  let j = 0
  while (j < last && mile > midpoint(j)) j++
  const from = j === 0 ? checkpoints[0].mile : midpoint(j - 1)
  const to = j === last ? checkpoints[last].mile : midpoint(j)
  const path = route.segments[j]?.path ?? []
  const position: LonLat =
    path.length > 0
      ? pointAlong(path, to > from ? (mile - from) / (to - from) : 0)
      : [checkpoints[j].lon, checkpoints[j].lat]

  return {
    route: route.label,
    position,
    mile,
    lengthMiles: route.summary.length_miles,
    status,
    level: checkpoints[j].level,
    at,
  }
}
