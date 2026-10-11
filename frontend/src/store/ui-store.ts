import { useEffect } from 'react'
import { create } from 'zustand'

export const MAX_HOUR = 48
/** Playback advances one forecast hour per step. */
export const PLAY_STEP_MS = 400

interface UiState {
  /** Route label (A, B or C) focused on the map and in the cards. */
  selectedRoute: string | null
  /** Forecast hour on the slider, 0 (the departure hour) to 48. */
  hour: number
  heatmapOn: boolean
  /** True while the slider plays forward on its own. */
  playing: boolean
  selectRoute: (label: string | null) => void
  setHour: (hour: number) => void
  setHeatmapOn: (on: boolean) => void
  setPlaying: (playing: boolean) => void
}

/**
 * UI-only state. Components subscribe through selectors, so a slider tick re-renders only
 * the map layers and the time label, not the form or the route cards.
 */
export const useUiStore = create<UiState>((set) => ({
  selectedRoute: null,
  hour: 0,
  heatmapOn: true,
  playing: false,
  selectRoute: (selectedRoute) => set({ selectedRoute }),
  setHour: (hour) => set({ hour: Math.max(0, Math.min(MAX_HOUR, Math.round(hour))) }),
  setHeatmapOn: (heatmapOn) => set({ heatmapOn }),
  setPlaying: (playing) => set({ playing }),
}))

/**
 * While `active`, moves the slider forward one hour every PLAY_STEP_MS and stops at +48 h.
 * Each step only changes the hour index, so playback makes no requests.
 */
export function usePlayback(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      const { hour, setHour, setPlaying } = useUiStore.getState()
      const next = Math.min(MAX_HOUR, hour + 1)
      setHour(next)
      if (next >= MAX_HOUR) setPlaying(false)
    }, PLAY_STEP_MS)
    return () => window.clearInterval(timer)
  }, [active])
}
