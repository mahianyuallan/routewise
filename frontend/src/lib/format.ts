/**
 * Display helpers. Every time on screen is shown in the trip's time zone (the origin's),
 * so the browser's own zone never enters the picture.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(options)
  let cached = partsCache.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', ...options })
    partsCache.set(key, cached)
  }
  return cached
}

/** "Mon 12 Oct, 09:00 CDT" */
export function formatDateTime(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = formatter(timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('timeZoneName')}`
}

/** "09:00 CDT" */
export function formatClock(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = formatter(timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('timeZoneName')}`
}

/** "Mon 09:00", for compact tables whose header names the zone. */
export function formatWeekdayClock(iso: string | Date, timeZone: string): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = formatter(timeZone, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('weekday')} ${get('hour')}:${get('minute')}`
}

/** "CDT": the zone's abbreviation at that instant. */
export function zoneAbbreviation(iso: string | Date, timeZone: string): string {
  return formatClock(iso, timeZone).split(' ').at(-1) ?? ''
}

/** "12 h 11 min", matching the API's wording. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`
}

export function formatMiles(miles: number, digits = 0): string {
  return `${miles.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} mi`
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

/** Hours from `from` to `to`, as a decimal. */
export function hoursBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000
}

/** "+6 h" */
export function offsetLabel(hours: number): string {
  return `${hours >= 0 ? '+' : ''}${hours} h`
}

/**
 * The next full hour as wall-clock time in `timeZone`, in the form a datetime-local input
 * takes: "2026-10-12T09:00". Defaults the departure field.
 */
export function nextFullHourLocal(timeZone: string, now: Date = new Date()): string {
  const nextHour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 3_600_000)
  const parts = formatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(nextHour)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** The browser's own zone, used only to default the departure before an origin is picked. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
