import { LEVELS, LEVEL_COLOR, LEVEL_LABEL, NO_DATA_COLOR, NO_DATA_LABEL } from '@/lib/risk'

interface Props {
  heatmapOn: boolean
}

/** The one palette, named in text as well as colour, so risk is never shown by colour alone. */
export function Legend({ heatmapOn }: Props) {
  return (
    <div className="pointer-events-none absolute top-3 right-3 rounded-lg border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
      <div className="mb-1.5 font-medium">Risk level</div>
      <ul className="space-y-1">
        {LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: LEVEL_COLOR[level] }} aria-hidden />
            {LEVEL_LABEL[level]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: NO_DATA_COLOR }} aria-hidden />
          {NO_DATA_LABEL}
        </li>
      </ul>
      {heatmapOn && <div className="mt-2 border-t pt-1.5 text-muted-foreground">Heatmap: risk, smoothed</div>}
    </div>
  )
}
