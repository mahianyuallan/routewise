import type { PlanResponse } from '@/api/client'

/** The phone sheet's handle line: what the plan says, or what to do next. */
export function planSummary(plan: PlanResponse | undefined, planning: boolean, failed: boolean): string {
  if (planning) return 'Planning routes…'
  if (failed) return 'Planning failed'
  if (!plan) return 'No trip planned yet'
  const { status, route } = plan.recommendation
  if (status === 'recommended') return `Route ${route} recommended`
  return status === 'no_safe_route' ? 'No safe route at this departure time' : 'No recommendation'
}
