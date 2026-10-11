import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TripPanel } from './TripPanel'

describe('TripPanel', () => {
  it('shows the plan summary on its handle and toggles when the handle is tapped', () => {
    const onToggle = vi.fn()
    render(
      <TripPanel open={false} onToggle={onToggle} summary="Route B recommended">
        <p>Form and results</p>
      </TripPanel>,
    )
    const handle = screen.getByRole('button', { name: /Route B recommended/ })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(handle)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('hides its content on a phone only while lowered', () => {
    const { rerender } = render(
      <TripPanel open={false} onToggle={() => {}} summary="Plan a trip">
        <p>Form and results</p>
      </TripPanel>,
    )
    const panel = screen.getByText('Form and results').parentElement!
    expect(panel).toHaveClass('max-md:hidden')
    rerender(
      <TripPanel open onToggle={() => {}} summary="Plan a trip">
        <p>Form and results</p>
      </TripPanel>,
    )
    expect(panel).not.toHaveClass('max-md:hidden')
    expect(screen.getByRole('button', { name: /Plan a trip/ })).toHaveAttribute('aria-expanded', 'true')
  })
})
