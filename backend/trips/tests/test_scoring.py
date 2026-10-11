import pytest

from trips.services.risk import Assessment, RiskLevel
from trips.services.scoring import RouteScore, rank, recommend, score_route

LABELS = ["A", "B", "C"]


def make_score(nt=0.0, severe=0.0, high=0.0, avg=0.5, hours=5.0, complete=True):
    by_level = dict.fromkeys(RiskLevel, 0.0)
    by_level[RiskLevel.NO_TRAVEL] = nt
    by_level[RiskLevel.SEVERE] = severe
    by_level[RiskLevel.HIGH] = high
    return RouteScore(
        miles_by_level=by_level,
        no_data_miles=0.0 if complete else 10.0,
        average_risk=avg,
        worst_level=RiskLevel.NO_TRAVEL if nt else RiskLevel.HIGH,
        has_no_travel=nt > 0,
        complete=complete,
        travel_time_s=hours * 3600,
    )


def decide(*scores):
    order = rank(scores)
    return order, recommend(LABELS[: len(scores)], scores, order)


def assessment(level):
    return Assessment(level, None, None, None, None, "", None, None, None, None)


def test_score_counts_miles_per_level_and_weights_the_average():
    levels = [RiskLevel.LOW, RiskLevel.HIGH, RiskLevel.SEVERE]
    score = score_route([assessment(lv) for lv in levels], [10.0, 20.0, 10.0], 3600)
    assert score.miles_by_level[RiskLevel.HIGH] == 20.0
    assert sum(score.miles_by_level.values()) == 40.0
    assert score.average_risk == pytest.approx((0 * 10 + 2 * 20 + 3 * 10) / 40)
    assert score.worst_level is RiskLevel.SEVERE
    assert score.complete and not score.has_no_travel


def test_no_data_is_left_out_of_the_average_and_marks_the_route_incomplete():
    score = score_route([assessment(RiskLevel.HIGH), assessment(None)], [10.0, 10.0], 3600)
    assert score.no_data_miles == 10.0
    assert score.average_risk == 2.0
    assert not score.complete


def test_no_travel_miles_decide_before_severe_miles():
    order, rec = decide(make_score(nt=50, severe=0), make_score(nt=0, severe=10))
    assert order == [1, 0]
    assert rec.rule == "no_travel_miles"
    assert rec.status == "recommended" and rec.route == 1


def test_fewest_severe_miles():
    order, rec = decide(make_score(severe=18), make_score(severe=0))
    assert order == [1, 0]
    assert rec.message == "Fewest Severe miles: 0 vs 18 on Route A"


def test_fewest_high_miles_after_severe_ties():
    _, rec = decide(make_score(severe=5, high=35), make_score(severe=5, high=10))
    assert rec.rule == "high_miles"
    assert rec.message == "Fewest High miles: 10 vs 35 on Route A"


def test_lowest_average_risk_after_mile_ties():
    _, rec = decide(make_score(avg=0.7), make_score(avg=0.4))
    assert rec.message == "Lowest average risk: 0.4 vs 0.7 on Route A"


def test_shortest_travel_time_breaks_a_risk_tie():
    order, rec = decide(make_score(hours=6), make_score(hours=5.5))
    assert order == [1, 0]
    assert rec.message == "Shortest travel time: 5 h 30 min vs 6 h 00 min on Route A"


def test_miles_are_compared_in_whole_miles():
    # 10.4 and 10.2 High miles both round to 10, so the faster route wins on travel time.
    _, rec = decide(make_score(high=10.2, hours=6), make_score(high=10.4, hours=5))
    assert rec.route == 1 and rec.rule == "travel_time"


def test_average_risk_is_compared_to_one_decimal():
    _, rec = decide(make_score(avg=0.36, hours=6), make_score(avg=0.44, hours=5))
    assert rec.route == 1 and rec.rule == "travel_time"


def test_any_no_travel_stretch_counts_as_at_least_a_mile():
    _, rec = decide(make_score(nt=0.3, severe=0), make_score(nt=0, severe=40))
    assert rec.route == 1 and rec.rule == "no_travel_miles"


def test_full_tie_keeps_tomtoms_order():
    order, rec = decide(make_score(), make_score())
    assert order == [0, 1]
    assert rec.rule == "routing_order"


def test_routes_with_missing_weather_rank_after_complete_ones():
    order, rec = decide(make_score(severe=0, complete=False), make_score(severe=30))
    assert order == [1, 0]
    assert rec.route == 1 and rec.rule == "complete_data"


def test_no_safe_route_when_every_route_has_no_travel():
    _, rec = decide(make_score(nt=5), make_score(nt=12), make_score(nt=1))
    assert rec.status == "no_safe_route"
    assert rec.route is None
    assert "every route has No Travel conditions" in rec.message


def test_no_recommendation_without_complete_weather():
    _, rec = decide(make_score(complete=False), make_score(complete=False))
    assert rec.status == "no_complete_route"
    assert rec.route is None


def test_single_route():
    _, rec = decide(make_score())
    assert rec.rule == "only_route"
    assert rec.message == "Route A is the only route found."
