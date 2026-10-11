import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Legend } from './Legend'

describe('Legend', () => {
  it('names every risk level and says the risk heatmap is smoothed', () => {
    render(<Legend heatmapOn heatmapMetric="risk" />)
    for (const label of ['Low', 'Moderate', 'High', 'Severe', 'No Travel', 'No data']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Heatmap: risk, smoothed')).toBeInTheDocument()
  })

  it('shows a weather reading with its unit and the rule thresholds marked', () => {
    render(<Legend heatmapOn heatmapMetric="wind" />)
    expect(screen.getByText(/sustained wind in mph/)).toBeInTheDocument()
    for (const tick of ['0', '25', '35', '45', '55+']) expect(screen.getByText(tick)).toBeInTheDocument()
  })

  it('formats rain and snow thresholds to their precision', () => {
    const { unmount } = render(<Legend heatmapOn heatmapMetric="rain" />)
    for (const tick of ['0.10', '0.25', '0.50', '1.00+']) expect(screen.getByText(tick)).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument() // would run into 0.10
    unmount()
    render(<Legend heatmapOn heatmapMetric="snow" />)
    for (const tick of ['0.5', '1.0', '2.0', '3.0+']) expect(screen.getByText(tick)).toBeInTheDocument()
  })

  it('folds into a button on a phone, which opens and closes it', () => {
    render(<Legend heatmapOn heatmapMetric="risk" />)
    const toggle = screen.getByRole('button', { name: 'Legend' })
    const panel = document.getElementById('map-legend')!
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).toHaveClass('max-md:hidden')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide legend' })).toHaveAttribute('aria-expanded', 'true')
    expect(panel).not.toHaveClass('max-md:hidden')
  })

  it('leaves the heatmap out when it is off', () => {
    render(<Legend heatmapOn={false} heatmapMetric="wind" />)
    expect(screen.queryByText(/Heatmap/)).not.toBeInTheDocument()
  })
})
