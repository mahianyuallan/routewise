import { describe, expect, it } from 'vitest'

import { ApiError, isForecastError } from './client'

describe('isForecastError', () => {
  it('is true only when the weather provider failed', () => {
    expect(isForecastError(new ApiError('Quota used up.', 503, 'provider_quota', 'Open-Meteo'))).toBe(true)
    expect(isForecastError(new ApiError('Busy.', 503, 'provider_unavailable', 'TomTom'))).toBe(false)
    expect(isForecastError(new Error('Open-Meteo'))).toBe(false)
  })
})

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
