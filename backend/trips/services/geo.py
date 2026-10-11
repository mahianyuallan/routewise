"""Distances, a local projection and the 0.1-degree weather cells."""

import math

import numpy as np
from pyproj import Transformer

METERS_PER_MILE = 1609.344
KG_PER_LB = 0.45359237
EARTH_RADIUS_M = 6_371_008.8

CELL_DEGREES = 0.1
type Cell = tuple[int, int]
"""A weather cell, as (lat, lon) in tenths of a degree."""


def haversine_m(lat1, lon1, lat2, lon2) -> np.ndarray:
    """Great-circle distance in metres; works on scalars or arrays."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = p2 - p1
    dl = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def cumulative_m(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Distance from the first point to each point along the polyline, in metres."""
    steps = haversine_m(lats[:-1], lons[:-1], lats[1:], lons[1:])
    return np.concatenate(([0.0], np.cumsum(steps)))


def cell_of(lat: float, lon: float) -> Cell:
    return (math.floor(lat / CELL_DEGREES + 0.5), math.floor(lon / CELL_DEGREES + 0.5))


def cell_center(cell: Cell) -> tuple[float, float]:
    """(lat, lon) of the cell's centre."""
    return (round(cell[0] * CELL_DEGREES, 1), round(cell[1] * CELL_DEGREES, 1))


class LocalProjection:
    """Azimuthal equidistant projection in metres, centred on a trip.

    Buffers, simplification and overlap are measured here, never in raw degrees,
    because a degree of longitude shrinks with latitude.
    """

    def __init__(self, lat0: float, lon0: float) -> None:
        crs = f"+proj=aeqd +lat_0={lat0:.6f} +lon_0={lon0:.6f} +units=m +ellps=WGS84"
        self._forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        self._inverse = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)

    def to_xy(self, lons, lats) -> tuple[np.ndarray, np.ndarray]:
        x, y = self._forward.transform(np.asarray(lons, float), np.asarray(lats, float))
        return np.asarray(x), np.asarray(y)

    def to_lonlat(self, x, y) -> tuple[np.ndarray, np.ndarray]:
        lons, lats = self._inverse.transform(np.asarray(x, float), np.asarray(y, float))
        return np.asarray(lons), np.asarray(lats)
