import { describe, expect, it } from 'vitest'

import {
  formatClock,
  formatDateTime,
  formatDuration,
  formatMiles,
  hoursBetween,
  nextFullHourLocal,
  offsetLabel,
} from './format'

describe('times in the origin zone', () => {
  it('shows a UTC instant as Chicago wall-clock time with its abbreviation', () => {
    expect(formatDateTime('2026-10-12T14:00:00Z', 'America/Chicago')).toBe('Mon 12 Oct, 09:00 CDT')
    expect(formatClock('2026-10-12T14:00:00Z', 'America/Chicago')).toBe('09:00 CDT')
  })

  it('switches to standard time after the clocks go back', () => {
    expect(formatClock('2026-11-02T14:00:00Z', 'America/Chicago')).toBe('08:00 CST')
  })

  it('never shows 24:00', () => {
    expect(formatClock('2026-10-12T05:00:00Z', 'America/Chicago')).toBe('00:00 CDT')
  })

  it('defaults the departure to the next full hour in the given zone', () => {
    const now = new Date('2026-10-11T16:20:00Z') // 11:20 CDT
    expect(nextFullHourLocal('America/Chicago', now)).toBe('2026-10-11T12:00')
    expect(nextFullHourLocal('UTC', now)).toBe('2026-10-11T17:00')
  })
})

describe('numbers', () => {
  it('formats durations like the API', () => {
    expect(formatDuration(12 * 3600 + 11 * 60)).toBe('12 h 11 min')
    expect(formatDuration(5 * 3600)).toBe('5 h 00 min')
    expect(formatDuration(25 * 60)).toBe('25 min')
  })

  it('formats miles with thousands separators', () => {
    expect(formatMiles(1033.3)).toBe('1,033 mi')
    expect(formatMiles(12.5, 1)).toBe('12.5 mi')
  })

  it('measures hours between instants and labels offsets', () => {
    expect(hoursBetween('2026-10-12T14:00:00Z', '2026-10-13T02:30:00Z')).toBe(12.5)
    expect(offsetLabel(6)).toBe('+6 h')
    expect(offsetLabel(0)).toBe('+0 h')
  })
})
