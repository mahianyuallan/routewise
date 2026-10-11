import type { PlanResponse } from '@/api/client'

import type { LonLat } from './geometry'

export type Storm = NonNullable<PlanResponse['trip']['storm']>

export const METERS_PER_MILE = 1609.344
/** Miles in one degree of latitude (and of longitude at the equator). */
const MILES_PER_DEGREE = (2 * Math.PI * 6_371_008.8) / 360 / METERS_PER_MILE

/** Where the simulated storm's centre is at `iso`: it drifts due east from `at_utc`, as the API does. */
export function stormCentreAt(storm: Storm, iso: string): LonLat {
  const hours = (new Date(iso).getTime() - new Date(storm.at_utc).getTime()) / 3_600_000
  const milesPerDegreeLon = MILES_PER_DEGREE * Math.cos((storm.lat * Math.PI) / 180)
  return [storm.lon + (hours * storm.drift_east_mph) / milesPerDegreeLon, storm.lat]
}
