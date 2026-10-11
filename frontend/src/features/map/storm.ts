import type { PlanResponse } from '@/api/client'
import type { Rgb } from '@/lib/risk'

import { EARTH_RADIUS_M, METERS_PER_MILE, type LonLat } from './geometry'

export type Storm = NonNullable<PlanResponse['trip']['storm']>

/** The storm's colour on the map ring, the legend and tooltips: amber, outside the risk palette. */
export const STORM_RGB: Rgb = [180, 83, 9]

/** Miles in one degree of latitude (and of longitude at the equator). */
const MILES_PER_DEGREE = (2 * Math.PI * EARTH_RADIUS_M) / 360 / METERS_PER_MILE

/** The plan's simulated storm, or null when the plan uses the forecast. */
export function simulatedStorm(plan: PlanResponse | undefined): Storm | null {
  return plan?.trip.weather_source === 'simulated' ? plan.trip.storm : null
}

/** Where the simulated storm's centre is at `iso`: it drifts due east from `at_utc`, as the API does. */
export function stormCentreAt(storm: Storm, iso: string): LonLat {
  const hours = (new Date(iso).getTime() - new Date(storm.at_utc).getTime()) / 3_600_000
  const milesPerDegreeLon = MILES_PER_DEGREE * Math.cos((storm.lat * Math.PI) / 180)
  return [storm.lon + (hours * storm.drift_east_mph) / milesPerDegreeLon, storm.lat]
}
