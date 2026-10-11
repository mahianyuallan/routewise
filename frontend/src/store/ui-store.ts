import { create } from 'zustand'

export const MAX_HOUR = 48

interface UiState {
  /** Route label (A, B or C) focused on the map and in the cards. */
  selectedRoute: string | null
  /** Forecast hour on the slider, 0 (the departure hour) to 48. */
  hour: number
  heatmapOn: boolean
  selectRoute: (label: string | null) => void
  setHour: (hour: number) => void
  setHeatmapOn: (on: boolean) => void
}

/**
 * UI-only state. Components subscribe through selectors, so a slider tick re-renders only
 * the map layers and the time label, not the form or the route cards.
 */
export const useUiStore = create<UiState>((set) => ({
  selectedRoute: null,
  hour: 0,
  heatmapOn: true,
  selectRoute: (selectedRoute) => set({ selectedRoute }),
  setHour: (hour) => set({ hour: Math.max(0, Math.min(MAX_HOUR, Math.round(hour))) }),
  setHeatmapOn: (heatmapOn) => set({ heatmapOn }),
}))
