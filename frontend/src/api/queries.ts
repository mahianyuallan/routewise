import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  checkHealth,
  fetchHeatmap,
  isApiError,
  planTrip,
  searchPlaces,
  type HeatmapRequest,
  type PlanRequest,
  type PlanResponse,
} from './client'

const FIFTEEN_MINUTES = 15 * 60_000
const ONE_DAY = 24 * 60 * 60_000

/** Retry once, and only when the server or the network was at fault; never retry a 4xx. */
function retryServerErrorsOnce(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isApiError(error) && error.retriable
}

export function usePlan(trip: PlanRequest | null) {
  return useQuery({
    queryKey: ['plan', trip],
    queryFn: ({ signal }) => planTrip(trip!, signal),
    enabled: trip !== null,
    // The previous plan stays on screen, dimmed, while a changed trip is re-planned.
    placeholderData: keepPreviousData,
    staleTime: FIFTEEN_MINUTES,
    retry: retryServerErrorsOnce,
  })
}

export function heatmapRequest(plan: PlanResponse | undefined): HeatmapRequest | null {
  if (!plan || plan.routes.length === 0) return null
  const storm = plan.trip.storm
  return {
    routes: plan.routes.map((route) => ({ label: route.label, outline: route.outline })),
    departure_utc: plan.trip.departure_utc,
    load_lb: plan.trip.load_lb,
    weather_source: plan.trip.weather_source,
    // The same storm the plan was scored with, so grid points and checkpoints agree.
    storm: storm ? { lat: storm.lat, lon: storm.lon, at_utc: storm.at_utc } : null,
  }
}

export function useHeatmap(plan: PlanResponse | undefined) {
  const body = heatmapRequest(plan)
  return useQuery({
    queryKey: ['heatmap', body],
    queryFn: ({ signal }) => fetchHeatmap(body!, signal),
    enabled: body !== null,
    staleTime: FIFTEEN_MINUTES,
    retry: retryServerErrorsOnce,
  })
}

export function usePlaces(text: string) {
  const query = text.trim().toLowerCase().replace(/\s+/g, ' ')
  return useQuery({
    queryKey: ['places', query],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: query.length >= 3,
    staleTime: ONE_DAY,
    retry: false,
    placeholderData: keepPreviousData,
  })
}

const WAKE_NOTICE_AFTER_MS = 2_000

/**
 * Pings the API when the page opens. If the answer takes longer than 2 seconds the server
 * is probably waking from sleep on free hosting, and the page says so instead of freezing.
 */
export function useServerStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => checkHealth(signal),
    staleTime: Infinity,
    retry: 8,
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 15_000),
  })
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (health.isSuccess || health.isError) return
    const timer = window.setTimeout(() => setSlow(true), WAKE_NOTICE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [health.isSuccess, health.isError])
  return {
    ready: health.isSuccess,
    waking: slow && !health.isSuccess && !health.isError,
    unreachable: health.isError,
  }
}
