"""The corridor heatmap: risk on a grid around all routes, hour by hour for 48 hours.

Hour 0 is the departure hour. Every point-hour is classified with the same function and
load as the checkpoints, so a grid point and a checkpoint at the same place and hour agree.
"""

import math
from collections.abc import Sequence
from datetime import datetime

import numpy as np
import shapely

from .geo import METERS_PER_MILE, Cell, LocalProjection, cell_center, cell_of
from .risk import classify
from .timeutil import iso_utc
from .weather import HOUR_S, WeatherProvider, hourly_frames

CORRIDOR_MILES = 25
MAX_POINTS = 200
HOURS = 49  # the departure hour plus the next 48

type Outline = Sequence[Sequence[float]]
"""A route outline as [lon, lat] pairs."""


def corridor_cells(outlines: Sequence[Outline]) -> list[Cell]:
    """Weather cells on a grid covering everything within 25 miles of any route (at most 200)."""
    lons = np.concatenate([np.asarray(o, float)[:, 0] for o in outlines])
    lats = np.concatenate([np.asarray(o, float)[:, 1] for o in outlines])
    projection = LocalProjection((lats.min() + lats.max()) / 2, (lons.min() + lons.max()) / 2)
    lines = []
    for outline in outlines:
        coords = np.asarray(outline, float)
        x, y = projection.to_xy(coords[:, 0], coords[:, 1])
        lines.append(shapely.linestrings(np.column_stack([x, y])))
    corridor = shapely.buffer(
        shapely.union_all(lines), CORRIDOR_MILES * METERS_PER_MILE, quad_segs=4
    )
    shapely.prepare(corridor)
    minx, miny, maxx, maxy = corridor.bounds

    spacing = math.sqrt(corridor.area / MAX_POINTS)
    while True:
        gx, gy = np.meshgrid(
            np.arange(minx + spacing / 2, maxx, spacing),
            np.arange(miny + spacing / 2, maxy, spacing),
        )
        gx, gy = gx.ravel(), gy.ravel()
        inside = shapely.contains_xy(corridor, gx, gy)
        if inside.sum() <= MAX_POINTS:
            break
        spacing *= 1.1
    point_lons, point_lats = projection.to_lonlat(gx[inside], gy[inside])
    return list(
        dict.fromkeys(cell_of(lat, lon) for lat, lon in zip(point_lats, point_lons, strict=True))
    )


def _nullable(values: np.ndarray) -> list[float | None]:
    return [None if math.isnan(v) else v for v in values.ravel().tolist()]


def build_heatmap(
    outlines: Sequence[Outline], departure_utc: datetime, load_lb: int, weather: WeatherProvider
) -> dict:
    """Grid points plus 49 hourly frames; arrays are hour-major (index = hour * points + point)."""
    cells = corridor_cells(outlines)
    series = weather.series(cells)
    start = math.floor(departure_utc.timestamp() / HOUR_S) * HOUR_S
    frames = hourly_frames(series, cells, start, HOURS)
    levels = classify(frames["wind"], frames["rain"], frames["snow"], load_lb)
    return {
        "hours": [iso_utc(start + h * HOUR_S) for h in range(HOURS)],
        "points": [[lon, lat] for lat, lon in (cell_center(cell) for cell in cells)],
        "levels": levels.level.ravel().tolist(),
        "wind_mph": _nullable(levels.wind_mph),
        "rain_in_hr": _nullable(levels.rain_in_hr),
        "snow_in_hr": _nullable(levels.snow_in_hr),
        "corridor_miles": CORRIDOR_MILES,
    }
