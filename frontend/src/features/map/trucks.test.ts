import { describe, expect, it } from 'vitest'

import type { Checkpoint, Route } from '@/api/client'

import { truckAt } from './trucks'

// Along the 35th parallel, one mile is about 0.01767 degrees of longitude.
const DEG_PER_MILE = 1 / (69.093 * Math.cos((35 * Math.PI) / 180))
const lonAt = (mile: number) => -100 + mile * DEG_PER_MILE

function checkpoint(index: number, mile: number, eta: string, level: Checkpoint['level']): Checkpoint {
  return {
    index,
    mile,
    lon: lonAt(mile),
    lat: 35,
    eta_utc: eta,
    miles_covered: 10,
    weather: { wind_mph: 10, gust_mph: 15, rain_in_hr: 0, snow_in_hr: 0 },
    level,
    condition_levels: { wind: level, rain: 'low', snow: 'low' },
    load_rule: null,
    reason: '',
  }
}

/** A stretch of road along the parallel, from one mile mark to another. */
function stretch(from: number, to: number): number[][] {
  return [
    [lonAt(from), 35],
    [lonAt((from + to) / 2), 35],
    [lonAt(to), 35],
  ]
}

const route: Route = {
  label: 'A',
  source: 'fastest',
  rank: 1,
  recommended: true,
  summary: { length_miles: 20, travel_time_s: 1200, arrival_utc: '2026-10-12T14:20:00Z', traffic_delay_s: 0 },
  score: {
    miles_by_level: { low: 10, moderate: 0, high: 10, severe: 0, no_travel: 0 },
    no_data_miles: 0,
    average_risk: 1,
    worst_level: 'high',
    complete: true,
    has_no_travel: false,
  },
  checkpoints: [
    checkpoint(0, 0, '2026-10-12T14:00:00Z', 'low'),
    checkpoint(1, 10, '2026-10-12T14:10:00Z', 'high'),
    checkpoint(2, 20, '2026-10-12T14:20:00Z', 'low'),
  ],
  // Segments run midpoint to midpoint: miles 0 to 5, 5 to 15 and 15 to 20.
  segments: [
    { checkpoint: 0, level: 'low', path: stretch(0, 5) },
    { checkpoint: 1, level: 'high', path: stretch(5, 15) },
    { checkpoint: 2, level: 'low', path: stretch(15, 20) },
  ],
  outline: [],
}

describe('truckAt', () => {
  it('waits at the origin before departure', () => {
    const truck = truckAt(route, '2026-10-12T13:30:00Z')!
    expect(truck.status).toBe('waiting')
    expect(truck.mile).toBe(0)
    expect(truck.position).toEqual([-100, 35])
  })

  it('moves along the road at the pace of the checkpoint ETAs', () => {
    const truck = truckAt(route, '2026-10-12T14:12:00Z')!
    expect(truck.status).toBe('driving')
    expect(truck.mile).toBeCloseTo(12)
    expect(truck.position[0]).toBeCloseTo(lonAt(12), 4)
    expect(truck.position[1]).toBeCloseTo(35, 6)
  })

  it('takes the level of the checkpoint whose stretch it is on', () => {
    expect(truckAt(route, '2026-10-12T14:04:00Z')!.level).toBe('low') // mile 4: first stretch
    expect(truckAt(route, '2026-10-12T14:06:00Z')!.level).toBe('high') // mile 6: second stretch
    expect(truckAt(route, '2026-10-12T14:16:00Z')!.level).toBe('low') // mile 16: last stretch
  })

  it('stays at the destination once it has arrived', () => {
    const truck = truckAt(route, '2026-10-12T18:00:00Z')!
    expect(truck.status).toBe('arrived')
    expect(truck.mile).toBe(20)
    expect(truck.position[0]).toBeCloseTo(lonAt(20), 6)
  })

  it('has no truck for a route without checkpoints', () => {
    expect(truckAt({ ...route, checkpoints: [] }, '2026-10-12T14:00:00Z')).toBeNull()
  })
})
