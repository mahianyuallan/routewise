import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'

import type { PlanResponse } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface Props {
  plan: PlanResponse
}

/** The recommendation and the rule that decided it, plus any notices about the plan. */
export function Recommendation({ plan }: Props) {
  const rec = plan.recommendation
  return (
    <div className="space-y-2">
      {rec.status === 'recommended' ? (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>Route {rec.route} recommended</AlertTitle>
          <AlertDescription>{rec.message}</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>
            {rec.status === 'no_safe_route' ? 'No safe route at this departure time' : 'No recommendation'}
          </AlertTitle>
          <AlertDescription>{rec.message}</AlertDescription>
        </Alert>
      )}
      {plan.notices.map((notice) => (
        <Alert key={notice}>
          <InfoIcon />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
