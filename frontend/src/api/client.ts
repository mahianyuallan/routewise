/**
 * Typed calls to the RouteWise API. Types come from the generated OpenAPI schema
 * (`npm run api:types`), so the frontend fails to compile when the API contract changes.
 */

import type { components } from './schema'

type Schemas = components['schemas']

export type Place = Schemas['PlaceResult']
export type PlanRequest = Schemas['PlanRequestRequest']
export type PlanResponse = Schemas['PlanResponse']
export type Route = Schemas['Route']
export type Checkpoint = Schemas['Checkpoint']
export type Recommendation = Schemas['Recommendation']
export type HeatmapRequest = Schemas['HeatmapRequestRequest']
export type HeatmapResponse = Schemas['HeatmapResponse']

/** Set in production to the API's origin; empty in development, where Vite proxies /api. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly provider: string | undefined
  readonly fields: Record<string, string[]> | undefined

  constructor(
    message: string,
    status: number,
    code: string,
    provider?: string,
    fields?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.provider = provider
    this.fields = fields
  }

  /** True when the request itself failed or the server was at fault, so a retry may help. */
  get retriable(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, 'network')
  }
  const body = await response.json().catch(() => null)
  if (response.ok) return body as T
  throw toApiError(response.status, body)
}

function toApiError(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    if (typeof record.detail === 'string') {
      const code = typeof record.code === 'string' ? record.code : 'error'
      const provider = typeof record.provider === 'string' ? record.provider : undefined
      return new ApiError(record.detail, status, code, provider)
    }
    // DRF validation errors: {field: ["message", ...]} or {field: {nested: [...]}}
    const fields: Record<string, string[]> = {}
    for (const [field, value] of Object.entries(record)) {
      fields[field] = flattenMessages(value)
    }
    if (Object.keys(fields).length) {
      const first = Object.entries(fields)[0]
      return new ApiError(
        `${first[0].replace(/_/g, ' ')}: ${first[1][0]}`,
        status,
        'validation',
        undefined,
        fields,
      )
    }
  }
  return new ApiError(`The server answered with an error (${status}).`, status, 'error')
}

function flattenMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(flattenMessages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenMessages)
  return []
}

export function checkHealth(signal?: AbortSignal): Promise<{ status: string }> {
  return request('/api/health/', { method: 'GET' }, signal)
}

export function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  return request(`/api/places/?q=${encodeURIComponent(text)}`, { method: 'GET' }, signal)
}

export function planTrip(body: PlanRequest, signal?: AbortSignal): Promise<PlanResponse> {
  return request('/api/plan/', { method: 'POST', body: JSON.stringify(body) }, signal)
}

export function fetchHeatmap(body: HeatmapRequest, signal?: AbortSignal): Promise<HeatmapResponse> {
  return request('/api/heatmap/', { method: 'POST', body: JSON.stringify(body) }, signal)
}
