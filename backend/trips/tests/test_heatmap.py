from datetime import UTC, datetime

import numpy as np

from trips.services.geo import cell_center, cell_of
from trips.services.heatmap import HOURS, MAX_POINTS, build_heatmap, corridor_cells
from trips.services.risk import Conditions, assess
from trips.services.weather import HourlySeries, conditions_at

START = 1_791_676_800  # 2026-10-11 00:00 UTC


def outline(miles: float, lat: float = 35.0) -> list[list[float]]:
    lon_per_mile = 1 / (69.172 * np.cos(np.radians(lat)))
    return [[-100 + i * miles * lon_per_mile / 50, lat] for i in range(51)]


class GustyProvider:
    """Wind that rises with longitude and hour, so every cell-hour differs."""

    def series(self, cells):
        result = {}
        for cell in cells:
            hours = np.arange(264)
            wind = 20 + (cell[1] % 10) * 3 + (hours % 24)
            result[cell] = HourlySeries(
                times=START + 3600 * hours,
                wind=wind.astype(float),
                gust=(wind + 10).astype(float),
                rain=np.full(264, 0.12),
                snow=np.zeros(264),
            )
        return result


def test_long_corridor_stays_within_the_point_budget():
    cells = corridor_cells([outline(1000.0)])
    assert 100 < len(cells) <= MAX_POINTS


def test_corridor_covers_the_route():
    route = outline(300.0)
    cells = set(corridor_cells([route]))
    centers = np.array([cell_center(c) for c in cells])
    for lon, lat in route[::5]:
        nearest = np.min(np.hypot(centers[:, 0] - lat, (centers[:, 1] - lon) * 0.82))
        assert nearest < 0.5  # within about 30 miles of a grid point


def test_frames_use_the_same_rules_as_checkpoints():
    route = outline(200.0)
    departure = datetime(2026, 10, 12, 14, 20, tzinfo=UTC)
    provider = GustyProvider()
    heatmap = build_heatmap([route], departure, 41_000, provider)
    n = len(heatmap["points"])
    assert len(heatmap["hours"]) == HOURS
    assert heatmap["hours"][0] == "2026-10-12T14:00:00Z"
    series = provider.series([cell_of(lat, lon) for lon, lat in heatmap["points"]])
    for hour in (0, 7, 48):
        for j in (0, n // 2, n - 1):
            lon, lat = heatmap["points"][j]
            t = datetime(2026, 10, 12, 14, tzinfo=UTC).timestamp() + hour * 3600
            c = conditions_at(series[cell_of(lat, lon)], t)
            expected = assess(Conditions(c.wind_mph, None, c.rain_in_hr, c.snow_in_hr), 41_000)
            assert heatmap["levels"][hour * n + j] == int(expected.level)
