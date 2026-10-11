import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'

import { PlanError } from './PlanError'

describe('PlanError', () => {
  it('names the provider that ran out and points at simulated weather when it is the forecast', () => {
    const error = new ApiError(
      "Open-Meteo's hourly free quota is used up. Try again later this hour.",
      503,
      'provider_quota',
      'Open-Meteo',
    )
    render(<PlanError error={error} />)
    expect(screen.getByText('Open-Meteo is out of free quota')).toBeInTheDocument()
    expect(screen.getByText(/hourly free quota is used up/)).toBeInTheDocument()
    expect(screen.getByText(/Switch on Simulated weather/)).toBeInTheDocument()
  })

  it('does not suggest simulated weather when something else failed', () => {
    render(<PlanError error={new ApiError('No truck route between these places.', 422, 'no_route')} />)
    expect(screen.getByText('No truck route found')).toBeInTheDocument()
    expect(screen.queryByText(/Simulated weather/)).not.toBeInTheDocument()
  })

  it('shows unexpected errors as they are', () => {
    render(<PlanError error={new Error('Something odd')} />)
    expect(screen.getByText('Planning failed')).toBeInTheDocument()
    expect(screen.getByText('Something odd')).toBeInTheDocument()
  })
})
