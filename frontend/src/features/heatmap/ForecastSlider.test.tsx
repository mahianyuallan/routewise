import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HeatmapResponse, PlanResponse } from '@/api/client'
import { MAX_HOUR, PLAY_STEP_MS, useUiStore } from '@/store/ui-store'

import { ForecastSlider } from './ForecastSlider'

const DEPARTURE = Date.parse('2026-10-12T14:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')

const plan = {
  trip: {
    origin: { label: 'Dallas, TX', lat: 32.78, lon: -96.8, timezone: 'America/Chicago' },
    destination: { label: 'Denver, CO', lat: 39.74, lon: -104.99, timezone: 'America/Denver' },
    timezone: 'America/Chicago',
    departure_utc: iso(DEPARTURE),
    load_lb: 20000,
    spacing_requested: 25,
    spacing_miles: 25,
    weather_source: 'forecast',
    storm: null,
  },
  notices: [],
  routes: [],
  ranking: [],
  recommendation: { status: 'recommended', route: null, rule: null, message: '' },
} satisfies PlanResponse

const heatmap: HeatmapResponse = {
  hours: Array.from({ length: MAX_HOUR + 1 }, (_, h) => iso(DEPARTURE + h * 3_600_000)),
  points: [],
  levels: [],
  wind_mph: [],
  rain_in_hr: [],
  snow_in_hr: [],
  corridor_miles: 25,
}

const hour = () => useUiStore.getState().hour
const step = (steps: number) => act(() => vi.advanceTimersByTime(steps * PLAY_STEP_MS))

describe('ForecastSlider playback', () => {
  beforeAll(() => {
    // Radix measures its slider and switch; jsdom has no ResizeObserver.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    useUiStore.setState({ hour: 0, playing: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays one hour per step and stops at +48 h', () => {
    render(<ForecastSlider plan={plan} heatmap={heatmap} loading={false} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    step(3)
    expect(hour()).toBe(3)
    step(MAX_HOUR)
    expect(hour()).toBe(MAX_HOUR)
    expect(useUiStore.getState().playing).toBe(false)
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  })

  it('starts over from the departure hour when played at the end, and pauses', () => {
    useUiStore.setState({ hour: MAX_HOUR })
    render(<ForecastSlider plan={plan} heatmap={heatmap} loading={false} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(hour()).toBe(0)
    step(2)
    expect(hour()).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    step(5)
    expect(hour()).toBe(2)
  })

  it('switches the heatmap between risk and the weather readings', () => {
    useUiStore.setState({ heatmapOn: true, heatmapMetric: 'risk' })
    render(<ForecastSlider plan={plan} heatmap={heatmap} loading={false} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Rain' }))
    expect(useUiStore.getState().heatmapMetric).toBe('rain')
  })

  it('disables the metric switch while the heatmap is off', () => {
    useUiStore.setState({ heatmapOn: false })
    render(<ForecastSlider plan={plan} heatmap={heatmap} loading={false} />)
    expect(screen.getByRole('radio', { name: 'Wind' })).toBeDisabled()
  })

  it('cannot play before the heatmap has loaded', () => {
    render(<ForecastSlider plan={plan} heatmap={undefined} loading />)
    expect(screen.getByRole('button', { name: /play/i })).toBeDisabled()
  })
})
