import type { PickingInfo } from '@deck.gl/core'
import { describe, expect, it } from 'vitest'

import type { Checkpoint } from '@/api/client'

import { checkpointTooltip, type CheckpointDatum } from './layers'

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
const info = { object: datum, layer: { id: 'checkpoints' } } as unknown as PickingInfo

describe('checkpointTooltip', () => {
  it('shows the ETA in the trip zone, the level and its reason', () => {
    const html = checkpointTooltip(info, 'America/Chicago')?.html ?? ''
    expect(html).toContain('Route A · mile 425 · ETA 20:01 CDT')
    expect(html).toContain('load rule 2')
    expect(html).not.toContain('Simulated')
  })

  it('says the weather is simulated when it is', () => {
    expect(checkpointTooltip(info, 'America/Chicago', true)?.html).toContain(
      'Simulated weather, not a forecast',
    )
  })
})
