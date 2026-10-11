export type LonLat = [number, number]

const EARTH_RADIUS_M = 6_371_008.8

export function haversineM(a: LonLat, b: LonLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** [[minLon, minLat], [maxLon, maxLat]] around every point of every line. */
export function boundsOf(lines: number[][][]): [LonLat, LonLat] | null {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null
}

/** The point halfway along a line, by distance. */
export function midpointAlong(line: number[][]): LonLat {
  if (line.length === 0) return [0, 0]
  const steps: number[] = [0]
  for (let i = 1; i < line.length; i++) {
    steps.push(steps[i - 1] + haversineM(line[i - 1] as LonLat, line[i] as LonLat))
  }
  const half = steps[steps.length - 1] / 2
  let i = 1
  while (i < steps.length && steps[i] < half) i++
  if (i >= steps.length) return line[line.length - 1] as LonLat
  const t = steps[i] === steps[i - 1] ? 0 : (half - steps[i - 1]) / (steps[i] - steps[i - 1])
  const [x0, y0] = line[i - 1]
  const [x1, y1] = line[i]
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
}

/** Typical gap between neighbouring grid points, in metres (the median nearest-neighbour distance). */
export function gridSpacingM(points: number[][]): number {
  if (points.length < 2) return 20_000
  const nearest: number[] = []
  for (let i = 0; i < points.length; i++) {
    let best = Infinity
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue
      const d = haversineM(points[i] as LonLat, points[j] as LonLat)
      if (d < best) best = d
    }
    nearest.push(best)
  }
  nearest.sort((a, b) => a - b)
  return nearest[Math.floor(nearest.length / 2)]
}

/**
 * Ground metres covered by one screen pixel at this MapLibre zoom and latitude.
 * MapLibre zoom levels count 512-pixel tiles, so zoom 0 shows the world in 512 px: one
 * level finer than the 256-pixel Web Mercator convention, hence `zoom + 1`.
 */
export function metersPerPixel(zoom: number, latitude: number): number {
  return (156_543.03 * Math.cos((latitude * Math.PI) / 180)) / 2 ** (zoom + 1)
}
