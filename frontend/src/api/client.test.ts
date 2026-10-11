import { describe, expect, it } from 'vitest'

import { ApiError } from './client'

describe('ApiError.retriable', () => {
  it('retries network failures and server errors', () => {
    expect(new ApiError("Can't reach the server.", 0, 'network').retriable).toBe(true)
    expect(
      new ApiError('Open-Meteo is not responding.', 503, 'provider_unavailable', 'Open-Meteo').retriable,
    ).toBe(true)
  })

  it('never retries a quota refusal or a bad request', () => {
    expect(new ApiError('Quota used up.', 503, 'provider_quota', 'Open-Meteo').retriable).toBe(false)
    expect(new ApiError('Check the trip.', 400, 'validation').retriable).toBe(false)
  })
})
