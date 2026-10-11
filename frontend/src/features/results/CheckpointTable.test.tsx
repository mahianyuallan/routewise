import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Checkpoint, Route } from '@/api/client'

import { CheckpointTable } from './CheckpointTable'

function checkpoint(
  index: number,
  mile: number,
  eta: string,
  overrides: Partial<Checkpoint> = {},
): Checkpoint {
  return {
    index,
    mile,
    lon: -97,
    lat: 33,
    eta_utc: eta,
    miles_covered: 25,
    weather: { wind_mph: 12.34, gust_mph: 20, rain_in_hr: 0, snow_in_hr: 0 },
    level: 'low',
    condition_levels: { wind: 'low', rain: 'low', snow: 'low' },
    load_rule: null,
    reason: 'Low: wind, rain and snow are all below Moderate',
    ...overrides,
  }
}

const route: Route = {
  label: 'A',
  source: 'fastest',
  rank: 1,
  recommended: true,
  summary: { length_miles: 50, travel_time_s: 3600, arrival_utc: '2026-10-13T05:10:00Z', traffic_delay_s: 0 },
  score: {
    miles_by_level: { low: 12.5, moderate: 0, high: 0, severe: 0, no_travel: 25 },
    no_data_miles: 12.5,
    average_risk: null,
    worst_level: null,
    complete: false,
    has_no_travel: true,
  },
  checkpoints: [
    checkpoint(0, 0, '2026-10-12T14:00:00Z'),
    checkpoint(1, 25, '2026-10-12T14:25:00Z', {
      weather: { wind_mph: 48, gust_mph: 60, rain_in_hr: 0.75, snow_in_hr: 0 },
      level: 'no_travel',
      load_rule: 2,
      reason: 'No Travel: 48.0 mph wind with a 35,000 lb load (load rule 2)',
    }),
    checkpoint(2, 50, '2026-10-13T05:10:00Z', {
      weather: { wind_mph: null, gust_mph: null, rain_in_hr: null, snow_in_hr: null },
      level: null,
      condition_levels: { wind: null, rain: null, snow: null },
      reason: 'No data: the forecast is missing wind and rain and snow',
    }),
  ],
  segments: [],
  outline: [],
}

function rows() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    )
}

describe('CheckpointTable', () => {
  it('lists every checkpoint with its mile, ETA in the trip zone, readings and level in words', () => {
    render(
      <CheckpointTable route={route} timeZone="America/Chicago" originLabel="Dallas, TX" simulated={false} />,
    )
    expect(screen.getByText(/ETAs in Dallas time \(CDT\)/)).toBeInTheDocument()
    expect(rows()[0]).toEqual(['0', 'Mon 09:00', '12.3', '0.00', '0.00', 'Low'])
  })

  it('names the load rule behind a level, with the reason on hover', () => {
    render(
      <CheckpointTable route={route} timeZone="America/Chicago" originLabel="Dallas, TX" simulated={false} />,
    )
    expect(rows()[1]).toEqual(['25', 'Mon 09:25', '48.0', '0.75', '0.00', 'No Travel · rule 2'])
    expect(screen.getAllByRole('row')[2]).toHaveAttribute('title', expect.stringContaining('load rule 2'))
  })

  it('shows dashes and No data when the forecast is missing', () => {
    render(
      <CheckpointTable route={route} timeZone="America/Chicago" originLabel="Dallas, TX" simulated={false} />,
    )
    expect(rows()[2]).toEqual(['50', 'Tue 00:10', '—', '—', '—', 'No data'])
  })

  it('says when the weather is simulated', () => {
    render(<CheckpointTable route={route} timeZone="America/Chicago" originLabel="Dallas, TX" simulated />)
    expect(screen.getByText(/Simulated weather, not a forecast/)).toBeInTheDocument()
  })
})
