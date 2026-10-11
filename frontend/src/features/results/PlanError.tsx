import { TriangleAlertIcon } from 'lucide-react'

import { errorMessage, isApiError, isForecastError } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Why a plan failed, in words. When the forecast is what failed, it points at simulated
 * weather, which needs no forecast, so the app can still be tried.
 */
export function PlanError({ error }: { error: unknown }) {
  const api = isApiError(error) ? error : null
  const title = api
    ? ({
        no_route: 'No truck route found',
        invalid_trip: 'Check the trip',
        validation: 'Check the trip',
        provider_quota: `${api.provider ?? 'A service'} is out of free quota`,
        provider_unavailable: `${api.provider ?? 'A service'} isn't responding`,
        provider_rejected: `${api.provider ?? 'A service'} rejected the request`,
        weather_units: 'Weather came back in the wrong units',
        network: "Can't reach the server",
      }[api.code] ?? 'Planning failed')
    : 'Planning failed'
  const message = api ? api.message : errorMessage(error)
  const forecastFailed = isForecastError(error)
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {forecastFailed && (
          <p>Switch on Simulated weather to plan the same trip without the forecast in the meantime.</p>
        )}
      </AlertDescription>
    </Alert>
  )
}
