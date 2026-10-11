import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PlanResponse, Route } from '@/api/client'
import { useUiStore } from '@/store/ui-store'

import { RouteCards } from './RouteCards'

function route(label: string, rank: number, overrides: Partial<Route['score']> = {}): Route {
  return {
    label,
    source: 'fastest',
    rank,
    recommended: rank === 1,
    summary: {
      length_miles: 882.9,
      travel_time_s: 12 * 3600 + 11 * 60,
      arrival_utc: '2026-10-13T02:11:00Z',
      traffic_delay_s: 0,
    },
    score: {
      miles_by_level: { low: 852.9, moderate: 30, high: 0, severe: 0, no_travel: 0 },
      no_data_miles: 0,
      average_risk: 0.03,
      worst_level: 'moderate',
      complete: true,
      has_no_travel: false,
      ...overrides,
    },
    checkpoints: [],
    segments: [],
    outline: [],
  }
}

const plan: PlanResponse = {
  trip: {
    origin: { label: 'Dallas, TX', lat: 32.78, lon: -96.8, timezone: 'America/Chicago' },
    destination: { label: 'Denver, CO', lat: 39.74, lon: -104.99, timezone: 'America/Denver' },
    timezone: 'America/Chicago',
    departure_utc: '2026-10-12T14:00:00Z',
    load_lb: 20000,
    spacing_requested: 25,
    spacing_miles: 25,
    weather_source: 'forecast',
    storm: null,
  },
  notices: [],
  routes: [
    route('A', 2),
    route('B', 1),
    route('C', 3, { complete: false, no_data_miles: 50, average_risk: null, worst_level: null }),
  ],
  ranking: ['B', 'A', 'C'],
  recommendation: { status: 'recommended', route: 'B', rule: 'travel_time', message: 'Shortest travel time' },
}

describe('RouteCards', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRoute: 'B' })
  })

  it('lists routes best first, with the badge on the recommended one', () => {
    render(<RouteCards plan={plan} dimmed={false} />)
    const cards = screen.getAllByRole('button')
    expect(cards.map((card) => within(card).getByText(/^Route [ABC]$/).textContent)).toEqual([
      'Route B',
      'Route A',
      'Route C',
    ])
    expect(within(cards[0]).getByText('Recommended')).toBeInTheDocument()
    expect(within(cards[1]).queryByText('Recommended')).not.toBeInTheDocument()
  })

  it('shows distance, time, arrival in the origin zone, and miles at each level', () => {
    render(<RouteCards plan={plan} dimmed={false} />)
    const first = screen.getAllByRole('button')[0]
    expect(within(first).getByText('883 mi')).toBeInTheDocument()
    expect(within(first).getByText('12 h 11 min')).toBeInTheDocument()
    expect(within(first).getByText(/arrives Mon 12 Oct, 21:11 CDT/)).toBeInTheDocument()
    expect(within(first).getByText('853 mi')).toBeInTheDocument()
    expect(within(first).getByText('30 mi')).toBeInTheDocument()
  })

  it('says when a route is missing weather data', () => {
    render(<RouteCards plan={plan} dimmed={false} />)
    const last = screen.getAllByRole('button')[2]
    expect(within(last).getByText(/No weather data for 50 mi/)).toBeInTheDocument()
    expect(within(last).getByText('No data')).toBeInTheDocument()
  })

  it('selects a route when its card is clicked', async () => {
    render(<RouteCards plan={plan} dimmed={false} />)
    await userEvent.click(screen.getAllByRole('button')[1])
    expect(useUiStore.getState().selectedRoute).toBe('A')
  })

  it('labels every card when the weather is simulated', () => {
    const storm = {
      lat: 36.2,
      lon: -101.4,
      at_utc: '2026-10-12T20:00:00Z',
      peak_wind_mph: 52,
      peak_rain_in_hr: 0.8,
      wind_radius_miles: 150,
      rain_radius_miles: 60,
      drift_east_mph: 25,
    }
    render(
      <RouteCards
        plan={{ ...plan, trip: { ...plan.trip, weather_source: 'simulated', storm } }}
        dimmed={false}
      />,
    )
    expect(screen.getAllByText('Simulated weather')).toHaveLength(3)
  })

  it('has no simulated label on a forecast', () => {
    render(<RouteCards plan={plan} dimmed={false} />)
    expect(screen.queryByText('Simulated weather')).not.toBeInTheDocument()
  })
})
