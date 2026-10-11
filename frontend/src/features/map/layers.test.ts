import type { PickingInfo } from '@deck.gl/core'
import { describe, expect, it } from 'vitest'

import type { Checkpoint } from '@/api/client'

import { mapTooltip, type CheckpointDatum } from './layers'
import type { Truck } from './trucks'

const checkpoint: Checkpoint = {
  index: 17,
  mile: 425,
  lon: -97.61977,
  lat: 38.50834,
  eta_utc: '2026-10-12T01:01:58Z',
  miles_covered: 25,
  weather: { wind_mph: 51.1, gust_mph: 62.8, rain_in_hr: 0.66, snow_in_hr: 0 },
  level: 'no_travel',
  condition_levels: { wind: 'no_travel', rain: 'severe', snow: 'low' },
  load_rule: 2,
  reason: 'No Travel: 51.1 mph wind with a 35,000 lb load (load rule 2)',
}
const datum: CheckpointDatum = { checkpoint, route: 'A', selected: true }

function picked(object: unknown, layerId: string): PickingInfo {
  return { object, layer: { id: layerId } } as unknown as PickingInfo
}

function truck(overrides: Partial<Truck>): Truck {
  return {
    route: 'B',
    position: [-100, 35],
    mile: 412.4,
    lengthMiles: 805,
    status: 'driving',
    level: 'high',
    at: '2026-10-12T00:00:00Z',
    ...overrides,
  }
}

describe('mapTooltip', () => {
  it('shows a checkpoint with its ETA in the trip zone, the level and its reason', () => {
    const html = mapTooltip(picked(datum, 'checkpoints'), 'America/Chicago')?.html ?? ''
    expect(html).toContain('Route A · mile 425 · ETA 20:01 CDT')
    expect(html).toContain('load rule 2')
    expect(html).not.toContain('Simulated')
  })

  it('says the weather is simulated when it is', () => {
    expect(mapTooltip(picked(datum, 'checkpoints'), 'America/Chicago', true)?.html).toContain(
      'Simulated weather, not a forecast',
    )
  })

  it('shows where a truck is at the slider hour and the level of its stretch', () => {
    const html = mapTooltip(picked(truck({}), 'trucks'), 'America/Chicago')?.html ?? ''
    expect(html).toContain('Route B truck · 19:00 CDT')
    expect(html).toContain('Mile 412 of 805')
    expect(html).toContain('High stretch')
  })

  it('says when a truck has not left or has arrived', () => {
    const waiting = mapTooltip(
      picked(truck({ status: 'waiting', mile: 0 }), 'truck-discs'),
      'America/Chicago',
    )
    expect(waiting?.html).toContain('Waiting at the origin')
    expect(waiting?.html).not.toContain('stretch')
    const arrived = mapTooltip(picked(truck({ status: 'arrived', mile: 805 }), 'trucks'), 'America/Chicago')
    expect(arrived?.html).toContain('Arrived at the destination')
  })

  it('has nothing to say about other layers', () => {
    expect(mapTooltip(picked({}, 'risk-heatmap'), 'America/Chicago')).toBeNull()
    expect(mapTooltip(picked(undefined, 'checkpoints'), 'America/Chicago')).toBeNull()
  })
})
