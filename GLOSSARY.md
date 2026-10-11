# RouteWise

RouteWise compares truck routes by the weather each will meet at the hour the truck gets there, scored with Spotter's risk and load rules. These are the words the code, the UI and the docs use.

## Language

### Trip and plan

**Trip**:
The journey a user asks about: origin, destination, departure, load and spacing.
_Avoid_: search, request, query

**Plan**:
What RouteWise works out for one trip: its routes, checkpoints, ranking and recommendation.
_Avoid_: result, report, search results

**Departure**:
The wall-clock time at the origin when the truck leaves, in the origin's time zone.
_Avoid_: start time, pickup time

**Load**:
The weight of the cargo in pounds, not counting the tractor and trailer.
_Avoid_: weight, gross weight, payload

### Routes and checkpoints

**Route**:
One candidate road path from origin to destination, labelled A, B or C. Its label never changes within a plan.
_Avoid_: option, alternative, path

**Recommended route**:
The top-ranked route among those with complete weather.
_Avoid_: best route, winner, safest route

**Checkpoint**:
A point on a route where the weather is read at the truck's ETA. Checkpoints sit every spacing miles, plus the origin and the destination.
_Avoid_: sample point, waypoint, stop

**Spacing**:
The distance between checkpoints: 10, 25 or 50 miles.
_Avoid_: interval, sampling rate, frequency

**ETA**:
The time the truck reaches a checkpoint: departure plus the truck's travel time to it.
_Avoid_: arrival time (reserved for the destination)

### Risk

**Risk level**:
How dangerous the weather is for the truck at a checkpoint: Low, Moderate, High, Severe or No Travel.
_Avoid_: class, category, severity

**Risk score**:
The number for a risk level, from Low 0 to No Travel 4.
_Avoid_: rating, points

**Condition level**:
The risk level one condition (wind, rain or snow) gives on its own, before the conditions are combined.
_Avoid_: per-condition class, sub-level

**Load rule**:
One of the brief's three rules that raise the wind's risk level for very high wind or a heavy load.
_Avoid_: weight rule, load adjustment

**Checkpoint reason**:
The sentence naming the condition, and any load rule, that set a checkpoint's risk level.
_Avoid_: explanation, note

**No data**:
The state of a checkpoint whose forecast is missing. It is never treated as Low.
_Avoid_: unknown, N/A

### Ranking

**Miles at level**:
The route miles credited to one risk level, as in "Severe miles". Each checkpoint stands for the road halfway to its neighbours.
_Avoid_: exposure, segment count

**Average risk**:
The distance-weighted mean risk score over the route miles that have data.
_Avoid_: risk index, mean level

**Deciding rule**:
The first ranking rule on which the recommended route beats the runner-up.
_Avoid_: reason (on its own), tie-breaker

### Weather and heatmap

**Sustained wind**:
The steady wind speed the risk rules use.
_Avoid_: wind speed (when gusts are also shown)

**Gust**:
The strongest wind in the hour before a forecast time. It is shown but never scored.
_Avoid_: peak wind, max wind

**Forecast hour**:
One hourly step of the 0 to 48 hour window that starts at the departure hour.
_Avoid_: frame, tick

**Corridor**:
The area within 25 miles of any of a plan's routes, which the heatmap covers.
_Avoid_: buffer, region, area

**Simulated weather**:
A labelled, made-up storm that replaces the forecast so every rule can be seen working on a calm day.
_Avoid_: fake weather, demo data, mock weather
