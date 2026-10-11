import { describe, expect, it } from 'vitest'

import type { PlanResponse } from '@/api/client'

import { planSummary } from './plan-summary'

function planWith(recommendation: PlanResponse['recommendation']): PlanResponse {
  return { recommendation } as PlanResponse
}

describe('planSummary', () => {
  it('says what to do before there is a plan, and while one is on its way', () => {
    expect(planSummary(undefined, false, false)).toBe('No trip planned yet')
    expect(planSummary(undefined, true, false)).toBe('Planning routes…')
    expect(planSummary(undefined, false, true)).toBe('Planning failed')
  })

  it('names the recommended route, or says why there is none', () => {
    const rec = { status: 'recommended', route: 'B', rule: 'travel_time', message: '' } as const
    expect(planSummary(planWith(rec), false, false)).toBe('Route B recommended')
    expect(planSummary(planWith({ ...rec, status: 'no_safe_route', route: null }), false, false)).toBe(
      'No safe route at this departure time',
    )
    expect(planSummary(planWith({ ...rec, status: 'no_complete_route', route: null }), false, false)).toBe(
      'No recommendation',
    )
  })
})
