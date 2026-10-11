# RouteWise PRD: Weather-Aware Truck Routing

**Author:** Allan Mwenja · **Date:** 10 Oct 2026, revised 11 Oct 2026 · **Status:** v2, design review done · **For:** Spotter Full Stack Developer assessment
**Links:** Brief: `fs-assessment-spotter.pdf` · Repo: [mahianyuallan/routewise](https://github.com/mahianyuallan/routewise) · Live app: TBD · Loom: TBD
**Companion docs:** how it's built: [TECH-STACK.md](TECH-STACK.md) · terms: [GLOSSARY.md](../GLOSSARY.md) · decisions: [docs/adr](adr/)

## 1. Summary
RouteWise is a React + Django web app that compares three truck routes between two places. For each route it forecasts the weather at the hour the truck reaches each point, scores that weather with Spotter's risk and load rules, and recommends the safest route, using travel time as the tie-breaker. A map shows the routes, checkpoints, risk levels and ETAs, plus a weather-risk heatmap of the corridor for the 48 hours after departure.

## 2. Problem
Before a trip, a truck driver can't easily see the weather each candidate route will have at the hour the truck gets there. As a result they can drive a heavy load into high wind, heavy rain or snow that another route, or the same route at a different time, would have avoided.

Not solving here: navigation, legal truck routing beyond what the routing API's truck mode provides, hours-of-service planning, and non-weather hazards such as crashes or closures.

## 3. Why it matters
- About 12% of US vehicle crashes, nearly 745,000 a year, are weather-related. Over 3,800 people die in them each year, and over 77% happen in rain or mist (FHWA, 2019 to 2023 averages).
- For a truck, wind risk depends on the load. Under the brief's rules, a 40 mph wind is High for a 35,000 lb load and Severe for a 45,000 lb load. A generic weather app can't express that.
- Weather depends on place and time. "Rain in Denver today" says nothing about the stretch of I-80 the truck reaches at 3 a.m. Matching each forecast to the truck's ETA is the core of the product.

## 4. Who it's for
A US truck driver or dispatcher planning one origin-to-destination trip before departure, usually on a laptop and sometimes on a phone. Fleet-wide planning and in-cab navigation are out of scope.

## 5. Success criteria
1. **Rules are right at every edge.** Automated tests cover every threshold boundary in the brief's table, all three load rules and each step of the recommendation order. They run in CI, and all pass.
2. **Every recommendation explains itself.** The UI names the rule that decided it, e.g. "fewest High miles: 10 vs 35".
3. **Smooth where it counts.**
   - Scrubbing the 0 to 48 h slider makes no network requests and holds 60 fps (Chrome DevTools).
   - A warm 1,000-mile plan returns in under 10 s, measured on the live API and stated in the README.
   - A keep-alive monitor keeps the API awake during review. If it ever does sleep, the page says it is waking the server rather than looking frozen.
4. **The brief is fully covered.** Every line of the brief maps to a shipped feature and a test or check (Appendix E).
5. **Deliverables ship on time, for free.** A public GitHub repo with README, the hosted app and a 5 to 10 minute Loom, by the end of Mon 12 Oct 2026, all on free plans.

## 6. Scope

### Must have (P0: the brief)
| # | Requirement |
|---|---|
| R1 | **Trip form.** Origin and destination with US-only autocomplete; each pick carries its coordinates and time zone. Departure date and time in the origin's local time (default: next full hour; allowed: now to 7 days ahead; earlier times are rejected). Load: cargo weight in lb, 0 to 45,000 (0 means an empty trailer). Checkpoint spacing of 10, 25 or 50 miles (default 25). |
| R2 | **Three routes** from a routing API in truck mode for the chosen departure time, for a standard 53-ft tractor-trailer, avoiding border crossings. Five variants are requested at once: fastest, eco, short, and two routes steered either side of the straight line. Near-duplicates are dropped. If 3 distinct routes don't exist, show what exists and say so. Routes are labelled A, B and C and keep their labels. |
| R3 | **Checkpoints** every N miles along each route, plus the origin and destination. Each has an ETA from that route's own travel-time profile. If the chosen spacing would exceed the weather budget, the app widens it and says why. |
| R4 | **Weather at the ETA** for each checkpoint: sustained wind, gusts (display only), rain rate and snow rate. |
| R5 | **Risk level** per checkpoint from the brief's thresholds and load rules (Appendix A), with a plain-language reason. |
| R6 | **Route summary:** distance, drive time, arrival time, miles at each risk level, average risk and worst level. |
| R7 | **Recommendation** using the brief's order (Appendix C), with the deciding reason. A clear warning appears when every route has No Travel conditions. |
| R8 | **Map.** All routes are shown, with the selected one (the recommended one by default) drawn wider and on top. Route segments and checkpoints are coloured by risk level from one ordered palette. Checkpoints have popups (mile, ETA, weather, level, reason). Route summaries sit beside the map and are labelled on it. Risk is never shown by colour alone. |
| R9 | **Corridor heatmap** of weather risk over the area within 25 miles of any route, using the same rules and load as the checkpoints. An hourly slider runs from the departure hour (+0 h) to +48 h. All 49 hours load at once, so scrubbing makes no requests. The legend says the field is smoothed; exact levels are on the checkpoints. |
| R10 | **Honest states.** Loading, empty and error states cover an unknown place, no route found, a busy weather service and a waking server. A checkpoint without weather shows "No data" and never counts as Low. A route with any No data checkpoint is never recommended. |

### Should have (P1: only after P0 is deployed, in this order)
- **S2** A simulated storm, clearly labelled, so reviewers can see every risk level and the load rules even on a calm day. Design: [TECH-STACK.md, Simulated weather](TECH-STACK.md#simulated-weather-s2-p1).
- **S4** A checkpoint table for the selected route.
- **S3** A play button on the slider, then truck markers showing where each truck would be at the selected hour.
- **S5** A heatmap switch between risk, wind, rain and snow.
- **S6** A phone layout: full-screen map with a bottom panel.
- **S1** Changing the load weight updates the results. This needs no extra work: changing the load re-submits the trip. Load also changes TomTom's weight restrictions, so the routes must be re-requested. Weather comes from the cache, and the old results stay on screen until the new ones arrive.

### Not in this submission
- Hours-of-service rest breaks in ETAs. ETAs assume continuous driving, and trips with more than 11 h of driving show a notice.
- Turn-by-turn navigation, live re-routing, traffic incidents and road closures.
- Hazards outside the rules: ice, fog, visibility, temperature and lightning.
- Accounts, saved trips, fleets and multi-stop trips.
- Suggesting a better departure time.
- Places outside the US. Autocomplete is US-only.

## 7. User flow
1. Enter the trip and press **Plan**.
2. Route cards arrive with their weather and risk in one response; the heatmap loads right after.
3. Three route cards appear ranked best first. The top card is marked **Recommended** and says why.
4. Selecting a card focuses that route on the map.
5. Hovering over or tapping a checkpoint shows its ETA, weather and risk.
6. Turning on the heatmap lets the user scrub from 0 to 48 h.
7. Changing the load or spacing re-plans the trip. The previous results stay on screen until the new ones arrive.

## 8. Decisions and assumptions
Where the brief leaves room, these are the calls made. Each one is a single constant or function in the code, so it is cheap to change.

| Topic | Decision | Why |
|---|---|---|
| "Every 10 / 25 / 50 miles" | The user picks the spacing (default 25). Checkpoints always include the origin and destination. If the chosen spacing would need more than 300 weather cells across the three routes, the app uses the next wider spacing and says so. 10-mile spacing covers trips up to about 1,000 miles. | The brief lists three options. 25 keeps long trips readable, and the cap keeps one plan under the weather API's 600-calls-a-minute limit. |
| Which wind | Sustained wind drives the rules. Gusts are shown but not scored. | The table says "wind". Gusts run well above sustained speeds, so scoring them would push most windy checkpoints up a level or two. |
| Range edges | A value on a shared edge takes the higher level (35 mph is High). The brief's strict ">1.00" for rain and ">3.0" for snow keep exactly 1.00 and 3.0 at Severe. | Safety first, and consistent with the brief's own "≥55" and ">" signs. |
| Combining conditions | Checkpoint level = the worst of wind (after load rules), rain and snow. | One hazard is enough to make a stretch dangerous. |
| "Severe miles" | Each checkpoint stands for the road halfway to its neighbors, so the miles add up to the route length. | This turns sampled points into real miles. |
| No Travel in the ranking | Fewest No Travel miles is checked before the brief's four rules. | No Travel is worse than Severe, and the brief's list doesn't mention it. |
| "Balancing" risk and time | Miles at each level are rounded to whole miles and average risk to one decimal before comparing. Ties fall through to travel time; a full tie keeps the routing API's order. | Rounding keeps the ranking consistent across three routes, and stops a single Moderate checkpoint from outweighing hours of extra driving. |
| Missing weather | A missing value is "No data": left out of averages, flagged, never counted as Low. Routes with any No data checkpoint rank after complete routes and can't be Recommended. If none is complete, there is no recommendation. | A route is never recommended on incomplete weather data. |
| Load | Load is cargo weight, 0 to 45,000 lb, and the rules use it exactly as entered. The routing API gets load + an assumed 35,000 lb tare and a standard 53-ft rig (13'6" tall, 8'6" wide, about 72 ft long, 5 axles). | The brief's 30,000 and 40,000 lb thresholds only make sense for cargo, since an empty rig already weighs about 30,000 to 35,000 lb. 45,000 + 35,000 is the 80,000 lb federal gross limit. |
| ETA | Departure time + the routing API's traffic-aware truck travel time to that mile. No rest breaks. | Uses the provider's own speed profile. Rest breaks are out of scope. |
| Which forecast hour | Rain, showers, snow and gusts come from the hour the truck is in, because the API reports them for the preceding hour. Sustained wind is interpolated between the two surrounding hours. | Avoids an off-by-one-hour error. Wind is an instant reading, so interpolation is the closer estimate. |
| Slider start | Hour 0 = departure hour, and labels show clock times. | Keeps the heatmap on the trip even for future departures. When departing now, it is the same as starting from the current time. |
| Heatmap | A smoothed field over the corridor (within 25 miles of any route), at most 200 grid points, labelled as smoothed. | Smooth to scrub, and honest that blending shows in-between colours. |
| Time zone | Times are entered and shown in the origin's local time, labeled (e.g. CDT), and computed in UTC. A time that happens twice when clocks go back takes its first occurrence; one that doesn't exist is rejected; departures before now are rejected. | Drivers plan in local time. A plan is for a trip that hasn't started. |
| Route labels | A, B and C follow the order the variants were requested in and never change within a plan; cards are sorted by rank. | Labels don't reshuffle when the ranking changes. |
| Getting three routes | One parallel wave of five single-route calls: fastest, eco, short and two via points either side of the straight line. TomTom's own alternatives aren't requested. | Measured on 800-mile trips: 4.5 to 5 s, against 11 to 14 s with TomTom's alternatives plus via-point fallback. The via routes also spread across different corridors, which suits comparing weather. |
| Load rules | Applied exactly as written. | The brief is the spec. See section 12. |

## 9. Technical approach
Full detail, versions and sources: [TECH-STACK.md](TECH-STACK.md).

| Layer | Choice | Why |
|---|---|---|
| Routing | TomTom Routing API v1, truck mode | Truck profile, alternatives on long routes, departure-time traffic and per-point travel times for ETAs. TomTom's newer Orbis API has no truck mode ([ADR 0002](adr/0002-tomtom-routing-v1-not-orbis.md)). |
| Places | Geoapify Address Autocomplete, through the backend | Each suggestion carries coordinates and its time zone; US-only; the key stays on the server. |
| Weather | Open-Meteo forecast API | No key. Hourly data up to 16 days ahead, many locations per request, mph and inches returned directly. |
| Backend | Django 5.2 LTS + Django REST Framework, a stateless JSON API | Risk, checkpoint and ranking logic are pure functions with no network code, so they are easy to test. The API keeps nothing between requests: the heatmap call sends back what it needs ([ADR 0003](adr/0003-stateless-api.md)). |
| Frontend | React + TypeScript (Vite), MapLibre GL JS with deck.gl, OpenFreeMap basemap | A WebGL map; the heatmap averages weights instead of summing them, and the slider changes an index, not the data. |
| Hosting | Vercel Hobby for the UI; Render free web service for the API, kept awake by UptimeRobot | Free, and the UI loads instantly from a CDN. If a warm 1,000-mile plan takes over 10 s on Render's 0.1 CPU, the API moves to Vercel ([ADR 0001](adr/0001-render-free-api-with-keepalive.md)). |
| Caching | Forecasts cached for 60 minutes per 0.1° cell, place searches for 24 hours, in memory | Forecasts update hourly, and caching keeps searches inside the weather API's limits. Best-effort: nothing depends on it except speed. |
| Quality | pytest with recorded provider responses, so tests run offline; Vitest for the frontend. GitHub Actions runs tests, lint and the frontend build on every push. | Proves the rules without live APIs. |

**Budgets.** Each plan uses at most 500 weather lookups (300 checkpoint cells and 200 heatmap points) and 5 routing calls, so TomTom's free 20,000 a month covers about 4,000 plans. API keys stay on the server.

## 10. Risks
| Risk | Mitigation |
|---|---|
| Fewer than 3 distinct routes come back | Request five variants in parallel (fastest, eco, short, two via points), drop near-duplicates, and explain when fewer exist. |
| Weather API limits (600 calls a minute, 10,000 a day; outbound IPs on Render are shared) | The 500-lookup budget, cell caching, batched requests, retry with backoff, and a clear "weather service busy" message. |
| Render's free instance is slow (0.1 CPU) and may restart at any time | A stateless API, so a restart loses nothing. Timing is measured on the first deploy and shown per stage in a `Server-Timing` header. The API moves to Vercel if a warm plan takes over 10 s. |
| Render sleeps after 15 idle minutes | An UptimeRobot check every 5 minutes, plus a "waking the server" message if it ever sleeps. |
| Off-by-one-hour or time-zone bugs | UTC internally; tests for hour selection, clock changes and past departures; labeled local times in the UI. |
| Heatmap stutters on long trips | At most 200 grid points with spacing that adapts to the corridor. WebGL rendering with a fixed colour domain. The slider changes an index only. |
| Calm weather on review day hides the risk logic | Boundary tests in CI, plus the simulated storm (S2) as the first P1 item. |
| Loom's free plan stops recordings at 5 minutes | Use the trial only if it needs no card, with an unlisted YouTube copy as backup. Otherwise record two parts under 5 minutes. |
| Deadline (end of Mon 12 Oct) | Deploy early. P1 work starts only after P0 is live. Anything unfinished goes in the README's next steps. |

## 11. Timeline
| Day | Goal |
|---|---|
| **Day 1 (Sat 10 Oct)** | PRD v1 and tech stack. |
| **Day 2 (Sun 11 Oct)** | Design review (this v2), repo, glossary and ADRs. Backend: risk engine and ranking with tests; TomTom, Geoapify and Open-Meteo adapters; `/api/plan` and `/api/heatmap`. First Render deploy and a timing check. |
| **Day 3 (Mon 12 Oct)** | React app: form, map, routes, checkpoints, popups, route cards and the deciding rule. Heatmap layer and slider. Vercel deploy and error states. P1 items in order while time allows. README and Loom. Final check on the live URLs, then submit. |

## 12. Assumptions instead of open questions
These three would be questions for Spotter, but answers won't arrive before the deadline. Each is stated as an assumption in the README and the submission note.
1. Wind risk uses sustained speed; gusts are shown but not scored.
2. The load rules raise wind risk for heavier loads, though industry blow-over guidance usually flags light or empty trailers as most at risk. The rules are applied as written.
3. The 0 to 48 h slider starts at the departure hour, which is the same as the current time when departing now.

---

## Appendix A: Risk rules (exact)
Levels and scores: Low 0, Moderate 1, High 2, Severe 3, No Travel 4.

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind w (mph, sustained) | w < 25 | 25 ≤ w < 35 | 35 ≤ w < 45 | 45 ≤ w < 55 | w ≥ 55 |
| Rain r (in/hr, rain + showers) | r < 0.10 | 0.10 ≤ r < 0.25 | 0.25 ≤ r < 0.50 | 0.50 ≤ r ≤ 1.00 | r > 1.00 |
| Snow s (in/hr) | s < 0.5 | 0.5 ≤ s < 1.0 | 1.0 ≤ s < 2.0 | 2.0 ≤ s ≤ 3.0 | s > 3.0 |

Load rules, with load L in lb (cargo weight, 0 to 45,000), applied to the wind level:
1. w ≥ 55 → No Travel for any load.
2. 45 ≤ w < 55 and L > 30,000 → No Travel.
3. 35 ≤ w < 45 and L > 40,000 → Severe.

Checkpoint level = max(wind level after load rules, rain level, snow level). The reason names the condition that set the level and any load rule that fired, e.g. "Severe: 38 mph wind with a 42,000 lb load (load rule 3)".

Minimum boundary tests:
- Wind: 24.9, 25, 34.9, 35, 44.9, 45, 54.9, 55.
- Rain: 0.09, 0.10, 0.24, 0.25, 0.49, 0.50, 1.00, 1.01.
- Snow: 0.4, 0.5, 0.9, 1.0, 1.9, 2.0, 3.0, 3.1.
- Loads: 30,000 vs 30,001 lb at 50 mph, and 40,000 vs 40,001 lb at 40 mph.
- Load range: 0 and 45,000 lb accepted; 45,001 lb rejected.

## Appendix B: Checkpoints, ETAs and weather
- **Positions:** at 0, N, 2N, ... miles along the route geometry, plus the destination when the route length L is not a multiple of N. If the three routes together would need more than 300 weather cells, the next wider spacing is used and the plan says so.
- **ETA:** departure (UTC) + travel time at that distance, interpolated from the routing response's cumulative distance and time points (TomTom `extendedRouteRepresentation=distance,travelTime`).
- **Miles per checkpoint:** half the gap to the previous checkpoint plus half the gap to the next. The totals equal L.
- **Weather fields:** Open-Meteo hourly `wind_speed_10m` (instantaneous), `wind_gusts_10m` (maximum over the preceding hour), and `rain` + `showers` and `snowfall` (totals over the preceding hour). All are requested in mph and inches.
- **Hour selection:** for an ETA of 14:20, rain, showers, snow and gusts use the 15:00 value, which covers 14:00 to 15:00. Sustained wind is interpolated a third of the way from the 14:00 value to the 15:00 value.
- **Units guard:** the backend checks the response's `hourly_units` and fails loudly if they are not mph and inches.
- **Missing values:** any missing field makes the checkpoint "No data" (Appendix C).

## Appendix C: Recommendation
For each route the app computes miles at each level, drive time, and average risk = Σ(score × miles) ÷ the route miles that have data. Miles are rounded to whole miles and average risk to one decimal before comparing. No Travel miles round up, so any No Travel stretch counts as at least a mile and a route can't pass as safe on rounding.

Routes are ranked by these rules, in order:
0. Fewest No Travel miles (added; see section 8)
1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel time

If every rule ties, the routing API's order decides. Routes with any No data checkpoint rank after the complete routes and can't be Recommended.

The top route is **Recommended**. Its reason is the first rule on which it beats the runner-up, e.g. "All routes have 0 Severe miles; Route B has the fewest High miles (10 vs 35)". Two cases replace the recommendation:
- **No safe route.** If even the top route has No Travel miles, the app shows a "No safe route at this departure time" warning, keeps the ranking, and points to the heatmap to look for a clearer window.
- **No complete route.** If no route has complete weather, the app shows the ranking with no recommendation and says why.

## Appendix D: External APIs (checked 10 to 11 Oct 2026)
| API | What we use | Limits that matter |
|---|---|---|
| TomTom Routing v1 | `travelMode=truck`. Five calls in parallel: `routeType=fastest`, `eco`, `short`, and two `fastest` calls with a `circle(...)` via point. `avoid=borderCrossings`. `departAt`. `vehicleWeight` = (load + 35,000 lb tare) in kg, plus rig length, width, height and axles. `extendedRouteRepresentation`. | 20,000 free requests a month, no card; past the quota it returns 429 and charges nothing |
| Geoapify Address Autocomplete | US-only typeahead with coordinates and time zone, through the backend | 3,000 free credits a day, 5 requests a second, no card; "Powered by Geoapify" attribution |
| Open-Meteo Forecast | Multi-location hourly forecast with `wind_speed_unit=mph` and `precipitation_unit=inch` (snowfall also comes back in inches) | Free for non-commercial use: 600 calls a minute, 5,000 an hour and 10,000 a day. Each location counts as one call. CC BY 4.0 attribution. |
| OpenFreeMap | Positron vector basemap | No key, no view limits |
| OpenRouteService (rejected) | | Its public API only computes alternatives for routes under 100 km |
| TomTom Orbis (rejected) | | No truck travel mode |

Sources:
- [TomTom Calculate Route, v1](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route)
- [TomTom pricing](https://docs.tomtom.com/pricing)
- [Geoapify Address Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)
- [Geoapify pricing](https://www.geoapify.com/pricing/)
- [Open-Meteo docs](https://open-meteo.com/en/docs)
- [Open-Meteo pricing](https://open-meteo.com/en/pricing)
- [Open-Meteo: multiple locations](https://openmeteo.substack.com/p/weather-data-for-multiple-locations)
- [openrouteservice restrictions](https://openrouteservice.org/restrictions/)
- [FHWA Road Weather Management](https://ops.fhwa.dot.gov/weather/roadimpact.htm)
- [Render free tier](https://render.com/docs/free)
- [Render instance types](https://render.com/docs/compute-plans)
- [Vercel: zero-configuration Django support](https://vercel.com/changelog/zero-configuration-django-support)
- [Loom Business + AI trial FAQ](https://support.atlassian.com/loom/docs/loom-business-ai-trial-faq/)

## Appendix E: Brief traceability
| Brief line | Covered by | Verified by |
|---|---|---|
| Inputs: origin and destination, departure date/time, load weight | R1 | Form validation tests (load range, departure window, clock changes); manual run |
| Generate 3 route options using a routing API | R2 | Adapter tests with recorded responses (parallel variants, via point, dedupe); manual run on 3 trips |
| Sample weather every 10/25/50 miles at the estimated arrival time | R3, R4, Appendix B | Unit tests for positions, the spacing budget, ETA interpolation and hour selection |
| Calculate weather risk using the risk and load rules | R5, Appendix A | Boundary and load-rule tests; simulated storm (S2) in the live app |
| Recommend the best route, balancing risk and travel time | R7, Appendix C | One test per ranking rule, plus rounding and No data |
| Show routes, checkpoints, risk levels, ETAs and summaries on a map | R6, R8 | Manual check and the Loom |
| Weather heatmap along the corridor with a 0 to 48 h slider | R9 | Performance check: no requests while scrubbing, 60 fps; a test that the window starts at the departure hour |
| GitHub repo, hosted app, 5 to 10 minute Loom | Section 11 | Submission checklist |
| Evaluation: UI, map and heatmap smoothness and performance (35%) | Section 5, criterion 3 | `Server-Timing` numbers in the README; DevTools performance trace |
