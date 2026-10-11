"""Miles at each risk level, the ranking, and the recommendation with its deciding rule.

Routes are ranked lexicographically: complete weather first, then fewest No Travel, Severe
and High miles, lowest average risk, shortest travel time, and finally TomTom's order.
Miles are compared in whole miles and average risk to one decimal, which keeps the order
transitive. No Travel miles round up, so any No Travel stretch counts as at least a mile.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from .risk import Assessment, RiskLevel

RULES = (
    ("complete_data", "Complete weather data"),
    ("no_travel_miles", "Fewest No Travel miles"),
    ("severe_miles", "Fewest Severe miles"),
    ("high_miles", "Fewest High miles"),
    ("average_risk", "Lowest average risk"),
    ("travel_time", "Shortest travel time"),
)


@dataclass(frozen=True, slots=True)
class RouteScore:
    miles_by_level: dict[RiskLevel, float]
    no_data_miles: float
    average_risk: float | None
    worst_level: RiskLevel | None
    has_no_travel: bool
    complete: bool
    travel_time_s: float


def score_route(
    assessments: Sequence[Assessment], miles: Sequence[float], travel_time_s: float
) -> RouteScore:
    by_level = dict.fromkeys(RiskLevel, 0.0)
    no_data = 0.0
    for assessment, covered in zip(assessments, miles, strict=True):
        if assessment.level is None:
            no_data += covered
        else:
            by_level[assessment.level] += covered
    levels = [a.level for a in assessments if a.level is not None]
    data_miles = sum(by_level.values())
    if data_miles > 0:
        average = sum(int(level) * m for level, m in by_level.items()) / data_miles
    else:
        average = float(np.mean(levels)) if levels else None
    return RouteScore(
        miles_by_level=by_level,
        no_data_miles=no_data,
        average_risk=average,
        worst_level=max(levels) if levels else None,
        has_no_travel=RiskLevel.NO_TRAVEL in levels,
        complete=len(levels) == len(assessments),
        travel_time_s=travel_time_s,
    )


def whole_miles(miles: float) -> int:
    return math.floor(miles + 0.5)


def tenths(value: float) -> float:
    return math.floor(value * 10 + 0.5 + 1e-9) / 10


def rule_values(score: RouteScore) -> tuple:
    """The values compared by each rule in RULES, in order; lower is better."""
    no_travel = score.miles_by_level[RiskLevel.NO_TRAVEL]
    return (
        0 if score.complete else 1,
        math.ceil(no_travel - 1e-9) if score.has_no_travel else 0,
        whole_miles(score.miles_by_level[RiskLevel.SEVERE]),
        whole_miles(score.miles_by_level[RiskLevel.HIGH]),
        tenths(score.average_risk) if score.average_risk is not None else math.inf,
        score.travel_time_s,
    )


def rank(scores: Sequence[RouteScore]) -> list[int]:
    """Route indexes, best first. Ties on every rule keep TomTom's order."""
    return sorted(range(len(scores)), key=lambda i: (*rule_values(scores[i]), i))


@dataclass(frozen=True, slots=True)
class Recommendation:
    status: str
    """recommended, no_safe_route or no_complete_route."""
    route: int | None
    rule: str | None
    message: str


def recommend(
    labels: Sequence[str], scores: Sequence[RouteScore], order: Sequence[int]
) -> Recommendation:
    top = order[0]
    if not scores[top].complete:
        return Recommendation(
            "no_complete_route",
            None,
            None,
            "Weather data is missing on every route, so there is no recommendation.",
        )
    if scores[top].has_no_travel:
        every_route = all(s.has_no_travel for s in scores)
        cause = (
            "has No Travel conditions"
            if every_route
            else ("has No Travel conditions or missing weather")
        )
        return Recommendation(
            "no_safe_route",
            None,
            None,
            f"No safe route at this departure time: every route {cause}. "
            "Try a later departure; the heatmap shows when conditions clear.",
        )
    if len(order) == 1:
        return Recommendation(
            "recommended", top, "only_route", f"Route {labels[top]} is the only route found."
        )
    runner_up = order[1]
    ours, theirs = rule_values(scores[top]), rule_values(scores[runner_up])
    for (key, title), mine, other in zip(RULES, ours, theirs, strict=True):
        if mine != other:
            return Recommendation(
                "recommended",
                top,
                key,
                _deciding_message(key, title, mine, other, labels[runner_up]),
            )
    return Recommendation(
        "recommended",
        top,
        "routing_order",
        f"Tied with Route {labels[runner_up]} on every rule; TomTom's order decides.",
    )


def _deciding_message(key: str, title: str, mine, other, runner_up: str) -> str:
    if key == "complete_data":
        return f"{title}: Route {runner_up} is missing some forecasts"
    if key == "average_risk":
        return f"{title}: {mine:.1f} vs {other:.1f} on Route {runner_up}"
    if key == "travel_time":
        return f"{title}: {format_duration(mine)} vs {format_duration(other)} on Route {runner_up}"
    return f"{title}: {mine} vs {other} on Route {runner_up}"


def format_duration(seconds: float) -> str:
    minutes = round(seconds / 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours} h {minutes:02d} min" if hours else f"{minutes} min"
