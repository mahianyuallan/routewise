import { ChevronUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  /** Phone only: whether the sheet shows its content or just its handle. */
  open: boolean
  onToggle: () => void
  /** One line on the handle: what the plan says, so a lowered sheet still answers the question. */
  summary: string
  children: ReactNode
}

/**
 * The form and the results. On a desktop it is the left column. On a phone it is a bottom
 * sheet over the full-screen map: tapping the handle raises or lowers it, and its content
 * scrolls inside without dragging the page.
 */
export function TripPanel({ open, onToggle, summary, children }: Props) {
  return (
    <aside
      aria-label="Trip and results"
      className={cn(
        'z-20 flex flex-col bg-background',
        'md:w-100 md:shrink-0 md:border-r',
        'max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[88%] max-md:rounded-t-2xl max-md:border-t',
        'max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_-8px_30px_rgb(0_0_0/0.14)]',
      )}
    >
      {/* h-14: App pads the map by this height (plus the inset) so the slider sits above it. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="trip-panel"
        className="flex h-14 shrink-0 flex-col justify-center gap-1.5 px-4 select-none active:bg-muted/60 md:hidden"
      >
        <span className="mx-auto block h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <span className="flex w-full items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">{summary}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {open ? 'Show map' : 'Details'}
            <ChevronUpIcon className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </span>
        </span>
      </button>
      <div
        id="trip-panel"
        className={cn(
          'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4',
          'max-md:pt-1 max-md:pr-[max(1rem,env(safe-area-inset-right))] max-md:pl-[max(1rem,env(safe-area-inset-left))]',
          !open && 'max-md:hidden',
        )}
      >
        {children}
      </div>
    </aside>
  )
}
