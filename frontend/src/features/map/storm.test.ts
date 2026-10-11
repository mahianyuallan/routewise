import { describe, expect, it } from 'vitest'

import type { PlanResponse } from '@/api/client'

import { simulatedStorm, stormCentreAt, type Storm } from './storm'

const storm: Storm = {
  lat: 60,
  lon: -100,
  at_utc: '2026-10-13T12:00:00Z',
  peak_wind_mph: 52,
  peak_rain_in_hr: 0.8,
  wind_radius_miles: 150,
  rain_radius_miles: 60,
  drift_east_mph: 25,
}

describe('stormCentreAt', () => {
  it('is at the echoed centre at its time', () => {
    expect(stormCentreAt(storm, storm.at_utc)).toEqual([-100, 60])
  })

  it('drifts east by the drift speed, in degrees that shrink with latitude', () => {
    // At 60° a degree of longitude is half of 69.09 miles, so 25 miles is about 0.724°.
    const [lon, lat] = stormCentreAt(storm, '2026-10-13T13:00:00Z')
    expect(lat).toBe(60)
    expect(lon).toBeCloseTo(-100 + 25 / (69.093 / 2), 3)
  })

  it('was west of the centre before its time', () => {
    expect(stormCentreAt(storm, '2026-10-13T10:00:00Z')[0]).toBeLessThan(-100)
  })
})

describe('simulatedStorm', () => {
  const plan = (weather_source: 'forecast' | 'simulated', withStorm: boolean) =>
    ({ trip: { weather_source, storm: withStorm ? storm : null } }) as PlanResponse

  it('is the storm on a simulated plan and nothing on a forecast', () => {
    expect(simulatedStorm(plan('simulated', true))).toBe(storm)
    expect(simulatedStorm(plan('forecast', false))).toBeNull()
    expect(simulatedStorm(plan('forecast', true))).toBeNull()
    expect(simulatedStorm(undefined)).toBeNull()
  })
})
